import { addChunkRecords, listChunksByDocument } from "../vectorstore/index.js";
import { createEmbedding } from "./embeddingService.js";
import { generateAnswer } from "./llmService.js";
import { cleanText, chunkText } from "./textProcessingService.js";
import { getUploadedDocument, updateDocument } from "./documentService.js";
import { traceStep } from "../utils/tracing.js";
import { optimizeQuery } from "./queryOptimizer.js";
import { runHybridSearch } from "./hybridSearch.js";
import { runSemanticSearch } from "./semanticSearch.js";
import { rerankChunks } from "./reranker.js";
import { getDomainProfile, getDomainSystemPrompt } from "./domainProfile.js";
import {
  classifyQueryDomain,
  classifyQueryComplexity,
} from "./domainClassifier.js";
import { validateAndImproveRetrieval } from "./cragValidator.js";

function stripEmbedding(record) {
  const { embedding, ...rest } = record;
  return rest;
}

export async function processDocument(documentId) {
  return traceStep("process_document", async () => {
    const domainProfile = getDomainProfile();
    const document = getUploadedDocument(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    // Step 1: Clean text so chunking and retrieval see consistent content.
    const cleanedText = cleanText(document.rawText);
    if (!cleanedText) {
      throw new Error("Document text is empty after cleaning");
    }

    // Step 2: Split the document into smaller chunks for retrieval.
    const chunks = chunkText(cleanedText, { chunkSize: 180, overlap: 30 });
    if (chunks.length === 0) {
      throw new Error("Document could not be chunked");
    }

    // Step 3: Turn each chunk into an embedding so we can compare meaning later.
    const chunkRecords = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkTextValue = chunks[index];
      const embedding = await createEmbedding(
        chunkTextValue,
        "RETRIEVAL_DOCUMENT",
      );

      chunkRecords.push({
        documentId,
        documentName: document.originalName,
        domainName: domainProfile.name,
        chunkIndex: index,
        text: chunkTextValue,
        embedding,
        characterLength: chunkTextValue.length,
      });
    }

    // Step 4: Store chunk embeddings in the vector store.
    const storedChunks = await addChunkRecords(chunkRecords);

    updateDocument(documentId, {
      status: "processed",
      chunkCount: storedChunks.length,
      cleanedText,
    });

    return {
      documentId,
      documentName: document.originalName,
      chunkCount: storedChunks.length,
      message: "Document processed and embeddings stored successfully.",
    };
  });
}

export async function answerQuestion({ question, documentId = null }) {
  return traceStep("answer_question", async () => {
    const domainProfile = getDomainProfile();
    if (!question || !question.trim()) {
      throw new Error("Question is required");
    }

    // Step 1: Classify query domain and complexity
    const domainClassification = await classifyQueryDomain(question);
    const complexityClassification = await classifyQueryComplexity(question);

    // Step 2: Rewrite the question into a clearer retrieval query (if needed)
    const queryOptimization = await optimizeQuery(question);

    // Step 3: Convert the optimized query into an embedding
    const queryEmbedding = await createEmbedding(
      queryOptimization.optimizedQuery,
      "RETRIEVAL_QUERY",
    );

    // Step 4: Adaptive Retrieval based on query complexity
    let retrievedChunks = [];
    let retrievalStrategy = "";
    let hybridSearchResults = null;
    let semanticResults = null;
    let keywordResults = null;
    let rerankedChunks = [];
    let cragResult = null;

    // Domain filter is passed to search functions

    // Adaptive retrieval logic
    if (complexityClassification.complexity === "simple") {
      // Simple query: semantic search only
      retrievalStrategy = "simple_semantic";
      semanticResults = await runSemanticSearch({
        queryEmbedding,
        documentId,
        domainName: domainClassification.domain,
        topK: 5,
      });
      rerankedChunks = await rerankChunks({
        query: queryOptimization.optimizedQuery,
        candidates: semanticResults,
        topK: 3,
      });
    } else if (complexityClassification.complexity === "medium") {
      // Medium query: hybrid search with reranking
      retrievalStrategy = "hybrid_reranked";
      hybridSearchResults = await runHybridSearch({
        optimizedQuery: queryOptimization.optimizedQuery,
        documentId,
        domainName: domainClassification.domain,
        topK: 8,
        queryEmbedding,
      });
      rerankedChunks = await rerankChunks({
        query: queryOptimization.optimizedQuery,
        candidates: hybridSearchResults.mergedResults,
        topK: 5,
      });
    } else {
      // Complex query: hybrid search with larger top-k and reranking
      retrievalStrategy = "complex_hybrid";
      hybridSearchResults = await runHybridSearch({
        optimizedQuery: queryOptimization.optimizedQuery,
        documentId,
        domainName: domainClassification.domain,
        topK: 12,
        queryEmbedding,
      });
      rerankedChunks = await rerankChunks({
        query: queryOptimization.optimizedQuery,
        candidates: hybridSearchResults.mergedResults,
        topK: 6,
      });
    }

    // Step 5: Corrective RAG validation
    cragResult = await validateAndImproveRetrieval({
      chunks: rerankedChunks,
      query: queryOptimization.optimizedQuery,
      retrievalFn: async ({ query: q, topK, noDomainFilter }) => {
        const qEmbedding = await createEmbedding(q, "RETRIEVAL_QUERY");
        const results = await runHybridSearch({
          optimizedQuery: q,
          documentId,
          domainName: noDomainFilter ? undefined : domainClassification.domain,
          topK,
          queryEmbedding: qEmbedding,
        });
        const reranked = await rerankChunks({
          query: q,
          candidates: results.mergedResults,
          topK: Math.min(topK, 6),
        });
        return reranked;
      },
    });

    retrievedChunks = cragResult.chunks.slice(
      0,
      complexityClassification.complexity === "complex" ? 5 : 3,
    );

    // Step 6: Generate answer with domain-specific system prompt
    const answer = await generateAnswer({
      question: queryOptimization.optimizedQuery,
      retrievedChunks,
    });

    // Collect source documents
    const sourceDocuments = [
      ...new Set(
        retrievedChunks.map((chunk) => chunk.documentName).filter(Boolean),
      ),
    ];

    // Evaluation metrics
    const evaluationMetrics = {
      retrievalPrecision:
        cragResult.finalQuality.relevantCount /
        Math.max(cragResult.finalQuality.totalChunks, 1),
      confidenceScore: cragResult.finalQuality.confidence,
      retrievalStrategy,
      cragRetries: cragResult.retries,
      cragValid: cragResult.validation.valid,
      queryComplexity: complexityClassification.complexity,
      domainClassified: domainClassification.domain,
      responseLatency: 0, // We'll calculate this in the controller
    };

    return {
      answer,
      queryType: complexityClassification.complexity,
      domain: {
        category: domainClassification.category,
        subcategory: domainClassification.domain,
        scores: domainClassification.domainScores,
      },
      confidence: cragResult.finalQuality.confidence,
      retrievalStrategy,
      sourceDocuments,
      retrievedChunks: retrievedChunks.map(stripEmbedding),
      evaluationMetrics,
      cragStatus: {
        valid: cragResult.validation.valid,
        issues: cragResult.validation.issues,
        retries: cragResult.retries,
        actions: cragResult.actions,
        finalQuality: cragResult.finalQuality,
      },
      question,
      queryOptimization,
      documentId,
      domainProfile,
      // Keep existing fields for backward compatibility
      semanticResults: semanticResults
        ? semanticResults.map(stripEmbedding)
        : [],
      keywordResults: keywordResults ? keywordResults.map(stripEmbedding) : [],
      hybridResults: hybridSearchResults
        ? hybridSearchResults.mergedResults.map(stripEmbedding)
        : [],
      rerankedChunks: rerankedChunks.map(stripEmbedding),
    };
  });
}

export async function getChunksForDocument(documentId) {
  return listChunksByDocument(documentId);
}

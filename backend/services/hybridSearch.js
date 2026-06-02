import { createEmbedding } from "./embeddingService.js";
import { runKeywordSearch } from "./keywordSearch.js";
import { runSemanticSearch } from "./semanticSearch.js";
import { traceStep } from "../utils/tracing.js";

function mergeSearchResults(semanticResults, keywordResults) {
  const merged = new Map();

  function makeKey(record) {
    return [
      record.documentName || record.documentId || "document",
      record.chunkIndex ?? "unknown",
      (record.text || "").slice(0, 160),
    ].join("::");
  }

  function upsert(record, source) {
    const key = makeKey(record);
    const current = merged.get(key) || {
      ...record,
      semanticScore: 0,
      keywordScore: 0,
      sources: [],
    };

    current.sources = Array.from(new Set([...current.sources, source]));
    current.semanticScore = Math.max(
      current.semanticScore,
      record.semanticScore ?? record.score ?? 0,
    );
    current.keywordScore = Math.max(
      current.keywordScore,
      record.keywordScore ?? 0,
    );
    current.text = record.text || current.text;
    current.documentId = record.documentId || current.documentId;
    current.documentName = record.documentName || current.documentName;
    current.chunkIndex = record.chunkIndex ?? current.chunkIndex;
    current.vectorId = record.vectorId || current.vectorId;
    merged.set(key, current);
  }

  for (const record of semanticResults) {
    upsert(record, "semantic");
  }

  for (const record of keywordResults) {
    upsert(record, "keyword");
  }

  return Array.from(merged.values())
    .map((record) => {
      const hybridScore = Number(
        (record.semanticScore * 0.65 + record.keywordScore * 0.35).toFixed(4),
      );

      return {
        ...record,
        hybridScore,
      };
    })
    .sort((left, right) => right.hybridScore - left.hybridScore);
}

export async function runHybridSearch({
  optimizedQuery,
  documentId = null,
  domainName = null,
  topK = 6,
  queryEmbedding = null,
}) {
  return traceStep("hybrid_search", async () => {
    const embedding =
      queryEmbedding ||
      (await createEmbedding(optimizedQuery, "RETRIEVAL_QUERY"));

    const [semanticResults, keywordResults] = await Promise.all([
      runSemanticSearch({
        queryEmbedding: embedding,
        documentId,
        domainName,
        topK,
      }),
      runKeywordSearch({
        query: optimizedQuery,
        documentId,
        domainName,
        topK,
      }),
    ]);

    return {
      queryEmbedding: embedding,
      semanticResults,
      keywordResults,
      mergedResults: mergeSearchResults(semanticResults, keywordResults).slice(
        0,
        topK,
      ),
    };
  });
}

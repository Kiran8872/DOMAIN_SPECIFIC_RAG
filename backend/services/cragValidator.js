import { traceStep } from "../utils/tracing.js";

const RETRIEVAL_QUALITY_THRESHOLDS = {
  MIN_CONFIDENCE: 0.4,
  MIN_RELEVANT_CHUNKS: 2,
  MIN_AVERAGE_SCORE: 0.3
};

function calculateRetrievalQuality(chunks, query) {
  const relevantChunks = chunks.filter(chunk => 
    (chunk.score ?? chunk.semanticScore ?? chunk.rerankScore ?? 0) > 0.2
  );
  
  const scores = chunks.map(chunk => 
    chunk.score ?? chunk.semanticScore ?? chunk.rerankScore ?? 0
  );
  
  const averageScore = scores.length > 0 
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length 
    : 0;
  
  const maxScore = Math.max(...scores, 0);
  
  return {
    relevantChunks,
    averageScore,
    maxScore,
    totalChunks: chunks.length,
    relevantCount: relevantChunks.length,
    confidence: Math.min(1, (averageScore * 0.5) + (maxScore * 0.3) + (relevantChunks.length / Math.max(chunks.length, 1) * 0.2))
  };
}

function validateRetrieval(quality) {
  const passes = (
    quality.confidence >= RETRIEVAL_QUALITY_THRESHOLDS.MIN_CONFIDENCE &&
    quality.relevantCount >= RETRIEVAL_QUALITY_THRESHOLDS.MIN_RELEVANT_CHUNKS &&
    quality.averageScore >= RETRIEVAL_QUALITY_THRESHOLDS.MIN_AVERAGE_SCORE
  );
  
  const issues = [];
  
  if (quality.confidence < RETRIEVAL_QUALITY_THRESHOLDS.MIN_CONFIDENCE) {
    issues.push("Low confidence score");
  }
  
  if (quality.relevantCount < RETRIEVAL_QUALITY_THRESHOLDS.MIN_RELEVANT_CHUNKS) {
    issues.push("Insufficient relevant chunks");
  }
  
  if (quality.averageScore < RETRIEVAL_QUALITY_THRESHOLDS.MIN_AVERAGE_SCORE) {
    issues.push("Low average relevance score");
  }
  
  return {
    valid: passes,
    issues,
    quality
  };
}

export async function validateAndImproveRetrieval({
  chunks,
  query,
  retrievalFn,
  maxRetries = 2
}) {
  return traceStep("validate_and_improve_retrieval", async () => {
    let currentChunks = chunks;
    let validation = validateRetrieval(calculateRetrievalQuality(currentChunks, query));
    let retries = 0;
    let actions = [];

    while (!validation.valid && retries < maxRetries) {
      retries++;
      actions.push(`Validation failed: ${validation.issues.join(", ")}`);
      
      const improvement = await improveRetrieval({
        query,
        currentRetrieval: validation.quality,
        validation,
        retrievalFn,
        retryNumber: retries
      });
      
      currentChunks = improvement.chunks;
      validation = validateRetrieval(calculateRetrievalQuality(currentChunks, query));
      actions.push(improvement.action);
    }

    return {
      chunks: currentChunks,
      validation,
      retries,
      actions,
      finalQuality: validation.quality
    };
  });
}

async function improveRetrieval({
  query,
  currentRetrieval,
  validation,
  retrievalFn,
  retryNumber
}) {
  let action = "";
  let newChunks = [];
  
  if (retryNumber === 1) {
    // First retry: increase top-k and try again
    action = "Increased top-K retrieval window from current top-K";
    newChunks = await retrievalFn({
      query,
      topK: 10,
      expanded: true
    });
  } else {
    // Second retry: no domain filter and try larger top-k
    action = "Removed domain filter and increased top-K";
    newChunks = await retrievalFn({
      query,
      topK: 15,
      expanded: true,
      noDomainFilter: true
    });
  }
  
  return {
    chunks: newChunks,
    action
  };
}

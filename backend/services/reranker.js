import { traceStep } from "../utils/tracing.js";

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "about",
  "tell",
  "me",
  "please",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length > 1 && !STOPWORDS.has(token));
}

function scoreChunk(queryTokens, chunk) {
  const chunkTokens = tokenize(chunk.text || "");
  const matchedTokens = queryTokens.filter((token) =>
    chunkTokens.includes(token),
  );
  const overlapScore = matchedTokens.length / Math.max(queryTokens.length, 1);
  const coverageScore =
    matchedTokens.length / Math.max(new Set(chunkTokens).size, 1);
  const phraseBonus = (chunk.text || "")
    .toLowerCase()
    .includes(queryTokens.join(" "))
    ? 0.15
    : 0;
  const semanticScore = chunk.semanticScore ?? chunk.score ?? 0;
  const keywordScore = chunk.keywordScore ?? 0;

  // Re-ranking matters because the hybrid retriever can return good chunks in a noisy order.
  const rerankScore = Number(
    (
      semanticScore * 0.45 +
      keywordScore * 0.3 +
      overlapScore * 0.2 +
      coverageScore * 0.05 +
      phraseBonus
    ).toFixed(4),
  );

  return {
    ...chunk,
    rerankScore,
    rerankSignals: {
      semanticScore: Number(semanticScore.toFixed?.(4) ?? semanticScore),
      keywordScore: Number(keywordScore.toFixed?.(4) ?? keywordScore),
      overlapScore: Number(overlapScore.toFixed(4)),
      coverageScore: Number(coverageScore.toFixed(4)),
      phraseBonus,
    },
    matchedTokens,
  };
}

export async function rerankChunks({ query, candidates = [], topK = 4 }) {
  return traceStep("rerank_chunks", async () => {
    const queryTokens = tokenize(query);

    return candidates
      .map((chunk) => scoreChunk(queryTokens, chunk))
      .sort((left, right) => right.rerankScore - left.rerankScore)
      .slice(0, topK);
  });
}

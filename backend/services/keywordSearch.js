import { listAllChunks } from "../vectorstore/index.js";
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
  "i",
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

function scoreKeywordMatch(queryTokens, chunkText) {
  if (queryTokens.length === 0) {
    return 0;
  }

  const chunkTokens = tokenize(chunkText);
  if (chunkTokens.length === 0) {
    return 0;
  }

  const tokenCounts = new Map();
  for (const token of chunkTokens) {
    tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  }

  const matchedTerms = [];
  let score = 0;

  for (const token of queryTokens) {
    const count = tokenCounts.get(token) || 0;
    if (count > 0) {
      matchedTerms.push(token);
      score += 1 + Math.log(1 + count);
    }
  }

  const overlap = matchedTerms.length / queryTokens.length;
  const exactPhraseBonus = chunkText
    .toLowerCase()
    .includes(queryTokens.join(" "))
    ? 1.25
    : 0;
  const lengthPenalty = Math.min(chunkTokens.length / 240, 1) * 0.25;

  return {
    keywordScore: Number(
      (score + overlap + exactPhraseBonus - lengthPenalty).toFixed(4),
    ),
    matchedTerms: [...new Set(matchedTerms)],
  };
}

export async function runKeywordSearch({
  query,
  documentId = null,
  domainName = null,
  topK = 5,
}) {
  return traceStep("keyword_search", async () => {
    const queryTokens = tokenize(query);
    const chunks = await listAllChunks({
      documentId: documentId || undefined,
      domainName: domainName || undefined,
    });

    const scoredChunks = chunks
      .map((chunk) => {
        const scoring = scoreKeywordMatch(queryTokens, chunk.text || "");

        return {
          ...chunk,
          keywordScore: scoring.keywordScore,
          matchedTerms: scoring.matchedTerms,
          searchSource: "keyword",
        };
      })
      .filter((chunk) => chunk.keywordScore > 0)
      .sort((left, right) => right.keywordScore - left.keywordScore)
      .slice(0, topK);

    return scoredChunks;
  });
}

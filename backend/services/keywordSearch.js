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
  let termScore = 0;

  for (const token of queryTokens) {
    const count = tokenCounts.get(token) || 0;
    if (count > 0) {
      matchedTerms.push(token);
      termScore += 1 + Math.min(Math.log(1 + count), 1);
    }
  }

  const uniqueMatches = new Set(matchedTerms);
  const overlap = uniqueMatches.size / queryTokens.length;
  const missingTerms = queryTokens.length - uniqueMatches.size;
  const exactPhraseBonus = chunkText
    .toLowerCase()
    .includes(queryTokens.join(" "))
    ? 2.5
    : 0;
  const allTermsBonus = overlap === 1 ? 3 : 0;
  const missingTermPenalty = missingTerms * 1.25;
  const lengthPenalty = Math.min(chunkTokens.length / 240, 1) * 0.25;

  return {
    keywordScore: Number(
      (
        termScore +
        overlap * 4 +
        exactPhraseBonus +
        allTermsBonus -
        missingTermPenalty -
        lengthPenalty
      ).toFixed(4),
    ),
    matchedTerms: [...uniqueMatches],
  };
}

function dedupeChunks(chunks) {
  const bestByContent = new Map();

  for (const chunk of chunks) {
    const key = [
      chunk.documentName || chunk.documentId || "document",
      chunk.chunkIndex ?? "unknown",
      (chunk.text || "").slice(0, 160),
    ].join("::");
    const current = bestByContent.get(key);

    if (!current || chunk.keywordScore > current.keywordScore) {
      bestByContent.set(key, chunk);
    }
  }

  return Array.from(bestByContent.values());
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

    const scoredChunks = dedupeChunks(
      chunks
        .map((chunk) => {
          const scoring = scoreKeywordMatch(queryTokens, chunk.text || "");

          return {
            ...chunk,
            keywordScore: scoring.keywordScore,
            matchedTerms: scoring.matchedTerms,
            searchSource: "keyword",
          };
        })
        .filter((chunk) => chunk.keywordScore > 0),
    )
      .sort((left, right) => right.keywordScore - left.keywordScore)
      .slice(0, topK);

    return scoredChunks;
  });
}

import { searchSimilarChunks } from "../vectorstore/index.js";
import { traceStep } from "../utils/tracing.js";

function dedupeChunks(chunks) {
  const bestByContent = new Map();

  for (const chunk of chunks) {
    const key = [
      chunk.documentName || chunk.documentId || "document",
      chunk.chunkIndex ?? "unknown",
      (chunk.text || "").slice(0, 160),
    ].join("::");
    const current = bestByContent.get(key);
    const score = chunk.semanticScore ?? chunk.score ?? 0;
    const currentScore = current?.semanticScore ?? current?.score ?? 0;

    if (!current || score > currentScore) {
      bestByContent.set(key, chunk);
    }
  }

  return Array.from(bestByContent.values());
}

export async function runSemanticSearch({
  queryEmbedding,
  documentId = null,
  domainName = null,
  topK = 5,
}) {
  return traceStep("semantic_search", async () => {
    const results = await searchSimilarChunks(queryEmbedding, topK, {
      documentId: documentId || undefined,
      domainName: domainName || undefined,
    });

    return dedupeChunks(
      results.map((record) => ({
        ...record,
        semanticScore: typeof record.score === "number" ? record.score : 0,
        searchSource: "semantic",
      })),
    );
  });
}

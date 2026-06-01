import { searchSimilarChunks } from "../vectorstore/index.js";
import { traceStep } from "../utils/tracing.js";

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

    return results.map((record) => ({
      ...record,
      semanticScore: typeof record.score === "number" ? record.score : 0,
      searchSource: "semantic",
    }));
  });
}

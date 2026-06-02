import { CloudClient } from "chromadb";

import {
  addChunkRecords as addChunkRecordsInMemory,
  getVectorStoreSize as getMemoryVectorStoreSize,
  listAllChunks as listMemoryAllChunks,
  listChunksByDocument as listMemoryChunksByDocument,
  resetVectorStore as resetMemoryVectorStore,
  searchSimilarChunks as searchMemorySimilarChunks,
} from "./memoryVectorStore.js";
import { getDomainProfile } from "../services/domainProfile.js";

const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "RAG_MODEL";
const PRECOMPUTED_EMBEDDING_FUNCTION = {
  name: "precomputed",
  generate: async (texts) => texts.map(() => []),
};

let collectionPromise = null;
let allChunksCache = null;

function applyChunkFilters(records, filters = {}) {
  return records.filter((record) => {
    if (filters.documentId && record.documentId !== filters.documentId) {
      return false;
    }

    if (filters.domainName && record.domainName !== filters.domainName) {
      return false;
    }

    return true;
  });
}

function makeChunkDedupeKey(record) {
  return [
    record.documentName || record.documentId || "document",
    record.chunkIndex ?? "unknown",
    (record.text || "").slice(0, 160),
  ].join("::");
}

function dedupeChunkRecords(records) {
  const bestByChunk = new Map();

  for (const record of records) {
    const key = makeChunkDedupeKey(record);
    const current = bestByChunk.get(key);
    const score = record.score ?? 0;
    const currentScore = current?.score ?? 0;

    if (!current || score > currentScore) {
      bestByChunk.set(key, record);
    }
  }

  return Array.from(bestByChunk.values());
}

function isChromaConfigured() {
  return Boolean(
    process.env.CHROMA_API_KEY &&
    process.env.CHROMA_TENANT &&
    process.env.CHROMA_DATABASE,
  );
}

export function getVectorStoreMode() {
  return isChromaConfigured() ? "chroma" : "memory";
}

export function getVectorStoreStatus() {
  return {
    mode: getVectorStoreMode(),
    connected: isChromaConfigured(),
    host: process.env.CHROMA_HOST || null,
    tenant: process.env.CHROMA_TENANT || null,
    database: process.env.CHROMA_DATABASE || null,
    collection: COLLECTION_NAME,
  };
}

async function getCollection() {
  if (!isChromaConfigured()) {
    return null;
  }

  if (!collectionPromise) {
    collectionPromise = (async () => {
      try {
        const client = new CloudClient({
          apiKey: process.env.CHROMA_API_KEY,
          tenant: process.env.CHROMA_TENANT,
          database: process.env.CHROMA_DATABASE,
          host: process.env.CHROMA_HOST || "api.trychroma.com",
          port: 443,
        });

        const collection = await client.getOrCreateCollection({
          name: COLLECTION_NAME,
          embeddingFunction: PRECOMPUTED_EMBEDDING_FUNCTION,
        });

        console.log("[ChromaDB] Connected to ChromaDB Cloud successfully.");
        return collection;
      } catch (err) {
        console.warn(
          `[ChromaDB] Failed to connect to ChromaDB Cloud: ${err.message}`
        );
        console.warn("[ChromaDB] Falling back to local disk-cached vector store.");
        return null;
      }
    })();
  }

  return collectionPromise;
}

function createRecordId(record) {
  const documentKey = String(record.documentId || record.documentName || "document")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 120);

  return (
    record.vectorId ||
    `${documentKey}-${record.chunkIndex}`
  );
}

function buildMetadata(record, vectorId) {
  return {
    documentId: record.documentId,
    documentName: record.documentName,
    domainName: record.domainName || getDomainProfile().name,
    chunkIndex: record.chunkIndex,
    characterLength: record.characterLength,
    createdAt: record.createdAt || new Date().toISOString(),
    vectorId,
  };
}

function mapQueryResults(result) {
  const ids = result.ids?.[0] || [];
  const documents = result.documents?.[0] || [];
  const metadatas = result.metadatas?.[0] || [];
  const distances = result.distances?.[0] || [];

  return ids.map((id, index) => {
    const metadata = metadatas[index] || {};
    const documentText = documents[index] || "";
    const distance = distances[index];

    return {
      vectorId: id,
      documentId: metadata.documentId || null,
      documentName: metadata.documentName || null,
      domainName: metadata.domainName || null,
      chunkIndex: metadata.chunkIndex ?? index,
      text: documentText,
      characterLength: metadata.characterLength || documentText.length,
      score: typeof distance === "number" ? Math.max(0, 1 - distance) : 0,
      distance: typeof distance === "number" ? distance : null,
      createdAt: metadata.createdAt || null,
    };
  });
}

function mapGetResults(result) {
  const ids = result.ids || [];
  const documents = result.documents || [];
  const metadatas = result.metadatas || [];

  return ids.map((id, index) => {
    const metadata = metadatas[index] || {};
    const documentText = documents[index] || "";

    return {
      vectorId: id,
      documentId: metadata.documentId || null,
      documentName: metadata.documentName || null,
      domainName: metadata.domainName || null,
      chunkIndex: metadata.chunkIndex ?? index,
      text: documentText,
      characterLength: metadata.characterLength || documentText.length,
      score: 0,
      distance: null,
      createdAt: metadata.createdAt || null,
    };
  });
}

function mapStoredChunks(result) {
  return mapGetResults(result).map((record) => ({ ...record }));
}

async function fetchAllChunks(collection, filters = {}) {
  const pageSize = 250;
  const records = [];
  let offset = 0;

  while (true) {
    const result = await collection.get({
      limit: pageSize,
      offset,
      include: ["documents", "metadatas"],
    });

    const rawBatch = mapStoredChunks(result);
    const batch = applyChunkFilters(rawBatch, filters);

    records.push(...batch);

    if (rawBatch.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return records;
}

export async function addChunkRecords(records) {
  const collection = await getCollection();

  if (!collection) {
    return addChunkRecordsInMemory(records);
  }

  const ids = records.map((record) => createRecordId(record));

  await collection.upsert({
    ids,
    embeddings: records.map((record) => record.embedding),
    documents: records.map((record) => record.text),
    metadatas: records.map((record, index) =>
      buildMetadata(record, ids[index]),
    ),
  });

  allChunksCache = null;

  return records.map((record, index) => ({
    ...record,
    vectorId: ids[index],
  }));
}

export async function searchSimilarChunks(
  queryEmbedding,
  topK = 3,
  filters = {},
) {
  const collection = await getCollection();

  if (!collection) {
    return searchMemorySimilarChunks(queryEmbedding, topK, filters);
  }

  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: Math.min(300, Math.max(topK * 8, topK)),
    include: ["documents", "metadatas", "distances"],
  });

  return dedupeChunkRecords(applyChunkFilters(mapQueryResults(result), filters))
    .slice(0, topK);
}

export async function listChunksByDocument(documentId) {
  const collection = await getCollection();

  if (!collection) {
    return listMemoryChunksByDocument(documentId);
  }

  if (allChunksCache) {
    return applyChunkFilters(allChunksCache, { documentId });
  }

  return fetchAllChunks(collection, { documentId });
}

export async function listAllChunks(filters = {}) {
  const collection = await getCollection();

  if (!collection) {
    return listMemoryAllChunks(filters);
  }

  if (!allChunksCache) {
    allChunksCache = dedupeChunkRecords(await fetchAllChunks(collection));
  }

  return applyChunkFilters(allChunksCache, filters);
}

export async function resetVectorStore() {
  const collection = await getCollection();
  if (!collection) {
    resetMemoryVectorStore();
    return;
  }

  // Chroma Cloud is the source of truth in deployed environments, so leave destructive operations explicit.
}

export async function getVectorStoreSize() {
  const collection = await getCollection();

  if (!collection) {
    return getMemoryVectorStoreSize();
  }

  return collection.count();
}

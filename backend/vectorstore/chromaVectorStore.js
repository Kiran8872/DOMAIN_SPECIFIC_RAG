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

let collectionPromise = null;

function isChromaConfigured() {
  return Boolean(
    process.env.CHROMA_API_KEY &&
    process.env.CHROMA_TENANT &&
    process.env.CHROMA_DATABASE &&
    process.env.CHROMA_HOST,
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
      const client = new CloudClient({
        apiKey: process.env.CHROMA_API_KEY,
        host: process.env.CHROMA_HOST,
        port: 443,
        tenant: process.env.CHROMA_TENANT,
        database: process.env.CHROMA_DATABASE,
        fetchOptions: {
          cache: "no-store",
        },
      });

      return client.getOrCreateCollection({
        name: COLLECTION_NAME,
        embeddingFunction: { generate: () => [] }
      });
    })();
  }

  return collectionPromise;
}

function createRecordId(record) {
  return (
    record.vectorId ||
    `${record.documentId}-${record.chunkIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

    const batch = mapStoredChunks(result).filter((record) => {
      if (filters.documentId && record.documentId !== filters.documentId) {
        return false;
      }

      if (filters.domainName && record.domainName !== filters.domainName) {
        return false;
      }

      return true;
    });

    records.push(...batch);

    if (batch.length < pageSize) {
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
    nResults: Math.max(topK * 3, topK),
    include: ["documents", "metadatas", "distances"],
  });

  return mapQueryResults(result)
    .filter((record) => {
      if (filters.documentId && record.documentId !== filters.documentId) {
        return false;
      }

      if (filters.domainName && record.domainName !== filters.domainName) {
        return false;
      }

      return true;
    })
    .slice(0, topK);
}

export async function listChunksByDocument(documentId) {
  const collection = await getCollection();

  if (!collection) {
    return listMemoryChunksByDocument(documentId);
  }

  return fetchAllChunks(collection, { documentId });
}

export async function listAllChunks(filters = {}) {
  const collection = await getCollection();

  if (!collection) {
    return listMemoryAllChunks(filters);
  }

  return fetchAllChunks(collection, filters);
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

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cosineSimilarity } from "../utils/similarity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "vectorstore.json");

let chunkStore = [];

// Load cached data from disk on startup
function loadFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      if (Array.isArray(data)) {
        chunkStore = data;
        console.log(
          `[VectorStore] Loaded ${chunkStore.length} chunks from disk cache.`
        );
        return true;
      }
    }
  } catch (err) {
    console.error("[VectorStore] Failed to load cache:", err.message);
  }
  return false;
}

// Save current data to disk
function saveToDisk() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(chunkStore));
    console.log(
      `[VectorStore] Saved ${chunkStore.length} chunks to disk cache.`
    );
  } catch (err) {
    console.error("[VectorStore] Failed to save cache:", err.message);
  }
}

// Load cache on module initialization
loadFromDisk();

function matchesFilters(record, filters = {}) {
  if (filters.documentId && record.documentId !== filters.documentId) {
    return false;
  }

  if (filters.domainName && record.domainName !== filters.domainName) {
    return false;
  }

  return true;
}

const MAX_CHUNKS = 50000;

export function addChunkRecords(records) {
  const documentIds = new Set(records.map((record) => record.documentId));
  chunkStore = chunkStore.filter((record) => !documentIds.has(record.documentId));

  // Prevent memory exhaustion
  if (chunkStore.length + records.length > MAX_CHUNKS) {
    throw new Error(`Vector store limit reached. Cannot store more than ${MAX_CHUNKS} chunks in memory mode. Please configure ChromaDB Cloud for unlimited storage.`);
  }

  const storedRecords = records.map((record) => ({
    ...record,
    vectorId: `${record.documentId}-${record.chunkIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }));

  chunkStore.push(...storedRecords);
  saveToDisk();
  return storedRecords;
}

export function searchSimilarChunks(queryEmbedding, topK = 3, filters = {}) {
  const scoredChunks = chunkStore
    .filter((record) => matchesFilters(record, filters))
    .map((record) => ({
      ...record,
      score: cosineSimilarity(queryEmbedding, record.embedding),
    }))
    .sort((left, right) => right.score - left.score);

  return scoredChunks.slice(0, topK);
}

export function listChunksByDocument(documentId) {
  return chunkStore
    .filter((record) => record.documentId === documentId)
    .map(({ embedding, ...rest }) => rest);
}

export function listAllChunks(filters = {}) {
  return chunkStore
    .filter((record) => matchesFilters(record, filters))
    .map((record) => ({ ...record }));
}

export function resetVectorStore() {
  chunkStore.length = 0;
  saveToDisk();
}

export function getVectorStoreSize() {
  return chunkStore.length;
}

/**
 * Returns a Set of document names already in the store.
 * Used by auto-ingest to skip already-processed docs.
 */
export function getStoredDocumentNames() {
  return new Set(chunkStore.map((r) => r.documentName).filter(Boolean));
}

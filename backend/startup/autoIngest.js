import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  registerUploadedDocument,
} from "../services/documentService.js";
import { processDocument } from "../services/ragService.js";
import { listAllChunks } from "../vectorstore/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DOCS_DIR = path.join(__dirname, "..", "sample_docs");

async function getStoredDocumentStats() {
  try {
    const chunks = await listAllChunks();
    const documentStats = new Map();

    for (const chunk of chunks) {
      if (!chunk.documentName) {
        continue;
      }

      documentStats.set(
        chunk.documentName,
        (documentStats.get(chunk.documentName) || 0) + 1,
      );
    }

    return documentStats;
  } catch (error) {
    console.warn(
      `[Auto-Ingest] Could not inspect vector store cache: ${error.message}`,
    );
    return new Map();
  }
}

/**
 * Auto-ingest all documents from backend/sample_docs on startup.
 * Skips files that are already in the vector store cache (persisted to disk).
 */
export async function autoIngestSampleDocs() {
  if (!fs.existsSync(SAMPLE_DOCS_DIR)) {
    console.log("[Auto-Ingest] No sample_docs directory found, skipping.");
    return;
  }

  const files = fs
    .readdirSync(SAMPLE_DOCS_DIR)
    .filter((f) => f.endsWith(".txt"));

  if (files.length === 0) {
    console.log("[Auto-Ingest] No .txt files found in sample_docs.");
    return;
  }

  // Check which documents are already in the persisted vector store
  const storedDocumentStats = await getStoredDocumentStats();
  const storedNames = new Set(storedDocumentStats.keys());
  const newFiles = files.filter((f) => !storedNames.has(f));

  if (newFiles.length === 0) {
    console.log(
      `[Auto-Ingest] All ${files.length} documents already in vector store cache. Ready instantly!`
    );
    // Still register them in the in-memory document list for the UI
    for (const fileName of files) {
      const filePath = path.join(SAMPLE_DOCS_DIR, fileName);
      const rawText = fs.readFileSync(filePath, "utf8");
      registerUploadedDocument({
        filePath,
        originalName: fileName,
        mimetype: "text/plain",
        rawText,
        status: "processed",
        chunkCount: storedDocumentStats.get(fileName) || 0,
      });
    }
    return;
  }

  console.log(
    `[Auto-Ingest] ${storedNames.size} docs cached, ${newFiles.length} new docs to process...`
  );

  // Register already-cached docs in the UI
  for (const fileName of files.filter((f) => storedNames.has(f))) {
    const filePath = path.join(SAMPLE_DOCS_DIR, fileName);
    const rawText = fs.readFileSync(filePath, "utf8");
    registerUploadedDocument({
      filePath,
      originalName: fileName,
      mimetype: "text/plain",
      rawText,
      status: "processed",
      chunkCount: storedDocumentStats.get(fileName) || 0,
    });
  }

  // Process only new docs
  let successCount = 0;
  let failCount = 0;

  for (const fileName of newFiles) {
    try {
      const filePath = path.join(SAMPLE_DOCS_DIR, fileName);
      const rawText = fs.readFileSync(filePath, "utf8");

      if (!rawText || rawText.trim().length < 100) {
        console.log(`[Auto-Ingest] Skipped (too short): ${fileName}`);
        continue;
      }

      const doc = registerUploadedDocument({
        filePath,
        originalName: fileName,
        mimetype: "text/plain",
        rawText,
      });

      await processDocument(doc.documentId);
      successCount++;
      console.log(
        `[Auto-Ingest] [${successCount}/${newFiles.length}] Processed: ${fileName}`
      );
    } catch (err) {
      failCount++;
      console.error(`[Auto-Ingest] Failed to process ${fileName}:`, err.message);
    }
  }

  console.log(
    `[Auto-Ingest] Complete! ${successCount} new docs ingested, ${failCount} failed.`
  );
}

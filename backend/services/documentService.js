import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import textract from "textract";

import { fileExtension, previewText } from "../utils/fileHelpers.js";

const documents = [];

function extractWithTextract(filePath) {
  return new Promise((resolve, reject) => {
    textract.fromFileWithPath(filePath, (error, text) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(text || "");
    });
  });
}

export async function extractTextFromDocument(file) {
  const originalName = file.originalname || file.filename || "document";
  const mimetype = file.mimetype || "";
  const extension = fileExtension(originalName);
  const fileBuffer = file.buffer || null;
  const filePath = file.path || null;

  // PDF files need binary parsing so we can turn pages into readable text.
  if (extension === ".pdf" || mimetype === "application/pdf") {
    const parsedPdf = await pdfParse(
      fileBuffer || (filePath ? await fs.readFile(filePath) : Buffer.alloc(0)),
    );
    return parsedPdf.text || "";
  }

  // DOCX is handled with Mammoth because it extracts clean text without layout noise.
  if (
    extension === ".docx" ||
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const parsedDocx = fileBuffer
      ? await mammoth.extractRawText({ buffer: fileBuffer })
      : await mammoth.extractRawText({ path: filePath });
    return parsedDocx.value || "";
  }

  // Legacy DOC files are handled best-effort with Textract to keep the demo beginner-friendly.
  if (extension === ".doc") {
    try {
      const tempPath = path.join(
        os.tmpdir(),
        `${randomUUID()}-${originalName}`,
      );

      if (fileBuffer) {
        await fs.writeFile(tempPath, fileBuffer);
      }

      try {
        return await extractWithTextract(tempPath);
      } finally {
        await fs.unlink(tempPath).catch(() => {});
      }
    } catch (error) {
      if (fileBuffer) {
        return fileBuffer.toString("utf8");
      }

      const rawBytes = await fs.readFile(filePath);
      return rawBytes.toString("utf8");
    }
  }

  // Plain text files are read directly.
  if (fileBuffer) {
    return fileBuffer.toString("utf8");
  }

  const rawText = await fs.readFile(filePath, "utf8");
  return rawText.toString();
}

export function registerUploadedDocument({
  filePath,
  originalName,
  mimetype,
  rawText,
}) {
  const documentId = randomUUID();

  const document = {
    documentId,
    originalName,
    filePath,
    mimetype,
    rawText,
    storage: filePath ? "disk" : "memory",
    status: "uploaded",
    chunkCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  documents.unshift(document);
  return document;
}

export function listUploadedDocuments() {
  return documents.map(({ rawText, ...document }) => ({
    ...document,
    textPreview: previewText(rawText),
    textLength: rawText.length,
  }));
}

export function getUploadedDocument(documentId) {
  return (
    documents.find((document) => document.documentId === documentId) || null
  );
}

export function updateDocument(documentId, updates) {
  const document = getUploadedDocument(documentId);
  if (!document) {
    return null;
  }

  Object.assign(document, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  return document;
}

export function getDocumentSummary(documentId) {
  const document = getUploadedDocument(documentId);
  if (!document) {
    return null;
  }

  const { rawText, ...summary } = document;
  return {
    ...summary,
    textPreview: previewText(rawText),
  };
}

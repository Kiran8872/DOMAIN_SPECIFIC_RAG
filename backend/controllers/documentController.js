import {
  extractTextFromDocument,
  listUploadedDocuments,
  registerUploadedDocument,
  getUploadedDocument,
} from "../services/documentService.js";
import {
  getChunksForDocument,
  processDocument,
} from "../services/ragService.js";
import { getVectorStoreStatus } from "../vectorstore/index.js";

export async function uploadDocument(req, res, next) {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Please upload a PDF, TXT, DOC, or DOCX file." });
    }

    const extractedText = await extractTextFromDocument(req.file);
    const document = registerUploadedDocument({
      filePath: req.file.path || null,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      rawText: extractedText,
    });

    return res.status(201).json({
      message: "Document uploaded successfully.",
      document,
      vectorStore: getVectorStoreStatus(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function processUploadedDocument(req, res, next) {
  try {
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ message: "documentId is required." });
    }

    const result = await processDocument(documentId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getDocuments(req, res) {
  return res.json({
    documents: listUploadedDocuments(),
    vectorStore: getVectorStoreStatus(),
  });
}

export async function getDocumentChunks(req, res) {
  const document = getUploadedDocument(req.params.documentId);
  if (!document) {
    return res.status(404).json({ message: "Document not found." });
  }

  const chunks = await getChunksForDocument(document.documentId);

  return res.json({
    documentId: document.documentId,
    documentName: document.originalName,
    chunks,
    vectorStore: getVectorStoreStatus(),
  });
}

import express from "express";
import multer from "multer";

import {
  getDocumentChunks,
  getDocuments,
  processUploadedDocument,
  uploadDocument,
} from "../controllers/documentController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/documents", getDocuments);
router.post("/upload", upload.single("file"), uploadDocument);
router.post("/process", processUploadedDocument);
router.get("/chunks/:documentId", getDocumentChunks);

export default router;

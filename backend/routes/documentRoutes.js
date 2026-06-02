import express from "express";
import multer from "multer";

import {
  getDocumentChunks,
  getDocuments,
  processUploadedDocument,
  uploadDocument,
} from "../controllers/documentController.js";

const router = express.Router();
// Secure file uploads with type and size limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, TXT, and DOCX are allowed."));
    }
  }
});

router.get("/documents", getDocuments);
router.post("/upload", upload.single("file"), uploadDocument);
router.post("/process", processUploadedDocument);
router.get("/chunks/:documentId", getDocumentChunks);

export default router;

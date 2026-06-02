import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import { rateLimit } from "express-rate-limit";

// Prevent server from silently crashing on unhandled errors
process.on("uncaughtException", (err) => {
  console.error("FATAL: Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("FATAL: Unhandled Rejection at:", promise, "reason:", reason);
});

import documentRoutes from "./routes/documentRoutes.js";
import ragRoutes from "./routes/ragRoutes.js";
import { getVectorStoreStatus } from "./vectorstore/index.js";

const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const app = express();

// Restrict CORS to specific frontend origin
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());

// Rate Limiting to prevent API abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { message: "Too many requests from this IP, please try again after 15 minutes" }
});
app.use("/api/backend", apiLimiter);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`Backend received: ${req.method} ${req.url}`);
  next();
});

app.use("/", ragRoutes);
app.use("/", documentRoutes);
app.use("/api/backend", ragRoutes);
app.use("/api/backend", documentRoutes);

app.get("/", (_req, res) => {
  res.json({
    message: "Domain-specific RAG backend is running.",
    langsmithEnabled:
      process.env.LANGSMITH_TRACING === "true" &&
      Boolean(process.env.LANGSMITH_API_KEY),
    vectorStore: getVectorStoreStatus(),
  });
});

app.get("/api/backend", (_req, res) => {
  res.json({
    message: "Domain-specific RAG backend is running (prefixed).",
    vectorStore: getVectorStoreStatus(),
  });
});

// Catch-all for /api/backend to prevent fallthrough
app.use("/api/backend", (req, res) => {
  res.status(404).json({
    message: `Backend route not found: ${req.method} ${req.url}`,
  });
});

// Return JSON errors so the frontend can show readable messages.
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    message: error.message || "Internal server error",
  });
});

import { autoIngestSampleDocs } from "./startup/autoIngest.js";

export default app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  // Auto-ingest sample docs in the background after server is ready
  autoIngestSampleDocs().catch((err) =>
    console.error("[Auto-Ingest] Fatal error:", err.message)
  );
});

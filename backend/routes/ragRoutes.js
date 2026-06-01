import express from "express";

import { askQuestion, healthCheck } from "../controllers/ragController.js";

const router = express.Router();

router.get("/health", healthCheck);
router.post("/ask", askQuestion);

export default router;

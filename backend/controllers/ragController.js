import { answerQuestion } from "../services/ragService.js";
import { getDomainProfile } from "../services/domainProfile.js";

export async function askQuestion(req, res, next) {
  try {
    const { question, documentId = null } = req.body;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ message: "A valid question string is required." });
    }

    if (question.length > 1000) {
      return res.status(400).json({ message: "Question exceeds maximum length of 1000 characters." });
    }

    // Basic sanitization to prevent control character injection
    const sanitizedQuestion = question.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();

    const result = await answerQuestion({
      question: sanitizedQuestion,
      documentId,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export function healthCheck(req, res) {
  const domainProfile = getDomainProfile();

  return res.json({
    status: "ok",
    service: "domain-specific-rag-backend",
    domainProfile,
  });
}

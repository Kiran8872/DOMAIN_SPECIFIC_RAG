import { answerQuestion } from "../services/ragService.js";
import { getDomainProfile } from "../services/domainProfile.js";

export async function askQuestion(req, res, next) {
  try {
    const { question, documentId = null } = req.body;

    if (!question) {
      return res.status(400).json({ message: "question is required." });
    }

    const result = await answerQuestion({
      question,
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

import { traceStep } from "../utils/tracing.js";
import { getDomainProfile, getDomainSystemPrompt } from "./domainProfile.js";

const GOOGLE_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
const GROQ_CHAT_MODELS = [
  process.env.GROQ_CHAT_MODEL || "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
];
const GROQ_API_KEY =
  process.env.GROQ_API_KEY || "";

function renderContext(retrievedChunks = []) {
  return retrievedChunks
    .map((chunk, index) => `Chunk ${index + 1}: ${chunk.text}`)
    .join("\n\n");
}

function buildFallbackAnswer(question, retrievedChunks, reason = "") {
  const domainProfile = getDomainProfile();
  if (retrievedChunks.length === 0) {
    return reason
      ? `LLM unavailable (${reason}). I could not find relevant context in ${domainProfile.name} for: ${question}`
      : `I could not find relevant context in ${domainProfile.name} for: ${question}`;
  }

  const topChunk = retrievedChunks[0];
  return [
    reason
      ? `LLM unavailable (${reason}), so this domain-specific RAG used a local fallback answer.`
      : "No LLM API key is configured, so this domain-specific RAG used a local fallback answer.",
    `Most relevant chunk: ${topChunk.text}`,
    `Question: ${question}`,
  ].join("\n\n");
}

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
}

async function fetchGeminiChatCompletion(question, retrievedChunks) {
  const context = renderContext(retrievedChunks);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_CHAT_MODEL}:generateContent?key=${getGoogleApiKey()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.2,
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `${getDomainSystemPrompt()}\n\n` +
                  `Context:\n${context || "No context available."}\n\nQuestion: ${question}`,
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const apiMessage =
      payload?.error?.message ||
      `LLM request failed with status ${response.status}`;
    throw new Error(apiMessage);
  }

  const payload = await response.json();
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .join("")
      .trim() || buildFallbackAnswer(question, retrievedChunks)
  );
}

async function fetchGroqChatCompletion(question, retrievedChunks) {
  const context = renderContext(retrievedChunks);

  for (const model of GROQ_CHAT_MODELS) {
    try {
      console.log(`Trying Groq model: ${model}`);
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: getDomainSystemPrompt(),
              },
              {
                role: "user",
                content: `Context:\n${context || "No context available."}\n\nQuestion: ${question}`,
              },
            ],
            temperature: 0.2,
          }),
        },
      );

      if (response.ok) {
        const payload = await response.json();
        return (
          payload.choices?.[0]?.message?.content?.trim() ||
          buildFallbackAnswer(question, retrievedChunks)
        );
      } else {
        const payload = await response.json().catch(() => ({}));
        console.log(
          `Model ${model} failed:`,
          payload?.error?.message || `Status ${response.status}`,
        );
      }
    } catch (error) {
      console.log(`Model ${model} threw error:`, error.message);
    }
  }

  throw new Error("All Groq models failed");
}

export async function generateAnswer({ question, retrievedChunks = [] }) {
  return traceStep("generate_answer", async () => {
    // Try Gemini first if available
    if (getGoogleApiKey()) {
      try {
        return await fetchGeminiChatCompletion(question, retrievedChunks);
      } catch (geminiError) {
        console.log(
          "Gemini API failed, falling back to Groq:",
          geminiError.message,
        );
      }
    }

    // Try Groq as fallback
    try {
      return await fetchGroqChatCompletion(question, retrievedChunks);
    } catch (groqError) {
      console.log(
        "Groq API also failed, falling back to local:",
        groqError.message,
      );
      return buildFallbackAnswer(
        question,
        retrievedChunks,
        groqError?.message || "All LLM APIs unavailable",
      );
    }
  });
}

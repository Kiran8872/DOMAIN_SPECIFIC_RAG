import { traceStep } from "../utils/tracing.js";
import { getDomainQueryInstructions } from "./domainProfile.js";

const GOOGLE_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest";

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
}

function heuristicRewrite(question) {
  const cleaned = question.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "";
  }

  const withoutQuestionMark = cleaned.replace(/[?]+$/, "");
  const wordCount = withoutQuestionMark.split(/\s+/).length;

  // Short or vague questions benefit from a slightly more explicit retrieval query.
  if (wordCount <= 4 || withoutQuestionMark.length < 32) {
    return `Explain ${withoutQuestionMark} in the context of the uploaded document`;
  }

  return withoutQuestionMark;
}

function sanitizeOptimizedQuery(text, fallbackQuery) {
  const stripped = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^optimized query:\s*/im, "")
    .replace(/^query:\s*/im, "")
    .trim();

  const tokenCount = stripped.split(/\s+/).filter(Boolean).length;
  if (!stripped || tokenCount < 4 || stripped.length < 20) {
    return fallbackQuery;
  }

  return stripped;
}

async function fetchOptimizedQuery(question) {
  const domainInstructions = getDomainQueryInstructions();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_CHAT_MODEL}:generateContent?key=${getGoogleApiKey()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 64,
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `${domainInstructions}\n\n` + `User question: ${question}`,
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload?.error?.message ||
        `Query rewrite failed with status ${response.status}`,
    );
  }

  const payload = await response.json();
  const candidate = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .join("")
    .trim();

  return sanitizeOptimizedQuery(candidate || "", heuristicRewrite(question));
}

export async function optimizeQuery(question) {
  return traceStep("optimize_query", async () => {
    const originalQuery = question.trim();
    const fallbackOptimizedQuery = heuristicRewrite(originalQuery);

    if (!getGoogleApiKey()) {
      return {
        originalQuery,
        optimizedQuery: fallbackOptimizedQuery,
        strategy: "heuristic",
      };
    }

    try {
      const optimizedQuery = await fetchOptimizedQuery(originalQuery);
      return {
        originalQuery,
        optimizedQuery,
        strategy: "llm",
      };
    } catch (error) {
      return {
        originalQuery,
        optimizedQuery: fallbackOptimizedQuery,
        strategy: "heuristic-fallback",
        note: error?.message || "Query optimization fallback used",
      };
    }
  });
}

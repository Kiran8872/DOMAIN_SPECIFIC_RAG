import { normalizeVector } from "../utils/similarity.js";
import { traceStep } from "../utils/tracing.js";

const EMBEDDING_DIMENSION = 128;
const GOOGLE_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

function hashToken(token) {
  let hashValue = 0;

  for (let index = 0; index < token.length; index += 1) {
    hashValue = (hashValue * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hashValue;
}

function buildLocalEmbedding(text) {
  const vector = new Array(EMBEDDING_DIMENSION).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) || [];

  if (tokens.length === 0) {
    return vector;
  }

  tokens.forEach((token, index) => {
    const tokenHash = hashToken(token);
    const primarySlot = tokenHash % EMBEDDING_DIMENSION;
    const secondarySlot = (tokenHash + index * 7) % EMBEDDING_DIMENSION;

    vector[primarySlot] += 1;
    vector[secondarySlot] += 0.5;
  });

  return normalizeVector(vector);
}

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
}

async function fetchGeminiEmbedding(text, taskType) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_EMBEDDING_MODEL}:embedContent?key=${getGoogleApiKey()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSION,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const values =
    payload.embedding?.values ||
    payload.embeddings?.[0]?.values ||
    buildLocalEmbedding(text);
  return normalizeVector(values);
}

export async function createEmbedding(text, taskType = "RETRIEVAL_DOCUMENT") {
  return traceStep("create_embedding", async () => {
    if (!text || !text.trim()) {
      return new Array(EMBEDDING_DIMENSION).fill(0);
    }

    if (!getGoogleApiKey()) {
      return buildLocalEmbedding(text);
    }

    try {
      return await fetchGeminiEmbedding(text, taskType);
    } catch {
      // Fall back to a local embedding so the demo still works without external API access.
      return buildLocalEmbedding(text);
    }
  });
}

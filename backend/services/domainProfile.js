const DEFAULT_DOMAIN_NAME = "Artificial Intelligence & Generative AI";
const DEFAULT_DOMAIN_DESCRIPTION =
  "Answer from the retrieved domain documents about artificial intelligence, generative AI, machine learning, deep learning, neural networks, large language models, and related topics. If uploaded documents contain relevant context for a question, use that context even when the question wording does not match the default domain vocabulary.";
const DEFAULT_DOMAIN_VOCABULARY =
  "Artificial Intelligence, Generative AI, Machine Learning, Deep Learning, Neural Networks, Large Language Models, Transformers, NLP, Computer Vision, Reinforcement Learning, GPT, LLM, Prompt Engineering, ChatGPT, Attention Mechanism, Convolutional Neural Network, Recurrent Neural Network";
const DEFAULT_DOMAIN_GUIDELINES =
  "Use official AI/ML terminology, be precise and technical, focus on practical explanations with examples when possible.";

export function getDomainProfile() {
  return {
    name: process.env.RAG_DOMAIN_NAME || DEFAULT_DOMAIN_NAME,
    description:
      process.env.RAG_DOMAIN_DESCRIPTION || DEFAULT_DOMAIN_DESCRIPTION,
    vocabulary: process.env.RAG_DOMAIN_VOCABULARY || DEFAULT_DOMAIN_VOCABULARY,
    guidelines: process.env.RAG_DOMAIN_GUIDELINES || DEFAULT_DOMAIN_GUIDELINES,
  };
}

export function getDomainSystemPrompt() {
  const domainProfile = getDomainProfile();
  const parts = [
    `You are a STRICT domain-specific expert for ${domainProfile.name}.`,
    domainProfile.description,
  ];

  if (domainProfile.vocabulary) {
    parts.push(
      `Use only domain-specific vocabulary: ${domainProfile.vocabulary}`,
    );
  }

  if (domainProfile.guidelines) {
    parts.push(domainProfile.guidelines);
  }

  parts.push(
    "RULES:",
    "1. Answer using information from the retrieved context chunks. You may synthesize and summarize across multiple chunks.",
    "2. If retrieved context contains relevant information, answer from it even if the question appears outside the default domain.",
    "3. If the retrieved context contains relevant information, provide a comprehensive answer based on it.",
    "4. If no retrieved context is relevant and the question is clearly unrelated to the domain, state that it is not related to the available documents.",
    "5. Maintain a formal, expert tone appropriate for the domain.",
    "6. Prefer information from the provided context, but you may use general domain knowledge to fill small gaps.",
  );

  return parts.join("\n");
}

export function getDomainQueryInstructions() {
  const domainProfile = getDomainProfile();
  const parts = [
    `Rewrite the user's question into an optimal retrieval query for ${domainProfile.name}.`,
  ];

  if (domainProfile.vocabulary) {
    parts.push(`Use domain-specific vocabulary: ${domainProfile.vocabulary}`);
  }

  parts.push(
    "Focus on key concepts and terms from the domain.",
    "Keep the meaning intact and output ONLY one clear sentence (8-25 words).",
    "Do NOT include extra text or explanations.",
  );

  return parts.join("\n");
}

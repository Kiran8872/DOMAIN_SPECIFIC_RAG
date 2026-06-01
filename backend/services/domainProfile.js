const DEFAULT_DOMAIN_NAME = "Full Stack Java Development";
const DEFAULT_DOMAIN_DESCRIPTION =
  "Answer only from retrieved documents about full stack Java development including React, JavaScript, Spring Boot, Java, and MySQL. Reject any off-topic questions not related to these technologies.";
const DEFAULT_DOMAIN_VOCABULARY =
  "React, JavaScript, Spring Boot, Java, MySQL, REST API, JPA, Hibernate, JDBC, Components, Hooks, State, Props, SQL, Queries, Transactions, Indexes";
const DEFAULT_DOMAIN_GUIDELINES =
  "Use official documentation terms, be precise and technical, focus on practical examples when possible.";

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
    "CRITICAL RULES:",
    "1. ONLY answer using information from the retrieved context chunks.",
    "2. If the question is off-topic, explicitly state it's not related to the domain.",
    "3. If the answer is not in the context, say: 'The domain documents do not mention this topic.'",
    "4. Maintain formal, expert tone appropriate for the domain.",
    "5. Do NOT use any external knowledge beyond the provided context.",
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

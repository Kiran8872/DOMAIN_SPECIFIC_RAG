const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "/api/backend"
).replace(/\/$/, "");

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : {
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
}

export const api = {
  listDocuments() {
    return request("/documents");
  },
  uploadDocument(file) {
    const formData = new FormData();
    formData.append("file", file);

    return request("/upload", {
      method: "POST",
      body: formData,
    });
  },
  processDocument(documentId) {
    return request("/process", {
      method: "POST",
      body: JSON.stringify({ documentId }),
    });
  },
  askQuestion({ question, documentId = null }) {
    return request("/ask", {
      method: "POST",
      body: JSON.stringify({ question, documentId }),
    });
  },
  getDocumentChunks(documentId) {
    return request(`/chunks/${documentId}`);
  },
  getDomainProfile() {
    return request("/health");
  },
};

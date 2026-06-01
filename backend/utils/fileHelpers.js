import path from "path";

export function safeFileName(originalName = "document") {
  const baseName = path.basename(originalName, path.extname(originalName));
  const safeBaseName = baseName
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const extension = path.extname(originalName).toLowerCase();

  return `${safeBaseName || "document"}-${Date.now()}${extension}`;
}

export function fileExtension(fileName = "") {
  return path.extname(fileName).toLowerCase();
}

export function previewText(text, maxLength = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

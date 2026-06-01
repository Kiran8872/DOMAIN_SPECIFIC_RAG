export function cleanText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();
}

export function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize ?? 1200;
  const overlap = options.overlap ?? 200;
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < words.length) {
    const endIndex = Math.min(startIndex + chunkSize, words.length);
    const chunk = words.slice(startIndex, endIndex).join(" ");
    chunks.push(chunk);

    if (endIndex >= words.length) {
      break;
    }

    startIndex = Math.max(endIndex - overlap, startIndex + 1);
  }

  return chunks;
}

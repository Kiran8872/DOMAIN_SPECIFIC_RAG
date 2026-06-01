export function cosineSimilarity(leftVector, rightVector) {
  const length = Math.min(leftVector.length, rightVector.length);
  if (length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftVector[index] ?? 0;
    const rightValue = rightVector[index] ?? 0;

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  if (!denominator) {
    return 0;
  }

  return dotProduct / denominator;
}

export function normalizeVector(vector) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (!magnitude) {
    return vector.map(() => 0);
  }

  return vector.map((value) => value / magnitude);
}

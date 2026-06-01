export default function AnswerPanel({ answer, retrievalResult, loading }) {
  const sourceDocuments = retrievalResult?.sourceDocuments || [];

  return (
    <div className="answer-panel">
      {/* Answer Box */}
      <div className="answer-box">
        {loading ? (
          <span style={{ color: 'var(--text-secondary)' }}>Generating answer...</span>
        ) : answer ? (
          <span>{answer}</span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>Ask a question to see the generated answer here.</span>
        )}
      </div>

      {/* Retrieved Chunks */}
      {retrievalResult?.retrievedChunks?.length > 0 && (
        <div className="retrieved-section">
          <h3>Retrieved Context</h3>
          {retrievalResult.retrievedChunks.map((chunk, index) => (
            <div key={index} className="chunk-card">
              <div className="chunk-card__meta">
                <span>{chunk.documentName}</span>
                <span>Chunk {chunk.chunkIndex}</span>
              </div>
              <p>{chunk.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

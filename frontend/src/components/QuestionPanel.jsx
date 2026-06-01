export default function QuestionPanel({ question, onQuestionChange, onAsk, asking, selectedDocumentLabel }) {
  return (
    <div className="question-box">
      <textarea
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="Ask anything about the uploaded documents..."
        rows={3}
      />
      <div className="ask-button-container">
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {selectedDocumentLabel ? `Focus: ${selectedDocumentLabel}` : 'Searching all documents'}
        </span>
        <button className="ask-button" type="button" onClick={onAsk} disabled={asking || !question.trim()}>
          {asking ? 'Thinking...' : 'Ask AI'}
        </button>
      </div>
    </div>
  );
}

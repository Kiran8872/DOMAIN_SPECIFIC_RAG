const pipelineSteps = [
  {
    title: 'Load Domain Docs',
    description: 'Upload a PDF, TXT, DOC, or DOCX file so the backend can extract domain text from it.',
    why: 'Domain-specific RAG starts with authoritative documents for the target subject.',
  },
  {
    title: 'Clean Text',
    description: 'Normalize whitespace and remove noisy characters before chunking.',
    why: 'Clean text improves chunk quality and retrieval consistency across domain sources.',
  },
  {
    title: 'Chunk Documents',
    description: 'Split the document into smaller overlapping chunks.',
    why: 'Smaller chunks are easier to embed and retrieve accurately within the domain.',
  },
  {
    title: 'Create Embeddings',
    description: 'Convert each chunk into a numeric vector using an embedding model.',
    why: 'Embeddings let us compare chunks and questions by meaning in the same domain space.',
  },
  {
    title: 'Store in Chroma',
    description: 'Keep the chunk embeddings in the vector store and keep the chunk text searchable for lexical retrieval.',
    why: 'Chroma becomes the authoritative domain index for semantic and keyword access.',
  },
  {
    title: 'Rewrite Query',
    description: 'Turn a short or vague user question into a domain-aware retrieval query.',
    why: 'Query rewriting helps the retriever search for better terms than the original wording.',
  },
  {
    title: 'Hybrid Search',
    description: 'Run semantic search and keyword search side by side, then merge the results.',
    why: 'Hybrid retrieval combines meaning-based matching with exact term matching inside the domain corpus.',
  },
  {
    title: 'Re-rank Chunks',
    description: 'Sort the merged results again before sending them to the LLM.',
    why: 'Re-ranking pushes the best domain evidence to the top so the model sees cleaner context.',
  },
];

export default function PipelineOverview() {
  return (
    <section className="surface pipeline-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Domain RAG workflow</p>
          <h2>What happens behind the scenes</h2>
        </div>
        <p className="panel-copy">
          This demo shows a domain-specific RAG pipeline while staying small enough to study step by step.
        </p>
      </div>

      <div className="pipeline-grid">
        {pipelineSteps.map((step, index) => (
          <article className="pipeline-card" key={step.title}>
            <div className="pipeline-card__index">0{index + 1}</div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <span>{step.why}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

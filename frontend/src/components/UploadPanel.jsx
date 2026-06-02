export default function UploadPanel({
  documents,
  selectedDocumentId,
  selectedFile,
  onFileChange,
  onUpload,
  onSelectDocument,
  onProcess,
  uploading,
  processing,
  loadingDocuments,
}) {
  return (
    <>
      <div className="upload-box">
        <label className="file-picker">
          <span>Upload Document</span>
          <input
            type="file"
            accept=".pdf,.txt,.docx"
            onChange={(event) => onFileChange(event.target.files?.[0] || null)}
          />
        </label>
        
        <button 
          className="primary-button" 
          type="button" 
          onClick={onUpload} 
          disabled={uploading || !selectedFile}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>

        <button
          className="primary-button"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
          type="button"
          onClick={onProcess}
          disabled={processing || !selectedDocumentId}
        >
          {processing ? 'Processing...' : 'Process Selected'}
        </button>
      </div>

      <div className="document-list">
        <div className="document-list__header">
          <span>Uploaded Documents</span>
          <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
            {loadingDocuments ? '...' : `${documents.length} item(s)`}
          </span>
        </div>

        {documents.length === 0 ? (
          <div style={{ padding: '16px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '12px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            No documents yet.
          </div>
        ) : (
          documents.map((document) => (
            <button
              key={document.documentId}
              type="button"
              className={`document-card ${selectedDocumentId === document.documentId ? 'document-card--active' : ''}`}
              onClick={() => onSelectDocument(document.documentId)}
            >
              <h4 title={document.originalName}>
                {document.originalName.length > 30 ? document.originalName.substring(0, 27) + '...' : document.originalName}
              </h4>
              <div className="document-card__meta">
                <span className={`status-pill status-pill--${document.status}`}>{document.status}</span>
                <span>{document.chunkCount} chunk(s)</span>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}

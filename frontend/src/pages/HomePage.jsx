import { useEffect, useMemo, useState } from 'react';

import AnswerPanel from '../components/AnswerPanel.jsx';
import QuestionPanel from '../components/QuestionPanel.jsx';
import UploadPanel from '../components/UploadPanel.jsx';
import { api } from '../services/api.js';

const emptyLoadingState = {
  uploading: false,
  processing: false,
  asking: false,
  loadingDocuments: true,
  loadingDomain: true,
};

export default function HomePage() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [retrievalResult, setRetrievalResult] = useState(null);
  const [loading, setLoading] = useState(emptyLoadingState);
  const [notice, setNotice] = useState('');
  const [domainProfile, setDomainProfile] = useState(null);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.documentId === selectedDocumentId) || null,
    [documents, selectedDocumentId],
  );

  async function refreshDocuments(nextSelectedId = null) {
    setLoading((current) => ({ ...current, loadingDocuments: true }));

    try {
      const payload = await api.listDocuments();
      setDocuments(payload.documents || []);

      const firstDocument = payload.documents?.[0] || null;
      if (nextSelectedId) {
        setSelectedDocumentId(nextSelectedId);
      } else if (!selectedDocumentId && firstDocument) {
        setSelectedDocumentId(firstDocument.documentId);
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading((current) => ({ ...current, loadingDocuments: false }));
    }
  }

  async function fetchDomainProfile() {
    setLoading((current) => ({ ...current, loadingDomain: true }));
    try {
      const payload = await api.getDomainProfile();
      setDomainProfile(payload.domainProfile);
    } catch (error) {
      console.error('Failed to fetch domain profile:', error);
    } finally {
      setLoading((current) => ({ ...current, loadingDomain: false }));
    }
  }

  useEffect(() => {
    refreshDocuments();
    fetchDomainProfile();
  }, []);

  async function handleUpload() {
    if (!selectedFile) {
      setNotice('Choose a file before uploading.');
      return;
    }

    setLoading((current) => ({ ...current, uploading: true }));
    setNotice('');

    try {
      const payload = await api.uploadDocument(selectedFile);
      setNotice(payload.message);
      setSelectedFile(null);
      await refreshDocuments(payload.document.documentId);

      // Automatically process the uploaded document so users can ask questions immediately.
      setLoading((current) => ({ ...current, processing: true }));
      const processedPayload = await api.processDocument(payload.document.documentId);
      setNotice(processedPayload.message);
      await refreshDocuments(payload.document.documentId);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading((current) => ({ ...current, uploading: false, processing: false }));
    }
  }

  async function ensureProcessedDocument(documentId) {
    const document = documents.find((item) => item.documentId === documentId);

    if (!document) {
      throw new Error('Upload and select a document first.');
    }

    if (document.status === 'processed') {
      return document;
    }

    setLoading((current) => ({ ...current, processing: true }));

    try {
      await api.processDocument(documentId);
      await refreshDocuments(documentId);
      return documents.find((item) => item.documentId === documentId) || document;
    } finally {
      setLoading((current) => ({ ...current, processing: false }));
    }
  }

  async function handleProcess() {
    if (!selectedDocumentId) {
      setNotice('Upload a document first, then select it to process.');
      return;
    }

    setLoading((current) => ({ ...current, processing: true }));
    setNotice('');

    try {
      const payload = await api.processDocument(selectedDocumentId);
      setNotice(payload.message);
      await refreshDocuments(selectedDocumentId);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading((current) => ({ ...current, processing: false }));
    }
  }

  async function handleAsk() {
    if (!question.trim()) {
      setNotice('Type a question before asking.');
      return;
    }

    setLoading((current) => ({ ...current, asking: true }));
    setNotice('');

    try {
      // Only ensure processed document if a specific document is selected
      if (selectedDocumentId) {
        await ensureProcessedDocument(selectedDocumentId);
      }

      const payload = await api.askQuestion({
        question,
        documentId: selectedDocumentId || null,
      });

      setAnswer(payload.answer);
      setRetrievalResult(payload);
      setNotice('Answer generated from retrieved context.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading((current) => ({ ...current, asking: false }));
    }
  }

  return (
    <main className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Domain Expert</h1>
          <p>{loading.loadingDomain ? 'Loading...' : domainProfile?.name}</p>
        </div>

        <UploadPanel
          documents={documents}
          selectedDocumentId={selectedDocumentId}
          selectedFile={selectedFile}
          onFileChange={setSelectedFile}
          onUpload={handleUpload}
          onSelectDocument={setSelectedDocumentId}
          onProcess={handleProcess}
          uploading={loading.uploading}
          processing={loading.processing}
          loadingDocuments={loading.loadingDocuments}
        />
      </aside>

      <section className="main-area">
        <div className="chat-container">
          {notice && <div className="notice">{notice}</div>}
          
          {!answer && domainProfile && (
            <div className="glass-panel">
              <h2>Welcome to {domainProfile.name}</h2>
              <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{domainProfile.description}</p>
              
              {domainProfile.guidelines && (
                <p style={{marginTop: '16px', color: 'var(--text-secondary)'}}><strong>Guidelines:</strong> {domainProfile.guidelines}</p>
              )}
              
              {domainProfile.vocabulary && (
                <div style={{ marginTop: '20px' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>You can ask about:</strong>
                  <div className="tags-container">
                    {domainProfile.vocabulary.split(',').map((topic, i) => (
                      <span 
                        key={i} 
                        className="topic-tag"
                        onClick={() => setQuestion(`Tell me about ${topic.trim()}`)}
                      >
                        {topic.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {answer && (
            <AnswerPanel
              answer={answer}
              retrievalResult={retrievalResult}
              loading={loading.asking}
            />
          )}
        </div>

        <div className="question-panel">
          <QuestionPanel
            question={question}
            onQuestionChange={setQuestion}
            onAsk={handleAsk}
            asking={loading.asking}
            selectedDocumentLabel={selectedDocument?.originalName || ''}
          />
        </div>
      </section>
    </main>
  );
}

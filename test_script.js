import fs from 'fs';

async function testRAG() {
  console.log('Uploading document...');
  const formData = new FormData();
  formData.append('file', new Blob([fs.readFileSync('test_doc.txt')]), 'test_doc.txt');

  const uploadRes = await fetch('http://localhost:3000/api/backend/upload', {
    method: 'POST',
    body: formData
  });
  const uploadData = await uploadRes.json();
  const docId = uploadData.document?.documentId;
  console.log('Uploaded Document ID:', docId);

  if (!docId) {
    console.error('Upload failed', uploadData);
    return;
  }

  console.log('Processing document...');
  const processRes = await fetch('http://localhost:3000/api/backend/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId: docId })
  });
  console.log('Process Response:', await processRes.json());

  console.log('Asking question...');
  const askRes = await fetch('http://localhost:3000/api/backend/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Who invented the Quantum Engine X-1 and when?' })
  });
  
  const askData = await askRes.json();
  console.log('Answer:', askData.answer);
}

testRAG().catch(console.error);

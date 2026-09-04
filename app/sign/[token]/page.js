'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import shared from '../../../styles/shared.module.css';
import shell from '../../../styles/pageShell.module.css';

export default function ExternalSignerPage({ params }) {
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [email, setEmail] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [signing, setSigning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState('');
  const [signedUrl, setSignedUrl] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const signatureCanvasRef = useRef(null);
  const drawingRef = useRef(false);

  function getCanvasPoint(event) {
    const canvas = signatureCanvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  }

  function startSignature(event) {
    const canvas = signatureCanvasRef.current;
    const context = canvas.getContext('2d');
    const point = getCanvasPoint(event);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  }

  function drawSignature(event) {
    if (!drawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    const context = canvas.getContext('2d');
    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setSignatureDataUrl(canvas.toDataURL('image/png'));
  }

  function finishSignature(event) {
    drawingRef.current = false;
    const canvas = signatureCanvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl('');
  }

  const loadRequest = useCallback(async (emailForVerification = '') => {
    const query = emailForVerification ? `?email=${encodeURIComponent(emailForVerification)}` : '';
    try {
      const response = await fetch(`/api/external-sign/${encodeURIComponent(token)}${query}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load signing request.');
      }
      setPayload(data);
      setError('');
      setLoading(false);
      return data;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load signing request.');
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  async function handleVerifySigner() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter the signer email address to continue.');
      return;
    }

    setVerifying(true);
    setError('');
    await loadRequest(normalizedEmail);
    setVerifying(false);
  }

  async function handleSign() {
    setSigning(true);
    setError('');
    setMessage('');

    if (!email.trim()) {
      setSigning(false);
      setError('Please enter your signer email to continue.');
      return;
    }

    if (!signatureName.trim()) {
      setSigning(false);
      setError('Type your full legal name before signing the document.');
      return;
    }

    if (!signatureDataUrl) {
      setSigning(false);
      setError('Draw your signature before signing the document.');
      return;
    }

    let response;
    let data;
    try {
      response = await fetch(`/api/external-sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), signatureName: signatureName.trim(), signatureDataUrl }),
      });
      data = await response.json();
    } catch {
      setSigning(false);
      setError('The signing service is unavailable. Please try again.');
      return;
    }

    setSigning(false);

    if (!response.ok) {
      setError(data.error || 'Unable to complete signature.');
      return;
    }

    setMessage('Signature recorded successfully. You may close this page.');
    setSignedUrl(data.signedUrl || '');
    setPayload((prev) => ({
      ...prev,
      signingRequest: {
        ...prev.signingRequest,
        status: 'signed',
      },
    }));
  }

  return (
    <main className={shell.shell}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <h1 className={shared.pageTitle}>Lawgda</h1>
          <p className={shared.pageSubtitle}>External signing access</p>

          <div className={shared.sectionCard}>
            {loading && <p className={shared.helpText}>Loading signing request...</p>}
            {!loading && error && <p className={`${shared.message} ${shared.messageError}`}>{error}</p>}
            {!loading && payload && (
              <>
                <h2 className={shared.cardTitle}>You have been requested to sign:</h2>
                <p className={shared.cardText}>{payload.document.filename || 'Document'}</p>
                <p className={shared.cardText}>Requested by: {payload.signingRequest.requestedBy}</p>
                <p className={shared.cardText}>Signer: {payload.signingRequest.signerName}</p>
                <p className={shared.cardText}>Status: {payload.signingRequest.status}</p>

                <div className={shared.formGrid} style={{ marginTop: '1rem' }}>
                  <label className={shared.fieldLabel}>
                    Confirm signer email
                    <input
                      className={shared.input}
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={payload.signingRequest.signerEmail}
                    />
                  </label>
                  <button type="button" className={shared.linkButton} onClick={handleVerifySigner} disabled={verifying}>
                    {verifying ? 'Verifying...' : 'Verify Signer'}
                  </button>
                </div>

                {payload.document.reviewUrl && (
                  <div style={{ marginTop: '1rem' }}>
                    <iframe
                      title="Document preview"
                      src={payload.document.reviewUrl}
                      style={{ width: '100%', minHeight: '560px', border: '1px solid #dfe4ef', background: '#fff', borderRadius: '12px' }}
                    />
                    <div className={shared.buttonGroup} style={{ marginTop: '1rem' }}>
                      <a href={payload.document.reviewUrl} target="_blank" rel="noreferrer" className={shared.button}>Review Document</a>
                    </div>
                  </div>
                )}

                {payload.requiresSignerVerification && (
                  <p className={shared.helpText} style={{ marginTop: '0.75rem' }}>
                    Verify signer email to unlock document review.
                  </p>
                )}

                {payload.document.sha256Hash && (
                  <p className={shared.helpText} style={{ marginTop: '1rem' }}>
                    SHA-256: {payload.document.sha256Hash}
                  </p>
                )}

                {payload.signingRequest.status !== 'signed' && payload.document.reviewUrl && (
                  <div className={shared.formGrid} style={{ marginTop: '1rem' }}>
                    <label className={shared.fieldLabel}>
                      Type your full legal name as your signature
                      <input
                        className={shared.input}
                        value={signatureName}
                        onChange={(event) => setSignatureName(event.target.value)}
                        placeholder={payload.signingRequest.signerName}
                      />
                    </label>
                    <div className={shared.fieldLabel}>
                      Draw your signature
                      <canvas
                        ref={signatureCanvasRef}
                        width="900"
                        height="240"
                        className={shared.signaturePad}
                        onPointerDown={startSignature}
                        onPointerMove={drawSignature}
                        onPointerUp={finishSignature}
                        onPointerCancel={finishSignature}
                        aria-label="Draw your signature"
                      />
                      <button type="button" className={shared.textButton} onClick={clearSignature}>
                        Clear signature
                      </button>
                    </div>
                    <button type="button" className={shared.button} onClick={handleSign} disabled={signing}>
                      {signing ? 'Signing...' : 'Sign Document'}
                    </button>
                  </div>
                )}

                {message && <p className={`${shared.message} ${shared.messageSuccess}`}>{message}</p>}
                {signedUrl && (
                  <p className={shared.helpText} style={{ marginTop: '0.75rem' }}>
                    <a href={signedUrl} target="_blank" rel="noreferrer">Open the signed PDF</a>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

'use client';

import NextImage from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import shared from '../../../styles/shared.module.css';
import shell from '../../../styles/pageShell.module.css';

async function readApiPayload(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return {
    error: `Signing service returned an unexpected response (HTTP ${response.status}). Please refresh and try again.`,
  };
}

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
  useEffect(() => () => { if (signedUrl.startsWith('blob:')) URL.revokeObjectURL(signedUrl); }, [signedUrl]);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [signatureInput, setSignatureInput] = useState('draw');
  const uploadVersionRef = useRef(0);
  const [signingMethod, setSigningMethod] = useState('standard');
  const [p12File, setP12File] = useState(null);
  const [p12Passphrase, setP12Passphrase] = useState('');
  const [certificateDetails, setCertificateDetails] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewingCertificate, setPreviewingCertificate] = useState(false);
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
    const context = canvas?.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl('');
  }

  function changeSignatureInput(value) {
    uploadVersionRef.current += 1;
    drawingRef.current = false;
    clearSignature();
    setSignatureInput(value);
  }

  function changeSigningMethod(value) {
    changeSignatureInput('draw');
    setSigningMethod(value);
  }

  function handleSignatureImageUpload(event) {
    const version = ++uploadVersionRef.current;
    setSignatureDataUrl('');
    const imageFile = event.target.files?.[0];
    if (!imageFile || signatureInput !== 'upload') return;
    if (!imageFile.type.startsWith('image/') || imageFile.size > 5 * 1024 * 1024) {
      setError('Choose an image smaller than 5 MB.');
      event.target.value = '';
      return;
    }
    setError('');
    const fail = () => {
      if (version === uploadVersionRef.current) setError('Unable to read this photo. Choose a PNG or JPEG image.');
    };
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = () => {
      const image = new Image();
      image.onerror = fail;
      image.onload = () => {
        if (version !== uploadVersionRef.current) return;
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setSignatureDataUrl(canvas.toDataURL('image/png'));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(imageFile);
  }

  function handleP12Upload(event) {
    setP12File(event.target.files?.[0] || null);
    setCertificateDetails(null);
  }

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async function previewCertificate() {
    setPreviewingCertificate(true);
    setCertificateDetails(null);
    setError('');
    try {
      const response = await fetch(`/api/external-sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview_certificate', signingMethod: 'dict', email: email.trim().toLowerCase(),
          p12Base64: await fileToBase64(p12File), p12Passphrase,
        }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) throw new Error(data.error || 'Unable to read certificate.');
      setCertificateDetails(data.certificate);
    } catch (error) {
      setError(error.message || 'Unable to read certificate.');
    } finally {
      setPreviewingCertificate(false);
    }
  }

  async function computeDocumentHash(reviewUrl) {
    // Hash only a real PDF: hashing an error response would always mismatch.
    const response = await fetch(reviewUrl, { cache: 'no-store' });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/pdf')) {
      const failure = await readApiPayload(response).catch(() => ({}));
      throw new Error(failure?.error || `Unable to load the document (HTTP ${response.status}).`);
    }
    const buffer = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  const loadRequest = useCallback(async (emailForVerification = '') => {
    const query = emailForVerification ? `?email=${encodeURIComponent(emailForVerification)}` : '';
    try {
      const response = await fetch(`/api/external-sign/${encodeURIComponent(token)}${query}`);
      const data = await readApiPayload(response);
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

  function isReadyToSign() {
    if (!email.trim()) return false;
    if (signingMethod === 'dict') return Boolean(p12File && p12Passphrase);
    return Boolean(signatureName.trim() && signatureDataUrl);
  }

  // Signing is irreversible, so ask for explicit confirmation first. Missing
  // inputs fall through to the normal validation messages.
  function requestSignature() {
    if (!isReadyToSign()) {
      handleSign();
      return;
    }
    setConfirmOpen(true);
  }

  async function handleSign() {
    setConfirmOpen(false);
    setSigning(true);
    setError('');
    setMessage('');

    if (!email.trim()) {
      setSigning(false);
      setError('Please enter your signer email to continue.');
      return;
    }

    if (signingMethod === 'standard' && !signatureName.trim()) {
      setSigning(false);
      setError('Type your full legal name before signing the document.');
      return;
    }

    if (signingMethod === 'dict') {
      if (!p12File || !p12Passphrase) {
        setSigning(false);
        setError('Upload your signing certificate and enter its passphrase.');
        return;
      }
    } else if (!signatureDataUrl) {
      setSigning(false);
      setError('Draw or upload your signature before signing the document.');
      return;
    }

    let documentHash = '';
    try {
      documentHash = await computeDocumentHash(payload.document.reviewUrl);
    } catch (hashError) {
      setSigning(false);
      setError(`Unable to compute the document hash in your browser: ${hashError instanceof Error ? hashError.message : 'unknown error'}`);
      return;
    }

    const requestBody = {
      email: email.trim().toLowerCase(),
      signatureName: signatureName.trim(),
      signingMethod,
      documentHash,
    };

    let response;
    let data;
    try {
      if (signingMethod === 'dict') {
        requestBody.p12Base64 = await fileToBase64(p12File);
        requestBody.p12Passphrase = p12Passphrase;
      } else {
        requestBody.signatureDataUrl = signatureDataUrl;
      }
      response = await fetch(`/api/external-sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      data = await readApiPayload(response);
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
    setP12File(null);
    setP12Passphrase('');
    if (data.signedUrl) {
      try {
        const signedFileResponse = await fetch(data.signedUrl, { cache: 'no-store' });
        if (!signedFileResponse.ok) throw new Error('Download failed');
        setSignedUrl(URL.createObjectURL(await signedFileResponse.blob()));
      } catch {
        setError('Your signature was saved, but the PDF could not be loaded. Ask the document owner for a fresh copy.');
      }
    }
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
                    {signingMethod === 'standard' && <label className={shared.fieldLabel}>
                      Type your full legal name as your signature
                      <input
                        className={shared.input}
                        value={signatureName}
                        onChange={(event) => setSignatureName(event.target.value)}
                        placeholder={payload.signingRequest.signerName}
                      />
                    </label>}

                    <div className={shared.fieldLabel}>
                      How would you like to sign?
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem' }}>
                        <label>
                          <input
                            type="radio"
                            name="signingMethod"
                            value="standard"
                            checked={signingMethod === 'standard'}
                            onChange={() => changeSigningMethod('standard')}
                          />{' '}
                          Standard signature
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="signingMethod"
                            value="dict"
                            checked={signingMethod === 'dict'}
                            onChange={() => changeSigningMethod('dict')}
                          />{' '}
                          {certificateDetails ? `Certificate from ${certificateDetails.issuer}` : 'Signing certificate'}
                        </label>
                      </div>
                    </div>

                    {signingMethod === 'standard' && (
                      <>
                        <div className={shared.fieldLabel}>
                          Signature source
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <label><input type="radio" name="signatureInput" checked={signatureInput === 'draw'} disabled={signing} onChange={() => changeSignatureInput('draw')} /> Signature pad</label>
                            <label><input type="radio" name="signatureInput" checked={signatureInput === 'upload'} disabled={signing} onChange={() => changeSignatureInput('upload')} /> Upload photo</label>
                          </div>
                          <p className={shared.helpText}>Choose one. Switching clears the previous signature.</p>
                        </div>
                        {signatureInput === 'draw' ? <div className={shared.fieldLabel}>
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
                        </div> : <label className={shared.fieldLabel}>
                          Upload a photo of your signature
                          <input className={shared.input} type="file" accept="image/*" disabled={signing} onChange={handleSignatureImageUpload} />
                          {signatureDataUrl && <NextImage src={signatureDataUrl} unoptimized width={900} height={240} alt="Uploaded signature preview" style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain' }} />}
                        </label>}
                      </>
                    )}

                    {signingMethod === 'dict' && (
                      <>
                        <label className={shared.fieldLabel}>
                          Upload signing certificate (.p12 or .pfx)
                          <input className={shared.input} type="file" accept=".p12,.pfx" disabled={previewingCertificate || signing} onChange={handleP12Upload} />
                        </label>
                        <label className={shared.fieldLabel}>
                          Certificate passphrase
                          <input
                            className={shared.input}
                            type="password"
                            value={p12Passphrase}
                            disabled={previewingCertificate || signing}
                            onChange={(event) => { setP12Passphrase(event.target.value); setCertificateDetails(null); }}
                          />
                        </label>
                        <button type="button" className={shared.linkButton} onClick={previewCertificate} disabled={!p12File || !p12Passphrase || previewingCertificate || signing}>
                          {previewingCertificate ? 'Reading certificate...' : 'Preview certificate details (optional)'}
                        </button>
                        {certificateDetails && (
                          <div className={shared.sectionCard} style={{ overflowWrap: 'anywhere' }} aria-live="polite">
                            <h3 className={shared.cardTitle}>Certificate details</h3>
                            <p><strong>Digitally signed by:</strong> {certificateDetails.holderName}</p>
                            <p><strong>Issuer:</strong> {certificateDetails.issuer}</p>
                            <p><strong>Certificate ID:</strong> {certificateDetails.serialNumber}</p>
                            <p><strong>Subject:</strong> {certificateDetails.subject}</p>
                            <p><strong>Valid from:</strong> {new Date(certificateDetails.validFrom).toLocaleString()}</p>
                            <p><strong>Valid until:</strong> {new Date(certificateDetails.validTo).toLocaleString()}</p>
                            <p className={shared.helpText}>Your name is taken from this certificate. The certificate file and private key are never included in the signed PDF.</p>
                          </div>
                        )}
                      </>
                    )}

                    <button type="button" className={shared.button} onClick={requestSignature} disabled={signing || previewingCertificate}>
                      {signing ? 'Signing...' : 'Sign Document'}
                    </button>
                  </div>
                )}

                {confirmOpen && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-sign-title"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
                  >
                    <div className={shared.sectionCard} style={{ maxWidth: 460, width: '100%', margin: 0, background: '#fff' }}>
                      <h3 id="confirm-sign-title" style={{ marginTop: 0 }}>Are you sure the details are correct?</h3>
                      <p className={shared.cardText}><strong>Document:</strong> {payload.document.filename || 'Document'}</p>
                      <p className={shared.cardText}><strong>Signer:</strong> {payload.signingRequest.signerName}</p>
                      <p className={shared.cardText}><strong>Email:</strong> {email.trim().toLowerCase()}</p>
                      <p className={shared.cardText}><strong>Method:</strong> {signingMethod === 'dict' ? 'Signing certificate' : 'Standard signature'}</p>
                      <p className={shared.helpText}>Once you sign, this cannot be undone.</p>
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                        <button type="button" className={shared.linkButton} onClick={() => setConfirmOpen(false)}>No</button>
                        <button type="button" className={shared.button} onClick={handleSign}>Yes</button>
                      </div>
                    </div>
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

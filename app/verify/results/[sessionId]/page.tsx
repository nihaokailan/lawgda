'use client';

import { auditEventLabel } from '../../../../lib/auditEventLabel';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getVerificationSession, type VerificationSession } from '../../../../lib/verificationSession';
import { readStoredDocument } from '../../../../lib/documentVerification';
import shared from '../../../../styles/shared.module.css';
import TopNav from '../../../components/TopNav';
import HashComparison from '../../../components/HashComparison';
import BackButton from '../../../components/BackButton';
import styles from './results.module.css';

type AuditEntry = { id: string; event_type: string; created_at: string; actor_email?: string; details?: Record<string, unknown>; title?: string; lines?: string[]; actorName?: string; actorRole?: string; actorEmail?: string | null };
type ChainEntry = { signer_name?: string; signer_email?: string; signed_at?: string; pre_sign_hash?: string; post_sign_hash?: string };

export default function VerificationResults({ params }: { params: { sessionId: string } }) {
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [ready, setReady] = useState(false);
  const [checkedUrl, setCheckedUrl] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceIsPdf, setReferenceIsPdf] = useState(true);
  const [fileError, setFileError] = useState('');
  const [auditError, setAuditError] = useState('');
  const [audit, setAudit] = useState<{ auditTrail: AuditEntry[]; hashChain: ChainEntry[]; chainIntegrity: { signingAuditValid: boolean | null; auditLogsValid: boolean | null } } | null>(null);

  useEffect(() => {
    const result = getVerificationSession(params.sessionId);
    setSession(result);
    setReady(true);
    if (!result) return;
    const controller = new AbortController();
    const urls: string[] = [];
    const localUrl = URL.createObjectURL(result.checkedFile);
    urls.push(localUrl);
    setCheckedUrl(localUrl);
    // Uploaded files compare with the selected stored version. Stored signed
    // files compare visually with the original document that began the workflow.
    const query = result.source === 'device' && result.version === 'signed' ? '?version=signed' : '';
    readStoredDocument(result.documentId, query, controller.signal).then(bytes => {
      if (controller.signal.aborted) return;
      const isPdf = new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-');
      setReferenceIsPdf(isPdf);
      const url = URL.createObjectURL(new Blob([bytes], { type: isPdf ? 'application/pdf' : 'application/octet-stream' }));
      urls.push(url);
      setReferenceUrl(url);
    }).catch(() => {
      if (!controller.signal.aborted) setFileError('Unable to load the Lawgda comparison document. Return to verification and try again.');
    });
    fetch(`/api/documents/${encodeURIComponent(result.documentId)}/audit`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load the hash chain and audit trail.');
        return response.json();
      }).then(data => { if (!controller.signal.aborted) setAudit(data); })
      .catch(() => { if (!controller.signal.aborted) setAuditError('Unable to load the hash chain and audit trail.'); });
    return () => { controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [params.sessionId]);

  if (!ready) return <main className={styles.page}><TopNav /><p className={styles.loading}>Loading verification…</p></main>;
  if (!session) return <main className={styles.page}><TopNav /><section className={styles.expired}><h1>Verification session expired</h1><p>Please select and verify the file again. Local files are kept only while this tab stays open without reloading.</p><Link href="/verify" className={shared.button}>Verify a document</Link></section></main>;
  const referenceLabel = session.source === 'device' && session.version === 'signed' ? 'Lawgda — latest signed document' : 'Lawgda — original document';
  const status = (value: boolean | null) => value === true ? 'Verified' : value === false ? 'Integrity check failed' : 'Not available';

  return <main className={styles.page}>
    <TopNav />
    <div className={styles.pageContent}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Verification <span aria-hidden="true">/</span> Results</p><h1>{session.title}</h1></div><div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}><BackButton className={shared.linkButton} fallbackHref="/verify" /><Link href="/verify" className={shared.linkButton}>Verify another document</Link></div></header>
    <HashComparison
      verdict={session.matches ? 'match' : 'mismatch'}
      message={session.matches ? 'Integrity verified — the checked file is identical to the recorded document version.' : 'The checked file does not match the recorded document version. It is a different file or it was altered.'}
      checkedHash={session.computedHash}
      recordedHash={session.expectedHash}
    />
    <div className={styles.columns}>
      <section className={styles.panel}><h2>{session.source === 'device' ? 'Your selected file' : `Verified ${session.version} document`}</h2><p>{session.checkedName}</p>{checkedUrl && (session.checkedFile.type === 'application/pdf' || session.checkedName.toLowerCase().endsWith('.pdf') ? <iframe className={styles.preview} title="Checked document" src={checkedUrl} /> : <p>This file type cannot be previewed in the browser. <a href={checkedUrl} download={session.checkedName}>Download the checked file</a></p>)}</section>
      <section className={styles.panel}><h2>{referenceLabel}</h2><p>{session.title}</p>{fileError ? <p role="alert">{fileError}</p> : referenceUrl ? (referenceIsPdf ? <iframe className={styles.preview} title="Lawgda comparison document" src={referenceUrl} /> : <p>This file type cannot be previewed in the browser. <a href={referenceUrl} download={session.title}>Download the Lawgda document</a></p>) : <p>Loading document…</p>}</section>
    </div>
    {auditError && <p className={`${shared.message} ${shared.messageError}`} role="alert">{auditError}</p>}
    <div className={styles.columns}>
      <section className={styles.panel}><h2>Document hash chain</h2><div className={styles.scroll} tabIndex={0} role="region" aria-label="Document hash chain">
        {!audit ? <p>{auditError || 'Loading hash chain…'}</p> : audit.hashChain.length === 0 ? <p>No completed signatures recorded.</p> : audit.hashChain.map((entry, index) => <article className={styles.entry} key={index}><strong>{index + 1}. {entry.signer_name || entry.signer_email || 'Signer'}</strong><p>{entry.signed_at ? new Date(entry.signed_at).toLocaleString() : ''}</p><small>Before signing</small><code>{entry.pre_sign_hash || 'Not recorded'}</code><small>After signing</small><code>{entry.post_sign_hash || 'Not recorded'}</code></article>)}
      </div></section>
      <section className={styles.panel}><h2>Audit trail</h2>{audit && <p>Document audit: {status(audit.chainIntegrity.auditLogsValid)} · Signing audit: {status(audit.chainIntegrity.signingAuditValid)}</p>}<div className={styles.scroll} tabIndex={0} role="region" aria-label="Audit trail">
        {!audit ? <p>{auditError || 'Loading audit trail…'}</p> : audit.auditTrail.length === 0 ? <p>No audit events recorded.</p> : audit.auditTrail.map(entry => <article className={styles.entry} key={`${entry.id}-${entry.event_type}`}><strong>{entry.title || auditEventLabel(entry)}</strong><p>By {entry.actorName || 'System'}{entry.actorEmail ? ` <${entry.actorEmail}>` : ''}{entry.actorRole ? ` (${entry.actorRole})` : ''} · {new Date(entry.created_at).toLocaleString()}</p>{(entry.lines || []).map(line => <small key={line}>{line}</small>)}</article>)}
      </div></section>
    </div>
    </div>
  </main>;
}

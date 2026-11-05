import { loadDocumentAuditHistory } from '../../../lib/documentAuditHistory';
import { enrichAuditEntries } from '../../../lib/auditPresentation';

export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyWithPublicKeyPem, verifyRsaDigestWithCertificate, LEGACY_RSA_SIGNATURE_SCHEME } from '../../../lib/keyWrapping';
import shared from '../../../styles/shared.module.css';
import shell from '../../../styles/pageShell.module.css';
import PublicFileCheck from '../../components/PublicFileCheck';
import TopNav from '../../components/TopNav';
import BackButton from '../../components/BackButton';

function getMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatDate(value: unknown) {
  return value ? new Date(String(value)).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium' }) + ' PHT' : '-';
}

export default async function PublicAuditPage({ params }: { params: { auditToken: string } }) {
  const auditToken = String(params.auditToken || '').trim();
  const supabase = getSupabaseAdmin();
  const { data: document } = await supabase
    .from('documents')
    .select('id,title,filename,metadata,created_at')
    .contains('metadata', { audit_token: auditToken })
    .maybeSingle();

  if (!document) notFound();

  const metadata = getMetadata(document.metadata);
  const hashChain = Array.isArray(metadata.hash_chain)
    ? metadata.hash_chain.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];

  let history: Awaited<ReturnType<typeof loadDocumentAuditHistory>> | null = null;
  try {
    history = await loadDocumentAuditHistory(supabase, document.id);
  } catch {
    // Missing data must never be presented as a verified empty chain.
  }
  // Who did what: names, emails and roles for each recorded event.
  let entries: Awaited<ReturnType<typeof enrichAuditEntries>> = [];
  if (history) {
    try {
      entries = await enrichAuditEntries(supabase, history.events);
    } catch {
      history = null;
    }
  }
  const integrity = history?.valid ?? null;
  const hasUploadEvent = history?.events.some((event) => ['document_uploaded', 'uploaded', 'document_created'].includes(event.event_type));

  return (
    <main className={shell.shell}>
      <TopNav />
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <header className={shared.pageActionHeader}>
            <div>
              <p className={shared.breadcrumb}>Verification <span aria-hidden="true">/</span> Audit trail</p>
              <h1 className={shared.pageTitle}>Document Audit Trail</h1>
              <p className={shared.pageSubtitle}>{String(document.title || document.filename || 'Signed document')}</p>
            </div>
            <BackButton className={shared.linkButton} fallbackHref="/landing" />
          </header>
          <section className={shared.sectionCard} style={{ marginBottom: '1rem' }}>
            <h2 className={shared.cardTitle}>Audit chain integrity</h2>
            <p role="status" style={{ color: integrity === false ? '#991b1b' : integrity === true ? '#047857' : '#92400e', fontWeight: 700 }}>
              {integrity === true ? '✓ Verified — no tampering detected in the recorded audit chains'
                : integrity === false ? '✗ Broken chain — audit records may have been altered or are missing'
                  : 'Not fully verifiable — historical hashes or audit data unavailable'}
            </p>
            <p className={shared.helpText}>Confirms no recorded event was changed. Older events without hashes can’t be checked. To check a PDF copy, use the file check below.</p>
          </section>
          <PublicFileCheck auditToken={auditToken} />
          <section className={shared.sectionCard} style={{ marginBottom: '1rem' }}>
            <h2 className={shared.cardTitle}>Document history</h2>
            <p className={shared.helpText}>Oldest to newest · Philippine time</p>
            {!history && <p className={shared.messageError}>Unable to load the audit history. Please refresh to try again.</p>}
            {history && (
              <ol style={{ paddingLeft: '1.5rem' }}>
                {!hasUploadEvent && document.created_at && (
                  <li style={{ padding: '0.75rem 0' }}>
                    <strong>Document uploaded / created</strong>
                    <p className={shared.helpText}>{formatDate(document.created_at)}</p>
                    <p className={shared.helpText}>From the document creation record; not part of the verified audit chain.</p>
                  </li>
                )}
                {history.events.map((event, index) => {
                  const entry = entries[index];
                  return (
                    <li key={event.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)', overflowWrap: 'anywhere' }}>
                      <strong>{entry.title}</strong>
                      <p className={shared.cardText} style={{ marginTop: '0.25rem' }}>
                        By <strong>{entry.actorName}</strong>
                        {entry.actorEmail && <span> ({entry.actorEmail})</span>}
                        <span> · {entry.actorRole}</span>
                      </p>
                      <p className={shared.helpText} style={{ margin: 0 }}>{formatDate(event.created_at)}</p>
                      {entry.lines.length > 0 && (
                        <ul className={shared.helpText} style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                          {entry.lines.map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      )}
                      {!event.record_hash && <p className={shared.helpText} style={{ margin: 0 }}>Historical event — no verification hash recorded</p>}
                    </li>
                  );
                })}
                {history.events.length === 0 && !document.created_at && <li>No audit events recorded.</li>}
              </ol>
            )}
          </section>
          <section className={shared.sectionCard}>
            <h2 className={shared.cardTitle}>Completed signatures</h2>
            {hashChain.length === 0 && <p className={shared.helpText}>No signature records are available.</p>}
            {hashChain.map((entry, index) => (
              <div key={String(entry.signing_request_id || index)} style={{ borderBottom: '1px solid var(--border)', padding: '0.85rem 0' }}>
                <p className={shared.cardText}><strong>Signer {index + 1}:</strong> {String(entry.signer_name || '-')}{entry.signer_email ? ` (${String(entry.signer_email)})` : ''}</p>
                <p className={shared.helpText}><strong>Signed:</strong> {formatDate(entry.signed_at)}</p>
                <p className={shared.helpText} style={{ overflowWrap: 'anywhere' }}><strong>Pre-sign SHA-256:</strong> {String(entry.pre_sign_hash || '-')}</p>
                <p className={shared.helpText} style={{ overflowWrap: 'anywhere' }}><strong>Post-sign SHA-256:</strong> {String(entry.post_sign_hash || '-')}</p>
                <p className={shared.helpText}><strong>Signing method:</strong> {entry.signing_method === 'dict' ? `Certificate — ${String((entry.certificate_details as { issuer?: string } | undefined)?.issuer || 'issuer unavailable')}` : 'Standard signature'}</p>
                {entry.cryptographic_signature && entry.certificate_pem ? (
                  (() => {
                    const coveredHash = entry.signature_covers === 'post_sign_hash' ? entry.post_sign_hash : entry.pre_sign_hash;
                    const signatureValid = verifyRsaDigestWithCertificate(
                      String(entry.certificate_pem),
                      Buffer.from(String(coveredHash || ''), 'hex'),
                      String(entry.cryptographic_signature),
                      // Entries written before signature_scheme existed used the legacy double-hash scheme.
                      String(entry.signature_scheme || LEGACY_RSA_SIGNATURE_SCHEME)
                    );
                    return (
                      <p className={shared.helpText}>
                        <strong>Cryptographic signature:</strong>{' '}
                        <span style={{ color: signatureValid ? '#047857' : '#991b1b', fontWeight: 700 }}>
                          {signatureValid ? '✓ Verified (RSA / signing certificate)' : '✗ Invalid signature'}
                        </span>
                      </p>
                    );
                  })()
                ) : entry.cryptographic_signature && entry.signing_public_key ? (
                  (() => {
                    const coveredHash = entry.signature_covers === 'pre_sign_hash' ? entry.pre_sign_hash : entry.post_sign_hash;
                    const signatureValid = verifyWithPublicKeyPem(
                      String(entry.signing_public_key),
                      Buffer.from(String(coveredHash || ''), 'hex'),
                      String(entry.cryptographic_signature)
                    );
                    return (
                      <p className={shared.helpText}>
                        <strong>Cryptographic signature:</strong>{' '}
                        <span style={{ color: signatureValid ? '#047857' : '#991b1b', fontWeight: 700 }}>
                          {signatureValid ? '✓ Verified (Ed25519)' : '✗ Invalid signature'}
                        </span>
                      </p>
                    );
                  })()
                ) : (
                  <p className={shared.helpText}><strong>Cryptographic signature:</strong> Not available for this signer.</p>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
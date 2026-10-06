import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import LawgdaLogo from '../../../components/LawgdaLogo';
import AuditTrailList from '../../../components/AuditTrailList';
import { enrichAuditEntries } from '../../../../lib/auditPresentation';
import WorkspaceShell from '../../../components/WorkspaceShell';
import { requireDocumentAccess } from '../../../../lib/authGuard';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import shared from '../../../../styles/shared.module.css';
import { verifyAuditLogsChain, verifySigningAuditChain } from '../../../../lib/auditChainVerify';

function getMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getDocumentType(document: Record<string, unknown>) {
  const mimeType = String(document.mime_type || '').trim();
  if (mimeType) return mimeType;
  const path = String(document.file_path || document.storage_path || document.path || '').toLowerCase();
  return path.endsWith('.pdf') ? 'PDF document' : 'Document';
}

function formatDate(value: unknown) {
  if (!value) return '-';
  return new Date(String(value)).toLocaleString();
}

export default async function SignedDocumentPage({ params }: { params: { documentId: string } }) {
  const { user, profile } = await requireDocumentAccess();
  const supabase = getSupabaseAdmin();
  const documentId = String(params.documentId || '').trim();
  const { data: document } = await supabase.from('documents').select('*').eq('id', documentId).maybeSingle();

  if (!document) notFound();

  const ownerId = document.owner_id ?? document.user_id;
  const uploaderId = document.uploaded_by ?? null;
  let allowed = ownerId === user.id || uploaderId === user.id;
  if (!allowed) {
    const { data: permission } = await supabase
      .from('document_permissions')
      .select('id')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .maybeSingle();
    allowed = Boolean(permission);
  }
  if (!allowed) redirect('/dashboard');

  const metadata = getMetadata(document.metadata);
  const hashChain = Array.isArray(metadata.hash_chain)
    ? metadata.hash_chain.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
  const { data: signingRequests } = await supabase
    .from('signing_requests')
    .select('signer_name,signer_email,status,signed_at')
    .eq('document_id', documentId)
    .order('signing_order', { ascending: true });
  const { data: signingAudit, error: signingAuditError } = await supabase
    .from('signing_audit_events')
    .select('id,event_type,created_at,created_at_text:created_at::text,actor_type,actor_user_id,actor_email,details,details_text:details::text,previous_hash,record_hash,signing_request_id,document_id')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const { data: auditLogs, error: auditLogsError } = await supabase
    .from('audit_logs')
    .select('id,event_type,created_at,created_at_text:created_at::text,actor_user_id,details,details_text:details::text,previous_hash,record_hash,document_id')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  const signingChain = verifySigningAuditChain(signingAudit || []);
  const auditLogsChain = verifyAuditLogsChain(auditLogs || []);
  const chainVerified = signingAuditError || auditLogsError ? null
    : signingChain.valid === false || auditLogsChain.valid === false ? false
    : signingChain.valid === null || auditLogsChain.valid === null ? null : true;

  const auditTrail = [...(signingAudit || []), ...(auditLogs || [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const auditEntries = await enrichAuditEntries(supabase, auditTrail);
  const signedPath = String(metadata.signed_file_path || metadata.signed_storage_path || metadata.signed_path || '');
  const signedUrl = signedPath ? `/api/documents/${encodeURIComponent(documentId)}/download?version=signed&inline=1` : '';
  const signer = signingRequests?.find((request) => request.status === 'signed') || signingRequests?.[0];
  const signerName = String(metadata.signature_name || signer?.signer_name || '-');
  const signerEmail = String(metadata.signature_email || signer?.signer_email || '-');

  return (
    <WorkspaceShell profile={profile} title="Signed Document" subtitle="Read-only signed document record and audit history.">
      <header
        style={{
          background: 'linear-gradient(135deg, #6a0f1a 0%, #8f1b2b 100%)',
          color: '#fff',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <LawgdaLogo color="#ffffff" textColor="#ffffff" size={36} />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: '999px', padding: '0.35rem 0.85rem', fontWeight: 700, fontSize: '0.85rem' }}>
            {signedPath ? '✓ Electronically signed' : 'Awaiting signature'}
          </span>
          <span
            style={{
              background: chainVerified === null ? '#fef3c7' : chainVerified ? '#d1fae5' : '#fee2e2',
              color: chainVerified === null ? '#92400e' : chainVerified ? '#047857' : '#991b1b',
              borderRadius: '999px', padding: '0.35rem 0.85rem', fontWeight: 700, fontSize: '0.85rem',
            }}
          >
            {chainVerified === null ? 'Integrity unverified' : chainVerified ? 'Integrity verified' : 'Integrity broken'}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <Link href={`/documents/${documentId}`} className={shared.linkButton}>Back to Document</Link>
        {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" className={shared.button}>Open Signed PDF</a>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
        <section className={shared.sectionCard}>
          <h2 className={shared.cardTitle}>Signed document details</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.85rem', margin: 0 }}>
            {[
              ['Signed by', signerName],
              ['Email', signerEmail],
              ['Signed on', formatDate(metadata.signed_at || signer?.signed_at)],
              ['Document type', getDocumentType(document)],
              ['Signature', signedPath ? 'Embedded in the signed PDF' : 'Not signed yet'],
            ].map(([label, value]) => (
              <div key={label} style={{ borderLeft: '3px solid #6a0f1a', paddingLeft: '0.75rem' }}>
                <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>{label}</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
              </div>
            ))}
            <div style={{ borderLeft: '3px solid #6a0f1a', paddingLeft: '0.75rem' }}>
              <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Document hash (SHA-256)</dt>
              <dd style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{document.sha256_hash || '-'}</dd>
            </div>
          </dl>
        </section>

        <section className={shared.sectionCard}>
          <h2 className={shared.cardTitle}>Audit trail</h2>
          <p className={shared.cardText}>
            <strong>Chain integrity:</strong>{' '}
            <span style={{ color: chainVerified === null ? '#92400e' : chainVerified ? '#047857' : '#991b1b', fontWeight: 700 }}>
              {chainVerified === null ? 'Not fully verifiable — historical hashes or audit data unavailable' : chainVerified ? '✓ Verified — no tampering detected' : '✗ Broken — records may have been altered'}
            </span>
          </p>
          <AuditTrailList entries={auditEntries} maxHeight={480} />
        </section>
      </div>

      <section className={shared.sectionCard}>
        <h2 className={shared.cardTitle}>Hash chain</h2>
        {hashChain.length === 0 && <p className={shared.helpText}>No completed signature hashes recorded.</p>}
        {hashChain.map((entry, index) => (
          <div key={String(entry.signing_request_id || index)} style={{ borderBottom: '1px solid var(--border)', padding: '0.75rem 0' }}>
            <p className={shared.cardText}><strong>Signer {index + 1}:</strong> {String(entry.signer_name || entry.signer_email || '-')}</p>
            <p className={shared.helpText}><strong>Pre-sign SHA-256:</strong> {String(entry.pre_sign_hash || '-')}</p>
            <p className={shared.helpText}><strong>Post-sign SHA-256:</strong> {String(entry.post_sign_hash || '-')}</p>
            <p className={shared.helpText}><strong>Signed:</strong> {formatDate(entry.signed_at)}</p>
          </div>
        ))}
      </section>

      <section className={shared.sectionCard}>
        <h2 className={shared.cardTitle}>Signed PDF</h2>
        {signedUrl ? (
          <iframe title="Signed PDF" src={signedUrl} style={{ width: '100%', minHeight: '720px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' }} />
        ) : (
          <p className={shared.helpText}>This document has not been signed yet.</p>
        )}
      </section>
    </WorkspaceShell>
  );
}

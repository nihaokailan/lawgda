import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import WorkspaceShell from '../../../components/WorkspaceShell';
import { requireAuthProfile } from '../../../../lib/authGuard';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import shared from '../../../../styles/shared.module.css';

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
  const { user, profile } = await requireAuthProfile('/signin');
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
  const { data: signingRequests } = await supabase
    .from('signing_requests')
    .select('signer_name,signer_email,status,signed_at')
    .eq('document_id', documentId)
    .order('signing_order', { ascending: true });
  const { data: signingAudit } = await supabase
    .from('signing_audit_events')
    .select('id,event_type,created_at,actor_user_id,details')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(50);
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('id,event_type,created_at,actor_user_id,details')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(50);

  const auditTrail = [...(signingAudit || []), ...(auditLogs || [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const signedPath = String(metadata.signed_file_path || metadata.signed_storage_path || metadata.signed_path || '');
  const signedBucket = String(metadata.signed_bucket || document.bucket || 'secure_docs');
  let signedUrl = '';
  if (signedPath) {
    const { data } = await supabase.storage.from(signedBucket).createSignedUrl(signedPath, 3600);
    signedUrl = data?.signedUrl || '';
  }
  const signer = signingRequests?.find((request) => request.status === 'signed') || signingRequests?.[0];
  const signerName = String(metadata.signature_name || signer?.signer_name || '-');
  const signerEmail = String(metadata.signature_email || signer?.signer_email || '-');

  return (
    <WorkspaceShell profile={profile} title="Signed Document" subtitle="Read-only signed document record and audit history.">
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <Link href={`/documents/${documentId}`} className={shared.linkButton}>Back to Document</Link>
        {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" className={shared.button}>Open Signed PDF</a>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
        <section className={shared.sectionCard}>
          <h2 className={shared.cardTitle}>Signed document details</h2>
          <p className={shared.cardText}><strong>Name:</strong> {signerName}</p>
          <p className={shared.cardText}><strong>Email:</strong> {signerEmail}</p>
          <p className={shared.cardText}><strong>Signature:</strong> {signedPath ? 'Handwritten signature embedded in signed PDF' : 'Not signed yet'}</p>
          <p className={shared.cardText}><strong>Document Hash:</strong> {document.sha256_hash || '-'}</p>
          <p className={shared.cardText}><strong>What Kind of Document:</strong> {getDocumentType(document)}</p>
          <p className={shared.cardText}><strong>Signed:</strong> {formatDate(metadata.signed_at || signer?.signed_at)}</p>
        </section>

        <section className={shared.sectionCard}>
          <h2 className={shared.cardTitle}>Audit trail</h2>
          {auditTrail.length === 0 && <p className={shared.helpText}>No audit events recorded.</p>}
          {auditTrail.length > 0 && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {auditTrail.map((event) => (
                <div key={event.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
                  <strong>{event.event_type}</strong>
                  <div className={shared.helpText}>{formatDate(event.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

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

import { notFound, redirect } from 'next/navigation';
import { hasDocumentAccess } from '../../../../lib/documentAccess';
import Link from 'next/link';
import WorkspaceShell from '../../../components/WorkspaceShell';
import RealtimeRefresh from '../../../components/RealtimeRefresh';
import { requireDocumentAccess } from '../../../../lib/authGuard';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import shared from '../../../../styles/shared.module.css';
import { verifyAuditLogsChain, verifySigningAuditChain } from '../../../../lib/auditChainVerify';

function getMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

  const allowed = await hasDocumentAccess({ user, profile, document });
  if (!allowed) redirect('/dashboard');

  const metadata = getMetadata(document.metadata);
  const hashChain = Array.isArray(metadata.hash_chain)
    ? metadata.hash_chain.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
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

  const signedPath = String(metadata.signed_file_path || metadata.signed_storage_path || metadata.signed_path || '');
  const integrityTone = chainVerified === null
    ? { background: '#fef3c7', color: '#92400e', text: 'Audit chain: not fully verifiable' }
    : chainVerified
      ? { background: '#d1fae5', color: '#047857', text: 'Audit chain: verified, no tampering' }
      : { background: '#fee2e2', color: '#991b1b', text: 'Audit chain: broken, records may be altered' };
  const chip = { borderRadius: '999px', padding: '0.35rem 0.85rem', fontWeight: 700, fontSize: '0.85rem' };
  const label = { fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--muted)', margin: 0 };
  const hash = { margin: '0.15rem 0 0', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.8rem', wordBreak: 'break-all' as const };

  return (
    <WorkspaceShell profile={profile} title="Signature Record" subtitle="Who signed, when, and proof the file wasn't altered.">
      <RealtimeRefresh filter={`id=eq.${documentId}`} />

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <Link href={`/documents/${documentId}`} className={shared.linkButton}>&larr; Back to Document</Link>
        <span style={{ ...chip, background: signedPath ? '#d1fae5' : '#f3f4f6', color: signedPath ? '#047857' : '#4b5563' }}>
          {signedPath ? '✓ Electronically signed' : 'Awaiting signature'}
        </span>
        <span style={{ ...chip, background: integrityTone.background, color: integrityTone.color }}>{integrityTone.text}</span>
      </div>

      <section className={shared.sectionCard}>
        <h2 className={shared.cardTitle}>Original upload</h2>
        <p style={label}>SHA-256 at upload</p>
        <p style={hash}>{document.sha256_hash || '-'}</p>
      </section>

      <section className={shared.sectionCard}>
        <h2 className={shared.cardTitle}>Signatures ({hashChain.length})</h2>
        {hashChain.length === 0 && <p className={shared.helpText}>No completed signatures yet.</p>}
        {hashChain.map((entry, index) => (
          <div key={String(entry.signing_request_id || index)} style={{ borderLeft: '3px solid var(--crimson)', paddingLeft: '0.85rem', margin: '1rem 0' }}>
            <p className={shared.cardText} style={{ margin: 0 }}>
              <strong>{index + 1}. {String(entry.signer_name || entry.signer_email || '-')}</strong>
              {entry.signer_email ? <span style={{ color: 'var(--muted)' }}> · {String(entry.signer_email)}</span> : null}
            </p>
            <p className={shared.helpText} style={{ margin: '0.2rem 0 0.5rem' }}>
              {formatDate(entry.signed_at)} · {entry.signing_method === 'dict' ? 'Signing certificate (.p12)' : 'Standard signature'}
            </p>
            <p style={label}>Before signing</p>
            <p style={hash}>{String(entry.pre_sign_hash || '-')}</p>
            <p style={{ ...label, marginTop: '0.5rem' }}>After signing</p>
            <p style={hash}>{String(entry.post_sign_hash || '-')}</p>
          </div>
        ))}
      </section>
    </WorkspaceShell>
  );
}

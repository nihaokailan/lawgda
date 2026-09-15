import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import shared from '../../../styles/shared.module.css';
import shell from '../../../styles/pageShell.module.css';

function getMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatDate(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : '-';
}

export default async function PublicAuditPage({ params }: { params: { auditToken: string } }) {
  const auditToken = String(params.auditToken || '').trim();
  const supabase = getSupabaseAdmin();
  const { data: document } = await supabase
    .from('documents')
    .select('title,filename,metadata')
    .contains('metadata', { audit_token: auditToken })
    .maybeSingle();

  if (!document) notFound();

  const metadata = getMetadata(document.metadata);
  const hashChain = Array.isArray(metadata.hash_chain)
    ? metadata.hash_chain.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];

  return (
    <main className={shell.shell}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <h1 className={shared.pageTitle}>Document Audit Trail</h1>
          <p className={shared.pageSubtitle}>{String(document.title || document.filename || 'Signed document')}</p>
          <section className={shared.sectionCard}>
            <h2 className={shared.cardTitle}>Completed signatures</h2>
            {hashChain.length === 0 && <p className={shared.helpText}>No signature records are available.</p>}
            {hashChain.map((entry, index) => (
              <div key={String(entry.signing_request_id || index)} style={{ borderBottom: '1px solid var(--border)', padding: '0.85rem 0' }}>
                <p className={shared.cardText}><strong>Signer {index + 1}:</strong> {String(entry.signer_name || '-')}</p>
                <p className={shared.helpText}><strong>Signed:</strong> {formatDate(entry.signed_at)}</p>
                <p className={shared.helpText} style={{ overflowWrap: 'anywhere' }}><strong>Pre-sign SHA-256:</strong> {String(entry.pre_sign_hash || '-')}</p>
                <p className={shared.helpText} style={{ overflowWrap: 'anywhere' }}><strong>Post-sign SHA-256:</strong> {String(entry.post_sign_hash || '-')}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
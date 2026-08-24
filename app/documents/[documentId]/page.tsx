import { notFound, redirect } from 'next/navigation';
import WorkspaceShell from '../../components/WorkspaceShell';
import { requireAuthProfile } from '../../../lib/authGuard';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import DocumentViewClient from './DocumentViewClient';
import Link from 'next/link';
import shared from '../../../styles/shared.module.css';

function normalizeStatus(value: unknown) {
  const status = String(value || '').toLowerCase();
  if (status.includes('pending')) return 'Pending Signatures';
  if (status.includes('sign')) return 'Signed';
  if (status.includes('file')) return 'Filed';
  if (status.includes('draft')) return 'Drafting';
  return 'Drafting';
}

export default async function DocumentViewPage({ params }: { params: { documentId: string } }) {
  const { user, profile } = await requireAuthProfile('/signin');
  const supabase = createSupabaseServerClient();
  const documentId = params.documentId;

  // Fetch document
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id,title,status,sha256_hash,created_at,user_id,owner_id')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    notFound();
  }

  // Check permissions
  const ownerId = document.owner_id ?? document.user_id;
  let hasPermission = ownerId === user.id;

  if (!hasPermission) {
    const { data: permission } = await supabase
      .from('document_permissions')
      .select('id')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .maybeSingle();
    hasPermission = Boolean(permission);
  }

  if (!hasPermission) {
    redirect('/dashboard');
  }

  return (
    <WorkspaceShell
      profile={profile}
      title="Document Details"
      subtitle="View document information, download, and verify authenticity."
    >
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/dashboard" className={shared.linkButton}>
          ← Back to Dashboard
        </Link>
        <Link 
          href={`/documents/${documentId}/edit`} 
          className={shared.linkButton}
          style={{ marginLeft: '0.5rem', background: 'var(--crimson)', color: '#fff' }}
        >
          Edit Document →
        </Link>
      </div>
      
      <DocumentViewClient
        document={{
          ...document,
          status: normalizeStatus(document.status),
        }}
      />
    </WorkspaceShell>
  );
}

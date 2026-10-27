import { notFound, redirect } from 'next/navigation';
import WorkspaceShell from '../../components/WorkspaceShell';
import SignNowButton from '../../components/SignNowButton';
import FileDocumentButton from '../../components/FileDocumentButton';
import DocumentDetailsEditor from '../../components/DocumentDetailsEditor';
import { ROLES } from '../../../lib/rbac';
import { loadMySigningTurns } from '../../../lib/signingTurn';
import { requireDocumentAccess } from '../../../lib/authGuard';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import DocumentViewClient from './DocumentViewClient';
import RealtimeRefresh from '../../components/RealtimeRefresh';
import Link from 'next/link';
import shared from '../../../styles/shared.module.css';
import { logDocumentAuditEvent } from '../../../lib/auditLog';
import { hasDocumentAccess } from '../../../lib/documentAccess';

function normalizeStatus(value: unknown) {
  const status = String(value || '').toLowerCase();
  if (status.includes('pending')) return 'Pending Signatures';
  if (status.includes('sign')) return 'Signed';
  if (status.includes('file')) return 'Filed';
  if (status.includes('draft')) return 'Drafting';
  return 'Drafting';
}

export default async function DocumentViewPage({ params }: { params: { documentId: string } }) {
  const { user, profile } = await requireDocumentAccess();
  const supabase = createSupabaseServerClient();
  const documentId = params.documentId;

  // Fetch document
  let { data: document, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    const admin = getSupabaseAdmin();
    const adminResult = await admin.from('documents').select('*').eq('id', documentId).maybeSingle();
    document = adminResult.data;
    docError = adminResult.error;
  }

  if (docError || !document) {
    notFound();
  }

  // Check permissions
  const hasPermission = await hasDocumentAccess({ user, profile, document });

  if (!hasPermission) {
    redirect('/dashboard');
  }

  const [turns, caseResult] = await Promise.all([
    loadMySigningTurns(getSupabaseAdmin(), user.email, [documentId]),
    document.case_id
      // Access to this document was checked above.
      ? getSupabaseAdmin().from('cases').select('id,title').eq('id', document.case_id).maybeSingle()
      : Promise.resolve({ data: null }),
    logDocumentAuditEvent({
      documentId,
      actorUserId: user.id,
      eventType: 'document_viewed',
      details: { context: 'document_details_page' },
    }),
  ]);
  const mySigningTurn = turns.get(documentId) ?? null;
  const caseFolder = caseResult.data as { id: string; title: string | null } | null;
  const isSignedOrFiled = ['signed', 'filed'].includes(String(document.status || '').toLowerCase());
  const isDocumentOwner = (document.owner_id ?? document.user_id) === user.id;

  return (
    <WorkspaceShell
      profile={profile}
      title="Document Details"
      subtitle="Download, verify and track this document."
    >
      <DocumentDetailsEditor
        documentId={documentId}
        title={String(document.title || document.filename || 'Untitled document')}
        caseNumber={document.case_number ?? null}
        tags={Array.isArray(document.tags) ? document.tags : []}
        canEdit={profile.role === ROLES.LAWYER || profile.role === ROLES.STAFF}
        locked={document.status === 'Filed'}
        caseNumberFromCase={Boolean(document.case_id)}
        status={normalizeStatus(document.status)}
        folderTitle={caseFolder ? caseFolder.title || 'Untitled folder' : null}
        uploadedAt={document.created_at ?? null}
      />

      {/* Actions on this document, below its details. */}
      {(isSignedOrFiled || isDocumentOwner) && (
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <Link
          href={`/documents/${documentId}/${isSignedOrFiled ? 'signed' : 'prepare'}`}
          className={shared.button}
          style={{ display: 'inline-block', textDecoration: 'none' }}
        >
          {isSignedOrFiled ? 'Signature Record →' : 'Sign Document →'}
        </Link>
      </div>
      )}

      {profile.role === ROLES.LAWYER && document.status === 'Signed' && (
        <div className={`${shared.sectionCard} ${shared.actionCallout}`} style={{ marginTop: 0, marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Ready to file</h3>
          <p className={shared.cardText}>Everyone has signed. Mark it Filed once submitted. This can’t be undone.</p>
          <FileDocumentButton documentId={documentId} className={shared.button} />
        </div>
      )}

      {mySigningTurn && (
        <div className={`${shared.sectionCard} ${mySigningTurn.state === 'sign' ? shared.actionCallout : ''}`} style={{ marginTop: 0, marginBottom: '1.5rem' }}>
          {mySigningTurn.state === 'sign' ? (
            <>
              <h3 style={{ marginTop: 0 }}>Your signature is requested</h3>
              <p className={shared.cardText}>It’s your turn. Sign here or from your email link. Once you use one, the other stops working.</p>
              <SignNowButton documentId={documentId} label="Sign this document" className={shared.button} />
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Waiting for other signers</h3>
              <p className={shared.cardText}>You can sign once the signers before you are done.</p>
            </>
          )}
        </div>
      )}

      <RealtimeRefresh filter={`id=eq.${documentId}`} />
      <DocumentViewClient
        document={{
          ...document,
          status: normalizeStatus(document.status),
          rawStatus: String(document.status || 'Drafting'),
        }}
      />
    </WorkspaceShell>
  );
}

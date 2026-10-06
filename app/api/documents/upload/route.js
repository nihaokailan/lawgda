import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { ROLES } from '../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { sha256Hex } from '../../../../lib/documentHash';
import { logDocumentAuditEvent } from '../../../../lib/auditLog';

async function uploadWithFallbackBuckets(supabaseAdmin, filePath, file) {
  const buckets = ['secure_docs', 'evidence', 'org-documents'];
  let lastError = 'Upload failed.';

  for (const bucket of buckets) {
    const { error } = await supabaseAdmin.storage.from(bucket).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/pdf',
    });

    if (!error) {
      return { bucket, error: null };
    }

    lastError = error.message;
    if (!error.message.toLowerCase().includes('bucket not found')) {
      return { bucket: null, error: lastError };
    }
  }

  return { bucket: null, error: lastError };
}

async function insertDocumentRecord(supabaseAdmin, payload) {
  async function adaptiveInsert(baseCandidate) {
    const candidate = { ...baseCandidate };

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { data, error } = await supabaseAdmin.from('documents').insert(candidate).select('*').single();
      if (!error) {
        return { data, error: null };
      }

      const missingColumn = error.message?.match(/Could not find the '([^']+)' column/)?.[1];
      if (!missingColumn || !(missingColumn in candidate)) {
        return { data: null, error: error.message };
      }

      delete candidate[missingColumn];
    }

    return { data: null, error: 'Unable to save document metadata after schema fallback attempts.' };
  }

  const safeName = String(payload.fileName || payload.title || 'document.pdf').replace(/\s+/g, '-');
  const recordTimestamp = new Date().toISOString();

  const attempts = [
    {
      user_id: payload.userId,
      owner_id: payload.userId,
      uploaded_by: payload.userId,
      org_id: payload.orgId,
      bucket: payload.bucket,
      path: payload.filePath,
      file_path: payload.filePath,
      title: payload.title,
      status: 'Drafting',
      sha256_hash: payload.sha256Hash,
      created_at: recordTimestamp,
    },
    {
      user_id: payload.userId,
      owner_id: payload.userId,
      uploaded_by: payload.userId,
      org_id: payload.orgId,
      bucket: payload.bucket,
      path: payload.filePath,
      file_path: payload.filePath,
      title: payload.title,
      status: 'Drafting',
      created_at: recordTimestamp,
    },
    {
      user_id: payload.userId,
      owner_id: payload.userId,
      uploaded_by: payload.userId,
      org_id: payload.orgId,
      path: payload.filePath,
      file_path: payload.filePath,
      title: payload.title,
      status: 'Drafting',
      created_at: recordTimestamp,
    }
  ];

  let lastError = 'Unable to save document metadata.';

  for (const candidate of attempts) {
    const { data, error } = await adaptiveInsert(candidate);
    if (!error) {
      return { data, error: null };
    }
    lastError = error;
  }

  return { data: null, error: lastError };
}

export async function POST(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Only firm Lawyers/Staff upload; neither admin tier may place documents
    // (and thereby gain access to their content) in the repository.
    let user;
    let profile;
    try {
      ({ user, profile } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]));
    } catch (error) {
      return rbacErrorResponse(error);
    }

    const formData = await request.formData();
    const title = String(formData.get('title') || '').trim();
    const caseIdRaw = String(formData.get('caseId') || '').trim();
    const caseId = caseIdRaw || null;
    const file = formData.get('file');

    if (!title) {
      return NextResponse.json({ error: 'Document title is required.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A PDF file is required.' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
    }

    const sha256Hash = sha256Hex(await file.arrayBuffer());

    const safeName = file.name.replace(/\s+/g, '-').toLowerCase();
    const filePath = caseId
      ? `${user.id}/${caseId}/${Date.now()}-${safeName}`
      : `${user.id}/${Date.now()}-${safeName}`;

    const uploadResult = await uploadWithFallbackBuckets(supabaseAdmin, filePath, file);
    if (uploadResult.error || !uploadResult.bucket) {
      return NextResponse.json({ error: uploadResult.error || 'Upload failed.' }, { status: 400 });
    }

    const orgId = profile.org_id;

    const insertResult = await insertDocumentRecord(supabaseAdmin, {
      caseId,
      userId: user.id,
      orgId,
      title,
      fileName: safeName,
      filePath,
      bucket: uploadResult.bucket,
      sha256Hash,
    });

    if (insertResult.error || !insertResult.data) {
      return NextResponse.json({ error: insertResult.error || 'Unable to save document.' }, { status: 400 });
    }

    const documentId = String(insertResult.data.id || '');
    if (documentId) {
      await supabaseAdmin.from('document_permissions').upsert(
        {
          document_id: documentId,
          user_id: user.id,
          role: 'owner',
        },
        { onConflict: 'document_id,user_id' }
      );
    }

    if (documentId) {
      await logDocumentAuditEvent({
        documentId,
        actorUserId: user.id,
        eventType: 'document_uploaded',
        details: { title, role: profile.role },
      }).catch((failure) => console.error('[audit] Unable to record draft creation:', failure));
    }

    revalidatePath('/cases');
    revalidatePath('/dashboard');

    return NextResponse.json({
      success: true,
      document: insertResult.data,
      bucket: uploadResult.bucket,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected upload error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

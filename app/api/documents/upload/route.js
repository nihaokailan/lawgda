import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';

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
    const supabase = createSupabaseServerClient();
    const supabaseAdmin = getSupabaseAdmin();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const title = String(formData.get('title') || '').trim();
    const sha256Hash = String(formData.get('sha256Hash') || '').trim();
    const caseIdRaw = String(formData.get('caseId') || '').trim();
    const caseId = caseIdRaw || null;
    const file = formData.get('file');

    if (!title) {
      return NextResponse.json({ error: 'Document title is required.' }, { status: 400 });
    }

    if (!sha256Hash) {
      return NextResponse.json({ error: 'SHA-256 hash is required.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A PDF file is required.' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
    }

    const safeName = file.name.replace(/\s+/g, '-').toLowerCase();
    const filePath = caseId
      ? `${user.id}/${caseId}/${Date.now()}-${safeName}`
      : `${user.id}/${Date.now()}-${safeName}`;

    const uploadResult = await uploadWithFallbackBuckets(supabaseAdmin, filePath, file);
    if (uploadResult.error || !uploadResult.bucket) {
      return NextResponse.json({ error: uploadResult.error || 'Upload failed.' }, { status: 400 });
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const orgId = profileError ? null : profileData?.org_id ?? null;

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

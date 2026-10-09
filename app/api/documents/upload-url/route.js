import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { ROLES } from '../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { INCOMING_PREFIX, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, UPLOAD_BUCKETS } from '../../../../lib/uploadLimits';

/**
 * Step 1 of an upload: issues a one-time signed URL so the browser sends the
 * PDF straight to Supabase Storage. File bytes never pass through this
 * serverless function, so Vercel's ~4.5 MB request-body cap does not apply.
 */
export async function POST(request) {
  let user;
  try {
    ({ user } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const size = Number(body?.size);
  const type = String(body?.type || '');

  if (type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 });
  }
  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `Files larger than ${MAX_UPLOAD_LABEL} are not allowed.` }, { status: 413 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const path = `${INCOMING_PREFIX}/${user.id}/${randomUUID()}.pdf`;
  let lastError = 'Unable to prepare upload.';

  for (const bucket of UPLOAD_BUCKETS) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
    if (!error && data?.token) {
      return NextResponse.json({ bucket, path, token: data.token }, { headers: { 'Cache-Control': 'no-store' } });
    }
    lastError = error?.message || lastError;
    if (!lastError.toLowerCase().includes('bucket not found')) {
      break;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 500 });
}

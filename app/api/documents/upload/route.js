import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { ROLES } from '../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { sha256Hex } from '../../../../lib/documentHash';
import { logDocumentAuditEvent } from '../../../../lib/auditLog';
import { INCOMING_PREFIX, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, UPLOAD_BUCKETS } from '../../../../lib/uploadLimits';
import { INDEX_LIMITS, parseTags, validateIndexFields } from '../../../../lib/documentIndexing';

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

  const recordTimestamp = new Date().toISOString();

  const attempts = [
    {
      user_id: payload.userId,
      owner_id: payload.userId,
      uploaded_by: payload.userId,
      org_id: payload.orgId,
      case_id: payload.caseId,
      bucket: payload.bucket,
      path: payload.filePath,
      file_path: payload.filePath,
      title: payload.title,
      status: 'Drafting',
      sha256_hash: payload.sha256Hash,
      case_number: payload.caseNumber,
      tags: payload.tags,
      author_name: payload.authorName,
      created_at: recordTimestamp,
    },
    {
      user_id: payload.userId,
      owner_id: payload.userId,
      uploaded_by: payload.userId,
      org_id: payload.orgId,
      case_id: payload.caseId,
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
      case_id: payload.caseId,
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

const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_ONLY = new RegExp(`^${UUID}$`, 'i');

/**
 * Step 2 of an upload (step 1 is /api/documents/upload-url): the browser has
 * already sent the PDF to Storage and reports the SHA-256 it computed locally.
 * The server re-hashes the stored bytes; only if both hashes match is the file
 * moved to its permanent UUID-named path and recorded as a Drafting document.
 */
export async function POST(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Firm Lawyers/Staff upload into their firm; a default (Normal) user with
    // no firm uploads a personal document (org_id stays null). Neither admin
    // tier may place documents (and thereby gain access to their content).
    let user;
    let profile;
    try {
      ({ user, profile } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF, ROLES.NORMAL]));
    } catch (error) {
      return rbacErrorResponse(error);
    }

    const body = await request.json().catch(() => ({}));
    const title = String(body?.title || '').trim();
    const caseId = String(body?.caseId || '').trim() || null;
    const bucket = String(body?.bucket || '');
    const incomingPath = String(body?.path || '');
    const clientHash = String(body?.sha256Hash || '').trim().toLowerCase();
    // Indexing metadata entered at upload (§1.5.2(4)); both are optional.
    let caseNumber = String(body?.caseNumber || '').trim() || null;
    const tags = parseTags(body?.tags);
    // Authorship: the uploader by default, otherwise a name they must type in.
    const isAuthor = body?.isAuthor !== false;
    const authorName = isAuthor
      ? String(profile.full_name || user.user_metadata?.full_name || profile.email || user.email || '').trim()
      : String(body?.authorName || '').trim();

    if (!title) {
      return NextResponse.json({ error: 'Document title is required.' }, { status: 400 });
    }
    if (!isAuthor && !authorName) {
      return NextResponse.json({ error: "Please enter the author's name." }, { status: 400 });
    }
    if (authorName.length > INDEX_LIMITS.authorName) {
      return NextResponse.json({ error: `Author name must be at most ${INDEX_LIMITS.authorName} characters.` }, { status: 400 });
    }
    const indexProblem = validateIndexFields({ caseNumber: caseNumber ?? '', tags });
    if (indexProblem) {
      return NextResponse.json({ error: indexProblem }, { status: 400 });
    }
    if (!SHA256_HEX.test(clientHash)) {
      return NextResponse.json({ error: 'A SHA-256 hash computed in the browser is required.' }, { status: 400 });
    }

    const incomingMatch = incomingPath.match(new RegExp(`^${INCOMING_PREFIX}/${user.id}/(${UUID})\\.pdf$`));
    if (!UPLOAD_BUCKETS.includes(bucket) || !incomingMatch) {
      return NextResponse.json({ error: 'Invalid upload reference.' }, { status: 400 });
    }

    if (caseId && !profile.org_id) {
      // Case folders belong to a firm; a user without one cannot file into them.
      await supabaseAdmin.storage.from(bucket).remove([incomingPath]);
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
    }
    if (caseId) {
      // Only a folder of the uploader's own firm.
      const { data: caseRow } = UUID_ONLY.test(caseId)
        ? await supabaseAdmin.from('cases').select('id,org_id,case_number').eq('id', caseId).maybeSingle()
        : { data: null };
      if (!caseRow || caseRow.org_id !== profile.org_id) {
        await supabaseAdmin.storage.from(bucket).remove([incomingPath]);
        return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
      }
      // A document in a case folder carries the case's number.
      caseNumber = caseRow.case_number || null;
    }

    const { data: stored, error: downloadError } = await supabaseAdmin.storage.from(bucket).download(incomingPath);
    if (downloadError || !stored) {
      return NextResponse.json({ error: 'Uploaded file was not found. Please upload again.' }, { status: 400 });
    }

    const bytes = Buffer.from(await stored.arrayBuffer());
    const rejectUpload = async (status, error) => {
      await supabaseAdmin.storage.from(bucket).remove([incomingPath]);
      return NextResponse.json({ error }, { status });
    };

    if (bytes.length > MAX_UPLOAD_BYTES) {
      return rejectUpload(413, `Files larger than ${MAX_UPLOAD_LABEL} are not allowed.`);
    }
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return rejectUpload(400, 'Only PDF files are allowed.');
    }

    const sha256Hash = sha256Hex(bytes);
    if (sha256Hash !== clientHash) {
      return rejectUpload(409, 'Integrity breach: the file received by the server does not match the SHA-256 computed in your browser. Nothing was saved.');
    }

    const fileId = incomingMatch[1];
    const filePath = caseId ? `${user.id}/${caseId}/${fileId}.pdf` : `${user.id}/${fileId}.pdf`;
    const { error: moveError } = await supabaseAdmin.storage.from(bucket).move(incomingPath, filePath);
    if (moveError) {
      return rejectUpload(500, `Unable to store the verified file: ${moveError.message}`);
    }

    const insertResult = await insertDocumentRecord(supabaseAdmin, {
      caseId,
      userId: user.id,
      orgId: profile.org_id,
      title,
      filePath,
      bucket,
      sha256Hash,
      caseNumber,
      tags,
      authorName: authorName || null,
    });

    if (insertResult.error || !insertResult.data) {
      await supabaseAdmin.storage.from(bucket).remove([filePath]);
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

      await logDocumentAuditEvent({
        documentId,
        actorUserId: user.id,
        eventType: 'document_uploaded',
        details: { title, case_id: caseId, case_number: caseNumber, tags, author_name: authorName || null, uploader_is_author: isAuthor, role: profile.role, sha256_hash: sha256Hash, hash_verified: 'browser_and_server', size_bytes: bytes.length },
      }).catch((failure) => console.error('[audit] Unable to record draft creation:', failure));
    }

    revalidatePath('/cases');
    revalidatePath('/dashboard');
    if (caseId) revalidatePath(`/cases/${caseId}`);

    return NextResponse.json({
      success: true,
      document: insertResult.data,
      bucket,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected upload error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

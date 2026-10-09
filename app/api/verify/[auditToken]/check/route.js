import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { logDocumentAuditEvent } from '../../../../../lib/auditLog';
import { classifyFileHash } from '../../../../../lib/publicVerification';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const AUDIT_TOKEN = /^av_[A-Za-z0-9_-]{20,}$/;
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Public integrity check behind the QR code on a signed PDF (§1.5.1(10)).
 * Anyone holding the QR link can check a copy: their browser computes the
 * SHA-256 and only that hash is sent — the file never leaves their device.
 * Every result is written to the document's hash-chained audit trail.
 */
export async function POST(request, { params }) {
  const auditToken = String(params?.auditToken || '').trim();
  const body = await request.json().catch(() => ({}));
  const computedHash = String(body?.sha256 || '').trim().toLowerCase();

  if (!AUDIT_TOKEN.test(auditToken)) {
    return NextResponse.json({ error: 'Invalid verification link.' }, { status: 404 });
  }
  if (!SHA256_HEX.test(computedHash)) {
    return NextResponse.json({ error: 'A SHA-256 hash computed in your browser is required.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: document } = await admin
    .from('documents')
    .select('id,sha256_hash,metadata')
    .contains('metadata', { audit_token: auditToken })
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: 'Invalid verification link.' }, { status: 404 });
  }

  const result = classifyFileHash(document, computedHash);
  const eventType = result.outcome === 'breach' ? 'integrity_check_failed' : 'integrity_check_passed';

  // Repeated checks of the same file within a few minutes are recorded once,
  // so a public link cannot be used to flood the audit trail.
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data: recent } = await admin
    .from('audit_logs')
    .select('id')
    .eq('document_id', document.id)
    .eq('event_type', eventType)
    .gte('created_at', since)
    .contains('details', { computed_hash: computedHash })
    .limit(1);

  if (!recent?.length) {
    try {
      await logDocumentAuditEvent({
        documentId: document.id,
        actorUserId: null,
        eventType,
        details: {
          channel: 'public_qr_page',
          outcome: result.outcome,
          version: result.matchedVersion,
          expected_hash: result.expectedHash,
          computed_hash: computedHash,
        },
      });
    } catch (failure) {
      console.error('[audit] Unable to record public integrity check:', failure);
    }
  }

  return NextResponse.json(
    { outcome: result.outcome, matchedVersion: result.matchedVersion, expectedHash: result.expectedHash, computedHash },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

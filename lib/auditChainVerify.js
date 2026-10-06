import { createHash } from 'node:crypto';

const GENESIS_HASH = '0'.repeat(64);

// The chain hash was computed from Postgres's native `created_at::text` cast
// (e.g. "2026-09-22 05:03:21.7+00"), which differs from the ISO-8601 string
// PostgREST normally returns for the same column. Callers must select
// created_at::text aliased as created_at_text so this matches.
function createdAtText(row) {
  return row.created_at_text ?? row.created_at ?? '';
}

/**
 * Recomputes each row's hash from its own fields + the previous row's stored
 * hash, and confirms it matches what was persisted. Rows must be the full
 * ordered set for a table (ascending by created_at, then id) — a gap in that
 * ordering will correctly surface as a broken chain.
 */
export function verifyAuditLogsChain(rows) {
  let expectedPrevious = GENESIS_HASH;
  let legacyRows = 0;
  let hashedRows = 0;

  for (const row of rows) {
    if (!row.record_hash && !row.previous_hash) {
      if (hashedRows) return { valid: false, brokenAtId: row.id };
      legacyRows += 1;
      continue;
    }
    if (typeof row.details_text !== 'string' || typeof row.created_at_text !== 'string') {
      return { valid: null, brokenAtId: null, reason: 'missing_hash_input' };
    }
    hashedRows += 1;
    const recomputed = createHash('sha256')
      .update(
        expectedPrevious +
        (row.id ?? '') +
        (row.document_id ?? '') +
        (row.event_type ?? '') +
        (row.actor_user_id ?? '') +
        row.details_text +
        createdAtText(row)
      )
      .digest('hex');

    if (row.previous_hash !== expectedPrevious || row.record_hash !== recomputed) {
      return { valid: false, brokenAtId: row.id };
    }

    expectedPrevious = row.record_hash;
  }

  return { valid: legacyRows ? null : true, brokenAtId: null, reason: legacyRows ? 'legacy_unhashed_records' : null, legacyRows };
}

export function verifySigningAuditChain(rows) {
  let expectedPrevious = GENESIS_HASH;
  let legacyRows = 0;
  let hashedRows = 0;

  for (const row of rows) {
    if (!row.record_hash && !row.previous_hash) {
      if (hashedRows) return { valid: false, brokenAtId: row.id };
      legacyRows += 1;
      continue;
    }
    if (typeof row.details_text !== 'string' || typeof row.created_at_text !== 'string') {
      return { valid: null, brokenAtId: null, reason: 'missing_hash_input' };
    }
    hashedRows += 1;
    const recomputed = createHash('sha256')
      .update(
        expectedPrevious +
        (row.id ?? '') +
        (row.signing_request_id ?? '') +
        (row.document_id ?? '') +
        (row.event_type ?? '') +
        (row.actor_type ?? '') +
        (row.actor_user_id ?? '') +
        (row.actor_email ?? '') +
        row.details_text +
        createdAtText(row)
      )
      .digest('hex');

    if (row.previous_hash !== expectedPrevious || row.record_hash !== recomputed) {
      return { valid: false, brokenAtId: row.id };
    }

    expectedPrevious = row.record_hash;
  }

  return { valid: legacyRows ? null : true, brokenAtId: null, reason: legacyRows ? 'legacy_unhashed_records' : null, legacyRows };
}

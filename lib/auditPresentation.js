import { ROLE_LABELS } from './roles';

function shortHash(value) {
  const text = String(value ?? '');
  return text ? `${text.slice(0, 16)}…` : '';
}

function formatWhen(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }) + ' PHT';
}

/** Title + detail lines for one audit row. Never surfaces signing links or tokens. */
export function describeAuditEvent(entry) {
  const details = entry.details && typeof entry.details === 'object' ? entry.details : {};
  const signer = details.signer_name || details.signer_email || entry.actor_email || 'the signer';
  const lines = [];

  switch (entry.event_type) {
    case 'document_uploaded':
      if (details.title) lines.push(`Title: ${details.title}`);
      if (details.case_number) lines.push(`Case number: ${details.case_number}`);
      if (Array.isArray(details.tags) && details.tags.length) lines.push(`Tags: ${details.tags.join(', ')}`);
      if (details.sha256_hash) lines.push(`SHA-256: ${shortHash(details.sha256_hash)}`);
      if (details.hash_verified === 'browser_and_server') lines.push('Hash computed in the browser and re-verified by the server');
      return { title: 'Draft created', lines };
    case 'document_viewed':
      if (details.version) lines.push(`Version: ${details.version}`);
      if (['pdf_preview', 'signer_review'].includes(details.context)) lines.push('A copy of the file was delivered to this device');
      return {
        title: details.context === 'audit_trail_view' ? 'Audit trail viewed'
          : details.context === 'pdf_preview' ? 'Document opened in the PDF viewer'
            : details.context === 'signer_review' ? 'Document opened by the signer for review'
              : 'Document viewed',
        lines,
      };
    case 'document_downloaded':
      if (details.version) lines.push(`Version: ${details.version}`);
      return {
        title: details.context === 'verification' ? 'File retrieved for integrity verification'
          : details.context === 'signer_copy' ? 'Signed copy delivered to the signer'
            : 'Document downloaded',
        lines,
      };
    case 'metadata_updated': {
      const changes = Array.isArray(details.changes) ? details.changes : [];
      changes.forEach((change) => lines.push(`${change.field}: "${change.old ?? ''}" → "${change.new ?? ''}"`));
      if (details.note) lines.push(`Note: ${details.note}`);
      return { title: 'Document details edited', lines };
    }
    case 'integrity_check_passed':
    case 'integrity_check_failed':
      if (details.version) lines.push(`Version checked: ${details.version}`);
      if (details.expected_hash) lines.push(`Recorded hash: ${shortHash(details.expected_hash)}`);
      if (details.computed_hash) lines.push(`Checked file hash: ${shortHash(details.computed_hash)}`);
      if (details.channel) lines.push(`Checked via: ${String(details.channel).replaceAll('_', ' ')}`);
      return { title: entry.event_type === 'integrity_check_failed' ? 'INTEGRITY BREACH — a checked file did not match the recorded hash' : 'Integrity verified — checked file matched the recorded hash', lines };
    case 'status_changed':
      if (details.reason) lines.push(`Reason: ${String(details.reason).replaceAll('_', ' ')}`);
      return { title: `Status changed from ${details.from || 'previous'} to ${details.to || 'new'}`, lines };
    case 'request_created':
    case 'signer_added':
      if (details.signer_email) lines.push(`Email: ${details.signer_email}`);
      if (details.signing_order) lines.push(`Signing order: ${details.signing_order}`);
      return { title: `Signer added: ${signer}`, lines };
    case 'signer_removed':
      return { title: 'Signer removed', lines };
    case 'invitation_sent':
      if (details.signer_email) lines.push(`Sent to: ${details.signer_email}`);
      if (details.email_status) lines.push(`Delivery: ${details.email_status}`);
      if (details.resend) lines.push('Resent by the sender');
      return { title: details.email_status === 'failed' ? `Invitation could not be sent to ${signer}` : `Signing invitation for ${signer}`, lines };
    case 'signer_verified':
      return { title: 'Signer identity verified', lines };
    case 'signing_completed':
      if (details.signer_email) lines.push(`Email: ${details.signer_email}`);
      if (details.signing_method) lines.push(`Method: ${details.signing_method === 'dict' ? 'Signing certificate' : 'Standard signature'}`);
      if (details.signed_at) lines.push(`Signed at: ${formatWhen(details.signed_at)}`);
      if (details.pre_sign_hash) lines.push(`Hash before signing: ${shortHash(details.pre_sign_hash)}`);
      if (details.post_sign_hash) lines.push(`Hash after signing: ${shortHash(details.post_sign_hash)}`);
      return { title: `Document signed by ${signer}`, lines };
    case 'signing_started_in_app':
      return { title: 'Signing started from inside Lawgda (emailed link replaced)', lines };
    case 'dict_certificate_applied':
      return { title: 'Signing certificate applied', lines };
    case 'request_revoked':
      return { title: 'Signing request revoked', lines };
    case 'request_expired':
      return { title: 'Signing request expired', lines };
    default:
      return { title: String(entry.event_type || 'Document activity').replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()), lines };
  }
}

/**
 * Adds who-did-what to audit rows. Internal actors are resolved from their
 * profile (name, role); external signers by the email recorded at signing;
 * everything else is the system. Hash fields stay on the row untouched so
 * chain verification is unaffected; `signing_link` is stripped from details.
 */
export async function enrichAuditEntries(supabaseAdmin, entries) {
  const userIds = [...new Set(entries.map((entry) => entry.actor_user_id).filter(Boolean))];
  const profiles = new Map();
  if (userIds.length > 0) {
    const { data } = await supabaseAdmin.from('profiles').select('user_id,full_name,email,role').in('user_id', userIds);
    (data || []).forEach((row) => profiles.set(row.user_id, row));
  }

  return entries.map((entry) => {
    const { signing_link: _omitted, ...safeDetails } = (entry.details && typeof entry.details === 'object' ? entry.details : {});
    const profile = entry.actor_user_id ? profiles.get(entry.actor_user_id) : null;
    const described = describeAuditEvent({ ...entry, details: safeDetails });

    let actorName = 'System';
    let actorRole = 'Automated';
    let actorEmail = null;
    if (profile) {
      actorName = profile.full_name || profile.email || 'Lawgda user';
      actorRole = ROLE_LABELS[profile.role] ?? profile.role;
      actorEmail = profile.email || null;
    } else if (entry.actor_user_id) {
      actorName = 'Former user';
      actorRole = 'Lawgda user';
    } else if (entry.actor_type === 'external_signer' || entry.actor_email || safeDetails.signer_email) {
      actorName = safeDetails.signer_name || entry.actor_email || safeDetails.signer_email || 'External signer';
      actorRole = 'External signer';
      actorEmail = entry.actor_email || safeDetails.signer_email || null;
    }

    return {
      id: entry.id,
      event_type: entry.event_type,
      created_at: entry.created_at,
      actor_user_id: entry.actor_user_id ?? null,
      actor_email: entry.actor_email ?? profile?.email ?? null,
      details: safeDetails,
      title: described.title,
      lines: described.lines,
      actorName,
      actorRole,
      // Shown next to the name; omitted when the name already is the email.
      actorEmail: actorEmail && actorEmail !== actorName ? actorEmail : null,
    };
  });
}

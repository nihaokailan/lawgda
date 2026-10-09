export function auditEventLabel(entry) {
  const details = entry.details || {};
  const signer = details.signer_name || details.signer_email || entry.actor_email || 'the signer';
  switch (entry.event_type) {
    case 'document_viewed': return details.context === 'audit_trail_view' ? 'Audit trail viewed' : 'Document viewed';
    case 'document_downloaded': return details.context === 'verification' ? 'File retrieved for integrity verification' : 'Document downloaded';
    case 'metadata_updated': return 'Document details edited';
    case 'integrity_check_passed': return 'Integrity verified';
    case 'integrity_check_failed': return 'Integrity breach detected';
    case 'status_changed': return `Document status changed from ${details.from || 'previous status'} to ${details.to || 'new status'}`;
    case 'signing_completed': return `Document signed by ${signer}`;
    case 'request_created':
    case 'signer_added': return `Signer added: ${signer}`;
    case 'invitation_sent': return details.email_status === 'failed' ? `Signing invitation could not be sent to ${signer}` : details.email_status === 'deferred' ? `Signing invitation queued for ${signer}` : `Signing invitation sent to ${signer}`;
    case 'signer_verified': return 'Signer identity verified';
    case 'dict_certificate_applied': return 'Signing certificate applied';
    case 'request_revoked': return 'Signing request revoked';
    case 'request_expired': return 'Signing request expired';
    default: return String(entry.event_type || 'Document activity').replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
  }
}

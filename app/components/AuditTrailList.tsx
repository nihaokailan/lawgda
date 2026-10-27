export type AuditTrailEntry = {
  id: string;
  created_at: string;
  title: string;
  lines: string[];
  actorName: string;
  actorRole: string;
  actorEmail?: string | null;
};

/** Who-did-what audit list. Scrolls inside its own box so long histories don't stretch the page. */
export default function AuditTrailList({ entries, maxHeight = 420 }: { entries: AuditTrailEntry[]; maxHeight?: number }) {
  if (entries.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>No audit events recorded.</p>;
  }

  return (
    <div
      role="region"
      aria-label="Audit trail"
      tabIndex={0}
      style={{ maxHeight, overflowY: 'auto', display: 'grid', gap: '0.75rem', paddingRight: '0.5rem' }}
    >
      {entries.map((entry) => (
        <article key={entry.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem' }}>
          <strong>{entry.title}</strong>
          <div style={{ fontSize: '0.85rem', marginTop: '0.15rem' }}>
            By <strong>{entry.actorName}</strong>
            {entry.actorEmail && <span> ({entry.actorEmail})</span>}
            <span style={{ color: 'var(--muted)' }}> &middot; {entry.actorRole}</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            {new Date(entry.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })} PHT
          </div>
          {entry.lines.length > 0 && (
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
              {entry.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

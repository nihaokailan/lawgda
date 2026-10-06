'use client';

import { useEffect, useState } from 'react';
import shared from '../../styles/shared.module.css';
import AuditTrailList, { type AuditTrailEntry } from './AuditTrailList';

const STAGES = ['Drafting', 'Pending', 'Signed', 'Filed'];

export default function DocumentLifecycleTimeline({
  documentId,
  currentStatus,
}: {
  documentId: string;
  currentStatus: string;
}) {
  const [entries, setEntries] = useState<AuditTrailEntry[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch(`/api/documents/${documentId}/audit`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load document history.');
        }
        if (!mounted) return;
        setEntries(payload.auditTrail || []);
        if (payload.chainIntegrity) {
          const values = [payload.chainIntegrity.signingAuditValid, payload.chainIntegrity.auditLogsValid];
          setChainValid(values.includes(false) ? false : values.every((value) => value === true) ? true : null);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to load document history.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [documentId]);

  const currentStageIndex = Math.max(0, STAGES.indexOf(currentStatus));

  return (
    <div className={shared.sectionCard}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Document Lifecycle</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {STAGES.map((stage, index) => (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: index <= currentStageIndex ? '#fff' : '#8892a6',
                background: index <= currentStageIndex ? 'var(--crimson)' : '#eef1f7',
              }}
            >
              {index + 1}
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: index === currentStageIndex ? 700 : 500,
                color: index === currentStageIndex ? 'var(--crimson)' : 'var(--muted)',
              }}
            >
              {stage}
            </span>
            {index < STAGES.length - 1 && (
              <span
                style={{
                  width: 24,
                  height: 2,
                  background: index < currentStageIndex ? 'var(--crimson)' : '#e2e7f1',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {!loading && !error && (
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem' }}>
          <strong>History integrity:</strong>{' '}
          <span style={{ color: chainValid === null ? '#92400e' : chainValid ? '#047857' : '#991b1b', fontWeight: 700 }}>
            {chainValid === null ? 'Not fully verifiable — historical hashes or audit data unavailable' : chainValid ? '\u2713 Verified \u2014 no tampering detected' : '\u2717 Broken \u2014 records may have been altered'}
          </span>
        </p>
      )}

      {loading && <p style={{ color: 'var(--muted)' }}>Loading history...</p>}
      {error && <p style={{ color: '#991b1b' }}>{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p style={{ color: 'var(--muted)' }}>No history recorded yet.</p>
      )}

      {!loading && entries.length > 0 && <AuditTrailList entries={entries} />}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';

type FileOption = { id: string; title: string | null; filename: string | null; status: string | null; created_at?: string | null };

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fileStatus(value: string | null) {
  const status = (value || '').toLowerCase();
  if (status.includes('file')) return 'Filed';
  if (status.includes('sign')) return 'Signed';
  if (status.includes('pending')) return 'Pending';
  return value || 'Drafting';
}

export default function VerificationFilePicker({ documents, selectedId, onSelect, disabled, loading }: {
  documents: FileOption[]; selectedId: string; onSelect: (id: string) => void; disabled: boolean; loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('all');
  const invalidDates = Boolean(from && to && from > to);
  const groups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const week = new Date(today);
    week.setDate(today.getDate() - 7);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const grouped = new Map<string, FileOption[]>();
    const sorted = [...documents].sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0));
    for (const document of sorted) {
      if (invalidDates) continue;
      if (![document.title, document.filename, document.id].some(value => value?.toLowerCase().includes(search.trim().toLowerCase()))) continue;
      if (status !== 'all' && fileStatus(document.status) !== status) continue;
      const date = new Date(document.created_at || '');
      const validDate = !Number.isNaN(date.getTime());
      const key = validDate ? dateKey(date) : '';
      if ((from && (!key || key < from)) || (to && (!key || key > to))) continue;
      const group = !validDate ? 'Date unavailable' : date >= today ? 'Today' : date >= yesterday ? 'Yesterday' : date >= week ? 'Previous 7 days' : date >= month ? 'Earlier this month' : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      grouped.set(group, [...(grouped.get(group) || []), document]);
    }
    return [...grouped.entries()];
  }, [documents, search, from, to, status, invalidDates]);
  const count = groups.reduce((total, [, files]) => total + files.length, 0);
  const selected = documents.find(document => document.id === selectedId);

  return <section className={'lawgdaPicker-picker'} aria-label="Choose a Lawgda document">
    <div className={'lawgdaPicker-toolbar'}>
      <div className={'lawgdaPicker-heading'}><strong>Lawgda documents</strong><span>Choose a file to verify</span></div>
      <label className={'lawgdaPicker-search'}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input aria-label="Search documents" type="search" placeholder="Search by file name…" value={search} onChange={event => setSearch(event.target.value)} disabled={disabled} />
      </label>
    </div>
    <div className={'lawgdaPicker-filters'}>
      <label>Uploaded from<input type="date" value={from} max={to || undefined} disabled={disabled} onChange={event => setFrom(event.target.value)} /></label>
      <label>Uploaded through<input type="date" value={to} min={from || undefined} disabled={disabled} onChange={event => setTo(event.target.value)} /></label>
      <label>Status<select value={status} disabled={disabled} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{['Signed', 'Pending', 'Filed', 'Drafting'].map(value => <option key={value}>{value}</option>)}</select></label>
      {(search || from || to || status !== 'all') && <button type="button" disabled={disabled} className={'lawgdaPicker-clear'} onClick={() => { setSearch(''); setFrom(''); setTo(''); setStatus('all'); }}>Clear filters</button>}
    </div>
    <div className={'lawgdaPicker-results'} aria-busy={loading}>
      {loading ? <p className={'lawgdaPicker-empty'}>Loading documents…</p> : invalidDates ? <p className={'lawgdaPicker-empty'} role="alert">Choose an end date on or after the start date.</p> : count === 0 ? <p className={'lawgdaPicker-empty'}>{documents.length ? 'No files match your search or filters.' : 'No documents are available in your account.'}</p> : groups.map(([group, files]) => <section key={group} className={'lawgdaPicker-group'}>
        <h4>{group}</h4>
        <div className={'lawgdaPicker-grid'}>{files.map(document => {
          const label = document.title || document.filename || document.id;
          const state = fileStatus(document.status);
          return <button type="button" key={document.id} className={`${'lawgdaPicker-card'} ${selectedId === document.id ? 'lawgdaPicker-selected' : ''}`} disabled={disabled} aria-pressed={selectedId === document.id} onClick={() => onSelect(document.id)} title={label}>
            <span className={'lawgdaPicker-preview'} aria-hidden="true">
              <svg width="48" height="58" viewBox="0 0 48 58" fill="none"><path d="M8 2h21l11 11v42H8z" fill="white" stroke="currentColor" strokeWidth="1.5" /><path d="M29 2v12h11M15 26h18M15 33h18M15 40h12" stroke="currentColor" strokeWidth="1.5" /></svg>
              {selectedId === document.id && <span className={'lawgdaPicker-check'}>✓</span>}
            </span>
            <span className={'lawgdaPicker-fileName'}>{label}</span>
            <span className={'lawgdaPicker-details'}><span className={`${'lawgdaPicker-badge'} ${state === 'Pending' ? 'lawgdaPicker-pending' : ['Signed', 'Filed'].includes(state) ? 'lawgdaPicker-signed' : 'lawgdaPicker-draft'}`}>{state}</span><span>{document.created_at && !Number.isNaN(Date.parse(document.created_at)) ? new Date(document.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}</span></span>
          </button>;
        })}</div>
      </section>)}
    </div>
    <div className={'lawgdaPicker-footer'} aria-live="polite"><span>{count} {count === 1 ? 'file' : 'files'}</span><span>{selected ? `Selected: ${selected.title || selected.filename || selected.id}` : 'Select a document to continue'}</span></div>
    <style jsx>{`
.lawgdaPicker-picker { margin-top: 16px; border: 1px solid #dfe2e8; border-radius: 18px; overflow: hidden; background: #f3f5f8; color: #263244; }
.lawgdaPicker-toolbar { display: flex; align-items: center; gap: 24px; padding: 20px; background: #edf0f5; }
.lawgdaPicker-heading { display: grid; gap: 4px; flex-shrink: 0; }
.lawgdaPicker-heading strong { font-size: 16px; }
.lawgdaPicker-heading span { font-size: 12px; color: #667085; }
.lawgdaPicker-search { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; background: #e1e5ec; border-radius: 30px; padding: 12px 16px; }
.lawgdaPicker-search input { width: 100%; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 14px; color: inherit; }
.lawgdaPicker-search:focus-within { outline: 2px solid #781323; outline-offset: 2px; }
.lawgdaPicker-filters { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; padding: 14px 20px; border-bottom: 1px solid #dfe2e8; }
.lawgdaPicker-filters label { display: grid; gap: 5px; font-size: 11px; font-weight: 600; color: #596476; }
.lawgdaPicker-filters input, .lawgdaPicker-filters select { border: 1px solid #d8dde5; border-radius: 8px; padding: 8px 10px; background: #fff; color: #263244; font: inherit; font-size: 12px; min-height: 36px; }
.lawgdaPicker-clear { background: none; border: 0; color: #781323; font: inherit; font-size: 12px; cursor: pointer; padding: 9px 0; }
.lawgdaPicker-results { max-height: 390px; min-height: 190px; overflow-y: auto; padding: 18px 20px; }
.lawgdaPicker-group + .lawgdaPicker-group { margin-top: 22px; }
.lawgdaPicker-group h4 { margin: 0 0 12px; color: #586170; font-size: 12px; font-weight: 600; }
.lawgdaPicker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 12px; }
.lawgdaPicker-card { min-width: 0; display: flex; flex-direction: column; text-align: left; border: 1.5px solid transparent; background: #fff; border-radius: 12px; padding: 8px; cursor: pointer; font: inherit; color: inherit; transition: border-color .15s, box-shadow .15s; }
.lawgdaPicker-card:hover { border-color: #c8a6ad; box-shadow: 0 3px 10px #2632440d; }
.lawgdaPicker-card:focus-visible, .lawgdaPicker-filters input:focus-visible, .lawgdaPicker-filters select:focus-visible { outline: 2px solid #781323; outline-offset: 2px; }
.lawgdaPicker-card.lawgdaPicker-selected { border-color: #781323; background: #fff9fa; }
.lawgdaPicker-preview { position: relative; display: grid; place-items: center; background: #f5f6f8; border-radius: 6px; height: 96px; color: #929aab; }
.lawgdaPicker-selected .lawgdaPicker-preview { background: #f3e9ec; color: #781323; }
.lawgdaPicker-check { position: absolute; right: 7px; top: 7px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #781323; color: white; font-size: 12px; }
.lawgdaPicker-fileName { display: block; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 10px 3px 8px; font-weight: 600; font-size: 12px; }
.lawgdaPicker-details { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 0 3px 3px; color: #697386; font-size: 10px; }
.lawgdaPicker-badge { padding: 3px 7px; border-radius: 20px; font-size: 10px; font-weight: 600; }
.lawgdaPicker-signed { color: #136849; background: #e5f5ee; }
.lawgdaPicker-pending { color: #946012; background: #fff1d8; }
.lawgdaPicker-draft { color: #596476; background: #eceff4; }
.lawgdaPicker-footer { padding: 12px 20px; background: #fff; border-top: 1px solid #dfe2e8; display: flex; justify-content: space-between; gap: 16px; font-size: 12px; color: #667085; }
.lawgdaPicker-footer span:last-child { overflow-wrap: anywhere; text-align: right; }
.lawgdaPicker-empty { text-align: center; padding: 45px 12px; font-size: 13px; color: #667085; }
.lawgdaPicker-card:disabled { cursor: default; opacity: .65; }
@media (max-width: 600px) { .lawgdaPicker-toolbar { flex-direction: column; align-items: stretch; gap: 12px; } .lawgdaPicker-filters, .lawgdaPicker-toolbar, .lawgdaPicker-results { padding: 14px; } .lawgdaPicker-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); } .lawgdaPicker-filters label { flex: 1; min-width: 120px; } .lawgdaPicker-filters input, .lawgdaPicker-filters select { width: 100%; min-width: 0; } }
    `}</style>
  </section>;
}

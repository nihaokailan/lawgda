import LawgdaLogo from './components/LawgdaLogo';

// Shown by Next.js the moment any page starts loading (navigation or first
// visit) until the page's server data is ready.
export default function Loading() {
  return (
    <div className="lawgda-loading" role="status" aria-live="polite">
      <LawgdaLogo size={36} />
      <span className="lawgda-loading-spinner" aria-hidden="true" />
      <p className="lawgda-loading-text">Loading…</p>
    </div>
  );
}

// Lawgda brand mark + wordmark, drawn inline so it needs no image asset.
export default function LawgdaLogo({ color = '#6a0f1a', textColor, size = 32 }) {
  const label = textColor || color;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
      <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Lawgda logo">
        <circle cx="16" cy="16" r="16" fill={color} />
        <text x="16" y="22.5" textAnchor="middle" fontSize="19" fontWeight="700" fill="#ffffff" fontFamily="Helvetica, Arial, sans-serif">L</text>
      </svg>
      <span style={{ fontWeight: 800, fontSize: size * 0.55, letterSpacing: '0.04em', color: label }}>LAWGDA</span>
    </span>
  );
}

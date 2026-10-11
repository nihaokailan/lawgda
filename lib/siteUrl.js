const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i;

function normalize(url) {
  const value = String(url || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Public base URL for links that leave the app (signing invitations, audit
 * QR codes). Emailed links must open the deployed site, never localhost, so
 * the order is:
 *   1. NEXT_PUBLIC_SITE_URL / SITE_URL, unless it points at localhost
 *   2. VERCEL_PROJECT_PRODUCTION_URL — set automatically by Vercel
 *   3. the incoming request's origin, unless it is localhost
 * Throws when none of these is a public URL, so an unusable link is never sent.
 */
export function getPublicSiteUrl(request) {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    request ? new URL(request.url).origin : '',
  ];

  for (const candidate of candidates) {
    const url = normalize(candidate);
    if (url && !LOCAL_HOST.test(url)) return url;
  }

  throw new Error('Public site URL is not configured. Set NEXT_PUBLIC_SITE_URL to the deployed Vercel URL (e.g. https://lawgda.vercel.app).');
}

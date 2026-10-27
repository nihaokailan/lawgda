'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { documentOriginLabel, readDocumentOrigin } from '../../lib/documentOrigin';

/**
 * On document pages, returns to the list the document was opened from
 * (Dashboard, Documents or a folder). Pages with a fixed parent (a folder's
 * parent is Documents) pass `href`. Elsewhere, returns to the previous page,
 * or to `fallbackHref` when the page was opened directly (e.g. from an email link).
 */
export default function BackButton({ fallbackHref = '/dashboard', className, label = 'Go Back', href = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const onDocumentPage = pathname.startsWith('/documents/');
  const [origin, setOrigin] = useState(null);

  // sessionStorage is browser-only, so the origin is read after mount.
  useEffect(() => {
    if (onDocumentPage) setOrigin(readDocumentOrigin() || fallbackHref);
  }, [onDocumentPage, fallbackHref]);

  function handleBack() {
    if (href) {
      router.push(href);
      return;
    }
    if (onDocumentPage) {
      router.push(origin || fallbackHref);
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  const text = href ? label : onDocumentPage ? documentOriginLabel(origin || fallbackHref) || 'Back to Dashboard' : label;

  return (
    <button type="button" className={className} onClick={handleBack}>
      <span aria-hidden="true">&larr;</span> {text}
    </button>
  );
}

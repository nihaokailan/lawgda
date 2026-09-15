'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>Something went wrong</h1>
        <p>Please try loading this page again.</p>
        <button type="button" onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
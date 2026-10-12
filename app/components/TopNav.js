'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import shared from '../../styles/shared.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function TopNav() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]);

  return (
    <header className={shared.topNav}>
      <Link href="/landing" className={shared.topNavBrandLink} aria-label="Go to the Lawgda landing page">
        <span className={shared.topNavMark} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3 19 6v5c0 4.4-2.8 8-7 10-4.2-2-7-5.6-7-10V6l7-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
        <span className={shared.topNavBrandCopy}>
          <span className={shared.topNavBrandName}>LAWGDA</span>
          <span className={shared.topNavTagline}>Secure Electronic Evidence</span>
        </span>
      </Link>
      <nav className={shared.topNavActions}>
        {user && (
          <>
            <Link href="/cases" className={shared.topNavLink}>Documents</Link>
            <Link href="/verify" className={shared.topNavLink}>Verify</Link>
            <span className={shared.topNavUserEmail}>{user.email}</span>
            <span className={shared.topNavAvatar} aria-label="Signed in account">
              {(user.email || 'U').charAt(0).toUpperCase()}
            </span>
          </>
        )}
        {!loading && !user && (
          <Link href="/signin" className={`${shared.topNavLink} ${shared.topNavSignIn}`}>
            Sign In
          </Link>
        )}
      </nav>
    </header>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import shared from '../../styles/shared.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import LawgdaMark from './LawgdaMark';

function getAccountInitial(user) {
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.first_name;
  return String(displayName || user?.email || 'U').trim().charAt(0).toUpperCase();
}

export default function TopNav() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
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

  useEffect(() => {
    if (!accountOpen) return undefined;

    function handlePointerDown(event) {
      if (!accountRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setAccountOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountOpen]);

  return (
    <header className={shared.topNav}>
      <Link
        href={user ? '/dashboard' : '/landing'}
        className={shared.topNavBrandLink}
        aria-label={user ? 'Go to your Lawgda workspace' : 'Go to the Lawgda landing page'}
      >
        <span className={shared.topNavMark} aria-hidden="true">
          <LawgdaMark />
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
            <div className={shared.accountControl} ref={accountRef}>
              <button
                type="button"
                className={shared.topNavAvatar}
                aria-label="Open account options"
                aria-expanded={accountOpen}
                aria-controls="top-nav-account-panel"
                onClick={() => setAccountOpen((open) => !open)}
              >
                {getAccountInitial(user)}
              </button>
              {accountOpen && (
                <div className={shared.accountPanel} id="top-nav-account-panel">
                  <span className={shared.accountPanelLabel}>Signed in as</span>
                  <span className={shared.accountPanelEmail}>{user.email}</span>
                  <Link
                    href="/profile"
                    className={shared.accountProfileLink}
                    onClick={() => setAccountOpen(false)}
                  >
                    View your profile
                  </Link>
                </div>
              )}
            </div>
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

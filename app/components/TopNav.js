'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import shared from '../../styles/shared.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function TopNav() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    // Get current session and profile
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      
      if (session?.user) {
        // Fetch user profile to get role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', session.user.id)
          .single();
        setUserRole(profile?.role || null);
      }
      
      setLoading(false);
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', session.user.id)
          .single();
        setUserRole(profile?.role || null);
      } else {
        setUserRole(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace('/landing');
  };

  const userInitial = String(user?.email || 'U').trim().charAt(0).toUpperCase() || 'U';

  return (
    <header className={shared.topNav}>
      <Link href="/landing" className={shared.topNavBrandLink} aria-label="Go to the Lawgda landing page">
        <span className={shared.topNavBrandName}>LAWGDA</span>
        <span className={shared.topNavTagline}>Secure Electronic Evidence</span>
      </Link>
      <nav className={shared.topNavActions}>
        {user && (
          <>
            <Link href="/cases" className={shared.topNavLink}>Documents</Link>
            <Link href="/verify" className={shared.topNavLink}>Verify</Link>
            <Link href="/profile" className={shared.topNavLink}>Profile</Link>
            {userRole === 'administrator' && (
              <Link href="/admin" className={shared.topNavLink}>
                Admin
              </Link>
            )}
            <span className={shared.topNavUserEmail}>{user.email}</span>
            <button 
              onClick={handleSignOut} 
              className={`${shared.topNavLink} ${shared.topNavSignOut}`}
              style={{ border: 'none', cursor: 'pointer' }}
            >
              Sign Out
            </button>
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

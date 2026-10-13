'use client';

import styles from './styles.module.css';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient, hasSupabaseBrowserConfig } from '../../lib/supabase/client';
import LawgdaMark from '../components/LawgdaMark';

export default function Landing() {
  const hasSupabaseConfig = hasSupabaseBrowserConfig();
  const supabase = hasSupabaseConfig ? createSupabaseBrowserClient() : null;
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);

  useEffect(() => {
    if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== 'function') {
      setLoading(false);
      return;
    }

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);

      if (session?.user) {
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

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
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
      data?.subscription?.unsubscribe();
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace('/landing');
  };

  const accountInitial = String(
    user?.user_metadata?.full_name || user?.user_metadata?.first_name || user?.email || 'U'
  ).trim().charAt(0).toUpperCase();

  return (
    <main>
      <header className={styles.landingHeader}>
        <Link
          href={user ? '/dashboard' : '/landing'}
          className={styles.landingBrand}
          aria-label={user ? 'Go to your Lawgda workspace' : 'Go to the Lawgda landing page'}
        >
          <span className={styles.landingBrandIcon}>
            <LawgdaMark className={styles.landingMark} />
          </span>
          <span>LAWGDA</span>
          <small>Secure Electronic Evidence</small>
        </Link>
        <nav className={styles.landingActions}>
          {user && (
            <>
              <Link href="/cases">Documents</Link>
              <Link href="/dashboard" className={styles.landingWorkspace}>Workspace</Link>
              {userRole === 'administrator' && (
                <Link href="/admin">
                  Admin Panel
                </Link>
              )}
              <div className={styles.accountControl} ref={accountRef}>
                <button
                  type="button"
                  className={styles.accountButton}
                  aria-label="Open account options"
                  aria-expanded={accountOpen}
                  aria-controls="landing-account-panel"
                  onClick={() => setAccountOpen((open) => !open)}
                >
                  {accountInitial}
                </button>
                {accountOpen && (
                  <div className={styles.accountPanel} id="landing-account-panel">
                    <span className={styles.accountPanelLabel}>Signed in as</span>
                    <span className={styles.accountPanelEmail}>{user.email}</span>
                    <Link
                      href="/profile"
                      className={styles.accountPanelLink}
                      onClick={() => setAccountOpen(false)}
                    >
                      View your profile
                    </Link>
                    <button
                      type="button"
                      className={styles.accountSignOut}
                      onClick={handleSignOut}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {!loading && !user && (
            <Link href="/signin" className={styles.landingSignIn}>
              Sign In
            </Link>
          )}
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroLayout}`}>
          <div className={styles.heroContent}>
            <p className={styles.heroTag}>A clearer way to manage legal documents</p>
            <h1>Legal work, organized and ready to move forward.</h1>
            <p className={styles.heroDescription}>
              For lawyers, paralegals, notaries and law students. Organize documents, keep signatures moving and check that a file has not changed—all in one workspace.
            </p>
            <div className={styles.btnRow}>
              <Link href={user ? '/dashboard' : '/signup'} className={`${styles.btn} ${styles.primary}`}>
                {user ? 'Open your workspace' : 'Create an account'}
              </Link>
              <Link href="/verify" className={styles.btn}>Verify a document</Link>
            </div>
          </div>
          <div className={styles.workflowPreview} aria-hidden="true">
            <div className={styles.previewTopline}>
              <span className={styles.previewMark}><LawgdaMark /></span>
              <span>Your document workflow</span>
              <span className={styles.previewStatus}>Simple & secure</span>
            </div>
            <div className={styles.previewDocument}>
              <span className={styles.documentIcon}>PDF</span>
              <span className={styles.documentLines}>
                <span className={styles.documentName}>Legal documents</span>
                <span className={styles.documentHint}>All in one organized workspace</span>
              </span>
              <span className={styles.documentCheck}>✓</span>
            </div>
            <ol className={styles.previewSteps}>
              <li><span>1</span><strong>Organize</strong><small>Keep files easy to find</small></li>
              <li><span>2</span><strong>Coordinate</strong><small>Follow signature requests</small></li>
              <li><span>3</span><strong>Review</strong><small>Check document integrity</small></li>
            </ol>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`container ${styles.container}`}>
          <h2 className={styles.sectionHeading}>The essentials for <strong>document work</strong></h2>
          <div className={styles.features}>
            <div className={styles.card}>
              <h4>Keep documents organized</h4>
              <p>Group legal PDFs into folders and find the files you need without digging through a crowded list.</p>
            </div>
            <div className={styles.card}>
              <h4>Coordinate signatures</h4>
              <p>Send signature requests to the right people and follow each signer’s progress in one place.</p>
            </div>
            <div className={styles.card}>
              <h4>Check document integrity</h4>
              <p>Check a document against its saved record to confirm its contents have not changed.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.process} id="how-it-works">
        <div className={`container ${styles.container}`}>
          <h2 className={styles.sectionHeading}>A straightforward <strong>workflow</strong></h2>
          <div className={styles.stepRow}>
            <div className={styles.step}>
              <h3>1</h3>
              <h4>Organize</h4>
              <p>Upload and sort legal PDFs into a workspace that fits your work.</p>
            </div>
            <div className={styles.step}>
              <h3>2</h3>
              <h4>Coordinate</h4>
              <p>Choose signers, send a request and keep track of what is outstanding.</p>
            </div>
            <div className={styles.step}>
              <h3>3</h3>
              <h4>Review</h4>
              <p>Check the completed document and verify its integrity when needed.</p>
            </div>
          </div>
        </div>
      </section>

      {!loading && !user && (
        <section className={styles.joinSection}>
          <div className={`container ${styles.container}`}>
            <p className={styles.joinTag}>What happens next</p>
            <h2>Getting started is straightforward.</h2>
            <p className={styles.joinDescription}>
              Create an account, then upload a PDF from your workspace. From there, you can organize it, request signatures or check that the file has not changed.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

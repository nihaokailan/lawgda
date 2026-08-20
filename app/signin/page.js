'use client';
import Link from 'next/link';
import { useState } from 'react';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';
import TopNav from '../components/TopNav';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createSupabaseBrowserClient();
  
  // Removed automatic session-based redirect from signin page

  async function handleSignIn(e) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(true);
      setMessage(
        error.message.includes('email not confirmed')
          ? 'Please confirm your email before signing in. Check your inbox for the confirmation link.'
          : error.message
      );
      return;
    }

    setLoading(false);
    window.location.replace('/dashboard');
  }

  return (
    <main className={`${shell.shell} ${shell.signinShell}`}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <TopNav />
          <h1 className={shared.pageTitle}>Sign In</h1>
          <p className={shared.pageSubtitle}>Access your secure document workspace and evidence tracking dashboard.</p>
          <div className={shared.sectionCard}>
            <form onSubmit={handleSignIn} className={shared.formGrid}>
              <label className={shared.fieldLabel}>
                Email
                <input className={shared.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className={shared.fieldLabel}>
                Password
                <input className={shared.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <button type="submit" className={shared.button} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
            </form>
            {message && (
              <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>{message}</p>
            )}
            <p className={shared.helpText} style={{ marginTop: '1rem' }}>
              Don&apos;t have an account? <Link href="/signup" className={shared.linkButton}>Create one</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

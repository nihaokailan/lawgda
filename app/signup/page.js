'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';
import TopNav from '../components/TopNav';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  async function handleSignup(e) {
    e.preventDefault();
    setMessage('');
    setError(false);

    if (password !== confirmPassword) {
      setError(true);
      setMessage('Passwords do not match.');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/signin`,
      },
    });

    if (error) {
      setError(true);
      setMessage(
        error.message.includes('rate limit')
          ? 'Too many emails sent. Wait a few minutes and try again.'
          : error.message
      );
      return;
    }

    if (data && !data.session) {
      setError(false);
      setMessage('Account created. Check your inbox and click the verification link to sign in.');
      return;
    }

    router.push('/dashboard');
  }

  return (
    <main className={shell.shell}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <TopNav />
          <h1 className={shared.pageTitle}>Sign Up</h1>
          <p className={shared.pageSubtitle}>Create your account to track legal documents, cases, and evidence workflows securely.</p>
          <div className={shared.sectionCard}>
            <form onSubmit={handleSignup} className={shared.formGrid}>
              <label className={shared.fieldLabel}>
                Email
                <input className={shared.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className={shared.fieldLabel}>
                Password
                <input className={shared.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </label>
              <label className={shared.fieldLabel}>
                Confirm Password
                <input className={shared.input} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
              </label>
              <button type="submit" className={shared.button}>Create account</button>
            </form>
            {message && (
              <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>{message}</p>
            )}
            <p className={shared.helpText} style={{ marginTop: '1rem' }}>
              Already have an account? <Link href="/signin" className={shared.linkButton}>Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

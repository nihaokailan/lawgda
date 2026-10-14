'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import auth from '../../styles/auth.module.css';
import { getAuthRequestErrorMessage } from '../../lib/authError';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import LawgdaMark from '../components/LawgdaMark';
import StatusDialog from '../components/StatusDialog';
import { getBrowserSiteUrl } from '../../lib/siteUrl';

// A recovery code (and its PKCE verifier) can be exchanged only once. React
// Strict Mode runs effects twice in development, so share a single exchange
// per code instead of letting the second run fail with a missing verifier.
const codeExchanges = new Map();

function exchangeCodeOnce(supabase, code) {
  if (!codeExchanges.has(code)) {
    codeExchanges.set(code, supabase.auth.exchangeCodeForSession(code));
  }
  return codeExchanges.get(code);
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageContent />
    </Suspense>
  );
}

function SignInPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [passwordUpdateLoading, setPasswordUpdateLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [recoveryChecking, setRecoveryChecking] = useState(false);
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    let active = true;

    async function initializeRecoverySession() {
      const type = searchParams.get('type');
      const code = searchParams.get('code');
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (type !== 'recovery' && !code && !accessToken) {
        return;
      }

      setRecoveryChecking(true);
      setError(false);
      setMessage('Checking your recovery link...');

      let recoveryError = null;
      if (code) {
        ({ error: recoveryError } = await exchangeCodeOnce(supabase, code));
      } else if (accessToken && refreshToken) {
        ({ error: recoveryError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }));
      }

      if (!recoveryError) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          recoveryError = new Error('The recovery session could not be established. Please request a new link.');
        }
      }

      if (!active) {
        return;
      }

      setRecoveryChecking(false);
      if (recoveryError) {
        setError(true);
        setMessage(`Your recovery link is invalid or expired: ${recoveryError.message}`);
        setRecoveryMode(false);
        return;
      }

      setRecoveryMode(true);
      setMessage('Choose a new password to complete your reset.');
    }

    initializeRecoverySession();
    return () => {
      active = false;
    };
  }, [searchParams, supabase]);

  async function handleSignIn(e) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        setError(true);
        setMessage(
          error.message.includes('email not confirmed')
            ? 'Please confirm your email before signing in. Check your inbox for the confirmation link.'
            : getAuthRequestErrorMessage(error)
        );
        return;
      }

      setLoading(false);
      window.location.replace('/dashboard');
    } catch (signInError) {
      setLoading(false);
      setError(true);
      setMessage(getAuthRequestErrorMessage(signInError));
    }
  }

  async function handlePasswordReset() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError(true);
      setMessage('Enter your email address first, then request a password reset.');
      return;
    }

    setResetLoading(true);
    setError(false);
    setMessage('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${getBrowserSiteUrl()}/signin?type=recovery`,
    });

    setResetLoading(false);

    if (resetError) {
      setError(true);
      setMessage(resetError.message);
      return;
    }

    setResetRequested(true);
    setError(false);
    setMessage('A password reset email has been sent. Open the link, then set your new password below.');
  }

  async function handlePasswordUpdate() {
    if (!newPassword || newPassword.length < 6) {
      setError(true);
      setMessage('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(true);
      setMessage('The new password and confirmation do not match.');
      return;
    }

    setPasswordUpdateLoading(true);
    setError(false);
    setMessage('');

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    setPasswordUpdateLoading(false);

    if (updateError) {
      setError(true);
      setMessage(`Unable to update your password: ${updateError.message}`);
      return;
    }

    setRecoveryMode(false);
    setResetRequested(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setMessage('Password updated successfully. You can now sign in with your new password.');
  }

  return (
    <main className={auth.page}>
      <section className={auth.card}>
        <header className={auth.topNav}>
          <Link href="/landing" className={auth.brandLink} aria-label="Go to the Lawgda landing page">
            <span className={auth.brandIcon}><LawgdaMark /></span>
            <span className={auth.brandCopy}>
              <span className={auth.brandName}>LAWGDA</span>
              <span className={auth.tagline}>Secure Electronic Evidence</span>
            </span>
          </Link>
          <Link href="/landing" className={auth.backLink}>
            &larr; Go Back
          </Link>
        </header>
        <div className={auth.content}>
          <h1 className={auth.title}>Sign In</h1>
          <p className={auth.subtitle}>Sign in to view your documents, signature requests and recent activity.</p>
          <form onSubmit={handleSignIn} className={auth.form}>
            <label className={auth.field}>
              Email
              <input className={auth.input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className={auth.field}>
              Password
              <div className={auth.inputWrap}>
                <input
                  className={`${auth.input} ${auth.passwordInput}`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={auth.passwordToggle}
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <button type="button" className={auth.textButton} onClick={handlePasswordReset} disabled={resetLoading}>
              {resetLoading ? 'Sending reset link...' : 'Forgot password?'}
            </button>
            <button type="submit" className={auth.primaryButton} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          </form>

          {recoveryMode && (
            <div className={auth.recoveryPanel}>
              <h2 className={auth.recoveryTitle}>Reset your password</h2>
              <label className={auth.field}>
                New password
                <div className={auth.inputWrap}>
                  <input
                    className={`${auth.input} ${auth.passwordInput}`}
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter a new password"
                    minLength={6}
                  />
                </div>
              </label>
              <label className={auth.field}>
                Confirm new password
                <div className={auth.inputWrap}>
                  <input
                    className={`${auth.input} ${auth.passwordInput}`}
                    type={showPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    minLength={6}
                  />
                </div>
              </label>
              <button type="button" className={auth.primaryButton} onClick={handlePasswordUpdate} disabled={passwordUpdateLoading}>
                {passwordUpdateLoading ? 'Updating password...' : 'Update password'}
              </button>
            </div>
          )}

          {resetRequested && !recoveryMode && !recoveryChecking && (
            <p className={auth.helperText}>The password form will appear after you open the reset link from your email.</p>
          )}

          <StatusDialog message={message} error={Boolean(error)} onClose={() => setMessage('')} />
          <p className={auth.footerText}>
            Don&apos;t have an account? <Link href="/signup" className={auth.footerLink}>Create one</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

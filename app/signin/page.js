'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

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
        ({ error: recoveryError } = await supabase.auth.exchangeCodeForSession(code));
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
      redirectTo: `${window.location.origin}/signin?type=recovery`,
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
    <main className={`${shell.shell} ${shell.signinShell}`}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <header className={shared.topNav}>
            <Link href="/landing" className={shared.topNavBrandLink} aria-label="Go to the Lawgda landing page">
              <span className={shared.topNavBrandName}>LAWGDA</span>
              <span className={shared.topNavTagline}>Secure Electronic Evidence</span>
            </Link>
            <Link href="/landing" className={shared.topNavLink}>
              &larr; Go Back
            </Link>
          </header>
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
                <div className={shared.passwordInputWrap}>
                  <input
                    className={`${shared.input} ${shared.passwordInput}`}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className={shared.passwordToggle}
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <button type="button" className={shared.textButton} onClick={handlePasswordReset} disabled={resetLoading}>
                {resetLoading ? 'Sending reset link...' : 'Forgot password?'}
              </button>
              <button type="submit" className={shared.button} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
            </form>

            {recoveryMode && (
              <div className={shared.resetPanel}>
                <h2 className={shared.resetTitle}>Reset your password</h2>
                <label className={shared.fieldLabel}>
                  New password
                  <div className={shared.passwordInputWrap}>
                    <input
                      className={`${shared.input} ${shared.passwordInput}`}
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter a new password"
                      minLength={6}
                    />
                  </div>
                </label>
                <label className={shared.fieldLabel}>
                  Confirm new password
                  <div className={shared.passwordInputWrap}>
                    <input
                      className={`${shared.input} ${shared.passwordInput}`}
                      type={showPassword ? 'text' : 'password'}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm your new password"
                      minLength={6}
                    />
                  </div>
                </label>
                <button type="button" className={shared.button} onClick={handlePasswordUpdate} disabled={passwordUpdateLoading}>
                  {passwordUpdateLoading ? 'Updating password...' : 'Update password'}
                </button>
              </div>
            )}

            {resetRequested && !recoveryMode && !recoveryChecking && (
              <p className={shared.helpText}>The password form will appear after you open the reset link from your email.</p>
            )}

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

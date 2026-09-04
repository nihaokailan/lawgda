'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function SignupPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function handleSignup(e) {
    e.preventDefault();
    setMessage('');
    setError(false);

    if (password !== confirmPassword) {
      setError(true);
      setMessage('Passwords do not match.');
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        },
        emailRedirectTo: `${window.location.origin}/signin`,
      },
    });

    if (signUpError) {
      setError(true);
      setMessage(
        signUpError.message.includes('rate limit')
          ? 'Signup email limit reached. Please wait a few minutes, or ask your admin to temporarily disable email confirmation in Supabase Auth settings for development.'
          : signUpError.message
      );
      return;
    }

    if (data && !data.session) {
      setMessage('Account created. Check your email to confirm your account before signing in.');
      return;
    }

    router.push('/dashboard');
  }

  return (
    <main className={shell.shell}>
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
          <h1 className={shared.pageTitle}>Create Account</h1>
          <p className={shared.pageSubtitle}>Anyone can register. New accounts are assigned the User role automatically.</p>
          <div className={shared.sectionCard}>
            <form onSubmit={handleSignup} className={shared.formGrid}>
              <label className={shared.fieldLabel}>
                First Name
                <input className={shared.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </label>
              <label className={shared.fieldLabel}>
                Last Name
                <input className={shared.input} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </label>
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
                    minLength={6}
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
              <label className={shared.fieldLabel}>
                Confirm Password
                <div className={shared.passwordInputWrap}>
                  <input
                    className={`${shared.input} ${shared.passwordInput}`}
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className={shared.passwordToggle}
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <button type="submit" className={shared.button}>Create account</button>
            </form>
            <p className={shared.helpText} style={{ marginTop: '1rem' }}>
              Anyone can register. New accounts are created as standard users and can be upgraded later by an admin.
            </p>
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

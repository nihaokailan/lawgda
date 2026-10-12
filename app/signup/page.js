'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import auth from '../../styles/auth.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import { getAuthRequestErrorMessage } from '../../lib/authError';

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

    try {
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
            : getAuthRequestErrorMessage(signUpError)
        );
        return;
      }

      if (data && !data.session) {
        setMessage('Account created. Check your email to confirm your account before signing in.');
        return;
      }

      router.push('/dashboard');
    } catch (signUpError) {
      setError(true);
      setMessage(getAuthRequestErrorMessage(signUpError));
    }
  }

  return (
    <main className={auth.page}>
      <section className={`${auth.card} ${auth.signupCard}`}>
        <header className={auth.topNav}>
          <Link href="/landing" className={auth.brandLink} aria-label="Go to the Lawgda landing page">
            <span className={auth.brandName}>LAWGDA</span>
            <span className={auth.tagline}>Secure Electronic Evidence</span>
          </Link>
          <Link href="/landing" className={auth.backLink}>
            &larr; Go Back
          </Link>
        </header>
        <div className={auth.content}>
          <h1 className={auth.title}>Create Account</h1>
          <p className={auth.subtitle}>Anyone can register. New accounts are assigned the User role automatically.</p>
          <form onSubmit={handleSignup} className={`${auth.form} ${auth.signupForm}`}>
            <label className={auth.field}>
              First Name
              <input className={auth.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </label>
            <label className={auth.field}>
              Last Name
              <input className={auth.input} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </label>
            <label className={auth.field}>
              Email
              <input className={auth.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className={auth.field}>
              Password
              <div className={auth.inputWrap}>
                <input
                  className={`${auth.input} ${auth.passwordInput}`}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
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
            <label className={auth.field}>
              Confirm Password
              <div className={auth.inputWrap}>
                <input
                  className={`${auth.input} ${auth.passwordInput}`}
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className={auth.passwordToggle}
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <button type="submit" className={auth.primaryButton}>Create account</button>
          </form>
          {message && (
            <p className={`${auth.message} ${error ? auth.messageError : auth.messageSuccess}`}>{message}</p>
          )}
          <p className={auth.footerText}>
            Already have an account? <Link href="/signin" className={auth.footerLink}>Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

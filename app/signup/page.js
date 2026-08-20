'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';
import TopNav from '../components/TopNav';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
          full_name: fullName,
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
          <TopNav />
          <h1 className={shared.pageTitle}>Create Account</h1>
          <p className={shared.pageSubtitle}>Anyone can register. New accounts are assigned the User role automatically.</p>
          <div className={shared.sectionCard}>
            <form onSubmit={handleSignup} className={shared.formGrid}>
              <label className={shared.fieldLabel}>
                Full name
                <input className={shared.input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </label>
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
            <p className={shared.helpText} style={{ marginTop: '1rem' }}>
              Admin privileges cannot be selected during registration.
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

'use client';

import { useState } from 'react';
import shared from '../../styles/shared.module.css';
import styles from '../../styles/workspace.module.css';
import { ROLE_LABELS } from '../../lib/roles';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function ProfileClient({ initialProfile, email }) {
  const nameParts = (initialProfile.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(nameParts[0] ?? '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' '));
  const [accountEmail, setAccountEmail] = useState(email);
  const [role, setRole] = useState(initialProfile.role ?? 'staff');
  const [organizationId, setOrganizationId] = useState(initialProfile.org_id ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const isAdmin = initialProfile.role === 'admin';
  const supabase = createSupabaseBrowserClient();

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError(false);

    if (newPassword !== confirmPassword) {
      setError(true);
      setMessage('New password and confirmation password do not match.');
      setSaving(false);
      return;
    }

    if (newPassword && !codeSent) {
      await sendConfirmationCode();
      setSaving(false);
      return;
    }

    if (newPassword && !verificationCode.trim()) {
      setError(true);
      setMessage('Enter the confirmation code sent to your email.');
      setSaving(false);
      return;
    }

    if (newPassword && !codeVerified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: verificationCode.trim(),
        type: 'email',
      });
      if (verifyError) {
        setError(true);
        setMessage(`Invalid confirmation code: ${verifyError.message}`);
        setSaving(false);
        return;
      }
      setCodeVerified(true);
      setMessage('Email confirmed. Click Save Profile again to apply the password change.');
      setSaving(false);
      return;
    }

    const profileUpdate = {
      email: accountEmail.trim() || null,
      full_name: `${firstName.trim()} ${lastName.trim()}`.trim() || null,
      ...(isAdmin ? { role, org_id: organizationId.trim() || null } : {}),
    };
    const { error: updateError } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('user_id', initialProfile.user_id);

    if (updateError) {
      setError(true);
      setMessage(`Unable to save profile: ${updateError.message}`);
      setSaving(false);
      return;
    }

    if (accountEmail.trim() && accountEmail.trim() !== email.trim()) {
      const { error: emailError } = await supabase.auth.updateUser({ email: accountEmail.trim() });
      if (emailError) {
        setError(true);
        setMessage(`Unable to update email: ${emailError.message}`);
        setSaving(false);
        return;
      }
    }

    if (newPassword) {
      const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
      if (passwordError) {
        setError(true);
        setMessage(`Unable to change password: ${passwordError.message}`);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setIsEditing(false);
    setMessage(newPassword ? 'Profile and password updated. Check your email for confirmation.' : 'Profile updated successfully.');
  }

  async function sendConfirmationCode() {
    setMessage('');
    setError(false);
    const { error: codeError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (codeError) {
      setError(true);
      setMessage(`Unable to send confirmation code: ${codeError.message}`);
      return;
    }

    setCodeSent(true);
    setMessage('A confirmation code was sent to your email.');
  }

  return (
    <>
      <div className={styles.profileToolbar}>
        <button type="button" className={shared.linkButton} onClick={() => setIsEditing((value) => !value)}>
          &#9998; {isEditing ? 'Close Edit' : 'Edit'}
        </button>
      </div>

      <div className={shared.sectionCard} style={{ marginTop: '1rem' }}>
        <form onSubmit={handleSave} className={shared.formGrid}>
          <label className={shared.fieldLabel}>
            Organization ID
            <input className={`${shared.input} ${styles.profileLocked}`} value={organizationId || 'Not assigned yet'} disabled />
          </label>
          <label className={shared.fieldLabel}>
            First Name
            <input
              className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              disabled={!isEditing}
              required
            />
          </label>
          <label className={shared.fieldLabel}>
            Last Name
            <input className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`} value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={!isEditing} required />
          </label>
          <label className={shared.fieldLabel}>
            Current Role
            <input className={`${shared.input} ${styles.profileLocked}`} value={ROLE_LABELS[role] ?? role} disabled />
          </label>
          <label className={shared.fieldLabel}>
            Change Password
            <input className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`} type="password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setCodeSent(false); setCodeVerified(false); }} disabled={!isEditing} placeholder="Leave blank to keep current password" minLength={6} />
          </label>
          <label className={shared.fieldLabel}>
            Confirm Password
            <input className={`${shared.input} ${isEditing && newPassword ? styles.profileEditable : styles.profileLocked}`} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={!isEditing || !newPassword} minLength={6} />
          </label>
          <label className={shared.fieldLabel}>
            Admin Request
            <input className={`${shared.input} ${styles.profileLocked}`} value={initialProfile.admin_request_status ?? 'none'} disabled />
          </label>
          <label className={shared.fieldLabel}>
            Email
            <input className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`} type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} disabled={!isEditing} required />
          </label>
          {newPassword && isEditing && (
            <>
              {codeSent && !codeVerified && (
                <label className={shared.fieldLabel}>
                  Confirmation code
                  <input className={`${shared.input} ${styles.profileEditable}`} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" />
                </label>
              )}
            </>
          )}
          <button className={shared.button} type="submit" disabled={saving || !isEditing}>
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </form>
        {message && (
          <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>
            {message}
          </p>
        )}
      </div>
    </>
  );
}

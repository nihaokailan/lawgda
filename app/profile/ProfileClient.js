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
  const [role, setRole] = useState(initialProfile.role ?? 'staff');
  const [organizationId, setOrganizationId] = useState(initialProfile.org_id ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
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

    if (changePassword && !codeVerified) {
      setError(true);
      setMessage('Verify the confirmation code before changing your password.');
      setSaving(false);
      return;
    }

    if (changePassword && newPassword !== confirmPassword) {
      setError(true);
      setMessage('New password and confirmation password do not match.');
      setSaving(false);
      return;
    }

    const profileUpdate = {
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

    if (changePassword) {
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
    setMessage(changePassword ? 'Profile and password updated successfully.' : 'Profile updated successfully.');
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

  async function verifyConfirmationCode() {
    setMessage('');
    setError(false);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: verificationCode.trim(),
      type: 'email',
    });

    if (verifyError) {
      setError(true);
      setMessage(`Invalid confirmation code: ${verifyError.message}`);
      return;
    }

    setCodeVerified(true);
    setMessage('Email confirmed. You can now save your new password.');
  }

  return (
    <>
      <div className={styles.profileToolbar}>
        <button type="button" className={shared.linkButton} onClick={() => setIsEditing((value) => !value)}>
          &#9998; {isEditing ? 'Close Edit' : 'Edit'}
        </button>
      </div>

      <div className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <p className={styles.infoLabel}>Email</p>
          <p className={styles.infoValue}>{email}</p>
        </div>
        <div className={styles.infoCard}>
          <p className={styles.infoLabel}>First Name</p>
          <p className={styles.infoValue}>{firstName || 'Not set'}</p>
        </div>
        <div className={styles.infoCard}>
          <p className={styles.infoLabel}>Last Name</p>
          <p className={styles.infoValue}>{lastName || 'Not set'}</p>
        </div>
        <div className={styles.infoCard}>
          <p className={styles.infoLabel}>Current Role</p>
          <p className={styles.infoValue}>{ROLE_LABELS[initialProfile.role] ?? initialProfile.role}</p>
        </div>
        <div className={styles.infoCard}>
          <p className={styles.infoLabel}>Organization ID</p>
          <p className={styles.infoValue}>{initialProfile.org_id ?? 'Not assigned yet'}</p>
        </div>
        <div className={styles.infoCard}>
          <p className={styles.infoLabel}>Admin Request</p>
          <p className={styles.infoValue}>{initialProfile.admin_request_status ?? 'none'}</p>
        </div>
      </div>

      <div className={shared.sectionCard} style={{ marginTop: '1rem' }}>
        <form onSubmit={handleSave} className={shared.formGrid}>
          <label className={shared.fieldLabel}>
            First Name
            <input
              className={shared.input}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              disabled={!isEditing}
              required
            />
          </label>
          <label className={shared.fieldLabel}>
            Last Name
            <input className={shared.input} value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={!isEditing} required />
          </label>
          <label className={shared.fieldLabel}>
            Current Role
            <select className={shared.select} value={role} onChange={(event) => setRole(event.target.value)} disabled={!isEditing || !isAdmin}>
              <option value="admin">Admin</option>
              <option value="lawyer">Lawyer</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          <label className={shared.fieldLabel}>
            Organization ID
            <input className={shared.input} value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={!isEditing || !isAdmin} />
          </label>
          <label className={shared.fieldLabel}>
            <span>Change password</span>
            <input type="checkbox" checked={changePassword} onChange={(event) => { setChangePassword(event.target.checked); setCodeSent(false); setCodeVerified(false); }} disabled={!isEditing} />
          </label>
          {changePassword && isEditing && (
            <>
              <button className={shared.linkButton} type="button" onClick={sendConfirmationCode} disabled={codeSent}>
                {codeSent ? 'Code sent' : 'Send confirmation code'}
              </button>
              {codeSent && !codeVerified && (
                <>
                  <label className={shared.fieldLabel}>
                    Confirmation code
                    <input className={shared.input} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" required />
                  </label>
                  <button className={shared.linkButton} type="button" onClick={verifyConfirmationCode}>Verify code</button>
                </>
              )}
              {codeVerified && (
                <>
                  <label className={shared.fieldLabel}>
                    New password
                    <input className={shared.input} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} required />
                  </label>
                  <label className={shared.fieldLabel}>
                    Confirm password
                    <input className={shared.input} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} required />
                  </label>
                </>
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

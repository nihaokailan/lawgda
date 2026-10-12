'use client';

import { useState } from 'react';
import Link from 'next/link';
import shared from '../../styles/shared.module.css';
import styles from '../../styles/workspace.module.css';
import { ROLE_LABELS } from '../../lib/roles';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function ProfileClient({ initialProfile, email }) {
  const nameParts = (initialProfile.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(nameParts[0] ?? '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' '));
  const [accountEmail, setAccountEmail] = useState(email);
  const role = initialProfile.role ?? 'normal';
  const organizationId = initialProfile.org_id ?? '';
  const [isEditing, setIsEditing] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
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
    <div className={styles.profilePage}>
      <section className={styles.profileIdentity}>
        <span className={styles.profileAvatar} aria-hidden="true">
          {(firstName || accountEmail || 'U').charAt(0).toUpperCase()}
        </span>
        <div className={styles.profileIdentityCopy}>
          <h2>{`${firstName} ${lastName}`.trim() || 'Your profile'}</h2>
          <p>{accountEmail}</p>
        </div>
        <span className={styles.rolePill}>
          <span aria-hidden="true" />{ROLE_LABELS[role] ?? role} role
        </span>
      </section>

      <div className={styles.profileColumns}>
        <section className={styles.profileFormSurface}>
          <form onSubmit={handleSave}>
            <div className={styles.profileFormBody}>
              <div className={styles.profileSectionHeading}>
                <h2>Personal information</h2>
                <p>This name appears on the documents you upload and sign.</p>
              </div>

              <div className={styles.profileNameFields}>
                <label className={shared.fieldLabel}>
                  First name
                  <input
                    className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`}
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    disabled={!isEditing}
                    required
                  />
                </label>
                <label className={shared.fieldLabel}>
                  Last name
                  <input
                    className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`}
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    disabled={!isEditing}
                    required
                  />
                </label>
              </div>

              <label className={shared.fieldLabel}>
                Email
                <input
                  className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`}
                  type="email"
                  value={accountEmail}
                  onChange={(event) => setAccountEmail(event.target.value)}
                  disabled={!isEditing}
                  required
                />
              </label>

              <div className={styles.profilePasswordFields}>
                <label className={shared.fieldLabel}>
                  Change password
                  <input
                    className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`}
                    type="password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setCodeSent(false);
                      setCodeVerified(false);
                    }}
                    disabled={!isEditing}
                    placeholder="Leave blank to keep current password"
                    minLength={6}
                  />
                </label>
                <p className={styles.profileHint}>Only fill this in if you want to set a new password.</p>
                {newPassword && isEditing && (
                  <label className={shared.fieldLabel}>
                    Confirm password
                    <input
                      className={`${shared.input} ${isEditing ? styles.profileEditable : styles.profileLocked}`}
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      minLength={6}
                    />
                  </label>
                )}
                {codeSent && !codeVerified && isEditing && (
                  <label className={shared.fieldLabel}>
                    Confirmation code
                    <input
                      className={`${shared.input} ${styles.profileEditable}`}
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className={styles.profileFormFooter}>
              {!isEditing ? (
                <button
                  type="button"
                  className={shared.button}
                  onClick={() => setIsEditing(true)}
                >
                  Edit profile
                </button>
              ) : (
                <>
                  <button type="button" className={shared.linkButton} onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                  <button className={shared.button} type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                </>
              )}
            </div>
          </form>
          {message && (
            <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>
              {message}
            </p>
          )}
        </section>

        <aside className={styles.profileDetailsCard}>
          <h2>Account details <span aria-label="Read only">Read only</span></h2>
          <div className={styles.profileDetail}>
            <span>Organization ID</span>
            <strong>{organizationId || 'Not assigned yet'}</strong>
            {!organizationId && <p>Assigned when you join an organization.</p>}
          </div>
          <div className={styles.profileDetail}>
            <span>Current role</span>
            <strong className={styles.rolePillCompact}>{ROLE_LABELS[role] ?? role}</strong>
          </div>
          <div className={styles.profileDetail}>
            <span>Admin request</span>
            <strong>{initialProfile.admin_request_status || 'None'}</strong>
          </div>
          {role === 'normal' && (
            <Link className={styles.profileRequestLink} href="/admin/request">
              Request admin access <span aria-hidden="true">→</span>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import shared from '../../styles/shared.module.css';
import styles from '../../styles/workspace.module.css';
import { ROLE_LABELS } from '../../lib/roles';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function ProfileClient({ initialProfile, email }) {
  const [fullName, setFullName] = useState(initialProfile.full_name ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createSupabaseBrowserClient();

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError(false);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null })
      .eq('user_id', initialProfile.user_id);

    if (updateError) {
      setError(true);
      setMessage(`Unable to save profile: ${updateError.message}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMessage('Profile updated successfully.');
  }

  return (
    <>
      <div className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <p className={styles.infoLabel}>Email</p>
          <p className={styles.infoValue}>{email}</p>
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
            Full name
            <input
              className={shared.input}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Add your full name"
            />
          </label>
          <button className={shared.button} type="submit" disabled={saving}>
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

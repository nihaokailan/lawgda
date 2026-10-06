'use client';

import { useState } from 'react';
import shared from '../../../styles/shared.module.css';

export default function AdminRequestClient({ profile }) {
  const [organizationName, setOrganizationName] = useState('');
  const [justification, setJustification] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError(false);

    const response = await fetch('/api/admin/request-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationName, justification }),
    });

    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(true);
      setMessage(payload.error || 'Unable to submit your request.');
      return;
    }

    setMessage('Request submitted. The platform\'s Default Admin must approve it before your organization is created.');
    setOrganizationName('');
    setJustification('');
  }

  return (
    <div className={shared.sectionCard} style={{ marginTop: 0 }}>
      <p className={shared.cardText}>Current request status: {profile.admin_request_status || 'none'}</p>
      <form onSubmit={handleSubmit} className={shared.formGrid}>
        <label className={shared.fieldLabel}>
          Organization name
          <input
            className={shared.input}
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            required
          />
        </label>

        <label className={shared.fieldLabel}>
          Why you need admin access
          <textarea
            className={shared.textarea}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            rows={4}
            placeholder="Describe your team use case and onboarding need."
          />
        </label>

        <button className={shared.button} type="submit" disabled={saving}>
          {saving ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>

      {message && (
        <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>
          {message}
        </p>
      )}
    </div>
  );
}

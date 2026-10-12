'use client';

import { useState } from 'react';
import Link from 'next/link';
import shared from '../../../styles/shared.module.css';
import styles from '../../../styles/workspace.module.css';

export default function AdminRequestClient({ profile }) {
  const [organizationName, setOrganizationName] = useState('');
  const [justification, setJustification] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRequestStatus, setSavedRequestStatus] = useState(profile.admin_request_status || 'none');
  const requestStatus = savedRequestStatus.toLowerCase();
  const hasRequest = !['none', 'null', ''].includes(requestStatus);
  const isApproved = ['approved', 'accepted'].includes(requestStatus);
  const isDeclined = ['declined', 'rejected', 'denied'].includes(requestStatus);
  const isPending = hasRequest && !isApproved && !isDeclined;

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError(false);

    try {
      const response = await fetch('/api/admin/request-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName, justification }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(true);
        setMessage(payload.error || 'Unable to submit your request.');
        return;
      }

      setSavedRequestStatus(payload.request?.admin_request_status || 'pending');
      setMessage('Request submitted. The platform\'s Default Admin must approve it before your organization is created.');
      setOrganizationName('');
      setJustification('');
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error ? failure.message : 'Unable to submit your request. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.adminRequestPage}>
      <section className={styles.requestStatusCard}>
        <div className={styles.requestStatusHeading}>
          <div>
            <h2>Request status</h2>
            <p>
              {isPending
                ? 'Your current request is waiting for a decision.'
                : isApproved
                  ? 'Your organization request has been approved.'
                  : isDeclined
                    ? 'Your request was declined.'
                    : 'Submit your organization details to begin the review.'}
            </p>
          </div>
          <span className={`${styles.requestStatusPill} ${isPending ? styles.requestStatusPending : ''} ${isApproved ? styles.requestStatusApproved : ''} ${isDeclined ? styles.requestStatusDeclined : ''}`}>
            <span aria-hidden="true" />{hasRequest ? savedRequestStatus : 'Not submitted'}
          </span>
        </div>
        <ol className={styles.requestSteps}>
          <li className={hasRequest ? styles.requestStepComplete : styles.requestStepActive}>
            <span>{hasRequest ? '✓' : '1'}</span>
            <div><strong>Submitted</strong><small>{hasRequest ? 'Request received' : 'Request not submitted'}</small></div>
          </li>
          <li className={isPending ? styles.requestStepActive : (isApproved || isDeclined ? styles.requestStepComplete : '')}>
            <span>{isApproved || isDeclined ? '✓' : '2'}</span>
            <div><strong>Under review</strong><small>{isPending ? 'Your request is being reviewed' : 'Platform administrator review'}</small></div>
          </li>
          <li className={isApproved || isDeclined ? styles.requestStepComplete : ''}>
            <span>{isApproved || isDeclined ? '✓' : '3'}</span>
            <div><strong>Decision</strong><small>{isApproved ? 'Approved' : isDeclined ? 'Declined' : 'Approved or declined'}</small></div>
          </li>
        </ol>
      </section>

      <div className={styles.requestColumns}>
        <section className={styles.requestFormCard}>
          <div className={styles.requestSectionHeading}>
            <h2>Organization details</h2>
            <p>Tell us who you are applying for and why.</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className={styles.requestFormBody}>
              <label className={shared.fieldLabel}>
                Organization name
                <input
                  className={shared.input}
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Registered name of your organization"
                  required
                />
              </label>
              <label className={shared.fieldLabel}>
                Why you need admin access
                <textarea
                  className={shared.textarea}
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  rows={5}
                  placeholder="Describe your team use case and onboarding need."
                />
              </label>
            </div>
            <div className={styles.requestFormFooter}>
              <button className={shared.button} type="submit" disabled={saving}>
                {saving ? 'Submitting...' : 'Submit request'}
              </button>
            </div>
          </form>
          {message && (
            <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>
              {message}
            </p>
          )}
        </section>

        <aside className={styles.requestGuidanceCard}>
          <h2>Before you submit</h2>
          <ul>
            <li><span aria-hidden="true">▣</span><p>Use your organization&apos;s registered name.</p></li>
            <li><span aria-hidden="true">♧</span><p>Explain how your team will use LAWGDA and who needs onboarding.</p></li>
          </ul>
          <Link href="/profile">Check your profile details <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
    </div>
  );
}

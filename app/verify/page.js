'use client';

import VerifyDocumentForm from '../components/VerifyDocumentForm';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';
import TopNav from '../components/TopNav';

export default function VerifyPage() {
  function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = '/cases';
  }

  return (
    <main className={shell.shell}>
      <TopNav />
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <header className={shared.pageActionHeader}>
            <div>
              <p className={shared.breadcrumb}>Workspace <span aria-hidden="true">/</span> Verification</p>
              <h1 className={shared.pageTitle}>Verify Document</h1>
              <p className={shared.pageSubtitle}>Verify a file from your device or choose a document stored in Lawgda.</p>
            </div>
            <button type="button" className={shared.linkButton} onClick={handleBack} aria-label="Go back to the previous page">
              &larr; Go Back
            </button>
          </header>
          <div className={shared.sectionCard}>
            <VerifyDocumentForm />
          </div>
        </div>
      </div>
    </main>
  );
}

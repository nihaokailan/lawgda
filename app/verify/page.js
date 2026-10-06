'use client';

import VerifyDocumentForm from '../components/VerifyDocumentForm';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';

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
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <header className={shared.topNav}>
            <div className={shared.topNavBrand}>
              <span className={shared.topNavBrandName}>LAWGDA</span>
              <span className={shared.topNavTagline}>Secure Electronic Evidence</span>
            </div>
            <button type="button" className={shared.topNavLink} onClick={handleBack} aria-label="Go back to the previous page">
              &larr; Go Back
            </button>
          </header>
          <h1 className={shared.pageTitle}>Verify Document</h1>
          <p className={shared.pageSubtitle}>Verify a file from your device or choose a document stored in Lawgda.</p>
          <div className={shared.sectionCard}>
            <VerifyDocumentForm />
          </div>
        </div>
      </div>
    </main>
  );
}

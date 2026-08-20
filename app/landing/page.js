import styles from './styles.module.css';
import Link from 'next/link';
import shared from '../../styles/shared.module.css';

export default function Landing() {
  return (
    <main>
      <header className={shared.topNav}>
        <Link href="/landing" className={shared.topNavBrandLink} aria-label="Go to the Lawgda landing page">
          <span className={shared.topNavBrandName}>LAWGDA</span>
          <span className={shared.topNavTagline}>Secure Electronic Evidence</span>
        </Link>
      </header>

      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroTag}>Secure Digital Signing & Verification</p>
            <h1>Sign With Confidence. Verify With Certainty.</h1>
            <p className={styles.heroDescription}>
              Lawgda lets you securely manage legal documents, coordinate multiple signatures, and verify document integrity with Lawgda.
            </p>
            <div className={styles.btnRow}>
              <Link href="/upload" className={`${styles.btn} ${styles.primary}`}>Sign a document →</Link>
              <Link href="/verify" className={styles.btn}>Verify a document →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`container ${styles.container}`}>
          <h2 className={styles.sectionHeading}>What We Offer — <strong>Key Features</strong></h2>
          <div className={styles.features}>
            <div className={styles.card}><h4>Secure Document Organization</h4><p>Keep legal documents organized in structured folders with controlled access. Lawgda helps legal professionals manage their documents without unnecessarily storing sensitive case information.</p></div>
            <div className={styles.card}><h4>Controlled Signature Workflows</h4><p>Request signatures from one or multiple authorized signers through a structured digital workflow. Track who needs to sign and the current signing status.</p></div>
            <div className={styles.card}><h4>Multi-Signer Support</h4><p>Support documents that require signatures from multiple lawyers, clients, or authorized individuals. Lawgda records each signer’s status and maintains the signing sequence when required.</p></div>
            <div className={styles.card}><h4>Document Locking</h4><p>Once a document enters an active signing workflow, its content is locked to prevent unauthorized editing or replacement. Signers can sign the document without modifying its contents.</p></div>
            <div className={styles.card}><h4>Secure Digital Signatures</h4><p>Support digital signing using authorized signing certificates, including DICT/PNPKI certificates where configured. Signing credentials are protected using secure key-management practices.</p></div>
            <div className={styles.card}><h4>Document Integrity Verification</h4><p>Lawgda generates a SHA-256 hash of the final signed document. The hash can later be recalculated and compared with the recorded value to detect whether the document has been altered after completion.</p></div>
          </div>
        </div>
      </section>

      <section className={styles.process}>
        <div className={`container ${styles.container}`}>
          <h2 className={styles.sectionHeading}>Process — <strong>How It Works</strong></h2>
          <div className={styles.stepRow}>
            <div className={styles.step}><h3>01</h3><h4>Organize Your Documents</h4><p>Upload your legal PDF documents and organize them into secure folders. Access is controlled based on each user’s role and document permissions.</p></div>
            <div className={styles.step}><h3>02</h3><h4>Request Signatures</h4><p>Select the document that needs to be signed and assign one or more authorized signers. Lawgda creates a signature request and tracks each signer’s status.</p></div>
            <div className={styles.step}><h3>03</h3><h4>Sign Securely</h4><p>The document becomes locked once the signing workflow begins. Each authorized signer can access the document and apply their digital signature without modifying the document’s content.</p></div>
            <div className={styles.step}><h3>04</h3><h4>Complete & Record</h4><p>Once all required signers have completed their signatures, Lawgda marks the document as completed and records the signing activity in the audit trail.</p></div>
            <div className={styles.step}><h3>05</h3><h4>Verify Document Integrity</h4><p>Lawgda generates a SHA-256 hash of the final signed document. When the document needs to be verified later, Lawgda generates a new hash and compares it with the recorded value. A mismatch indicates that the file has been modified.</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}

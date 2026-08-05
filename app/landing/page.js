import styles from './styles.module.css';
import Link from 'next/link';

export default function Landing() {
  return (
    <main>
      <nav className={styles.nav}>
        <div className={styles.logo}>LAWGDA</div>
        <div className={styles.navLinks}>
          <Link href="/upload">SIGN DOCUMENT</Link>
          <Link href="/verify">VERIFY DOCUMENT</Link>
          <Link href="/cases">MY DOCUMENTS</Link>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className="container">
          <div style={{maxWidth:900, margin:'0 auto'}}>
            <p style={{letterSpacing:2, textTransform:'uppercase', fontSize:12}}>MVP — Secure Digital Signing & Verification</p>
            <h1>Legal Documents You Can Trust</h1>
            <p>
              Lawgda lets you digitally sign PDF documents using your own certificate,
              append a tamper-evident signature page, and verify authenticity instantly via QR code.
            </p>
            <div className={styles.btnRow}>
              <Link href="/upload" className={`${styles.btn} ${styles.primary}`}>Sign a document →</Link>
              <Link href="/verify" className={styles.btn}>Verify a document →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={'container ' + styles.container}>
          <h2 style={{textAlign:'center', marginBottom:'1.5rem'}}>What We Offer — <strong>Key Features</strong></h2>
          <div className={styles.features}>
            <div className={styles.card}><h4>Client-Side SHA-256 Hashing</h4><p>Documents are hashed in the browser using the Web Crypto API so original bytes never leave your device unprocessed.</p></div>
            <div className={styles.card}><h4>AES-256-GCM Key Management</h4><p>Your keys can be encrypted and stored—protecting private keys for signature operations.</p></div>
            <div className={styles.card}><h4>RSA-SHA256 Digital Signatures</h4><p>Sign using your certificate; signatures are verifiable and non-repudiable.</p></div>
            <div className={styles.card}><h4>Append Certificate Model</h4><p>A separate signature page with QR code is appended to the PDF so originals remain intact.</p></div>
            <div className={styles.card}><h4>Cryptographic Verification</h4><p>Re-upload or verify with the QR code to validate a document's authenticity.</p></div>
            <div className={styles.card}><h4>Regulatory Compliance</h4><p>Designed to support common legal-compliance needs and chain-of-custody tracking.</p></div>
          </div>
        </div>
      </section>

      <section className={styles.process}>
        <div className={'container ' + styles.container}>
          <h2 style={{textAlign:'center', marginBottom:'1rem'}}>Process — <strong>How It Works</strong></h2>
          <div className={styles.stepRow}>
            <div className={styles.step}><h3>01</h3><h4>Upload PDF Document</h4><p>Upload your document; the browser instantly computes the SHA-256 hash client-side.</p></div>
            <div className={styles.step}><h3>02</h3><h4>Sign with Certificate</h4><p>Use your certificate to sign and append a tamper-evident signature page.</p></div>
            <div className={styles.step}><h3>03</h3><h4>Verify Instantly</h4><p>Anyone can verify authenticity via the QR code or re-upload for comparison.</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}

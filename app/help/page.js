import TopNav from '../components/TopNav';
import BackButton from '../components/BackButton';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';
import { MAX_UPLOAD_LABEL } from '../../lib/uploadLimits';

export const metadata = { title: 'Help & FAQs · Lawgda' };

const SECTIONS = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'What is Lawgda?',
        a: <p>A secure place to upload legal PDFs, collect signatures, and prove a document was never changed. Every view, edit and signature is recorded.</p>,
      },
      {
        q: 'What can my role do?',
        a: (
          <ul>
            <li><strong>Lawyer:</strong> upload, send for signing, sign, and mark documents as Filed.</li>
            <li><strong>Staff:</strong> upload, organize, and send for signing. Staff cannot sign.</li>
            <li><strong>Admin:</strong> manages the firm&apos;s Lawyers and Staff. Admins cannot open documents.</li>
            <li><strong>New account:</strong> can sign documents sent to you, or request admin access to set up a firm.</li>
          </ul>
        ),
      },
    ],
  },
  {
    title: 'Documents',
    items: [
      {
        q: 'How do I upload a document?',
        a: (
          <ol>
            <li>On the Dashboard or Documents page, click <strong>Upload document</strong>.</li>
            <li>Choose a PDF (up to {MAX_UPLOAD_LABEL}) and give it a title.</li>
            <li>Optionally add a case number and tags so it is easy to find later.</li>
          </ol>
        ),
      },
      {
        q: 'How do I find a document?',
        a: <p>Go to <strong>Documents</strong> and search by title, case number, tag, status or owner. Click a row to open it.</p>,
      },
      {
        q: 'What do the statuses mean?',
        a: (
          <ul>
            <li><strong>Drafting:</strong> uploaded, not yet sent for signing.</li>
            <li><strong>Pending:</strong> waiting for signatures.</li>
            <li><strong>Signed:</strong> everyone has signed.</li>
            <li><strong>Filed:</strong> marked as submitted by a Lawyer. Its details are locked.</li>
          </ul>
        ),
      },
      {
        q: 'Can I edit a document?',
        a: <p>You can edit its title, case number and tags on the document page until it is Filed. The PDF itself never changes, and every edit is recorded.</p>,
      },
    ],
  },
  {
    title: 'Signing',
    items: [
      {
        q: 'How do I send a document for signing?',
        a: (
          <ol>
            <li>Open the document and click <strong>Sign Document</strong>.</li>
            <li>Add each signer in the order they should sign.</li>
            <li>Click <strong>Send signing links</strong>. Each signer is emailed when it is their turn.</li>
          </ol>
        ),
      },
      {
        q: 'How do I sign?',
        a: (
          <ol>
            <li>Open the link in your email. If you have an account, you can also click <strong>Sign now</strong> on your Dashboard.</li>
            <li>Enter your email and click <strong>Send code</strong>, then type the 6-digit code from your inbox. (Not needed when you use <strong>Sign now</strong>.)</li>
            <li>Choose <strong>Standard signature</strong> (draw or upload a photo) or <strong>Signing certificate</strong> (your .p12 file and passphrase). Your name is the one the sender assigned.</li>
            <li>Click <strong>Sign Document</strong> and confirm.</li>
          </ol>
        ),
      },
      {
        q: 'Standard signature or signing certificate?',
        a: <p>Both are recorded and verifiable. Use a <strong>signing certificate</strong> (such as one issued by DICT) when you need your identity tied to a government-issued certificate. Otherwise, a standard signature is enough.</p>,
      },
      {
        q: 'I didn’t get my code.',
        a: <p>Check your spam folder. Codes expire after 10 minutes. Click <strong>Resend code</strong> for a new one (once a minute). After 5 wrong tries, request a new code.</p>,
      },
      {
        q: 'Why can’t I sign yet?',
        a: <p>Signers sign in order. You will be emailed when the signers before you are done.</p>,
      },
      {
        q: 'My signing link says it is invalid or expired.',
        a: <p>Links expire after 7 days, and each new link replaces the old one. Using <strong>Sign now</strong> also replaces the emailed link. Ask the sender for a new link if needed.</p>,
      },
      {
        q: '“The document hash does not match” — what do I do?',
        a: <p>The document changed after you opened the page. Refresh the page and sign again.</p>,
      },
      {
        q: '“The signing service is temporarily unavailable” — what does that mean?',
        a: <p>Nothing was signed. The service that protects signing keys is briefly offline. Try again in a few minutes.</p>,
      },
    ],
  },
  {
    title: 'Verifying',
    items: [
      {
        q: 'How do I check that a document is genuine?',
        a: (
          <ul>
            <li>Scan the QR code on the document&apos;s signature page, or</li>
            <li>Click <strong>Verify a document</strong> and choose the file.</li>
          </ul>
        ),
      },
      {
        q: 'What do the results mean?',
        a: (
          <ul>
            <li><strong>Authentic:</strong> identical to the final signed document.</li>
            <li><strong>Genuine but not final:</strong> an earlier version, such as before everyone signed.</li>
            <li><strong>Integrity breach:</strong> matches no recorded version. It may have been altered.</li>
          </ul>
        ),
      },
      {
        q: 'What is the audit trail?',
        a: <p>A record of every view, edit, signature and status change. Each entry is linked to the one before it, so any change to the record is detected.</p>,
      },
    ],
  },
  {
    title: 'Privacy and security',
    items: [
      {
        q: 'Who can see my documents?',
        a: <p>Only you and the people you share them with in your firm. Admins see the document list, never the contents.</p>,
      },
      {
        q: 'How are signing keys protected?',
        a: <p>Private keys are encrypted by a separate key management server and are never stored in readable form. Your certificate file is never added to the signed PDF.</p>,
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <main className={shell.shell}>
      <TopNav />
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <header className={shared.pageActionHeader}>
            <div>
              <h1 className={shared.pageTitle}>Help &amp; FAQs</h1>
              <p className={shared.pageSubtitle}>Quick answers on uploading, signing and verifying.</p>
            </div>
            <BackButton className={shared.linkButton} fallbackHref="/landing" />
          </header>

          {SECTIONS.map((section) => (
            <section key={section.title} className={shared.faqSection}>
              <h2 className={shared.faqHeading}>{section.title}</h2>
              {section.items.map((item) => (
                <details key={item.q} className={shared.faqItem}>
                  <summary>{item.q}</summary>
                  <div className={shared.faqAnswer}>{item.a}</div>
                </details>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

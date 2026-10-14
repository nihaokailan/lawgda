import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';

export default function AccountDisabledPage() {
  return (
    <main className={shell.shell}>
      <div className={shell.content}>
        <div className={shared.pageShell} style={{ maxWidth: 520, textAlign: 'center', marginTop: '4rem' }}>
          <h1 className={shared.pageTitle} style={{ fontSize: '1.8rem' }}>Account unavailable</h1>
          <p className={shared.cardText}>
            This account, or the organization it belongs to, has been deactivated. Contact your
            organization administrator or the Lawgda platform administrator.
          </p>
          <form action="/api/auth/signout" method="post" style={{ marginTop: '1.25rem' }}>
            <button type="submit" className={shared.button}>Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}

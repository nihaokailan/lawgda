import Link from 'next/link';
import { requireAuth } from '../../lib/authGuard';
import TopNav from '../components/TopNav';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';

export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <main className={shell.shell}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <TopNav />
          <h1 className={shared.pageTitle}>Dashboard</h1>
          <p className={shared.pageSubtitle}>Welcome back, {user.email}. Manage your documents and cases from here.</p>
          <div className={shared.buttonGroup} style={{ marginTop: '1.5rem' }}>
            <Link href="/cases" className={shared.button}>Cases</Link>
            <Link href="/upload" className={shared.button}>Upload Document</Link>
          </div>
          <form action="/api/auth/signout" method="post" style={{ marginTop: '2rem' }}>
            <button type="submit" className={shared.linkButton}>Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}

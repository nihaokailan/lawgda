import Link from 'next/link';
import shared from '../../styles/shared.module.css';

export default function TopNav() {
  return (
    <header className={shared.topNav}>
      <div className={shared.topNavBrand}>
        <span className={shared.topNavBrandName}>LAWGDA</span>
        <span className={shared.topNavTagline}>Secure Electronic Evidence</span>
      </div>
      <nav className={shared.topNavActions}>
        <Link href="/upload" className={shared.topNavLink}>Sign Document</Link>
        <Link href="/verify" className={shared.topNavLink}>Verify Document</Link>
        <Link href="/cases" className={shared.topNavLink}>My Documents</Link>
        <Link href="/signin" className={shared.topNavLink}>Sign In</Link>
      </nav>
    </header>
  );
}

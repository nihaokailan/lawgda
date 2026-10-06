'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '../../styles/workspace.module.css';
import { PERMISSIONS, ROLE_LABELS, hasPermission } from '../../lib/roles';

function navItemClass(pathname, href) {
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  return `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`;
}

export default function WorkspaceSidebar({ role }) {
  const pathname = usePathname();

  const items = [
    { href: '/dashboard', label: 'Dashboard', roles: ['normal', 'lawyer', 'staff'] },
    { href: '/admin', label: 'Admin Dashboard', roles: ['admin'] },
    {
      href: '/platform',
      label: 'Platform Administration',
      roles: ['default_admin'],
    },
    {
      href: '/cases',
      label: 'Documents',
      permissions: [PERMISSIONS.MANAGE_ASSIGNED_DOCUMENTS, PERMISSIONS.ORGANIZE_DOCUMENTS],
    },
    {
      href: '/profile',
      label: 'User Profile',
    },
    {
      href: '/admin/request',
      label: 'Request Admin',
      roles: ['normal'],
    },
    {
      href: '/admin/users',
      label: 'Provision Users',
      permissions: [PERMISSIONS.MANAGE_USERS_SYSTEM],
    },
    { href: '/admin/repository', label: 'Repository', roles: ['admin'] },
    { href: '/admin/audit', label: 'Audit Logs', roles: ['admin'] },
  ];

  return (
    <aside className={`workspace-sidebar ${styles.sidebar}`}>
      <div>
        <p className={styles.brand}>LAWGDA</p>
        <p className={styles.roleBadge}>{ROLE_LABELS[role] ?? 'Staff'}</p>
      </div>

      <nav className={styles.nav}>
        {items
          .filter((item) => {
            if (item.roles) {
              return item.roles.includes(role);
            }
            if (role === 'default_admin') {
              return false;
            }
            if (!item.permissions) {
              return true;
            }
            return item.permissions.some((permission) => hasPermission(role, permission));
          })
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${navItemClass(pathname, item.href)} workspace-navLink ${pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'workspace-navLinkActive' : ''}`}
            >
              {item.label}
            </Link>
          ))}
      </nav>

      <form action="/api/auth/signout" method="post" className={styles.signoutForm}>
        <button type="submit" className={`workspace-signoutButton ${styles.signoutButton}`}>Sign out</button>
      </form>
    </aside>
  );
}

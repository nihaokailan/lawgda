'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '../../styles/workspace.module.css';
import { PERMISSIONS, hasPermission } from '../../lib/roles';

function navItemClass(pathname, href) {
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  return `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`;
}

const NAV_ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7M16 7l2 2m-5 1 2 2" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><rect x="14" y="11" width="4" height="4" rx=".5" /></>,
  documents: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8m-8 4h8" /></>,
  admin: <><path d="M12 3 20 7v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V7z" /><path d="m9 12 2 2 4-4" /></>,
  repository: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  audit: <><path d="M8 3h8l4 4v14H4V3z" /><path d="M8 11h8m-8 4h8m-8 4h5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><path d="M12 17h.01" /></>,
};

function NavigationIcon({ href }) {
  const kind = href === '/dashboard' || href === '/admin' || href === '/platform'
    ? 'dashboard'
    : href === '/profile'
      ? 'user'
      : href === '/admin/request'
        ? 'key'
        : href === '/cases'
          ? 'documents'
          : href === '/case-folders'
            ? 'folder'
          : href === '/help'
            ? 'help'
          : href.includes('repository') || href === '/repository'
            ? 'repository'
            : href.includes('audit')
              ? 'audit'
              : 'admin';

  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" aria-hidden="true">
      {NAV_ICONS[kind]}
    </svg>
  );
}

const COLLAPSED_KEY = 'lawgda.sidebarCollapsed';

export default function WorkspaceSidebar({ role, dashboard = false }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Remembered per browser; read after mount so server and client render the same markup.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // Storage unavailable (private mode): start expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Not remembered, but the toggle still works for this page.
      }
      return next;
    });
  }

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
    { href: '/case-folders', label: 'Case Folders', roles: ['lawyer', 'staff'] },
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
    { href: '/help', label: 'Help & FAQs', roles: ['normal', 'lawyer', 'staff', 'admin', 'default_admin'] },
  ];

  return (
    <aside className={`workspace-sidebar ${styles.sidebar} ${dashboard ? styles.dashboardSidebar : ''} ${collapsed ? styles.sidebarCollapsed : ''}`}>
      {dashboard && (
        <Link href="/landing" className={styles.dashboardBrand} aria-label="Lawgda home">
          <span className={styles.brandMark} aria-hidden="true">L</span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>LAWGDA</span>
            <span className={styles.brandTagline}>Secure evidence</span>
          </span>
        </Link>
      )}
      <div className={styles.sidebarNavigation}>
        <button
          type="button"
          className={styles.sidebarToggle}
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className={styles.navIcon} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d={collapsed ? 'm13 10 2 2-2 2' : 'm15 10-2 2 2 2'} />
          </svg>
        </button>
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
                title={collapsed ? (item.label === 'Request Admin' ? 'Request admin access' : item.label) : undefined}
              >
                <NavigationIcon href={item.href} />
                <span>{item.label === 'Request Admin' ? 'Request admin access' : item.label}</span>
              </Link>
            ))}
        </nav>
      </div>

      <form action="/api/auth/signout" method="post" className={`${styles.signoutForm} ${dashboard ? styles.dashboardSignoutForm : ''}`}>
        <button type="submit" className={`${styles.signoutButton} ${dashboard ? styles.dashboardSignoutButton : ''}`} title={collapsed ? 'Sign out' : undefined}>
          <svg className={styles.navIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 17l5-5-5-5m5 5H3" />
            <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
          </svg>
          <span>Sign out</span>
        </button>
      </form>
    </aside>
  );
}

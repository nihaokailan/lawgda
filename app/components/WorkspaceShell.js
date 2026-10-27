import styles from '../../styles/workspace.module.css';
import WorkspaceSidebar from './WorkspaceSidebar';
import TopNav from './TopNav';
import BackButton from './BackButton';

const HOME_BY_ROLE = { admin: '/admin', default_admin: '/platform' };

export default function WorkspaceShell({
  profile,
  title,
  subtitle,
  breadcrumb = 'Workspace',
  children,
  dashboard = false,
  accountName = '',
  accountEmail = '',
}) {
  return (
    <main className={`workspace-shell ${styles.shell} ${dashboard ? styles.dashboardShell : ''}`}>
      <TopNav />
      <div className={`workspace-container ${styles.container} ${dashboard ? styles.dashboardContainer : ''}`}>
        <WorkspaceSidebar
          role={profile.role}
          dashboard={dashboard}
          accountName={accountName}
          accountEmail={accountEmail}
        />
        <section className={`workspace-main-panel ${styles.mainPanel} ${dashboard ? styles.dashboardMainPanel : ''}`}>
          {!dashboard && (
            <header className={`workspace-header ${styles.header} ${styles.headerWithBack}`}>
              <div className={styles.headerText}>
                <p className={styles.breadcrumb}>
                  {breadcrumb} <span aria-hidden="true">/</span> {title}
                </p>
                <h1 className={`workspace-title ${styles.title}`}>{title}</h1>
                <p className={`workspace-subtitle ${styles.subtitle}`}>{subtitle}</p>
              </div>
              <BackButton className={styles.headerBack} fallbackHref={HOME_BY_ROLE[profile.role] || '/dashboard'} />
            </header>
          )}
          <div className={`workspace-content ${styles.content} ${dashboard ? styles.dashboardPageContent : ''}`}>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

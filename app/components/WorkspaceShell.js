import styles from '../../styles/workspace.module.css';
import WorkspaceSidebar from './WorkspaceSidebar';
import TopNav from './TopNav';

export default function WorkspaceShell({ profile, title, subtitle, children }) {
  return (
    <main className={`workspace-shell ${styles.shell}`}>
      <TopNav />
      <div className={`workspace-container ${styles.container}`}>
        <WorkspaceSidebar role={profile.role} />
        <section className={`workspace-main-panel ${styles.mainPanel}`}>
          <header className={`workspace-header ${styles.header}`}>
            <h1 className={`workspace-title ${styles.title}`}>{title}</h1>
            <p className={`workspace-subtitle ${styles.subtitle}`}>{subtitle}</p>
          </header>
          <div className={`workspace-content ${styles.content}`}>{children}</div>
        </section>
      </div>
    </main>
  );
}

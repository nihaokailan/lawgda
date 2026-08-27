import styles from '../../styles/workspace.module.css';
import WorkspaceSidebar from './WorkspaceSidebar';
import TopNav from './TopNav';

export default function WorkspaceShell({ profile, title, subtitle, children }) {
  return (
    <main className={styles.shell}>
      <TopNav />
      <div className={styles.container}>
        <WorkspaceSidebar role={profile.role} />
        <section className={styles.mainPanel}>
          <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </header>
          <div className={styles.content}>{children}</div>
        </section>
      </div>
    </main>
  );
}

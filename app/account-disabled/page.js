export default function AccountDisabledPage() {
  return (
    <main style={{ maxWidth: 480, margin: '6rem auto', padding: '0 1rem', textAlign: 'center' }}>
      <h1>Account unavailable</h1>
      <p>
        This account, or the organization it belongs to, has been deactivated. Contact your
        organization administrator or the Lawgda platform administrator.
      </p>
      <form action="/api/auth/signout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}

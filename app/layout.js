import './globals.css';

export const metadata = {
  title: 'Lawgda Evidence Tracker',
  description: 'Legal evidence tracking with Supabase auth and case management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const PLACEHOLDER_PROJECT_URL = /your-project-ref/i.test(SUPABASE_URL);

export function getAuthRequestErrorMessage(error) {
  if (PLACEHOLDER_PROJECT_URL) {
    return 'Supabase is still using the example project URL. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to your project credentials, then restart the app.';
  }

  const message = error?.message || 'The authentication request could not be completed.';
  if (/failed to fetch|fetch failed|networkerror/i.test(message)) {
    return 'Could not reach Supabase. Check your internet connection and Supabase project URL, then try again.';
  }

  return message;
}

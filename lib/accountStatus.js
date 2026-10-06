// Deactivation must also invalidate the Supabase Auth account, otherwise an
// already-issued session keeps working until it expires.
export async function setAuthAccountActive(supabaseAdmin, userId, isActive) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? 'none' : '876000h',
  });
  if (error) {
    throw new Error(`Unable to update the sign-in status of the account: ${error.message}`);
  }
}

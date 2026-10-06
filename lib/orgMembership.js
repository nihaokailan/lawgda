import { ROLES } from './rbac';

// Roles an Organization Admin may assign, with the plain-language limits
// shown to the admin before any assignment or role change is saved.
export const ROLE_SCOPE_DESCRIPTIONS = {
  [ROLES.LAWYER]: 'upload documents, request signatures, apply digital signatures and set documents to Filed for documents they own or are granted. They cannot manage users, firm settings or the audit log.',
  [ROLES.STAFF]: 'data entry and document indexing (file names and folder placement) on documents they are granted. They cannot apply digital signatures, set documents to Filed, or manage users, firm settings or the audit log.',
};

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Role assignment only ever applies to a real, email-confirmed account that
 * registered itself and does not yet belong to any firm. This never creates
 * accounts, and it deliberately reveals nothing about accounts that belong to
 * other organizations: every ineligible case except "already in your firm"
 * returns the same `unavailable` result.
 */
export async function findAssignableAccount(supabaseAdmin, orgId, rawEmail) {
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 'invalid_email' };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('user_id,email,full_name,role,org_id,is_active')
    .ilike('email', escapeLike(email))
    .limit(1)
    .maybeSingle();

  if (profile?.org_id && profile.org_id === orgId) {
    return { status: 'already_member' };
  }

  if (!profile || profile.role !== ROLES.NORMAL || profile.org_id || profile.is_active === false) {
    return { status: 'unavailable' };
  }

  const { data: authData } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
  if (!authData?.user?.email_confirmed_at) {
    return { status: 'unavailable' };
  }

  return { status: 'eligible', profile };
}

export const ASSIGNABLE_ACCOUNT_MESSAGES = {
  invalid_email: 'Enter a valid email address.',
  already_member: 'This person is already a member of your organization. Change their role from the member list below.',
  unavailable: 'No available account was found for this email. The person must first register at Lawgda, confirm their email, and not already belong to another organization.',
};

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { PERMISSIONS, ROLES } from '../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { generateTemporaryPassword } from '../../../../lib/passwords';
import { logGranularAudit } from '../../../../lib/granularAudit';

/**
 * Default Admin's view of the platform. Deliberately returns only:
 * organization name/status, the organization's Admin's name/email/status,
 * and a user count — never any Lawyer/Staff name, email, or other PII, and
 * never any document/folder metadata. Each query below selects exactly the
 * columns needed so no employee-level data can leak through this response.
 */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.VIEW_ORGANIZATION_SUMMARY);
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: organizations, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id,name,status,created_at')
    .order('created_at', { ascending: false });

  if (orgError) {
    return NextResponse.json({ error: 'Unable to load organizations.' }, { status: 500 });
  }

  const summaries = await Promise.all(
    (organizations || []).map(async (org) => {
      const [{ data: admins }, { count: userCount }] = await Promise.all([
        supabaseAdmin
          .from('profiles')
          .select('user_id,full_name,email,is_active')
          .eq('org_id', org.id)
          .eq('role', ROLES.ADMIN),
        supabaseAdmin
          .from('profiles')
          .select('user_id', { count: 'exact', head: true })
          .eq('org_id', org.id),
      ]);

      return {
        id: org.id,
        name: org.name,
        status: org.status,
        createdAt: org.created_at,
        admins: (admins || []).map((admin) => ({
          userId: admin.user_id,
          fullName: admin.full_name,
          email: admin.email,
          isActive: admin.is_active,
        })),
        userCount: userCount ?? 0,
      };
    })
  );

  return NextResponse.json({ organizations: summaries });
}

/**
 * Creates a new law firm and its sole initial Organization Admin account in
 * one step. This is the only way an organization gets created outside the
 * request_admin_role -> approve flow.
 */
export async function POST(request) {
  let user;
  try {
    ({ user } = await requirePermission(PERMISSIONS.MANAGE_ORG_ADMINS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const organizationName = String(body?.organizationName ?? '').trim();
  const adminEmail = String(body?.adminEmail ?? '').trim().toLowerCase();
  const adminFullName = String(body?.adminFullName ?? '').trim();

  if (!organizationName || !adminEmail) {
    return NextResponse.json({ error: 'Organization name and admin email are required.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ name: organizationName, created_by: user.id })
    .select('id,name,status,created_at')
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: orgError?.message || 'Unable to create the organization.' }, { status: 400 });
  }

  const temporaryPassword = generateTemporaryPassword();
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: adminFullName, created_by: user.id, org_id: org.id },
  });

  if (createError) {
    // Roll back the organization so we don't leave an admin-less firm behind.
    await supabaseAdmin.from('organizations').delete().eq('id', org.id);
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      user_id: created.user.id,
      email: adminEmail,
      full_name: adminFullName || null,
      role: ROLES.ADMIN,
      org_id: org.id,
      is_active: true,
      admin_request_status: 'none',
    },
    { onConflict: 'user_id' }
  );

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    await supabaseAdmin.from('organizations').delete().eq('id', org.id);
    return NextResponse.json({ error: 'Unable to provision the organization admin.' }, { status: 500 });
  }

  await logGranularAudit({
    actorUserId: user.id,
    actorRole: ROLES.DEFAULT_ADMIN,
    action: 'insert',
    resourceTable: 'organizations',
    resourceId: org.id,
    fieldName: 'name',
    newValue: org.name,
    orgId: org.id,
    metadata: { source: 'platform_org_creation', adminUserId: created.user.id },
  });

  return NextResponse.json({
    success: true,
    organization: org,
    temporaryPassword,
    message: 'Organization and Admin account provisioned. Share the temporary password securely.',
  });
}

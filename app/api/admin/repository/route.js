import { NextResponse } from 'next/server';
import { PERMISSIONS } from '../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { loadOrgRepositoryMetadata } from '../../../../lib/orgRepository';

export async function GET() {
  let profile;
  try {
    ({ profile } = await requirePermission(PERMISSIONS.OVERSEE_REPOSITORY));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  try {
    return NextResponse.json(await loadOrgRepositoryMetadata(profile.org_id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load repository metadata.' }, { status: 500 });
  }
}

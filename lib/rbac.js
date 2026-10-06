// Strict RBAC permission model for Lawgda.
//
// This is the single source of truth for roles and permissions. The five
// roles below are the only ones that exist in the system — do not add a new
// role here without also updating the `app_role` Postgres enum
// (supabase/migrations) and the seed script.
//
// Two admin tiers: DEFAULT_ADMIN is the single platform-level account (seed
// only, org_id always null) that manages law firms and their Organization
// Admin accounts only — it never becomes a member of any firm and never
// gains firm-level data access. ADMIN is each firm's own, org-scoped admin
// (org_id always set) and is what the rest of the app refers to as "Admin".

export const ROLES = {
  NORMAL: 'normal',
  DEFAULT_ADMIN: 'default_admin',
  ADMIN: 'admin', // Organization Admin (org-scoped)
  LAWYER: 'lawyer',
  STAFF: 'staff', // Paralegal / Staff
};

export const PERMISSIONS = {
  // Normal (default on sign up)
  SIGN_DOCUMENT: 'sign_document',
  REQUEST_ADMIN_ROLE: 'request_admin_role',

  // Default Admin (platform-level, seed-only)
  MANAGE_ORGANIZATIONS: 'manage_organizations',
  MANAGE_ORG_ADMINS: 'manage_org_admins',
  VIEW_ORGANIZATION_SUMMARY: 'view_organization_summary',

  // Admin (org-scoped)
  MANAGE_SYSTEM_SETTINGS: 'manage_system_settings',
  CREATE_USERS: 'create_users',
  MANAGE_USERS: 'manage_users',
  OVERSEE_REPOSITORY: 'oversee_repository',
  VIEW_AUDIT_LOGS: 'view_audit_logs',

  // Lawyer ("sole control" holder)
  UPLOAD_DOCUMENT: 'upload_document',
  APPLY_DICT_DIGITAL_SIGNATURE: 'apply_dict_digital_signature',
  SET_STATUS_FILED: 'set_status_filed',

  // Paralegal / Staff
  DATA_ENTRY: 'data_entry',
  DOCUMENT_INDEXING: 'document_indexing',

  // Not granted to any role. Checked explicitly (via assertCanViewDocumentContent
  // in lib/rbacMiddleware.js) anywhere raw document payload/content would be
  // returned, so the restriction holds even if ROLE_PERMISSIONS is edited later.
  VIEW_DOCUMENT_CONTENT: 'view_document_content',
};

export const ROLE_PERMISSIONS = {
  [ROLES.NORMAL]: [PERMISSIONS.SIGN_DOCUMENT, PERMISSIONS.REQUEST_ADMIN_ROLE],
  [ROLES.DEFAULT_ADMIN]: [
    PERMISSIONS.MANAGE_ORGANIZATIONS,
    PERMISSIONS.MANAGE_ORG_ADMINS,
    PERMISSIONS.VIEW_ORGANIZATION_SUMMARY,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.MANAGE_SYSTEM_SETTINGS,
    PERMISSIONS.CREATE_USERS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.OVERSEE_REPOSITORY,
    PERMISSIONS.VIEW_AUDIT_LOGS,
  ],
  [ROLES.LAWYER]: [
    PERMISSIONS.UPLOAD_DOCUMENT,
    PERMISSIONS.APPLY_DICT_DIGITAL_SIGNATURE,
    PERMISSIONS.SET_STATUS_FILED,
  ],
  [ROLES.STAFF]: [PERMISSIONS.DATA_ENTRY, PERMISSIONS.DOCUMENT_INDEXING],
};

// Explicit deny list. Checked before the allow-list in hasPermission(), so a
// deny always wins even if ROLE_PERMISSIONS is accidentally widened later.
// This is the enforcement point for "Admin is blind to document payload" and
// for "Default Admin never touches firm-level data".
export const STRICT_DENY = {
  [ROLES.ADMIN]: [PERMISSIONS.VIEW_DOCUMENT_CONTENT],
  [ROLES.DEFAULT_ADMIN]: [
    PERMISSIONS.VIEW_DOCUMENT_CONTENT,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.CREATE_USERS,
    PERMISSIONS.OVERSEE_REPOSITORY,
    PERMISSIONS.MANAGE_SYSTEM_SETTINGS,
  ],
};

// Roles an Organization Admin may provision via create_users. Admin cannot
// create other Admins or Default Admins, nor Normal accounts (signup-only).
export const ADMIN_CREATABLE_ROLES = [ROLES.LAWYER, ROLES.STAFF];

// Roles Default Admin may provision via manage_org_admins. Default Admin may
// only ever create an Organization Admin account — never a Lawyer, Staff, or
// another Default Admin.
export const DEFAULT_ADMIN_CREATABLE_ROLES = [ROLES.ADMIN];

// Roles that belong to exactly one organization (profiles.org_id is never null).
export const ORG_SCOPED_ROLES = [ROLES.ADMIN, ROLES.LAWYER, ROLES.STAFF];

export function isKnownRole(role) {
  return Object.values(ROLES).includes(role);
}

export function hasPermission(role, permission) {
  if (!isKnownRole(role)) {
    return false;
  }
  if (STRICT_DENY[role]?.includes(permission)) {
    return false;
  }
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export class RbacError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = 'RbacError';
    this.status = status;
  }
}

export function assertPermission(role, permission) {
  if (!hasPermission(role, permission)) {
    throw new RbacError(`Role "${role}" lacks the "${permission}" permission.`, 403);
  }
}

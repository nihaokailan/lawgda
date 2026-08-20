export const ROLES = {
  ADMIN: 'admin',
  LAWYER: 'lawyer',
  STAFF: 'staff',
  // Backward-compatible aliases used by older routes/components.
  ADMINISTRATOR: 'admin',
  USER: 'staff',
  PARALEGAL: 'staff',
  SIGNER: 'staff',
};

export const PERMISSIONS = {
  MANAGE_USERS_SYSTEM: 'manage_users_system',
  MANAGE_ORGANIZATION: 'manage_organization',
  MANAGE_ASSIGNED_DOCUMENTS: 'manage_assigned_documents',
  ORGANIZE_DOCUMENTS: 'organize_documents',
  REQUEST_SIGNATURES: 'request_signatures',
  VIEW_ASSIGNED_DOCUMENTS: 'view_assigned_documents',
  SIGN_DOCUMENTS: 'sign_documents',
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.LAWYER]: 'Lawyer',
  [ROLES.STAFF]: 'Staff',
};

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    PERMISSIONS.MANAGE_USERS_SYSTEM,
    PERMISSIONS.MANAGE_ORGANIZATION,
    PERMISSIONS.MANAGE_ASSIGNED_DOCUMENTS,
    PERMISSIONS.ORGANIZE_DOCUMENTS,
    PERMISSIONS.REQUEST_SIGNATURES,
    PERMISSIONS.VIEW_ASSIGNED_DOCUMENTS,
    PERMISSIONS.SIGN_DOCUMENTS,
  ],
  [ROLES.LAWYER]: [
    PERMISSIONS.MANAGE_ASSIGNED_DOCUMENTS,
    PERMISSIONS.ORGANIZE_DOCUMENTS,
    PERMISSIONS.REQUEST_SIGNATURES,
    PERMISSIONS.VIEW_ASSIGNED_DOCUMENTS,
    PERMISSIONS.SIGN_DOCUMENTS,
  ],
  [ROLES.STAFF]: [
    PERMISSIONS.ORGANIZE_DOCUMENTS,
    PERMISSIONS.VIEW_ASSIGNED_DOCUMENTS,
    PERMISSIONS.MANAGE_ASSIGNED_DOCUMENTS,
  ],
};

export function normalizeRole(role) {
  return role && ROLE_PERMISSIONS[role] ? role : ROLES.STAFF;
}

export function hasPermission(role, permission) {
  const normalizedRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalizedRole] ?? [];
  return permissions.includes(permission);
}

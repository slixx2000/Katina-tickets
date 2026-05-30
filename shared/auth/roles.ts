export const APP_ROLES = [
  'SUPER_ADMIN',
  'ORGANIZER',
  'SCANNER',
  'SUPPORT',
  'FINANCE',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_PERMISSIONS = {
  dashboard: ['SUPER_ADMIN', 'ORGANIZER', 'SUPPORT', 'FINANCE'] as const,
  events: ['SUPER_ADMIN', 'ORGANIZER'] as const,
  scanner: ['SUPER_ADMIN', 'SCANNER'] as const,
  support: ['SUPER_ADMIN', 'SUPPORT'] as const,
  finance: ['SUPER_ADMIN', 'FINANCE'] as const,
  users: ['SUPER_ADMIN'] as const,
} as const satisfies Record<string, readonly AppRole[]>;

export const MFA_RECOMMENDED_ROLES: readonly AppRole[] = ['SUPER_ADMIN', 'FINANCE'];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}

export function normalizeAppRole(value: unknown, fallback: AppRole = 'SUPPORT'): AppRole {
  return isAppRole(value) ? value : fallback;
}

export function hasRole(required: AppRole | readonly AppRole[], actualRole?: AppRole | null): boolean {
  if (!actualRole) {
    return false;
  }

  const roles = Array.isArray(required) ? required : [required];
  return roles.includes(actualRole);
}

export function canAccessPermission(permission: keyof typeof ROLE_PERMISSIONS, actualRole?: AppRole | null): boolean {
  return hasRole(ROLE_PERMISSIONS[permission], actualRole);
}

export function canAccessAdminArea(actualRole?: AppRole | null): boolean {
  return canAccessPermission('dashboard', actualRole);
}

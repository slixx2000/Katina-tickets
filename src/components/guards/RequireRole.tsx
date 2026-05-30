import type { ReactNode } from 'react';
import type { AppRole } from '../../auth/rbac';
import { hasRole } from '../../auth/rbac';
import type { AppSessionUser } from '../../auth/session';

interface RequireRoleProps {
  user: AppSessionUser | null;
  allowedRoles: readonly AppRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

export default function RequireRole({ user, allowedRoles, children, fallback = null }: RequireRoleProps) {
  if (!hasRole(allowedRoles, user?.role ?? null)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

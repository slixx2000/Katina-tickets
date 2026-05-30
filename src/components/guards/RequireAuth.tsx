import type { ReactNode } from 'react';
import type { AppSessionUser } from '../../auth/session';

interface RequireAuthProps {
  user: AppSessionUser | null;
  children: ReactNode;
  fallback?: ReactNode;
}

export default function RequireAuth({ user, children, fallback = null }: RequireAuthProps) {
  if (!user) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

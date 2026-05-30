import { canAccessAdminArea, normalizeAppRole, type AppRole } from './rbac';

export type SupabaseSessionUserLike = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export type AppSessionUser = {
  id: string;
  email: string;
  role: AppRole;
  mfaEnabled: boolean;
};

export type ServerSessionResponse = {
  authenticated: boolean;
  user: AppSessionUser | null;
};

function readMetadataValue(user: SupabaseSessionUserLike, keys: readonly string[]) {
  const metadataSources = [user.app_metadata, user.user_metadata];

  for (const source of metadataSources) {
    if (!source) continue;

    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null) {
        return value;
      }
    }
  }

  return undefined;
}

export function resolveAppRole(user: SupabaseSessionUserLike | null | undefined): AppRole {
  if (!user) {
    return 'SUPPORT';
  }

  return normalizeAppRole(readMetadataValue(user, ['role', 'user_role', 'access_role']), 'SUPPORT');
}

export function resolveMfaEnabled(user: SupabaseSessionUserLike | null | undefined): boolean {
  if (!user) return false;

  const value = readMetadataValue(user, ['mfaEnabled', 'mfa_enabled', 'two_factor_enabled']);
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function toAppSessionUser(user: SupabaseSessionUserLike | null | undefined): AppSessionUser | null {
  if (!user?.id || !user.email) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: resolveAppRole(user),
    mfaEnabled: resolveMfaEnabled(user),
  };
}

export function canEnterAdminConsole(user: AppSessionUser | null | undefined): boolean {
  return !!user && canAccessAdminArea(user.role);
}

export async function fetchServerSession(): Promise<AppSessionUser | null> {
  const response = await fetch('/api/auth/session', {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as ServerSessionResponse;
  return payload.user ?? null;
}

export async function refreshServerSession(): Promise<AppSessionUser | null> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as ServerSessionResponse;
  return payload.user ?? null;
}

export async function clearServerSession(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });
}

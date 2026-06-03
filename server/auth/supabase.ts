import { createClient } from '@supabase/supabase-js';
import { normalizeAppRole, type AppRole } from '../../shared/auth/roles';

export type SupabaseVerifiedUser = {
  id: string;
  email: string;
  role: AppRole;
  mfaEnabled: boolean;
};

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function readMetadataRole(
  userMetadata: Record<string, unknown> | null | undefined,
  appMetadata: Record<string, unknown> | null | undefined,
): AppRole {
  const value =
    userMetadata?.role ??
    userMetadata?.user_role ??
    userMetadata?.access_role ??
    appMetadata?.role ??
    appMetadata?.user_role ??
    appMetadata?.access_role;

  return normalizeAppRole(value, 'CUSTOMER');
}

function readMetadataMfaFlag(
  userMetadata: Record<string, unknown> | null | undefined,
  appMetadata: Record<string, unknown> | null | undefined,
): boolean {
  const value =
    userMetadata?.mfaEnabled ??
    userMetadata?.mfa_enabled ??
    userMetadata?.two_factor_enabled ??
    appMetadata?.mfaEnabled ??
    appMetadata?.mfa_enabled ??
    appMetadata?.two_factor_enabled;

  return value === true || value === 'true' || value === 1 || value === '1';
}

export async function verifySupabaseAccessToken(accessToken: string): Promise<SupabaseVerifiedUser | null> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user?.id || !data.user.email) {
    return null;
  }

  const user = data.user;
  return {
    id: user.id,
    email: user.email,
    role: readMetadataRole(user.user_metadata, user.app_metadata),
    mfaEnabled: readMetadataMfaFlag(user.user_metadata, user.app_metadata),
  };
}

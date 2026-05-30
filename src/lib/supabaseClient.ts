import { createClient } from '@supabase/supabase-js';

type SupabaseAuthMockUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

type SupabaseAuthMockSession = {
  user: SupabaseAuthMockUser | null;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const createMockClient = () => ({
  auth: {
    async getSession() {
      return { data: { session: null }, error: null };
    },
    async signInWithPassword({ email }: { email: string; password: string }) {
      if (!email) {
        return {
          data: { user: null, session: null },
          error: new Error('Email is required'),
        };
      }

      const role = email.toLowerCase().includes('finance')
        ? 'FINANCE'
        : email.toLowerCase().includes('scanner')
          ? 'SCANNER'
          : email.toLowerCase().includes('organizer')
            ? 'ORGANIZER'
            : email.toLowerCase().includes('support')
              ? 'SUPPORT'
              : 'SUPER_ADMIN';

      const session: SupabaseAuthMockSession = {
        user: {
          id: `mock-${email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          email,
          user_metadata: { role, mfaEnabled: role === 'SUPER_ADMIN' || role === 'FINANCE' },
          app_metadata: { role, mfa_enabled: role === 'SUPER_ADMIN' || role === 'FINANCE' },
        },
        access_token: `dev-session:${email}:${role}`,
        refresh_token: `dev-refresh:${email}:${role}`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      };

      return {
        data: { user: session.user, session },
        error: null,
      };
    },
    async signOut() {
      return { error: null };
    },
    onAuthStateChange(callback: (event: string, session: SupabaseAuthMockSession | null) => void) {
      callback('INITIAL_SESSION', null);
      return {
        data: {
          subscription: {
            unsubscribe() {
              // no-op mock
            },
          },
        },
      };
    },
  },
});

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createMockClient();

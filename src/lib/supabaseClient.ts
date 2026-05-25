import { createClient } from '@supabase/supabase-js';

type SupabaseAuthMockSession = {
  user: { id: string; email?: string } | null;
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

      const session: SupabaseAuthMockSession = {
        user: { id: 'mock-admin', email },
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

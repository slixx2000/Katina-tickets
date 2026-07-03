import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { canEnterAdminConsole, toAppSessionUser } from '../auth/session';

interface AdminLoginProps {
  onSuccess: () => void;
}

export default function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMfaRequired(false);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const sessionUser = toAppSessionUser(data.user ?? null);

      if (!sessionUser) {
        throw new Error('Signed in, but the session payload was incomplete.');
      }

      if (!canEnterAdminConsole(sessionUser)) {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('You do not have permission to access the admin console.');
      }

      const accessToken = data.session?.access_token;
      const profile = data.user;

      if (!accessToken || !profile?.email) {
        throw new Error('Signed in, but no server session could be created.');
      }

      const exchangeResponse = await fetch('/api/session-auth/exchange', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken, mfaCode: mfaCode.trim() || undefined }),
      });

      if (!exchangeResponse.ok) {
        const payload = await exchangeResponse.json().catch(() => null);
        if (payload?.mfaRequired) {
          setMfaRequired(true);
          throw new Error('Enter your authenticator or recovery code to continue.');
        }
        throw new Error(payload?.message || 'Could not create secure server session.');
      }

      await supabase.auth.signOut({ scope: 'local' });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--app-canvas)] text-[var(--app-text)]">
      <form onSubmit={handleLogin} className="w-full max-w-sm bg-[var(--app-panel)] p-8 border border-[color:var(--app-border)] text-[var(--app-panel-text)] shadow-2xl">
        <h2 className="text-2xl mb-4 text-[var(--app-panel-text)] font-bold">Admin Sign In</h2>
        <label className="block text-sm text-[var(--app-panel-text)]/80 mb-2">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} className="w-full mb-4 p-2 bg-transparent border border-[color:var(--app-border)] text-[var(--app-panel-text)]" />
        <label className="block text-sm text-[var(--app-panel-text)]/80 mb-2">Password</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full mb-4 p-2 bg-transparent border border-[color:var(--app-border)] text-[var(--app-panel-text)]" />
        {mfaRequired && (
          <>
            <label className="block text-sm text-[var(--app-panel-text)]/80 mb-2">MFA Code</label>
            <input
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value)}
              className="w-full mb-4 p-2 bg-transparent border border-[color:var(--app-border)] text-[var(--app-panel-text)]"
              placeholder="123456 or backup code"
            />
          </>
        )}
        {error && <p className="text-xs text-red-300 mb-2">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-[var(--app-cta)] text-[var(--app-on-cta)] py-2 font-bold hover:bg-[var(--app-cta-hover)] transition-colors">{loading ? 'Signing in…' : 'Sign In'}</button>
        <p className="text-xs text-[var(--app-panel-text)]/70 mt-3">Uses Supabase Auth with server-enforced session controls and MFA challenge when required.</p>
      </form>
    </div>
  );
}

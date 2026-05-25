import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface AdminLoginProps {
  onSuccess: () => void;
}

export default function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data?.user) {
        onSuccess();
      }
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
        {error && <p className="text-xs text-red-300 mb-2">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-[var(--app-cta)] text-[var(--app-on-cta)] py-2 font-bold hover:bg-[var(--app-cta-hover)] transition-colors">{loading ? 'Signing in…' : 'Sign In'}</button>
        <p className="text-xs text-[var(--app-panel-text)]/70 mt-3">Uses Supabase Auth; replace with MFA or SSO for production.</p>
      </form>
    </div>
  );
}

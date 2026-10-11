'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppRole } from '@restaurant/shared';
import { useAuth } from '@/features/auth/auth-context';
import { BRAND } from '@/lib/brand';

const fieldClassName = 'block w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)] min-h-[44px]';

const demoUsers: Array<{ label: string; role: AppRole; identifier: string }> = [
  { label: 'Admin', role: 'ADMIN', identifier: 'admin@tavola.com' },
  { label: 'Manager', role: 'MANAGER', identifier: 'manager@tavola.com' },
  { label: 'Cashier', role: 'CASHIER', identifier: 'cashier@tavola.com' },
  { label: 'Waiter', role: 'WAITER', identifier: 'waiter@tavola.com' },
  { label: 'Chef', role: 'CHEF', identifier: 'chef@tavola.com' },
];

export default function LoginPage() {
  const { login, getRoleRedirect } = useAuth();
  const router = useRouter();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Please provide both email/phone and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const user = await login({ identifier, password });
      const redirectPath = getRoleRedirect(user.role);
      router.push(redirectPath);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (demoIdentifier: string) => {
    setIdentifier(demoIdentifier);
    setPassword('password123');
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[var(--bg)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-[var(--brand-ink)] font-black text-2xl">
            T
          </div>
          <h1 className="mt-4 text-center font-display text-3xl font-extrabold tracking-tight text-[var(--ink)]">
            {BRAND.name}
          </h1>
          <p className="mt-1 text-center text-sm text-[var(--ink-muted)]">
            Staff Portal Login
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          {error && (
            <div className="mb-6 rounded-xl border border-[var(--st-late)]/25 bg-[var(--st-late)]/5 p-4 text-sm font-medium text-[var(--st-late)]">
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="identifier" className="block text-sm font-semibold text-[var(--ink)]">
                Email or phone number
              </label>
              <div className="mt-1.5">
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. admin@tavola.com or 9999900001"
                  className={fieldClassName}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-[var(--ink)]">
                Password
              </label>
              <div className="mt-1.5">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={fieldClassName}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full min-h-[44px] items-center justify-center rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-ink)] shadow transition hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-[var(--line)] pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Quick demo account fills
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {demoUsers.map((demo) => (
                <button
                  key={demo.role}
                  type="button"
                  onClick={() => handleQuickLogin(demo.identifier)}
                  className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--brand)] hover:bg-white"
                >
                  {demo.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Demo password: <code className="rounded bg-[var(--bg)] px-1 py-0.5 font-mono">password123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

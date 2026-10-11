'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppRole } from '@restaurant/shared';
import { useAuth } from './auth-context';

interface RoleGuardProps {
  allowedRoles: AppRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, isLoading, getRoleRedirect } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login');
      } else if (!allowedRoles.includes(user.role)) {
        // Redirect user to their designated dashboard if unauthorized for this route
        const targetPath = getRoleRedirect(user.role);
        router.push(targetPath);
      }
    }
  }, [user, isLoading, allowedRoles, router, getRoleRedirect]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4 text-[var(--ink)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand)] border-t-transparent" />
          <p className="text-sm font-medium text-[var(--ink-muted)]">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4 text-[var(--ink)]">
        <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center shadow-sm">
          <h2 className="text-xl font-bold text-[var(--ink)]">Access Restricted</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            You do not have permission to view this page.
          </p>
          <button
            onClick={() => router.push(user ? getRoleRedirect(user.role) : '/login')}
            className="mt-5 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-[var(--brand-ink)] transition hover:opacity-90 min-h-[44px]"
          >
            {user ? 'Go to your dashboard' : 'Return to Login'}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

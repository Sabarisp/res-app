'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-context';
import { AppRole } from '@restaurant/shared';
import { BRAND } from '@/lib/brand';

type AppShellProps = {
  title: string;
  variant?: 'customer' | 'staff';
  children: React.ReactNode;
};

type StaffLink = { href: string; label: string; roles: AppRole[] };

// Only show links the signed-in role can actually open (matches each
// page's RoleGuard and the API's requireRole checks).
const staffLinks: StaffLink[] = [
  { href: '/waiter', label: 'Waiter POS', roles: ['WAITER', 'MANAGER', 'ADMIN'] },
  { href: '/kitchen', label: 'Kitchen', roles: ['CHEF', 'MANAGER', 'ADMIN'] },
  { href: '/cashier', label: 'Cashier', roles: ['CASHIER', 'MANAGER', 'ADMIN'] },
  { href: '/admin', label: 'Admin', roles: ['ADMIN', 'MANAGER'] },
];

const customerLinks = [
  { href: '/', label: 'Home' },
];

export function AppShell({ title, variant = 'customer', children }: AppShellProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const homeLink = { href: '/', label: 'Home' };
  const visibleStaffLinks = user ? staffLinks.filter((link) => link.roles.includes(user.role)) : [];
  const headerLinks = variant === 'staff' ? [homeLink, ...visibleStaffLinks] : customerLinks;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand)] text-[var(--brand-ink)] font-black text-xl">
                T
              </div>
              <span className="font-display font-extrabold text-xl tracking-tight text-[var(--ink)]">
                {BRAND.name}
              </span>
            </Link>
            <span className="hidden sm:inline-block text-xs font-semibold uppercase tracking-widest text-[var(--ink-muted)] border-l border-[var(--line)] pl-3">
              {title}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-2">
              {headerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
                    pathname === link.href
                      ? 'bg-[var(--brand)] text-[var(--brand-ink)]'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg)]'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold text-[var(--ink)]">{user.name}</p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--brand)]">{user.role}</p>
                </div>
                <button
                  onClick={() => logout()}
                  className="min-h-[36px] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line)] hover:bg-[var(--line)]"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-xl bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand-ink)] transition hover:opacity-90 min-h-[36px] flex items-center"
              >
                Staff Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {variant === 'staff' ? (
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[220px_1fr] sm:px-6">
          <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="space-y-1.5">
              <Link
                href="/"
                className={`block rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                  pathname === '/'
                    ? 'bg-[var(--brand)] text-[var(--brand-ink)]'
                    : 'text-[var(--ink)] hover:bg-[var(--bg)] border border-transparent hover:border-[var(--line)]'
                }`}
              >
                ← Home
              </Link>
              <p className="!mt-4 text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">Operations</p>
              {visibleStaffLinks.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-[var(--brand)] text-[var(--brand-ink)]'
                        : 'text-[var(--ink)] hover:bg-[var(--bg)] border border-transparent hover:border-[var(--line)]'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {visibleStaffLinks.length === 0 ? (
                <p className="px-3.5 text-xs text-[var(--ink-muted)]">Sign in with a staff account to open these tools.</p>
              ) : null}
            </div>
          </aside>
          <main>{children}</main>
        </div>
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      )}
    </div>
  );
}

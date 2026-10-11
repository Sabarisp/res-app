'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { RoleGuard } from '@/features/auth/role-guard';

const links = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/menu', label: 'Menu' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/tables', label: 'Tables' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/staff', label: 'Staff' },
  { href: '/admin/reports', label: 'Reports' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RoleGuard allowedRoles={['ADMIN', 'MANAGER']}>
      <AppShell title="Admin Dashboard" variant="staff">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <nav className="mb-6 flex flex-wrap gap-2 border-b border-[var(--line)] pb-4">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[var(--brand)] text-[var(--brand-ink)]'
                      : 'border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] hover:border-[var(--brand)]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {children}
        </div>
      </AppShell>
    </RoleGuard>
  );
}

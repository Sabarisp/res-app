import Link from 'next/link';

import { AppShell } from '@/components/app-shell';
import { BRAND } from '@/lib/brand';

const features = [
  { href: '/login', label: 'Staff login' },
  { href: '/waiter', label: 'Waiter POS' },
  { href: '/kitchen', label: 'Kitchen display' },
  { href: '/cashier', label: 'Cashier' },
  { href: '/admin', label: 'Admin dashboard' },
];

export default function HomePage() {
  return (
    <AppShell title="Restaurant system" variant="customer">
      <section className="rounded-[var(--radius-sheet)] bg-[var(--brand)] p-8 text-[var(--brand-ink)] shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--brand-ink)]/80">Welcome</p>
        <h2 className="mt-3 text-4xl font-black md:text-5xl">Delight your guests with a smarter dining flow.</h2>
        <p className="mt-4 max-w-2xl text-lg text-[var(--brand-ink)]/90">
          {BRAND.tagline}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/login" className="rounded-full bg-[var(--surface)] px-4 py-2 font-semibold text-[var(--brand)] transition hover:opacity-90">
            Staff login
          </Link>
          <p className="text-sm text-[var(--brand-ink)]/90">
            Guests: scan the QR code on your table to browse the menu and place your order.
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {features.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand)]/40"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">View</p>
            <h3 className="mt-3 text-lg font-bold text-[var(--ink)]">{feature.label}</h3>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}

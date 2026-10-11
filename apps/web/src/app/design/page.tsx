'use client';

import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, PageHeader, Price, QuantityStepper, StatusBadge } from '@/components/ui-kit';

export default function DesignPage() {
  return (
    <AppShell title="Design system" variant="staff">
      <div className="space-y-8">
        <PageHeader
          eyebrow="Foundation"
          title="Tavola design system"
          description="Colours, status states and shared UI patterns used across the restaurant product."
          action={<button type="button" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-ink)]">Preview</button>}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            ['bg', 'var(--bg)'],
            ['surface', 'var(--surface)'],
            ['brand', 'var(--brand)'],
            ['accent', 'var(--accent)'],
            ['st-ready', 'var(--st-ready)'],
          ].map(([name, value]) => (
            <div key={name} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="h-20 rounded-xl border border-[var(--line)]" style={{ background: value }} />
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">{name}</p>
              <p className="mt-1 text-sm text-[var(--ink)]">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="text-lg font-bold text-[var(--ink)]">Status badges</h3>
            <div className="mt-4 flex flex-wrap gap-3">
              <StatusBadge label="New" tone="new" />
              <StatusBadge label="Preparing" tone="preparing" />
              <StatusBadge label="Ready" tone="ready" />
              <StatusBadge label="Late" tone="late" />
              <StatusBadge label="Served" tone="served" />
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="text-lg font-bold text-[var(--ink)]">Pricing</h3>
            <div className="mt-4 flex items-center gap-3">
              <Price value={348.6} className="text-xl" />
              <span className="text-sm text-[var(--ink-muted)]">INR pricing in a tabular format</span>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="text-lg font-bold text-[var(--ink)]">Quantity stepper</h3>
            <div className="mt-4">
              <QuantityStepper value={2} onChange={() => undefined} />
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="text-lg font-bold text-[var(--ink)]">Empty and error states</h3>
            <div className="mt-4 space-y-3">
              <EmptyState title="No open orders" description="New orders will appear here once the first table checks in." />
              <ErrorState title="Menu could not refresh" description="The kiosk lost its connection to the API. Try again in a moment." actionLabel="Retry" onAction={() => undefined} />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

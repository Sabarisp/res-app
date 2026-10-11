import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">404</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--ink)]">Page not found</h1>
        <p className="mt-2 text-[var(--ink-muted)]">The route you requested does not exist yet.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-[var(--brand)] px-4 py-2 font-semibold text-[var(--brand-ink)] transition hover:opacity-90">
          Return home
        </Link>
      </div>
    </main>
  );
}

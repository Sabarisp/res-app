type ErrorStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ErrorState({ title, description, actionLabel, onAction }: ErrorStateProps) {
  return (
    <div className="rounded-3xl border border-[var(--st-late)]/25 bg-[var(--st-late)]/5 p-6 text-center shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--st-late)]">Error</p>
      <h3 className="mt-3 font-display text-2xl font-bold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-ink)] shadow-sm transition hover:opacity-90"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

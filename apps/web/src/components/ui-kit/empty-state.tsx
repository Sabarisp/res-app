import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--bg)] p-8 text-center shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--ink-muted)]">Empty</p>
      <h3 className="mt-3 font-display text-2xl font-bold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--brand)]">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--ink)]">{title}</h2>
        {description ? <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  );
}

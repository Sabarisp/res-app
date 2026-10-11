type StatusBadgeProps = {
  label: string;
  tone?: 'new' | 'preparing' | 'ready' | 'late' | 'served' | 'neutral';
};

const toneMap: Record<NonNullable<StatusBadgeProps['tone']>, { dot: string; pill: string; text: string }> = {
  new: { dot: 'bg-[var(--st-new)]', pill: 'bg-[var(--st-new)]/10', text: 'text-[var(--st-new)]' },
  preparing: { dot: 'bg-[var(--st-preparing)]', pill: 'bg-[var(--st-preparing)]/10', text: 'text-[var(--st-preparing)]' },
  ready: { dot: 'bg-[var(--st-ready)]', pill: 'bg-[var(--st-ready)]/10', text: 'text-[var(--st-ready)]' },
  late: { dot: 'bg-[var(--st-late)]', pill: 'bg-[var(--st-late)]/10', text: 'text-[var(--st-late)]' },
  served: { dot: 'bg-[var(--st-served)]', pill: 'bg-[var(--st-served)]/10', text: 'text-[var(--st-served)]' },
  neutral: { dot: 'bg-[var(--brand)]', pill: 'bg-[var(--brand)]/10', text: 'text-[var(--brand)]' },
};

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const colors = toneMap[tone];

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold ${colors.pill} ${colors.text}`}>
      <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
      {label}
    </span>
  );
}

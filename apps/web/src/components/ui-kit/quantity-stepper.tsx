type QuantityStepperProps = {
  value: number;
  min?: number;
  onChange: (next: number) => void;
  label?: string;
};

export function QuantityStepper({ value, min = 0, onChange, label = 'Quantity' }: QuantityStepperProps) {
  const safeValue = Math.max(min, value);

  return (
    <div aria-label={label} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1 shadow-sm">
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => onChange(Math.max(min, safeValue - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-[var(--ink)] transition hover:bg-[var(--bg)]"
      >
        −
      </button>
      <span className="tabular-nums min-w-6 text-center text-sm font-semibold text-[var(--ink)]">{safeValue}</span>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => onChange(safeValue + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-[var(--brand)] transition hover:bg-[var(--bg)]"
      >
        +
      </button>
    </div>
  );
}

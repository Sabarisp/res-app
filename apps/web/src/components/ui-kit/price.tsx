import { formatMoney } from '../../lib/formatMoney';

type PriceProps = {
  value: number | string;
  className?: string;
};

export function Price({ value, className = '' }: PriceProps) {
  return (
    <span className={`tabular-nums font-semibold ${className}`.trim()}>
      {formatMoney(value)}
    </span>
  );
}

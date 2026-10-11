'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, Download, IndianRupee, Percent, ShoppingBag, TrendingUp } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { apiFetch, downloadApiFile } from '@/lib/api';

type SummaryResponse = {
  totalRevenue: string;
  totalTax: string;
  totalOrders: number;
  averageOrderValue: string;
  tablesServed: number;
  ordersToday: number;
};

type DailySalesEntry = {
  date: string;
  revenue: string;
  orders: number;
};

type TopItemEntry = {
  name: string;
  quantity: number;
  revenue: string;
};

type PeakHourEntry = {
  label: string;
  orders: number;
};

type PaymentModeEntry = {
  mode: string;
  total: string;
  count: number;
};

type GstSummary = {
  netSales: string;
  totalTax: string;
  grossSales: string;
  taxRate: number;
  orderCount: number;
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const chartPalette = ['var(--brand)', 'var(--accent)', 'var(--st-new)', 'var(--st-ready)', 'var(--st-late)'];
const formatMoney = (value?: string) => currencyFormatter.format(Number(value ?? '0'));

function buildDefaultRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 29);

  const toValue = today.toISOString().slice(0, 10);
  const fromValue = from.toISOString().slice(0, 10);

  return { from: fromValue, to: toValue };
}

export function ReportDashboard() {
  const defaultRange = useMemo(() => buildDefaultRange(), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [dailySales, setDailySales] = useState<DailySalesEntry[]>([]);
  const [topItems, setTopItems] = useState<TopItemEntry[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHourEntry[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentModeEntry[]>([]);
  const [gstSummary, setGstSummary] = useState<GstSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (params.toString()) {
        params.set('limit', '5');
      }

      const [summaryRes, salesRes, topRes, peakRes, paymentRes, gstRes] = await Promise.all([
        apiFetch<SummaryResponse>(`/reports/summary?${params.toString()}`),
        apiFetch<DailySalesEntry[]>(`/reports/daily-sales?${params.toString()}`),
        apiFetch<TopItemEntry[]>(`/reports/top-items?${params.toString()}`),
        apiFetch<PeakHourEntry[]>(`/reports/peak-hours?${params.toString()}`),
        apiFetch<PaymentModeEntry[]>(`/reports/payment-modes?${params.toString()}`),
        apiFetch<GstSummary>(`/reports/gst-summary?${params.toString()}`),
      ]);

      setSummary(summaryRes);
      setDailySales(salesRes);
      setTopItems(topRes);
      setPeakHours(peakRes);
      setPaymentModes(paymentRes);
      setGstSummary(gstRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const exportCsv = async () => {
    try {
      setExporting(true);
      setExportError(null);
      const params = new URLSearchParams({ from, to });
      await downloadApiFile(`/reports/export.csv?${params.toString()}`, 'tavola-sales.csv');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export this report.');
    } finally {
      setExporting(false);
    }
  };

  const chartSales = dailySales.map((entry) => ({ ...entry, revenue: Number(entry.revenue) }));
  const chartPaymentModes = paymentModes.map((entry) => ({ ...entry, total: Number(entry.total) }));

  const cards = [
    {
      label: 'Total revenue',
      value: formatMoney(summary?.totalRevenue),
      icon: IndianRupee,
      accent: 'text-[var(--brand)]',
    },
    {
      label: 'Orders',
      value: String(summary?.totalOrders ?? 0),
      icon: ShoppingBag,
      accent: 'text-[var(--st-new)]',
    },
    {
      label: 'Avg. order value',
      value: formatMoney(summary?.averageOrderValue),
      icon: TrendingUp,
      accent: 'text-[var(--st-ready)]',
    },
    {
      label: 'Tax collected',
      value: formatMoney(gstSummary?.totalTax),
      icon: Percent,
      accent: 'text-[var(--st-preparing)]',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--brand)]">Reports</p>
          <h2 className="mt-2 text-3xl font-display font-bold text-[var(--ink)]">Operations dashboard</h2>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            To
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]"
            />
          </label>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-ink)] disabled:opacity-60"
          >
            <Download size={16} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {exportError ? <p role="alert" className="rounded-xl border border-[var(--st-late)]/30 p-3 text-sm text-[var(--st-late)]">{exportError}</p> : null}
      {error ? (
        <div className="rounded-2xl border border-[var(--st-late)]/30 bg-[var(--st-late)]/5 p-4 text-sm text-[var(--st-late)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--bg)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, accent }) => (
            <div key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--ink-muted)]">{label}</p>
                <span className={`rounded-xl bg-[var(--bg)] p-2 ${accent}`}>
                  <Icon size={18} />
                </span>
              </div>
              <p className="mt-4 text-3xl font-display font-bold text-[var(--ink)]">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-[var(--ink)]">
            <CalendarRange size={18} className="text-[var(--brand)]" />
            <h3 className="text-lg font-bold">Sales trend</h3>
          </div>
          {dailySales.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-muted)]">
              No sales in this range.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSales}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="var(--ink-muted)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--ink-muted)" tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value) => {
                      const amount = typeof value === 'number' ? value : Number(value ?? 0);
                      return currencyFormatter.format(amount);
                    }}
                    labelStyle={{ color: 'var(--ink)' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="var(--brand)" fill="url(#salesFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-[var(--ink)]">
            <BarChart3 size={18} className="text-[var(--brand)]" />
            <h3 className="text-lg font-bold">Top items</h3>
          </div>
          {topItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-muted)]">
              No menu items sold in this range.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topItems} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="var(--ink-muted)" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={80} stroke="var(--ink-muted)" tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => `${typeof value === 'number' ? value : Number(value ?? 0)} sold`} />
                  <Bar dataKey="quantity" radius={[0, 8, 8, 0]} fill="var(--brand)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-[var(--ink)]">
            <TrendingUp size={18} className="text-[var(--brand)]" />
            <h3 className="text-lg font-bold">Peak service hours</h3>
          </div>
          {peakHours.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-muted)]">
              No orders in the selected range.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakHours}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="var(--ink-muted)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--ink-muted)" tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="var(--st-preparing)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-[var(--ink)]">
            <Percent size={18} className="text-[var(--brand)]" />
            <h3 className="text-lg font-bold">Payment mix</h3>
          </div>
          {paymentModes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-muted)]">
              No completed payment data for this range.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_1fr] md:items-center">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartPaymentModes} dataKey="total" nameKey="mode" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {chartPaymentModes.map((entry, index) => (
                        <Cell key={`${entry.mode}-${index}`} fill={chartPalette[index % chartPalette.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => {
                        const amount = typeof value === 'number' ? value : Number(value ?? 0);
                        return currencyFormatter.format(amount);
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                {paymentModes.map((entry, index) => (
                  <div key={entry.mode} className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartPalette[index % chartPalette.length] }} />
                      <span className="text-sm font-semibold text-[var(--ink)]">{entry.mode}</span>
                    </div>
                    <span className="text-sm text-[var(--ink-muted)]">{formatMoney(entry.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <h3 className="text-lg font-bold text-[var(--ink)]">GST summary</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
              <span className="text-sm text-[var(--ink-muted)]">Net sales</span>
              <span className="font-semibold text-[var(--ink)]">{formatMoney(gstSummary?.netSales)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
              <span className="text-sm text-[var(--ink-muted)]">Tax collected</span>
              <span className="font-semibold text-[var(--ink)]">{formatMoney(gstSummary?.totalTax)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
              <span className="text-sm text-[var(--ink-muted)]">Effective tax rate</span>
              <span className="font-semibold text-[var(--ink)]">{(gstSummary?.taxRate ?? 0).toFixed(2)}%</span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <h3 className="text-lg font-bold text-[var(--ink)]">Sales snapshot</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
              <span className="text-sm text-[var(--ink-muted)]">Tables served</span>
              <span className="font-semibold text-[var(--ink)]">{summary?.tablesServed ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
              <span className="text-sm text-[var(--ink-muted)]">Orders today</span>
              <span className="font-semibold text-[var(--ink)]">{summary?.ordersToday ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
              <span className="text-sm text-[var(--ink-muted)]">Gross sales</span>
              <span className="font-semibold text-[var(--ink)]">{formatMoney(gstSummary?.grossSales)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

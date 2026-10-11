'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import type { CouponDto } from '@restaurant/shared';

import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState } from '@/components/ui-kit';
import { apiFetch } from '@/lib/api';
import { useApiError } from '@/lib/useApiError';

type CouponForm = {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  minOrderValue: string;
  isActive: boolean;
  validTo: string;
};

const emptyForm: CouponForm = { code: '', type: 'PERCENT', value: '', minOrderValue: '', isActive: true, validTo: '' };

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { forbidden, handleError, clearForbidden } = useApiError();

  const loadCoupons = useCallback(async () => {
    try {
      setLoading(true);
      clearForbidden();
      setError(null);
      const data = await apiFetch<CouponDto[]>('/coupons');
      setCoupons(data);
    } catch (err) {
      setError(handleError(err, 'Unable to load coupons.'));
    } finally {
      setLoading(false);
    }
  }, [clearForbidden, handleError]);

  useEffect(() => { void loadCoupons(); }, [loadCoupons]);

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (coupon: CouponDto) => {
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrderValue: coupon.minOrderValue ?? '',
      isActive: coupon.isActive,
      validTo: coupon.validTo ? coupon.validTo.slice(0, 10) : '',
    });
    setEditingId(coupon.id);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.value) { setError('Code and value are required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        code: form.code.trim(),
        type: form.type,
        value: Number(form.value),
        minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : null,
        isActive: form.isActive,
        validTo: form.validTo ? new Date(form.validTo).toISOString() : null,
      };
      if (editingId) {
        await apiFetch(`/coupons/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/coupons', { method: 'POST', body: JSON.stringify(body) });
      }
      setDialogOpen(false);
      await loadCoupons();
    } catch (err) {
      setError(handleError(err, 'Coupon could not be saved.'));
    } finally { setSaving(false); }
  };

  const toggleActive = async (coupon: CouponDto) => {
    try {
      await apiFetch(`/coupons/${coupon.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !coupon.isActive }) });
      await loadCoupons();
    } catch (err) { setError(handleError(err, 'Coupon could not be updated.')); }
  };

  const remove = async (coupon: CouponDto) => {
    try {
      await apiFetch(`/coupons/${coupon.id}`, { method: 'DELETE' });
      await loadCoupons();
    } catch (err) { setError(handleError(err, 'Coupon could not be deleted.')); }
  };

  if (forbidden) {
    return (
      <AppShell title="Coupons" variant="staff">
        <ErrorState title="No access to coupons" description="Your role cannot manage coupons. Ask an administrator for access." actionLabel="Retry" onAction={() => void loadCoupons()} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Coupons" variant="staff">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--brand)]">Discounts</p>
            <h2 className="mt-2 text-3xl font-display font-bold text-[var(--ink)]">Coupons</h2>
          </div>
          <button onClick={openCreate} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-ink)]">
            <Plus size={16} /> New coupon
          </button>
        </div>

        {error ? <ErrorState title="Coupons need attention" description={error} actionLabel="Retry" onAction={() => void loadCoupons()} /> : null}

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-[var(--line)]" />)}</div>
        ) : coupons.length === 0 ? (
          <EmptyState title="No coupons yet" description="Create a coupon to offer percent or fixed discounts at billing." action={<button onClick={openCreate} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 font-semibold text-[var(--brand-ink)]">Create coupon</button>} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Min order</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Used</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3 font-semibold text-[var(--ink)]">{coupon.code}</td>
                    <td className="px-4 py-3 text-[var(--ink)]">{coupon.type === 'PERCENT' ? `${coupon.value}% off` : `₹${coupon.value} off`}</td>
                    <td className="px-4 py-3 text-[var(--ink-muted)]">{coupon.minOrderValue ? `₹${coupon.minOrderValue}` : '—'}</td>
                    <td className="px-4 py-3 text-[var(--ink-muted)]">{formatDate(coupon.validTo)}</td>
                    <td className="px-4 py-3 text-[var(--ink-muted)]">{coupon.usedCount}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${coupon.isActive ? 'bg-[var(--st-ready)]/10 text-[var(--st-ready)]' : 'bg-[var(--line)] text-[var(--ink-muted)]'}`}>
                        {coupon.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => void toggleActive(coupon)} className="min-h-9 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold text-[var(--ink)]">{coupon.isActive ? 'Disable' : 'Enable'}</button>
                        <button onClick={() => openEdit(coupon)} aria-label={`Edit ${coupon.code}`} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-muted)]"><Pencil size={15} /></button>
                        <button onClick={() => void remove(coupon)} aria-label={`Delete ${coupon.code}`} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-muted)] hover:text-[var(--st-late)]"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-[var(--ink-muted)]">A coupon that has already been used cannot be deleted — it is disabled instead so past bills stay accurate.</p>
      </div>

      {dialogOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="coupon-dialog-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <section className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-5 sm:rounded-[20px]">
            <h2 id="coupon-dialog-title" className="font-display text-xl font-bold text-[var(--ink)]">{editingId ? 'Edit coupon' : 'New coupon'}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-[var(--ink)]">Code
                <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="SAVE10" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 font-normal text-[var(--ink)]" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-semibold text-[var(--ink)]">Type
                  <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CouponForm['type'] })} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 font-normal text-[var(--ink)]">
                    <option value="PERCENT">Percent (%)</option>
                    <option value="FIXED">Fixed (₹)</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-[var(--ink)]">Value
                  <input type="number" min="0" step="0.01" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 font-normal text-[var(--ink)]" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-semibold text-[var(--ink)]">Min order (₹)
                  <input type="number" min="0" step="0.01" value={form.minOrderValue} onChange={(event) => setForm({ ...form, minOrderValue: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 font-normal text-[var(--ink)]" />
                </label>
                <label className="block text-sm font-semibold text-[var(--ink)]">Expires
                  <input type="date" value={form.validTo} onChange={(event) => setForm({ ...form, validTo: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 font-normal text-[var(--ink)]" />
                </label>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[var(--ink)]">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
                Active (can be applied at billing)
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setDialogOpen(false)} className="min-h-11 flex-1 rounded-lg border border-[var(--line)] font-semibold text-[var(--ink)]">Cancel</button>
              <button onClick={() => void save()} disabled={saving} className="min-h-11 flex-1 rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)] disabled:opacity-60">{saving ? 'Saving…' : 'Save coupon'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

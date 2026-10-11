'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import QRCode from 'qrcode';

import { EmptyState, ErrorState, PageHeader, StatusBadge } from '@/components/ui-kit';
import { apiFetch } from '@/lib/api';

type DiningTable = {
  id: string;
  number: number;
  capacity: number;
  status: 'FREE' | 'OCCUPIED' | 'BILL_REQUESTED';
  qrToken: string;
  qrUrl: string;
};
type TableForm = { number: string; capacity: string };

export function TableManager() {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [form, setForm] = useState<TableForm>({ number: '', capacity: '4' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await apiFetch<DiningTable[]>('/tables');
      setTables(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tables.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      const entries = await Promise.all(tables.map(async (table) => [
        table.id,
        await QRCode.toDataURL(table.qrUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 }),
      ] as const));
      if (!cancelled) setQrImages(Object.fromEntries(entries));
    };
    void generate().catch((err: unknown) => {
      setError(err instanceof Error ? `Unable to create table QR codes: ${err.message}` : 'Unable to create table QR codes.');
    });
    return () => { cancelled = true; };
  }, [tables]);

  const saveTable = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = { number: Number(form.number), capacity: Number(form.capacity) };
      await apiFetch(editingId ? `/tables/${editingId}` : '/tables', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setForm({ number: '', capacity: '4' });
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save table.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (table: DiningTable, status: DiningTable['status']) => {
    try {
      await apiFetch(`/tables/${table.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update table status.');
    }
  };

  const deleteTable = async (table: DiningTable) => {
    if (!window.confirm(`Delete Table ${table.number}? This cannot be undone.`)) return;
    try {
      await apiFetch(`/tables/${table.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete table.');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Tables" title="Table administration" description="Manage seating, table status and scannable QR links." action={<Link href="/admin" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 font-semibold text-[var(--brand-ink)]">Back to dashboard</Link>} />

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 print:hidden">
        <h2 className="font-display text-xl font-bold text-[var(--ink)]">{editingId ? 'Edit table' : 'Add a table'}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <label className="text-sm font-medium text-[var(--ink-muted)]">Table number<input type="number" min="1" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-[var(--ink)]" /></label>
          <label className="text-sm font-medium text-[var(--ink-muted)]">Seats<input type="number" min="1" max="30" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-[var(--ink)]" /></label>
          <button onClick={() => void saveTable()} disabled={saving || !form.number} className="mt-auto min-h-11 rounded-lg bg-[var(--brand)] px-4 font-semibold text-[var(--brand-ink)] disabled:opacity-60">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add table'}</button>
          {editingId ? <button onClick={() => { setEditingId(null); setForm({ number: '', capacity: '4' }); }} className="mt-auto min-h-11 rounded-lg border border-[var(--line)] px-4 font-semibold text-[var(--ink)]">Cancel</button> : null}
        </div>
      </section>

      <div className="flex justify-end print:hidden"><button onClick={() => window.print()} disabled={!tables.length} className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 font-semibold text-[var(--ink)] disabled:opacity-50">Print QR sheet</button></div>
      {error ? <ErrorState title="Table management needs attention" description={error} actionLabel="Retry" onAction={() => { setLoading(true); void loadData(); }} /> : null}
      {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-xl bg-[var(--line)]" />)}</div> : tables.length === 0 ? <EmptyState title="No tables yet" description="Add a table to generate its unique QR link for customers." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
          {tables.map((table) => <article key={table.id} className="break-inside-avoid rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-display text-2xl font-bold text-[var(--ink)]">Table {table.number}</h2><p className="text-sm text-[var(--ink-muted)]">{table.capacity} seats</p></div><StatusBadge label={table.status.replace('_', ' ')} tone={table.status === 'FREE' ? 'ready' : table.status === 'BILL_REQUESTED' ? 'late' : 'preparing'} /></div>
            <div className="mt-3 flex items-center justify-center rounded-lg border border-[var(--line)] bg-white p-2">{qrImages[table.id] ? <Image src={qrImages[table.id]} alt={`QR code for Table ${table.number}`} width={160} height={160} unoptimized /> : <div className="h-40 w-40 animate-pulse rounded bg-[var(--line)]" />}</div>
            <p className="mt-2 break-all text-xs text-[var(--ink-muted)]">{table.qrUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2 print:hidden">
              <a href={qrImages[table.id]} download={`table-${table.number}-qr.png`} aria-disabled={!qrImages[table.id]} className="inline-flex min-h-10 items-center rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[var(--ink)]">Download QR</a>
              <button onClick={() => { setEditingId(table.id); setForm({ number: String(table.number), capacity: String(table.capacity) }); }} className="min-h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[var(--ink)]">Edit</button>
              <button onClick={() => void deleteTable(table)} className="min-h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[var(--st-late)]">Delete</button>
              <select aria-label={`Status for table ${table.number}`} value={table.status} onChange={(event) => void updateStatus(table, event.target.value as DiningTable['status'])} className="min-h-10 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"><option value="FREE">Free</option><option value="OCCUPIED">Occupied</option><option value="BILL_REQUESTED">Bill requested</option></select>
            </div>
          </article>)}
        </div>
      )}
    </div>
  );
}

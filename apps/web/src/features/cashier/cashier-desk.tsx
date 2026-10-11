'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, LiveIndicator, PageHeader, Price, StatusBadge } from '@/components/ui-kit';
import { RoleGuard } from '@/features/auth/role-guard';
import { apiFetch , downloadApiFile } from '@/lib/api';
import { useApiError } from '@/lib/useApiError';
import { getSocket } from '@/lib/socket';
import { formatPaise, lineTotal, multiplyMoney, paiseFromMoney } from '@/lib/formatMoney';

type OpenOrder = {
  id: string;
  orderNumber: number;
  status: string;
  subtotal: string;
  taxAmount: string;
  discount: string;
  total: string;
  createdAt: string;
  table: { number: number } | null;
  items: Array<{ id: string; name: string; quantity: number; unitPrice: string; notes: string | null }>;
  payments: Array<PaymentLine & { status: string }>;
};
type Bill = { subtotal: string; taxAmount: string; discount: string; total: string; paidAmount: string; amountDue: string };
type PaymentLine = { method: 'CASH' | 'UPI' | 'CARD' | 'ONLINE'; amount: string };
type CloseResponse = {
  orderId: string;
  status: string;
  subtotal: string;
  taxAmount: string;
  discount: string;
  total: string;
  payments: PaymentLine[];
};
type ClosedInvoice = {
  order: OpenOrder;
  bill: CloseResponse;
};

export function CashierDesk() {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', amount: '' }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<ClosedInvoice | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const { forbidden, handleError, clearForbidden } = useApiError();

  const loadOrders = useCallback(async () => {
    try {
      clearForbidden();
      const data = await apiFetch<OpenOrder[]>('/orders/open');
      setOrders(data);
      setSelectedId((current) => current && data.some((order) => order.id === current) ? current : data[0]?.id ?? null);
      setError(null);
    } catch (err) {
      // Never render a failed fetch as an empty list: keep prior orders, surface error.
      setError(handleError(err, 'Unable to load open bills.'));
    } finally {
      setLoading(false);
    }
  }, [clearForbidden, handleError]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // Live desk (B-11): refetch whenever the floor changes; re-sync on reconnect.
  useEffect(() => {
    const socket = getSocket();
    const joinWaiters = () => {
      socket.emit('join-room', 'waiters', (result: { joined: boolean }) => {
        if (!result.joined) setError('Live billing updates are unavailable. Check your staff login.');
      });
      void loadOrders();
    };
    const onUpdate = () => { void loadOrders(); };
    socket.on('connect', joinWaiters);
    socket.on('order:new', onUpdate);
    socket.on('order:status_changed', onUpdate);
    socket.on('bill:requested', onUpdate);
    if (socket.connected) joinWaiters();
    return () => {
      socket.emit('leave-room', 'waiters');
      socket.off('connect', joinWaiters);
      socket.off('order:new', onUpdate);
      socket.off('order:status_changed', onUpdate);
      socket.off('bill:requested', onUpdate);
    };
  }, [loadOrders]);

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;

  const preview = useCallback(async (orderId: string, code: string) => {
    const result = await apiFetch<Bill>(`/orders/${orderId}/bill-preview`, {
      method: 'POST',
      body: JSON.stringify(code.trim() ? { couponCode: code.trim() } : {}),
    });
    setBill(result);
    setPayments([{ method: 'CASH', amount: result.amountDue }]);
  }, []);

  useEffect(() => {
    if (!selectedOrder) {
      setBill(null);
      return;
    }
    void preview(selectedOrder.id, '').catch((err: unknown) => {
      setError(handleError(err, 'Unable to calculate bill.'));
      setBill(null);
    });
    setCouponCode('');
  }, [preview, selectedOrder, handleError]);

  const applyCoupon = async () => {
    if (!selectedOrder) return;
    try {
      clearForbidden();
      await preview(selectedOrder.id, couponCode);
      setError(null);
    } catch (err) {
      setError(handleError(err, 'Coupon could not be applied.'));
    }
  };

  const paidTotal = useMemo(() => payments.reduce((sum, item) => {
    try {
      return sum + paiseFromMoney(item.amount.trim() || '0');
    } catch {
      return sum;
    }
  }, 0), [payments]);
  const expectedTotal = bill ? paiseFromMoney(bill.amountDue) : 0;

  const closeBill = async () => {
    if (!selectedOrder || !bill || saving) return;
    setSaving(true);
    setError(null);
    try {
      const tendered = payments
        .map((payment) => ({ ...payment, amount: payment.amount.trim() }))
        .filter((payment) => {
          try {
            return paiseFromMoney(payment.amount) > 0;
          } catch {
            return false;
          }
        });
      // Server is authoritative: render the invoice from the close response (B-09).
      const result = await apiFetch<CloseResponse>(`/orders/${selectedOrder.id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          couponCode: couponCode.trim() || undefined,
          payments: tendered,
        }),
      });
      setInvoice({ order: selectedOrder, bill: result });
      setSelectedId(null);
      await loadOrders();
    } catch (err) {
      setError(handleError(err, 'Unable to close bill.'));
    } finally {
      setSaving(false);
    }
  };

  const printInvoice = () => window.print();

  const confirmCancel = async () => {
    if (!cancelOrderId) return;
    if (cancelReason.trim().length < 3) { setError('Please give a reason of at least 3 characters to cancel.'); return; }
    setActionSaving(true);
    try {
      await apiFetch(`/orders/${cancelOrderId}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: cancelReason.trim() }) });
      setCancelOrderId(null); setCancelReason(''); setError(null);
      setSelectedId(null);
      await loadOrders();
    } catch (err) {
      setError(handleError(err, 'Unable to cancel the order.'));
    } finally { setActionSaving(false); }
  };
  const downloadInvoicePdf = async () => {
  if (!invoice) return;
  try {
    await downloadApiFile(`/orders/${invoice.order.id}/invoice`, `invoice-${invoice.order.orderNumber}.pdf`);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unable to download invoice.');
  }
};

  return (
    <RoleGuard allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}>
      <AppShell title="Cashier billing" variant="staff">
        <div className="space-y-5">
          <PageHeader eyebrow="Billing desk" title="Open bills" description="Review server-calculated totals, accept split payments and close each order once." />
          <div className="flex justify-end"><LiveIndicator label="Billing" /></div>
          {error ? <ErrorState title="Billing needs attention" description={error} actionLabel="Refresh bills" onAction={() => { setLoading(true); void loadOrders(); }} /> : null}
          {loading ? <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><div className="h-64 animate-pulse rounded-xl bg-[var(--line)]" /><div className="h-64 animate-pulse rounded-xl bg-[var(--line)]" /></div> : orders.length === 0 ? <EmptyState title="No open bills" description="Orders that have not been paid will appear here. Ask the waiter to request a bill if a table is ready to check out." /> : (
            <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
              <nav aria-label="Open bills" className="space-y-2">{orders.map((order) => <button key={order.id} onClick={() => setSelectedId(order.id)} className={`w-full rounded-xl border p-4 text-left ${selectedId === order.id ? 'border-[var(--brand)] bg-[var(--brand)]/5' : 'border-[var(--line)] bg-[var(--surface)]'}`}><div className="flex items-center justify-between gap-2"><span className="font-display text-xl font-bold text-[var(--ink)]">Order #{order.orderNumber}</span><StatusBadge label={order.status} tone={order.status === 'READY' || order.status === 'SERVED' ? 'ready' : 'preparing'} /></div><p className="mt-2 text-sm text-[var(--ink-muted)]">{order.table ? `Table ${order.table.number}` : 'Walk-in'} · {order.items.length} lines</p><Price value={order.total} className="mt-2 text-lg text-[var(--ink)]" /></button>)}</nav>
              {selectedOrder && bill ? <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
                <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-4"><div><p className="text-sm text-[var(--ink-muted)]">{selectedOrder.table ? `Table ${selectedOrder.table.number}` : 'Walk-in order'}</p><h2 className="font-display text-2xl font-bold text-[var(--ink)]">Order #{selectedOrder.orderNumber}</h2></div><StatusBadge label={selectedOrder.status} tone={selectedOrder.status === 'READY' || selectedOrder.status === 'SERVED' ? 'ready' : 'preparing'} /></header>
                <div className="mt-4 space-y-3">{selectedOrder.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><div><p className="font-semibold text-[var(--ink)]">{item.quantity} × {item.name}</p>{item.notes ? <p className="text-xs text-[var(--ink-muted)]">{item.notes}</p> : null}</div><Price value={multiplyMoney(item.unitPrice, item.quantity)} /></div>)}</div>
                <div className="mt-4 flex gap-2"><input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Coupon code" aria-label="Coupon code" className="min-h-11 flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-[var(--ink)]" /><button onClick={() => void applyCoupon()} className="min-h-11 rounded-lg border border-[var(--line)] px-4 font-semibold text-[var(--ink)]">Apply</button></div>
                <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between text-[var(--ink-muted)]"><dt>Subtotal</dt><dd><Price value={bill.subtotal} /></dd></div><div className="flex justify-between text-[var(--ink-muted)]"><dt>GST</dt><dd><Price value={bill.taxAmount} /></dd></div><div className="flex justify-between text-[var(--ink-muted)]"><dt>Discount</dt><dd><Price value={bill.discount} /></dd></div><div className="flex justify-between text-[var(--ink-muted)]"><dt>Paid</dt><dd><Price value={bill.paidAmount} /></dd></div><div className="flex justify-between border-t border-[var(--line)] pt-3 text-lg font-bold text-[var(--ink)]"><dt>Amount due</dt><dd><Price value={bill.amountDue} /></dd></div></dl>
                {expectedTotal > 0 ? <div className="mt-5 space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold text-[var(--ink)]">Payment split</h3><button onClick={() => setPayments((current) => [...current, { method: 'CASH', amount: '0.00' }])} className="min-h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[var(--ink)]">Add payment</button></div>{payments.map((payment, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2"><select aria-label={`Payment method ${index + 1}`} value={payment.method} onChange={(event) => setPayments((current) => current.map((entry, i) => i === index ? { ...entry, method: event.target.value as PaymentLine['method'] } : entry))} className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="ONLINE">Online</option></select><input inputMode="decimal" value={payment.amount} onChange={(event) => setPayments((current) => current.map((entry, i) => i === index ? { ...entry, amount: event.target.value } : entry))} aria-label={`Payment amount ${index + 1}`} className="min-h-11 min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]" />{payments.length > 1 ? <button onClick={() => setPayments((current) => current.filter((_, i) => i !== index))} aria-label={`Remove payment ${index + 1}`} className="min-h-11 min-w-11 rounded-lg border border-[var(--line)] text-[var(--st-late)]">×</button> : null}</div>)}</div> : <p className="mt-5 text-sm text-[var(--ink-muted)]">This order is fully paid. Close the bill to release the table.</p>}
                <p className={`mt-2 text-sm ${paidTotal === expectedTotal ? 'text-[var(--st-ready)]' : 'text-[var(--st-late)]'}`}>Allocated: <Price value={formatPaise(paidTotal)} /> of <Price value={bill.amountDue} /></p>
                <button onClick={() => void closeBill()} disabled={saving || paidTotal !== expectedTotal} className="mt-4 min-h-12 w-full rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)] disabled:opacity-50">{saving ? 'Closing bill…' : expectedTotal ? 'Take payment and close bill' : 'Close bill'}</button>
                {selectedOrder.status !== 'SERVED' && selectedOrder.status !== 'COMPLETED' ? (
                  <button onClick={() => { setCancelReason(''); setCancelOrderId(selectedOrder.id); }} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--st-late)]/40 font-semibold text-[var(--st-late)]">Cancel order</button>
                ) : null}
              </section> : <EmptyState title="Select a bill" description="Choose an open order to review its items and collect payment." />}
            </div>
          )}
          {invoice ? <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 print:border-0 print:p-0"><div className="flex flex-wrap items-center justify-between gap-3 print:hidden"><h2 className="font-display text-2xl font-bold text-[var(--ink)]">Payment recorded</h2><div className="flex gap-2">
  <button onClick={() => void downloadInvoicePdf()} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 font-semibold text-[var(--brand-ink)]">Download invoice PDF</button>
  <button onClick={printInvoice} className="min-h-11 rounded-lg border border-[var(--line)] px-4 font-semibold text-[var(--ink)]">Print</button>
</div></div><div className="mt-4" id="invoice"><h3 className="font-display text-2xl font-bold text-[var(--ink)]">Tavola · Invoice</h3><p className="mt-1 text-sm text-[var(--ink-muted)]">Order #{invoice.order.orderNumber} · {invoice.order.table ? `Table ${invoice.order.table.number}` : 'Walk-in'}</p><div className="mt-4 space-y-2">{invoice.order.items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.quantity} × {item.name}</span><Price value={multiplyMoney(item.unitPrice, item.quantity)} /></div>)}</div><div className="mt-4 space-y-2 border-t border-[var(--line)] pt-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><Price value={invoice.bill.subtotal} /></div><div className="flex justify-between"><span>GST</span><Price value={invoice.bill.taxAmount} /></div><div className="flex justify-between"><span>Discount</span><Price value={invoice.bill.discount} /></div><div className="flex justify-between font-bold"><span>Total</span><Price value={invoice.bill.total} /></div>{invoice.bill.payments.map((payment, index) => <div key={index} className="flex justify-between"><span>{payment.method}</span><Price value={payment.amount} /></div>)}</div></div></section> : null}
        </div>

        {cancelOrderId ? (
          <div role="dialog" aria-modal="true" aria-labelledby="cashier-reason-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
            <section className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-5 sm:rounded-[20px]">
              <h2 id="cashier-reason-title" className="font-display text-xl font-bold text-[var(--ink)]">Cancel this order?</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">The order is cancelled and any unused stock is returned. This cannot be undone.</p>
              <label className="mt-4 block text-sm font-semibold text-[var(--ink)]">
                Reason
                <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} maxLength={500} placeholder="For example: duplicate entry" className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 font-normal outline-none focus:border-[var(--brand)]" />
              </label>
              <div className="mt-4 flex gap-2">
                <button onClick={() => { setCancelOrderId(null); setCancelReason(''); }} className="min-h-11 flex-1 rounded-lg border border-[var(--line)] font-semibold text-[var(--ink)]">Keep order</button>
                <button onClick={() => void confirmCancel()} disabled={actionSaving || cancelReason.trim().length < 3} className="min-h-11 flex-1 rounded-lg bg-[var(--st-late)] font-semibold text-white disabled:opacity-50">{actionSaving ? 'Working…' : 'Cancel order'}</button>
              </div>
            </section>
          </div>
        ) : null}
      </AppShell>
    </RoleGuard>
  );
}

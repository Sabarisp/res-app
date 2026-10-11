'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, Price, StatusBadge } from '@/components/ui-kit';
import { apiFetch } from '@/lib/api';
import { lineTotal } from '@/lib/formatMoney';
import { getSocket } from '@/lib/socket';

type OrderData = {
  id: string;
  orderNumber: number;
  status: 'PENDING' | 'RECEIVED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
  subtotal: string;
  taxAmount: string;
  discount: string;
  total: string;
  table: { id: string; number: number; qrToken: string } | null;
  payments: Array<{ status: string; amount: string }>;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: string;
    status: string;
    notes: string | null;
    addons: Array<{ name: string; price: string }>;
  }>;
};

const progress = ['RECEIVED', 'PREPARING', 'READY', 'SERVED'] as const;
const statusLabel: Record<OrderData['status'], string> = {
  PENDING: 'Received',
  RECEIVED: 'Received',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SERVED: 'Served',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function OrderTracking({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    try {
      const data = await apiFetch<OrderData>(`/orders/${encodeURIComponent(orderId)}`);
      setOrder(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load order.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const tableId = order?.table?.id ?? null;
  const tableQrToken = order?.table?.qrToken ?? null;

  useEffect(() => {
    void loadOrder();
    const socket = getSocket();
    // The server only admits customers holding the table qrToken (B-08/B-13),
    // so join is attempted once per connect once the order (and its table) is known.
    const joinRoom = () => {
      if (!tableId || !tableQrToken) {
        setLive(false);
        return;
      }
      socket.emit('join-room', `order:${orderId}`, { qrToken: tableQrToken }, (result: { joined: boolean }) => {
        setLive(result.joined === true);
      });
      socket.emit('join-room', `table:${tableId}`, { qrToken: tableQrToken });
    };
    const onStatusChanged = (event: { orderId: string }) => {
      if (event.orderId === orderId) void loadOrder();
    };
    const onTableEvent = (event: { orderId?: string }) => {
      if (event.orderId && event.orderId !== orderId) return;
      setActionMessage(null);
      setActionError(null);
      void loadOrder();
    };
    const onDisconnect = () => setLive(false);
    socket.on('connect', joinRoom);
    socket.on('disconnect', onDisconnect);
    socket.on('order:status_changed', onStatusChanged);
    socket.on('item:status_changed', onTableEvent);
    socket.on('waiter:called', onTableEvent);
    socket.on('bill:requested', onTableEvent);
    if (socket.connected) joinRoom();
    return () => {
      socket.emit('leave-room', `order:${orderId}`);
      if (tableId) socket.emit('leave-room', `table:${tableId}`);
      socket.off('connect', joinRoom);
      socket.off('disconnect', onDisconnect);
      socket.off('order:status_changed', onStatusChanged);
      socket.off('item:status_changed', onTableEvent);
      socket.off('waiter:called', onTableEvent);
      socket.off('bill:requested', onTableEvent);
    };
  }, [loadOrder, orderId, tableId, tableQrToken]);

  const requestAction = async (action: 'call-waiter' | 'request-bill') => {
    setActionMessage(null);
    setActionError(null);
    try {
      await apiFetch(`/orders/${encodeURIComponent(orderId)}/${action}`, { method: 'POST' });
      setActionMessage(action === 'call-waiter' ? 'A waiter has been notified.' : 'Your bill request has been sent.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to send your request.');
    }
  };

  const handlePayOnline = async () => {
    const currentOrder = order;
    if (!currentOrder) return;
    setPaymentError(null);
    setPaymentBusy(true);
    try {
      const paymentOrder = await apiFetch<{ id: string; amount: number; currency: string; keyId: string }>('/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
      if (typeof window.Razorpay !== 'function') {
        const loaded = await new Promise<boolean>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
        if (!loaded || typeof window.Razorpay !== 'function') throw new Error('Unable to load Razorpay checkout.');
      }
      const checkout = new window.Razorpay({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: 'Tavola',
        description: `Order ${currentOrder.orderNumber}`,
        order_id: paymentOrder.id,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await apiFetch('/payments/verify', { method: 'POST', body: JSON.stringify(response) });
            await loadOrder();
          } catch (err) {
            setPaymentError(err instanceof Error ? err.message : 'Payment verification failed.');
          } finally {
            setPaymentBusy(false);
          }
        },
        modal: { ondismiss: () => setPaymentBusy(false) },
      });
      checkout.open();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Unable to start online payment.');
      setPaymentBusy(false);
    }
  };

  if (loading) return <AppShell title="Order tracking" variant="customer"><div className="space-y-4"><div className="h-8 w-40 animate-pulse rounded-xl bg-[var(--line)]" /><div className="h-48 animate-pulse rounded-xl bg-[var(--line)]" /></div></AppShell>;
  if (error || !order) return <AppShell title="Order tracking" variant="customer"><ErrorState title="We could not load this order" description={`${error ?? 'Order not found.'} Check the order link or ask a staff member for help.`} actionLabel="Try again" onAction={() => { setLoading(true); void loadOrder(); }} /></AppShell>;

  const currentStep = progress.indexOf(
    order.status === 'PENDING' ? 'RECEIVED'
      : order.status === 'SERVED' || order.status === 'COMPLETED' ? 'SERVED'
        : order.status as (typeof progress)[number],
  );
  const cancelled = order.status === 'CANCELLED';

  return (
    <AppShell title="Order tracking" variant="customer">
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
            <div><p className="text-sm font-semibold text-[var(--brand)]">Order #{order.orderNumber}</p><h1 className="mt-1 font-display text-3xl font-bold text-[var(--ink)]">Order status</h1></div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-[var(--st-ready)]' : 'bg-[var(--st-preparing)]'}`} /><span className="text-sm text-[var(--ink-muted)]">{live ? 'Live updates' : 'Reconnecting'}</span></div>
          </div>
          <div className="mt-5 flex items-center gap-3"><StatusBadge label={statusLabel[order.status]} tone={order.status === 'READY' || order.status === 'SERVED' || order.status === 'COMPLETED' ? 'ready' : order.status === 'CANCELLED' ? 'late' : order.status === 'PREPARING' ? 'preparing' : 'new'} />{order.table ? <span className="text-sm text-[var(--ink-muted)]">Table {order.table.number}</span> : null}</div>
          {cancelled ? <div className="mt-4 rounded-lg border border-[var(--st-late)]/30 p-3 text-sm text-[var(--st-late)]">This order was cancelled. Please contact staff for assistance.</div> : (
            <ol className="mt-6 space-y-4 border-l-2 border-[var(--line)] pl-5">
              {progress.map((step, index) => {
                const complete = currentStep >= index;
                return <li key={step} className="relative"><span className={`absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 ${complete ? 'border-[var(--brand)] bg-[var(--brand)]' : 'border-[var(--line)] bg-[var(--surface)]'}`} /><p className={`font-semibold ${complete ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>{statusLabel[step]}</p><p className="text-sm text-[var(--ink-muted)]">{index === 0 ? 'Your order has reached the restaurant.' : index === 1 ? 'The kitchen is preparing your dishes.' : index === 2 ? 'Your dishes are ready.' : 'Your meal has been served.'}</p></li>;
              })}
            </ol>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={() => void requestAction('call-waiter')} className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 font-semibold text-[var(--ink)]">Call waiter</button>
            <button onClick={() => void requestAction('request-bill')} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 font-semibold text-[var(--brand-ink)]">Request bill</button>
          </div>
          {actionMessage ? <p role="status" className="mt-3 text-sm text-[var(--st-ready)]">{actionMessage}</p> : null}
          {actionError ? <p role="alert" className="mt-3 text-sm text-[var(--st-late)]">{actionError}</p> : null}
        </section>
        <aside className="h-fit rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 xl:sticky xl:top-24">
          <h2 className="font-display text-2xl font-bold text-[var(--ink)]">Your items</h2>
          {order.items.length === 0 ? <EmptyState title="No order items" description="If this seems wrong, ask a staff member to review the order." /> : <div className="mt-4 space-y-3">{order.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><div><p className="font-semibold text-[var(--ink)]">{item.quantity} × {item.name}</p>{item.addons.length ? <p className="text-xs text-[var(--ink-muted)]">{item.addons.map((addon) => `${addon.name} (₹${addon.price})`).join(', ')}</p> : null}{item.notes ? <p className="text-xs text-[var(--ink-muted)]">Note: {item.notes}</p> : null}</div><Price value={lineTotal(item.unitPrice, item.quantity, item.addons.map((addon) => addon.price))} /></div>)}</div>}
          <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between text-[var(--ink-muted)]"><dt>Subtotal</dt><dd><Price value={order.subtotal} /></dd></div><div className="flex justify-between text-[var(--ink-muted)]"><dt>Tax</dt><dd><Price value={order.taxAmount} /></dd></div>{order.discount !== '0.00' ? <div className="flex justify-between text-[var(--ink-muted)]"><dt>Discount</dt><dd><Price value={order.discount} /></dd></div> : null}<div className="flex justify-between border-t border-[var(--line)] pt-3 text-base font-bold text-[var(--ink)]"><dt>Total</dt><dd><Price value={order.total} /></dd></div></dl>
          {paymentError ? <p role="alert" className="mt-3 text-sm text-[var(--st-late)]">{paymentError}</p> : null}
          {order.payments.some((payment) => payment.status === 'PAID') ? <p role="status" className="mt-3 text-sm font-semibold text-[var(--st-ready)]">Payment received.</p> : <button onClick={() => void handlePayOnline()} disabled={paymentBusy || cancelled} className="mt-4 min-h-12 w-full rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)] disabled:opacity-60">{paymentBusy ? 'Opening secure checkout…' : 'Pay online'}</button>}
          <Link href={order.table ? `/t/${encodeURIComponent(order.table.qrToken)}` : '/'} className="mt-4 flex min-h-11 items-center justify-center rounded-lg border border-[var(--line)] px-4 font-semibold text-[var(--ink)]">Return to menu</Link>
        </aside>
      </div>
    </AppShell>
  );
}

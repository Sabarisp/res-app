'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Receipt } from 'lucide-react';

import { EmptyState, ErrorState, Price, StatusBadge } from '@/components/ui-kit';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';

type TableOrder = {
  id: string;
  orderNumber: number;
  status: string;
  total: string;
  table: { id: string; number: number } | null;
  items: Array<{ id: string; name: string; quantity: number; status: string }>;
};

/**
 * "Your orders" for a table (Phase 5-5): every open order with live status, plus
 * call-waiter and request-bill. Public — no customer account required.
 */
export function TableOrders({ qrToken, onClose }: { qrToken: string; onClose: () => void }) {
  const [orders, setOrders] = useState<TableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const loadOrders = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      const data = await apiFetch<TableOrder[]>(`/orders/by-table/${encodeURIComponent(qrToken)}`);
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your orders.');
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  useEffect(() => { void loadOrders(true); }, [loadOrders]);

  // Live status: join this table's room (scoped by qrToken) and refresh on changes.
  useEffect(() => {
    const socket = getSocket();
    const tableId = orders[0]?.table?.id;
    const joinTable = () => {
      if (tableId) socket.emit('join-room', `table:${tableId}`, { qrToken });
    };
    const onUpdate = () => { void loadOrders(); };
    socket.on('connect', joinTable);
    socket.on('order:status_changed', onUpdate);
    socket.on('item:status_changed', onUpdate);
    if (socket.connected) joinTable();
    return () => {
      if (tableId) socket.emit('leave-room', `table:${tableId}`);
      socket.off('connect', joinTable);
      socket.off('order:status_changed', onUpdate);
      socket.off('item:status_changed', onUpdate);
    };
  }, [loadOrders, orders, qrToken]);

  const callWaiter = async (orderId: string) => {
    setActing(orderId);
    try {
      await apiFetch(`/orders/${orderId}/call-waiter`, { method: 'POST' });
      setNotice('A waiter has been notified.');
    } catch {
      setNotice('Could not notify a waiter. Please try again.');
    } finally { setActing(null); }
  };

  const requestBill = async (orderId: string) => {
    setActing(orderId);
    try {
      await apiFetch(`/orders/${orderId}/request-bill`, { method: 'POST' });
      setNotice('Bill requested. A waiter will bring your bill.');
    } catch {
      setNotice('Could not request a bill. Please try again.');
    } finally { setActing(null); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="table-orders-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <section className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-[20px] bg-[var(--surface)] p-5 sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 id="table-orders-title" className="font-display text-2xl font-bold text-[var(--ink)]">Your orders</h2>
          <button onClick={onClose} aria-label="Close your orders" className="min-h-11 min-w-11 rounded-lg border border-[var(--line)] text-xl text-[var(--ink)]">×</button>
        </div>

        {notice ? <p role="status" className="mt-3 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand)]/10 p-3 text-sm font-semibold text-[var(--ink)]">{notice}</p> : null}

        {loading ? (
          <div className="mt-4 space-y-3">{Array.from({ length: 2 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-[var(--line)]" />)}</div>
        ) : error ? (
          <div className="mt-4"><ErrorState title="Your orders could not load" description={error} actionLabel="Try again" onAction={() => void loadOrders(true)} /></div>
        ) : orders.length === 0 ? (
          <EmptyState title="No open orders" description="Orders you place from this table will appear here with their live status." />
        ) : (
          <div className="mt-4 space-y-3">
            {orders.map((order) => (
              <article key={order.id} className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-[var(--ink)]">Order #{order.orderNumber}</h3>
                  <StatusBadge label={order.status} tone={order.status === 'READY' || order.status === 'SERVED' ? 'ready' : order.status === 'PREPARING' ? 'preparing' : 'new'} />
                </div>
                <ul className="mt-3 space-y-1 text-sm text-[var(--ink)]">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span>{item.quantity} × {item.name}</span>
                      <span className="text-xs text-[var(--ink-muted)]">{item.status}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
                  <span className="text-sm text-[var(--ink-muted)]">Total</span>
                  <Price value={order.total} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => void callWaiter(order.id)} disabled={acting === order.id} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--line)] font-semibold text-[var(--ink)] disabled:opacity-60">
                    <Bell size={16} /> Call waiter
                  </button>
                  <button onClick={() => void requestBill(order.id)} disabled={acting === order.id} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)] disabled:opacity-60">
                    <Receipt size={16} /> Request bill
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

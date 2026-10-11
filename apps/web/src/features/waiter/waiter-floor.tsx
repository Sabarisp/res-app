'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, LiveIndicator, Price, QuantityStepper, StatusBadge } from '@/components/ui-kit';
import { RoleGuard } from '@/features/auth/role-guard';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';

type DiningTable = {
  id: string;
  number: number;
  capacity: number;
  status: 'FREE' | 'OCCUPIED' | 'BILL_REQUESTED';
};
type OrderItem = { id: string; name: string; quantity: number; status: string; notes: string | null };
type OpenOrder = {
  id: string;
  orderNumber: number;
  status: string;
  total: string;
  table: { id: string; number: number } | null;
  items: OrderItem[];
};
type MenuChoice = { id: string; name: string; price: string; isAvailable: boolean };

export function WaiterFloor() {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [menuItems, setMenuItems] = useState<MenuChoice[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY'>('DINE_IN');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ orderId: string; itemId: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const loadFloor = useCallback(async () => {
    try {
      const [tableData, orderData, menuData] = await Promise.all([
        apiFetch<DiningTable[]>('/tables'),
        apiFetch<OpenOrder[]>('/orders/open'),
        apiFetch<Array<{ menuItems: MenuChoice[] }>>('/menu'),
      ]);
      setTables(tableData);
      setOrders(orderData);
      setMenuItems(menuData.flatMap((category) => category.menuItems));
      setSelectedTableId((current) => current ?? tableData[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load floor status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFloor();
    const socket = getSocket();
    const joinWaiters = () => {
      socket.emit('join-room', 'waiters', (result: { joined: boolean }) => {
        if (!result.joined) setError('Waiter live updates are unavailable. Check your staff login.');
      });
      void loadFloor();
    };
    const onUpdate = (event: { tableId?: string }) => {
      setNotice(event.tableId ? 'A table needs your attention.' : 'A new floor update arrived.');
      void loadFloor();
    };
    socket.on('connect', joinWaiters);
    socket.on('order:new', onUpdate);
    socket.on('waiter:called', onUpdate);
    socket.on('bill:requested', onUpdate);
    socket.on('order:status_changed', onUpdate);
    socket.on('item:status_changed', onUpdate);
    socket.on('menu:availability_changed', onUpdate);
    if (socket.connected) joinWaiters();
    return () => {
      socket.emit('leave-room', 'waiters');
      socket.off('connect', joinWaiters);
      socket.off('order:new', onUpdate);
      socket.off('waiter:called', onUpdate);
      socket.off('bill:requested', onUpdate);
      socket.off('order:status_changed', onUpdate);
      socket.off('item:status_changed', onUpdate);
      socket.off('menu:availability_changed', onUpdate);
    };
  }, [loadFloor]);

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const tableOrders = useMemo(() => orders.filter((order) => order.table?.id === selectedTableId), [orders, selectedTableId]);
  const walkInOrders = orders.filter((order) => order.table === null);
  const freeCount = tables.filter((table) => table.status === 'FREE').length;

  const openComposer = (orderId?: string) => {
    setEditingOrderId(orderId ?? null);
    setOrderType('DINE_IN');
    setQuantities({});
    setComposerOpen(true);
  };

  const saveOrder = async () => {
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity, addonIds: [] as string[] }));
    if (items.length === 0) {
      setError('Choose at least one available menu item.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingOrderId) {
        await apiFetch(`/orders/${editingOrderId}/items`, { method: 'POST', body: JSON.stringify({ items }) });
      } else {
        await apiFetch('/orders/staff', {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            type: orderType,
            tableId: orderType === 'DINE_IN' ? selectedTable?.id : undefined,
            items,
          }),
        });
      }
      setComposerOpen(false);
      setQuantities({});
      await loadFloor();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save order.');
    } finally {
      setSaving(false);
    }
  };

  const markServed = async (orderId: string) => {
    try {
      await apiFetch(`/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SERVED' }) });
      await loadFloor();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark order served.');
    }
  };

  const openCancel = (orderId: string) => { setReason(''); setCancelOrderId(orderId); };
  const openVoid = (orderId: string, itemId: string, label: string) => { setReason(''); setVoidTarget({ orderId, itemId, label }); };

  const confirmCancel = async () => {
    if (!cancelOrderId) return;
    if (reason.trim().length < 3) { setError('Please give a reason of at least 3 characters to cancel.'); return; }
    setActionSaving(true);
    try {
      await apiFetch(`/orders/${cancelOrderId}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: reason.trim() }) });
      setCancelOrderId(null); setReason(''); setError(null);
      await loadFloor();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel the order.');
    } finally { setActionSaving(false); }
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (reason.trim().length < 3) { setError('Please give a reason of at least 3 characters to remove the item.'); return; }
    setActionSaving(true);
    try {
      await apiFetch(`/orders/${voidTarget.orderId}/items/${voidTarget.itemId}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: reason.trim() }) });
      setVoidTarget(null); setReason(''); setError(null);
      await loadFloor();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the item.');
    } finally { setActionSaving(false); }
  };

  const setTableStatus = async (table: DiningTable, status: DiningTable['status']) => {
    try {
      await apiFetch(`/tables/${table.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadFloor();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update table.');
    }
  };

  const orderCard = (order: OpenOrder) => (
    <article key={order.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--ink)]">Order #{order.orderNumber}</h3>
        <StatusBadge label={order.status} tone={order.status === 'READY' || order.status === 'SERVED' ? 'ready' : order.status === 'PREPARING' ? 'preparing' : 'new'} />
      </div>
      <ul className="mt-3 space-y-2">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 text-sm text-[var(--ink)]">
            <span>{item.quantity} × {item.name}{item.notes ? <span className="block text-xs text-[var(--ink-muted)]">Note: {item.notes}</span> : null}</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-[var(--ink-muted)]">{item.status}</span>
              {item.status === 'PENDING' ? (
                <button onClick={() => openVoid(order.id, item.id, item.name)} className="min-h-9 rounded-lg border border-[var(--line)] px-2 text-xs font-semibold text-[var(--st-late)]">Remove</button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3"><span className="text-sm text-[var(--ink-muted)]">Total</span><Price value={order.total} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => openComposer(order.id)} className="min-h-11 rounded-lg border border-[var(--line)] font-semibold text-[var(--ink)]">Add items</button>
        {order.status === 'READY' ? <button onClick={() => void markServed(order.id)} className="min-h-11 rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)]">Mark served</button> : null}
        <button onClick={() => openCancel(order.id)} className="col-span-2 min-h-11 rounded-lg border border-[var(--st-late)]/40 font-semibold text-[var(--st-late)]">Cancel order</button>
      </div>
    </article>
  );

  return (
    <RoleGuard allowedRoles={['WAITER', 'MANAGER', 'ADMIN']}>
      <AppShell title="Waiter POS" variant="staff">
        <div className="space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><div><p className="text-sm font-semibold text-[var(--brand)]">Floor operations</p><h1 className="font-display text-3xl font-bold text-[var(--ink)]">Table map</h1></div><div className="flex items-center gap-3"><LiveIndicator label="Floor" /><p className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink-muted)]"><span className="font-semibold text-[var(--ink)]">Free tables:</span> {freeCount}</p><button onClick={() => openComposer()} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 font-semibold text-[var(--brand-ink)]">New order</button></div></header>
          {notice ? <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-[var(--st-preparing)]/30 bg-[var(--st-preparing)]/10 p-3 text-sm font-semibold text-[var(--ink)]"><span>{notice}</span><button onClick={() => setNotice(null)} className="min-h-10 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3">Dismiss</button></div> : null}
          {error ? <ErrorState title="Floor operations need attention" description={error} actionLabel="Retry" onAction={() => { setLoading(true); void loadFloor(); }} /> : null}
          {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl bg-[var(--line)]" />)}</div> : tables.length === 0 ? <EmptyState title="No tables configured" description="An administrator needs to add tables before dine-in floor service can begin." /> : <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
            <section aria-label="Dining tables" className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">{tables.map((table) => <button key={table.id} onClick={() => setSelectedTableId(table.id)} className={`min-h-36 rounded-xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)] ${selectedTableId === table.id ? 'border-[var(--brand)] bg-[var(--brand)]/5' : 'border-[var(--line)] bg-[var(--surface)]'}`}><div className="flex items-center justify-between gap-2"><span className="font-display text-2xl font-bold text-[var(--ink)]">Table {table.number}</span><StatusBadge label={table.status.replace('_', ' ')} tone={table.status === 'FREE' ? 'ready' : table.status === 'BILL_REQUESTED' ? 'late' : 'preparing'} /></div><p className="mt-3 text-sm text-[var(--ink-muted)]">Seats {table.capacity}</p><p className="mt-1 text-sm text-[var(--ink-muted)]">{orders.filter((order) => order.table?.id === table.id).length} open orders</p></button>)}</section>
            <aside className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">{selectedTable ? <><div className="flex items-center justify-between border-b border-[var(--line)] pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Selected table</p><h2 className="font-display text-2xl font-bold text-[var(--ink)]">Table {selectedTable.number}</h2></div><select aria-label="Table status" value={selectedTable.status} onChange={(event) => void setTableStatus(selectedTable, event.target.value as DiningTable['status'])} className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"><option value="FREE">Free</option><option value="OCCUPIED">Occupied</option><option value="BILL_REQUESTED">Bill requested</option></select></div><div className="mt-4 space-y-4">{tableOrders.length ? tableOrders.map(orderCard) : <EmptyState title="No open orders" description="Orders from this table appear here as soon as they are placed." />}</div></> : <EmptyState title="Select a table" description="Choose a table to view active orders and service actions." />}</aside>
          </div>}
          {walkInOrders.length ? <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><h2 className="font-display text-xl font-bold text-[var(--ink)]">Walk-in orders</h2><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{walkInOrders.map(orderCard)}</div></section> : null}
          {composerOpen ? <div role="dialog" aria-modal="true" aria-labelledby="order-composer-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-[20px] bg-[var(--surface)] p-5 sm:rounded-[20px]"><div className="flex items-center justify-between gap-3"><div><h2 id="order-composer-title" className="font-display text-2xl font-bold text-[var(--ink)]">{editingOrderId ? 'Add items to order' : 'Create order'}</h2><p className="text-sm text-[var(--ink-muted)]">Prices and tax are calculated by the server.</p></div><button onClick={() => setComposerOpen(false)} className="min-h-11 min-w-11 rounded-lg border border-[var(--line)] text-xl" aria-label="Close">×</button></div>{!editingOrderId ? <label className="mt-4 block text-sm font-semibold text-[var(--ink)]">Order type<select value={orderType} onChange={(event) => setOrderType(event.target.value as 'DINE_IN' | 'TAKEAWAY')} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3"><option value="DINE_IN">Dine in · {selectedTable ? `Table ${selectedTable.number}` : 'select a table first'}</option><option value="TAKEAWAY">Walk-in / takeaway</option></select></label> : null}<div className="mt-4 space-y-2">{menuItems.filter((item) => item.isAvailable).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3"><div><p className="font-semibold text-[var(--ink)]">{item.name}</p><Price value={item.price} /></div><QuantityStepper value={quantities[item.id] ?? 0} onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} label={`Quantity of ${item.name}`} /></div>)}</div><button onClick={() => void saveOrder()} disabled={saving || (!editingOrderId && orderType === 'DINE_IN' && !selectedTable)} className="mt-4 min-h-12 w-full rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)] disabled:opacity-50">{saving ? 'Saving order…' : editingOrderId ? 'Add selected items' : 'Create order'}</button></section></div> : null}
        </div>

        {cancelOrderId || voidTarget ? (
          <div role="dialog" aria-modal="true" aria-labelledby="reason-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
            <section className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-5 sm:rounded-[20px]">
              <h2 id="reason-title" className="font-display text-xl font-bold text-[var(--ink)]">
                {voidTarget ? `Remove ${voidTarget.label}?` : 'Cancel this order?'}
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {voidTarget
                  ? 'The item is returned to stock and the bill is recalculated. This cannot be undone.'
                  : 'The order is cancelled and any unused stock is returned. This cannot be undone.'}
              </p>
              <label className="mt-4 block text-sm font-semibold text-[var(--ink)]">
                Reason
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="For example: guest changed their mind"
                  className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 font-normal outline-none focus:border-[var(--brand)]"
                />
              </label>
              <div className="mt-4 flex gap-2">
                <button onClick={() => { setCancelOrderId(null); setVoidTarget(null); setReason(''); }} className="min-h-11 flex-1 rounded-lg border border-[var(--line)] font-semibold text-[var(--ink)]">Keep order</button>
                <button onClick={() => void (voidTarget ? confirmVoid() : confirmCancel())} disabled={actionSaving || reason.trim().length < 3} className="min-h-11 flex-1 rounded-lg bg-[var(--st-late)] font-semibold text-white disabled:opacity-50">
                  {actionSaving ? 'Working…' : voidTarget ? 'Remove item' : 'Cancel order'}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </AppShell>
    </RoleGuard>
  );
}

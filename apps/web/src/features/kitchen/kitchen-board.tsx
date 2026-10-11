'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { ElapsedTimer, EmptyState, ErrorState, LiveIndicator, StatusBadge } from '@/components/ui-kit';
import { RoleGuard } from '@/features/auth/role-guard';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';

type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY';
type KitchenOrder = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  createdAt: string;
  table: { number: number } | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    station: 'KITCHEN' | 'BAR' | 'COUNTER';
    notes: string | null;
    status: string;
  }>;
};

const stages: Array<{ status: OrderStatus; label: string }> = [
  { status: 'RECEIVED', label: 'New' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'READY', label: 'Ready' },
];
const stations = ['ALL', 'KITCHEN', 'BAR', 'COUNTER'] as const;

export function KitchenBoard() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [station, setStation] = useState<(typeof stations)[number]>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionOrder, setActionOrder] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundContext = useRef<AudioContext | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await apiFetch<KitchenOrder[]>('/orders/kitchen');
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load kitchen orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  const playNewOrderAlert = useCallback(() => {
    const context = soundContext.current;
    if (!context || context.state !== 'running') return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  }, []);

  useEffect(() => {
    void loadOrders();
    const socket = getSocket();
    const joinKitchen = () => {
      socket.emit('join-room', 'kitchen', (result: { joined: boolean }) => {
        if (!result.joined) setError('Kitchen updates require a staff login with kitchen access.');
      });
      void loadOrders();
    };
    const onNewOrder = () => {
      playNewOrderAlert();
      void loadOrders();
    };
    const onStatusChanged = (payload?: { orderId?: string; status?: string }) => {
      if (payload?.status === 'CANCELLED') {
        setNotice('An order was cancelled and removed from the board.');
      }
      void loadOrders();
    };
    socket.on('connect', joinKitchen);
    socket.on('order:new', onNewOrder);
    socket.on('order:status_changed', onStatusChanged);
    socket.on('item:status_changed', loadOrders);
    if (socket.connected) joinKitchen();
    return () => {
      socket.emit('leave-room', 'kitchen');
      socket.off('connect', joinKitchen);
      socket.off('order:new', onNewOrder);
      socket.off('order:status_changed', onStatusChanged);
      socket.off('item:status_changed', loadOrders);
    };
  }, [loadOrders, playNewOrderAlert]);

  const toggleSound = async () => {
    try {
      if (!soundContext.current) soundContext.current = new AudioContext();
      if (soundEnabled) {
        await soundContext.current.suspend();
        setSoundEnabled(false);
      } else {
        await soundContext.current.resume();
        setSoundEnabled(soundContext.current.state === 'running');
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kitchen sound alerts are unavailable in this browser.');
    }
  };

  const visibleOrders = useMemo(() => orders.map((order) => ({
    ...order,
    items: order.items.filter((item) => station === 'ALL' || item.station === station),
  })).filter((order) => order.items.length > 0), [orders, station]);

  const setStatus = async (order: KitchenOrder, status: 'PREPARING' | 'READY') => {
    setActionOrder(order.id);
    setError(null);
    try {
      await apiFetch(`/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update order status.');
    } finally {
      setActionOrder(null);
    }
  };

  return (
    <RoleGuard allowedRoles={['CHEF', 'MANAGER', 'ADMIN']}>
      <AppShell title="Kitchen display" variant="staff">
        <div data-theme="kds" className="min-h-[calc(100vh-8rem)] rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4 text-[var(--ink)] sm:p-6">
          <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div><p className="text-sm font-semibold text-[var(--st-preparing)]">Kitchen display</p><h1 className="font-display text-3xl font-bold">Active orders</h1><p className="mt-1 text-sm text-[var(--ink-muted)]">Keep this board open for live order updates.</p></div>
            <div className="flex flex-wrap gap-2">
              <LiveIndicator label="Kitchen" />
              <button onClick={() => void toggleSound()} className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)]">{soundEnabled ? 'Sound on' : 'Enable sound'}</button>
              <nav aria-label="Filter station" className="flex flex-wrap gap-2">{stations.map((option) => <button key={option} onClick={() => setStation(option)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${station === option ? 'bg-[var(--brand)] text-[var(--brand-ink)]' : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}>{option === 'ALL' ? 'All stations' : option}</button>)}</nav>
            </div>
          </header>
          {error ? <div className="mt-4"><ErrorState title="Kitchen orders could not be updated" description={error} actionLabel="Retry" onAction={() => { setLoading(true); void loadOrders(); }} /></div> : null}
          {notice ? <div role="status" className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--st-late)]/30 bg-[var(--st-late)]/10 p-3 text-sm font-semibold"><span>{notice}</span><button onClick={() => setNotice(null)} className="min-h-10 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3">Dismiss</button></div> : null}
          {loading ? <div className="mt-5 grid gap-4 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-72 animate-pulse rounded-xl bg-[var(--kds-surface)]" />)}</div> : (
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {stages.map((stage) => {
                const stageOrders = visibleOrders.filter((order) => order.status === stage.status);
                return <section key={stage.status} aria-labelledby={`stage-${stage.status}`} className="min-h-64 rounded-xl border border-[var(--line)] bg-[var(--kds-surface)] p-3">
                  <div className="mb-3 flex items-center justify-between"><h2 id={`stage-${stage.status}`} className="font-display text-xl font-bold">{stage.label}</h2><StatusBadge label={`${stageOrders.length} orders`} tone={stage.status === 'RECEIVED' ? 'new' : stage.status === 'PREPARING' ? 'preparing' : 'ready'} /></div>
                  {stageOrders.length === 0 ? <EmptyState title={`No ${stage.label.toLowerCase()} orders`} description="New orders will appear here automatically." /> : <div className="space-y-3">{stageOrders.map((order) => <article key={order.id} className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4">
                    <div className="flex items-start justify-between gap-3"><div><p className="tabular-nums font-display text-5xl font-bold leading-none">{order.orderNumber}</p><p className="mt-2 text-lg font-semibold">{order.table ? `Table ${order.table.number}` : 'Walk-in'}</p></div><div className="text-right"><p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Elapsed</p><ElapsedTimer startedAt={order.createdAt} /></div></div>
                    <ul className="mt-4 space-y-2">{order.items.map((item) => <li key={item.id} className="border-t border-[var(--line)] pt-2"><div className="flex justify-between gap-2 text-lg font-semibold"><span>{item.quantity} × {item.name}</span><span className="text-sm text-[var(--ink-muted)]">{item.station}</span></div>{item.notes ? <p className="mt-1 rounded bg-[var(--accent)]/15 p-2 text-sm font-semibold">Note: {item.notes}</p> : null}</li>)}</ul>
                    {stage.status !== 'READY' ? <button disabled={actionOrder === order.id} onClick={() => void setStatus(order, stage.status === 'RECEIVED' ? 'PREPARING' : 'READY')} className="mt-4 min-h-16 w-full rounded-lg bg-[var(--brand)] px-4 text-lg font-bold text-[var(--brand-ink)] disabled:opacity-60">{actionOrder === order.id ? 'Updating…' : stage.status === 'RECEIVED' ? 'Start preparing' : 'Mark ready'}</button> : null}
                  </article>)}</div>}
                </section>;
              })}
            </div>
          )}
        </div>
      </AppShell>
    </RoleGuard>
  );
}

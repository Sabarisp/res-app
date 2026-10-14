'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, Price, QuantityStepper } from '@/components/ui-kit';
import { TableOrders } from '@/features/menu/table-orders';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { formatPaise, paiseFromMoney } from '@/lib/formatMoney';
import { useCartStore, type CartLine } from '@/store/cart-store';

type Addon = { id: string; name: string; price: string };
type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  isVeg: boolean;
  isAvailable: boolean;
  imageUrl: string | null;
  taxPercent: string;
  prepTimeMin: number;
  addons: Addon[];
};
type MenuCategory = { id: string; name: string; menuItems: MenuItem[] };
type DiningTable = { id: string; number: number; status: string };
const EMPTY_CART: CartLine[] = [];

const toPaise = (value: string) => paiseFromMoney(value);
const fromPaise = (paise: number) => formatPaise(paise);

export function CustomerMenu({ qrToken }: { qrToken: string }) {
  const router = useRouter();
  const setActiveToken = useCartStore((state) => state.setActiveToken);
  const addItem = useCartStore((state) => state.addItem);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const setNotes = useCartStore((state) => state.setNotes);
  const clearCart = useCartStore((state) => state.clearCart);
  const cart = useCartStore((state) => state.cartByToken[qrToken] ?? EMPTY_CART);
  const [table, setTable] = useState<DiningTable | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [diet, setDiet] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [itemNotes, setItemNotes] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setActiveToken(qrToken);
  }, [qrToken, setActiveToken]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setTable(null);
      setCategories([]);
      setError(null);
      setErrorCode(null);
      const resolvedTable = await apiFetch<DiningTable>(`/tables/by-token/${encodeURIComponent(qrToken)}`);
      setTable(resolvedTable);
      const menu = await apiFetch<MenuCategory[]>('/menu');
      setCategories(menu);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this table menu.');
      setErrorCode(err instanceof Error && 'code' in err ? String((err as { code?: unknown }).code ?? '') || null : null);
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Live availability (B-12): refetch the menu when staff toggle an item.
  useEffect(() => {
    const socket = getSocket();
    const onAvailabilityChanged = () => {
      apiFetch<MenuCategory[]>('/menu').then(setCategories).catch(() => undefined);
    };
    socket.on('menu:availability_changed', onAvailabilityChanged);
    return () => {
      socket.off('menu:availability_changed', onAvailabilityChanged);
    };
  }, []);

  const items = useMemo(() => categories.flatMap((category) =>
    category.menuItems.map((item) => ({ ...item, categoryName: category.name })),
  ), [categories]);
  const categoryNames = useMemo(() => ['All', ...categories.map((category) => category.name)], [categories]);
  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.categoryName === activeCategory;
    const searchText = `${item.name} ${item.description ?? ''}`.toLowerCase();
    const matchesSearch = searchText.includes(search.trim().toLowerCase());
    const matchesDiet = diet === 'ALL' || (diet === 'VEG' ? item.isVeg : !item.isVeg);
    return matchesCategory && matchesSearch && matchesDiet;
  }), [activeCategory, diet, items, search]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const cartEntries = useMemo(() => cart.map((line) => {
    const item = itemById.get(line.menuItemId);
    if (!item) return null;
    const addons = item.addons.filter((addon) => line.addonIds.includes(addon.id));
    let unitPaise = 0;
    try {
      unitPaise = toPaise(item.price) + addons.reduce((sum, addon) => sum + toPaise(addon.price), 0);
    } catch {
      unitPaise = 0;
    }
    return { line, item, addons, unitPaise };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null), [cart, itemById]);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalPaise = cartEntries.reduce((sum, entry) => sum + entry.unitPaise * entry.line.quantity, 0);

  const addConfiguredItem = (item: MenuItem, addonIds: string[], notes: string) => {
    const line = { menuItemId: item.id, addonIds: [...addonIds].sort(), notes };
    addItem(line);
    setNotes(item.id, line.addonIds, notes);
    setSelectedItem(null);
  };

  const openCustomizer = (item: MenuItem) => {
    setSelectedItem(item);
    setSelectedAddons([]);
    setItemNotes('');
  };

  const placeOrder = async () => {
    if (!table || cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyStorageKey = `tavola-order-key:${qrToken}`;
      const idempotencyKey = window.sessionStorage.getItem(idempotencyStorageKey) ?? crypto.randomUUID();
      window.sessionStorage.setItem(idempotencyStorageKey, idempotencyKey);
      const order = await apiFetch<{ id: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          qrToken,
          idempotencyKey,
          items: cart.map((line: CartLine) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            addonIds: line.addonIds,
            notes: line.notes || undefined,
          })),
        }),
      });
      window.sessionStorage.removeItem(idempotencyStorageKey);
      clearCart(qrToken);
      router.push(`/order/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place your order.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <AppShell title="Menu" variant="customer"><div className="space-y-4"><div className="h-8 w-40 animate-pulse rounded-xl bg-[var(--line)]" /><div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl bg-[var(--line)]" />)}</div></div></AppShell>;
  }

  if (error && !table) {
    const invalidLink = errorCode === 'TABLE_NOT_FOUND' || errorCode === 'INVALID_QR_TOKEN';
    const rateLimited = errorCode === 'TOO_MANY_REQUESTS';
    if (rateLimited) {
      return <AppShell title="Table menu" variant="customer"><ErrorState title="The system is busy" description="We are handling a lot of requests right now. Wait a minute, then tap Try again." actionLabel="Try again" onAction={() => void loadData()} /></AppShell>;
    }
    return <AppShell title="Table menu" variant="customer"><ErrorState title={invalidLink ? 'This table link is unavailable' : 'Unable to verify this table'} description={invalidLink ? 'This QR code does not match an active table. Check the QR code or ask staff for a valid table link.' : 'The restaurant could not verify this QR link right now. Check your connection and try again.'} actionLabel="Try again" onAction={() => void loadData()} /></AppShell>;
  }

  if (error && table && categories.length === 0) {
    if (errorCode === 'TOO_MANY_REQUESTS') {
      return <AppShell title="Table menu" variant="customer"><ErrorState title="The system is busy" description="We are handling a lot of requests right now. Wait a minute, then tap Try again." actionLabel="Try again" onAction={() => void loadData()} /></AppShell>;
    }
    return <AppShell title="Table menu" variant="customer"><ErrorState title="The menu could not load" description="Your table link is valid, but the menu did not load. Check your connection and try again." actionLabel="Try again" onAction={() => void loadData()} /></AppShell>;
  }

  return (
    <AppShell title="Menu" variant="customer">
      <div className="space-y-5 pb-24">
        <header className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-sm font-semibold text-[var(--brand)]">Tavola menu</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-[var(--ink)]">Table {table?.number}</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Choose your dishes. We’ll confirm the final bill when you place the order.</p>
          <button onClick={() => setOrdersOpen(true)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] hover:border-[var(--brand)]">Your orders</button>
        </header>

        {error ? <p role="alert" className="rounded-lg border border-[var(--st-late)]/30 bg-[var(--surface)] p-3 text-sm text-[var(--st-late)]">{error}</p> : null}

        <label className="block">
          <span className="sr-only">Search menu</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes" className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[var(--ink)] outline-none focus:border-[var(--brand)]" />
        </label>

        <div className="sticky top-14 z-20 -mx-4 overflow-x-auto border-y border-[var(--line)] bg-[var(--bg)] px-4 py-2 sm:mx-0 sm:rounded-xl sm:border">
          <nav aria-label="Menu categories" className="flex min-w-max gap-2">
            {categoryNames.map((name) => <button key={name} onClick={() => setActiveCategory(name)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${activeCategory === name ? 'bg-[var(--brand)] text-[var(--brand-ink)]' : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}>{name}</button>)}
          </nav>
        </div>

        <div className="flex gap-2">
          {(['ALL', 'VEG', 'NON_VEG'] as const).map((value) => <button key={value} onClick={() => setDiet(value)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${diet === value ? 'bg-[var(--brand)] text-[var(--brand-ink)]' : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}>{value === 'ALL' ? 'All dishes' : value === 'VEG' ? 'Vegetarian' : 'Non-vegetarian'}</button>)}
        </div>

        {filteredItems.length === 0 ? <EmptyState title="No matching dishes" description="Try another category or clear your search to see more of the menu." action={<button onClick={() => { setSearch(''); setActiveCategory('All'); setDiet('ALL'); }} className="min-h-11 rounded-lg border border-[var(--line)] px-4 font-semibold text-[var(--ink)]">Show all dishes</button>} /> : (
          <div className="grid gap-3">
            {filteredItems.map((item) => {
              const quantity = cart.filter((line) => line.menuItemId === item.id).reduce((sum, line) => sum + line.quantity, 0);
              return (
                <article key={item.id} className={`flex gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 ${item.isAvailable ? '' : 'opacity-60'}`}>
                  <div className="relative order-2 h-24 w-24 shrink-0 self-start overflow-hidden rounded-lg bg-[var(--line)]">
                    {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} fill unoptimized sizes="96px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center font-display text-3xl font-bold text-[var(--ink-muted)]">{item.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div><h2 className="font-display text-lg font-bold leading-tight text-[var(--ink)]">{item.name}</h2><p className="mt-1 line-clamp-1 text-sm text-[var(--ink-muted)]">{item.description || item.categoryName}</p></div>
                      <span aria-label={item.isVeg ? 'Vegetarian' : 'Non-vegetarian'} className="shrink-0 rounded border border-[var(--line)] px-1.5 py-0.5 text-xs font-semibold text-[var(--ink-muted)]">{item.isVeg ? 'Veg' : 'Non-veg'}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Price value={item.price} className="text-[var(--ink)]" />
                      {!item.isAvailable ? <span className="text-sm font-semibold text-[var(--ink-muted)]">Unavailable</span> : quantity > 0 && item.addons.length === 0 ? <QuantityStepper value={quantity} onChange={(value) => setQuantity(item.id, value)} label={`Quantity of ${item.name}`} /> : <button onClick={() => openCustomizer(item)} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-ink)]">{quantity ? `Added (${quantity})` : 'Add'}</button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {itemCount > 0 ? <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--surface)] p-3 shadow-lg"><button onClick={() => setCartOpen(true)} className="mx-auto flex min-h-12 w-full max-w-3xl items-center justify-between rounded-lg bg-[var(--brand)] px-4 font-semibold text-[var(--brand-ink)]"><span>{itemCount} {itemCount === 1 ? 'item' : 'items'} · View order</span><Price value={fromPaise(subtotalPaise)} /></button></div> : null}

      {selectedItem ? <div role="dialog" aria-modal="true" aria-labelledby="customizer-title" className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"><div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[20px] bg-[var(--surface)] p-5 sm:rounded-[20px]"><div className="flex items-start justify-between gap-3"><div><h2 id="customizer-title" className="font-display text-2xl font-bold text-[var(--ink)]">{selectedItem.name}</h2><p className="text-sm text-[var(--ink-muted)]">Choose add-ons and leave a kitchen note.</p></div><button onClick={() => setSelectedItem(null)} aria-label="Close customizer" className="min-h-11 min-w-11 rounded-lg border border-[var(--line)] text-xl text-[var(--ink)]">×</button></div>
        {selectedItem.addons.length ? <fieldset className="mt-5 space-y-2"><legend className="mb-2 text-sm font-semibold text-[var(--ink)]">Add-ons</legend>{selectedItem.addons.map((addon) => <label key={addon.id} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-3"><span className="flex items-center gap-3 text-sm text-[var(--ink)]"><input type="checkbox" checked={selectedAddons.includes(addon.id)} onChange={(event) => setSelectedAddons((current) => event.target.checked ? [...current, addon.id] : current.filter((id) => id !== addon.id))} />{addon.name}</span><Price value={addon.price} /></label>)}</fieldset> : <p className="mt-5 text-sm text-[var(--ink-muted)]">No add-ons for this dish.</p>}
        <label className="mt-4 block text-sm font-semibold text-[var(--ink)]">Note for kitchen<textarea value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} maxLength={250} rows={3} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 font-normal outline-none focus:border-[var(--brand)]" placeholder="For example: no onions" /></label>
        <button onClick={() => addConfiguredItem(selectedItem, selectedAddons, itemNotes)} className="mt-4 min-h-12 w-full rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)]">Add to order</button>
      </div></div> : null}

      {cartOpen ? <div role="dialog" aria-modal="true" aria-labelledby="cart-title" className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"><div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-[20px] bg-[var(--surface)] p-5 sm:rounded-[20px]"><div className="flex items-center justify-between"><h2 id="cart-title" className="font-display text-2xl font-bold text-[var(--ink)]">Your order</h2><button onClick={() => setCartOpen(false)} className="min-h-11 min-w-11 rounded-lg border border-[var(--line)] text-xl text-[var(--ink)]" aria-label="Close cart">×</button></div>
        <div className="mt-4 space-y-3">{cartEntries.map(({ line, item, addons, unitPaise }) => <div key={`${line.menuItemId}:${line.addonIds.join(',')}`} className="rounded-lg border border-[var(--line)] p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-[var(--ink)]">{item.name}</p><p className="text-sm text-[var(--ink-muted)]">{addons.length ? addons.map((addon) => addon.name).join(', ') : 'No add-ons'}</p></div><Price value={fromPaise(unitPaise * line.quantity)} /></div><label className="mt-2 block text-xs font-medium text-[var(--ink-muted)]">Kitchen note<input value={line.notes} onChange={(event) => setNotes(line.menuItemId, line.addonIds, event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]" /></label><div className="mt-2 flex items-center justify-between"><span className="text-sm text-[var(--ink-muted)]">Quantity</span><QuantityStepper value={line.quantity} onChange={(value) => setQuantity(line.menuItemId, value, line.addonIds)} label={`Quantity of ${item.name}`} /></div></div>)}</div>
        <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-4 font-semibold text-[var(--ink)]"><span>Estimated subtotal</span><Price value={fromPaise(subtotalPaise)} /></div><p className="mt-1 text-xs text-[var(--ink-muted)]">Final tax and total are calculated by the restaurant server.</p>
        <button onClick={() => void placeOrder()} disabled={submitting || !cart.length} className="mt-4 min-h-12 w-full rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)] disabled:opacity-60">{submitting ? 'Placing order…' : 'Place order'}</button><button onClick={() => setCartOpen(false)} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] font-semibold text-[var(--ink)]">Continue browsing</button>
      </div></div> : null}
      {ordersOpen ? <TableOrders qrToken={qrToken} onClose={() => setOrdersOpen(false)} /> : null}
      <Link href="/" className="sr-only">Back home</Link>
    </AppShell>
  );
}

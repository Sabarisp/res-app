'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { EmptyState, PageHeader, Price, StatusBadge } from '@/components/ui-kit';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  isVeg: boolean;
  station: 'KITCHEN' | 'BAR' | 'COUNTER';
  taxPercent: string;
  prepTimeMin: number;
  isAvailable: boolean;
  imageUrl: string | null;
  categoryId: string;
  category?: { id: string; name: string } | null;
  addons: Array<{ id: string; name: string; price: string }>;
};

type MenuForm = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  station: 'KITCHEN' | 'BAR' | 'COUNTER';
  taxPercent: string;
  prepTimeMin: string;
  isVeg: boolean;
  imageUrl: string;
};

const emptyForm: MenuForm = {
  name: '',
  description: '',
  categoryId: '',
  price: '0',
  station: 'KITCHEN',
  taxPercent: '5',
  prepTimeMin: '15',
  isVeg: true,
  imageUrl: '',
};

export default function AdminMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [categoryName, setCategoryName] = useState('');
  const [addonName, setAddonName] = useState('');
  const [addonPrice, setAddonPrice] = useState('0');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [menu, categoryList] = await Promise.all([
        apiFetch<MenuItem[]>('/menu/admin'),
        apiFetch<Array<{ id: string; name: string }>>('/menu/categories'),
      ]);
      setItems(menu);
      setCategories(categoryList);
      setForm((current) => ({ ...current, categoryId: current.categoryId || categoryList[0]?.id || '' }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load menu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Live availability (B-12): another admin/waiter toggle keeps this list current.
  useEffect(() => {
    const socket = getSocket();
    const onAvailabilityChanged = () => { void loadData(); };
    socket.on('menu:availability_changed', onAvailabilityChanged);
    return () => {
      socket.off('menu:availability_changed', onAvailabilityChanged);
    };
  }, [loadData]);

  const handleSave = async () => {
    try {
      if (!form.name.trim() || !form.categoryId) {
        throw new Error('Please enter a menu item name and choose a category.');
      }

      await apiFetch(editingId ? `/menu/${editingId}` : '/menu', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...form,
          description: form.description || null,
          imageUrl: form.imageUrl || null,
          price: form.price,
          taxPercent: form.taxPercent,
          prepTimeMin: Number(form.prepTimeMin),
        }),
      });
      setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' });
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create menu item');
    }
  };

  const filteredItems = useMemo(() => items.filter((item) => (
    (filterCategory === 'ALL' || item.categoryId === filterCategory)
    && `${item.name} ${item.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [filterCategory, items, search]);

  const createCategory = async () => {
    try {
      await apiFetch('/menu/categories', {
        method: 'POST',
        body: JSON.stringify({ name: categoryName, sortOrder: categories.length }),
      });
      setCategoryName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create category');
    }
  };

  const editCategory = async (category: { id: string; name: string }) => {
    const name = window.prompt('Category name', category.name);
    if (!name?.trim()) return;
    try {
      await apiFetch(`/menu/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename category');
    }
  };

  const deleteCategory = async (category: { id: string; name: string }) => {
    if (!window.confirm(`Delete ${category.name}? Categories with menu items cannot be removed.`)) return;
    try {
      await apiFetch(`/menu/categories/${category.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete category');
    }
  };

  const startEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? '',
      categoryId: item.categoryId,
      price: item.price,
      station: item.station,
      taxPercent: item.taxPercent,
      prepTimeMin: String(item.prepTimeMin),
      isVeg: item.isVeg,
      imageUrl: item.imageUrl ?? '',
    });
  };

  const deleteItem = async (item: MenuItem) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      await apiFetch(`/menu/${item.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete menu item');
    }
  };

  const addAddon = async (item: MenuItem) => {
    try {
      await apiFetch(`/menu/${item.id}/addons`, {
        method: 'POST',
        body: JSON.stringify({ name: addonName, price: addonPrice }),
      });
      setAddonName('');
      setAddonPrice('0');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add add-on');
    }
  };

  const deleteAddon = async (addonId: string) => {
    try {
      await apiFetch(`/menu/addons/${addonId}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove add-on');
    }
  };

  const handleToggle = async (id: string, isAvailable: boolean) => {
    try {
      await apiFetch(`/menu/${id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !isAvailable }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update availability');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Menu"
        title="Menu management"
        description="Review items, update availability and keep the digital menu aligned with the kitchen."
        action={
          <Link href="/admin" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-ink)] shadow-sm transition hover:opacity-90">
            Back to dashboard
          </Link>
        }
      />

      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Item name" className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]" />
          <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description" className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]" />
          <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]">
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="Price" className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]" />
          <select value={form.station} onChange={(event) => setForm({ ...form, station: event.target.value as 'KITCHEN' | 'BAR' | 'COUNTER' })} className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]">
            <option value="KITCHEN">Kitchen</option>
            <option value="BAR">Bar</option>
            <option value="COUNTER">Counter</option>
          </select>
          <input type="number" min="0" max="100" step="0.01" value={form.taxPercent} onChange={(event) => setForm({ ...form, taxPercent: event.target.value })} placeholder="Tax percent" className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]" />
          <input type="number" min="1" value={form.prepTimeMin} onChange={(event) => setForm({ ...form, prepTimeMin: event.target.value })} placeholder="Prep time (min)" className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]" />
          <input value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="Image URL (optional)" className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]" />
          <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--ink)]"><input type="checkbox" checked={form.isVeg} onChange={(event) => setForm({ ...form, isVeg: event.target.checked })} />Vegetarian</label>
          <button onClick={() => void handleSave()} className="min-h-[44px] rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-ink)]">{editingId ? 'Save item' : 'Add item'}</button>
          {editingId ? <button onClick={() => { setEditingId(null); setForm(emptyForm); }} className="min-h-[44px] rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)]">Cancel</button> : null}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto]">
        <label className="text-sm font-semibold text-[var(--ink)]">Add category<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 font-normal" /></label>
        <button onClick={() => void createCategory()} disabled={!categoryName.trim()} className="mt-auto min-h-11 rounded-lg border border-[var(--line)] px-4 font-semibold text-[var(--ink)] disabled:opacity-50">Add category</button>
        <div className="flex flex-wrap gap-2 sm:col-span-2">{categories.map((category) => <span key={category.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-sm text-[var(--ink)]">{category.name}<button onClick={() => void editCategory(category)} aria-label={`Rename ${category.name}`} className="min-h-8 px-2 font-semibold">Edit</button><button onClick={() => void deleteCategory(category)} aria-label={`Delete ${category.name}`} className="min-h-8 px-2 font-semibold text-[var(--st-late)]">×</button></span>)}</div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input aria-label="Search menu items" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu items" className="min-h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]" />
        <select aria-label="Filter by category" value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)} className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"><option value="ALL">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--ink-muted)]">Loading menu…</div>
      ) : error ? (
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--st-late)]">{error}</div>
      ) : filteredItems.length === 0 ? (
        <EmptyState title="No menu items yet" description="Create the first item to make this menu available to customers." />
      ) : (
        <div className="grid gap-4">
          {filteredItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-xl font-bold text-[var(--ink)]">{item.name}</h3>
                  <StatusBadge label={item.isAvailable ? 'Available' : 'Hidden'} tone={item.isAvailable ? 'ready' : 'neutral'} />
                </div>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{item.description || 'No description provided.'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-[var(--ink-muted)]">
                  <span>{item.category?.name ?? 'Unassigned'}</span>
                  <span>{item.station}</span>
                  <span>{item.isVeg ? 'Veg' : 'Non-veg'}</span>
                  <span>{item.taxPercent}% GST</span>
                  <span>{item.prepTimeMin} min</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Price value={item.price} className="text-lg" />
                <button onClick={() => void handleToggle(item.id, item.isAvailable)} className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-medium text-[var(--ink)]">
                  {item.isAvailable ? 'Hide' : 'Show'}
                </button>
                <button onClick={() => startEdit(item)} className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-medium text-[var(--ink)]">Edit</button>
                <button onClick={() => void deleteItem(item)} className="min-h-[44px] rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--st-late)]">Delete</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                {item.addons.map((addon) => <span key={addon.id} className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-[var(--ink)]">{addon.name} <Price value={addon.price} /><button aria-label={`Remove ${addon.name}`} onClick={() => void deleteAddon(addon.id)} className="font-bold text-[var(--st-late)]">×</button></span>)}
                <input value={addonName} onChange={(event) => setAddonName(event.target.value)} placeholder="Add-on name" className="min-h-10 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" />
                <input type="number" min="0" step="0.01" value={addonPrice} onChange={(event) => setAddonPrice(event.target.value)} aria-label="Add-on price" className="min-h-10 w-24 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" />
                <button onClick={() => void addAddon(item)} disabled={!addonName.trim()} className="min-h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[var(--ink)] disabled:opacity-50">Add option</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

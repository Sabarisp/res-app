'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Package2, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react';

import type { StockMovementDto } from '@restaurant/shared';

import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, LiveIndicator } from '@/components/ui-kit';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useApiError } from '@/lib/useApiError';

// Schema truth (apps/api/prisma/schema.prisma): stockQty, reorderLevel, qtyUsed.
// Backend serializes IngredientDto {stockQty,reorderLevel} and
// RecipeItemDto {ingredientId,ingredientName,unit,qtyUsed,stockQty,reorderLevel}.
type Ingredient = {
  id: string;
  name: string;
  unit: string;
  stockQty: string;
  reorderLevel: string;
};

type RecipeEntry = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  qtyUsed: string;
  stockQty: string;
  reorderLevel: string;
};

type MenuItem = {
  id: string;
  name: string;
  category?: { name: string };
  isAvailable: boolean;
};

type RecipeDraft = { ingredientId: string; qtyUsed: string };

const emptyIngredient = { name: '', unit: 'kg', stockQty: '0', reorderLevel: '0' };

const compareDecimal = (a: string, b: string): number => {
  const [aW = '0', aF = ''] = a.split('.');
  const [bW = '0', bF = ''] = b.split('.');
  const aP = BigInt(aW) * 100n + BigInt(aF.padEnd(2, '0').slice(0, 2) || '0');
  const bP = BigInt(bW) * 100n + BigInt(bF.padEnd(2, '0').slice(0, 2) || '0');
  return aP <= bP ? (aP < bP ? -1 : 0) : 1;
};

export default function AdminInventoryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [recipe, setRecipe] = useState<RecipeEntry[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [drafts, setDrafts] = useState<RecipeDraft[]>([]);
  const [form, setForm] = useState(emptyIngredient);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState<'PURCHASE' | 'WASTE' | 'CORRECTION'>('PURCHASE');
  const [adjustNote, setAdjustNote] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [movements, setMovements] = useState<StockMovementDto[]>([]);
  const { forbidden, handleError, clearForbidden } = useApiError();

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      clearForbidden();
      setError(null);
      const [ingredientData, menuData] = await Promise.all([
        apiFetch<Ingredient[]>('/inventory/ingredients'),
        apiFetch<MenuItem[]>('/inventory/menu-items'),
      ]);
      setIngredients(ingredientData);
      setMenuItems(menuData);
      setSelectedItemId((current) => current || menuData[0]?.id || '');
    } catch (err) {
      setError(handleError(err, 'Unable to load inventory data.'));
    } finally {
      setLoading(false);
    }
  }, [clearForbidden, handleError]);

  const fetchRecipe = useCallback(async (menuItemId: string) => {
    if (!menuItemId) {
      setRecipe([]);
      setDrafts([]);
      return;
    }
    try {
      setRecipeLoading(true);
      const data = await apiFetch<RecipeEntry[]>(`/inventory/menu-items/${menuItemId}/recipe`);
      setRecipe(data);
      setDrafts(data.map((entry) => ({ ingredientId: entry.ingredientId, qtyUsed: entry.qtyUsed })));
      setError(null);
    } catch (err) {
      setError(handleError(err, 'Unable to load recipe.'));
      setRecipe([]);
      setDrafts([]);
    } finally {
      setRecipeLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (selectedItemId) void fetchRecipe(selectedItemId);
  }, [fetchRecipe, selectedItemId]);

  // Live low-stock (Phase 4): join the admin room and refresh when an order
  // pushes an ingredient across its reorder level. Only ADMIN/MANAGER may join.
  useEffect(() => {
    const socket = getSocket();
    const joinAdmin = () => {
      socket.emit('join-room', 'admin', () => {});
    };
    const onLowStock = () => { void fetchInventory(); };
    socket.on('connect', joinAdmin);
    socket.on('inventory:low_stock', onLowStock);
    if (socket.connected) joinAdmin();
    return () => {
      socket.emit('leave-room', 'admin');
      socket.off('connect', joinAdmin);
      socket.off('inventory:low_stock', onLowStock);
    };
  }, [fetchInventory]);

  const fetchMovements = useCallback(async () => {
    try {
      const data = await apiFetch<StockMovementDto[]>('/inventory/stock-movements');
      setMovements(data);
    } catch {
      // History is non-critical; ignore failures so the page still works.
    }
  }, []);

  useEffect(() => {
    void fetchMovements();
  }, [fetchMovements]);

  const openAdjust = (ingredient: Ingredient) => {
    setAdjustTarget(ingredient);
    setAdjustDelta('');
    setAdjustReason('PURCHASE');
    setAdjustNote('');
  };

  const confirmAdjust = async () => {
    if (!adjustTarget) return;
    const delta = Number(adjustDelta);
    if (!adjustDelta || Number.isNaN(delta) || delta === 0) { setError('Enter a non-zero delta (positive to add, negative to remove).'); return; }
    setActionSaving(true);
    try {
      await apiFetch(`/inventory/ingredients/${adjustTarget.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta: adjustDelta.trim(), reason: adjustReason, note: adjustNote.trim() || null }),
      });
      setAdjustTarget(null);
      setError(null);
      await fetchInventory();
      await fetchMovements();
    } catch (err) {
      setError(handleError(err, 'Stock could not be adjusted.'));
    } finally { setActionSaving(false); }
  };

  const selectedItem = menuItems.find((item) => item.id === selectedItemId) ?? menuItems[0];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (!form.name.trim()) {
        throw new Error('Ingredient name is required.');
      }

      const created = await apiFetch<Ingredient>('/inventory/ingredients', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          unit: form.unit.trim(),
          stockQty: Number(form.stockQty),
          reorderLevel: Number(form.reorderLevel),
        }),
      });
      setIngredients((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(emptyIngredient);
      setError(null);
    } catch (err) {
      setError(handleError(err, 'Ingredient could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ingredientId: string) => {
    try {
      await apiFetch(`/inventory/ingredients/${ingredientId}`, { method: 'DELETE' });
      setIngredients((current) => current.filter((item) => item.id !== ingredientId));
      if (selectedItemId) await fetchRecipe(selectedItemId);
    } catch (err) {
      setError(handleError(err, 'Ingredient could not be deleted.'));
    }
  };

  const handleRecipeSave = async () => {
    if (!selectedItemId) return;
    const items = drafts
      .filter((draft) => draft.ingredientId && Number(draft.qtyUsed) > 0)
      .map((draft) => ({ ingredientId: draft.ingredientId, qtyUsed: Number(draft.qtyUsed) }));
    if (items.length === 0) {
      setError('Add at least one ingredient with a quantity greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const saved = await apiFetch<RecipeEntry[]>(`/inventory/menu-items/${selectedItemId}/recipe`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
      setRecipe(saved);
      setDrafts(saved.map((entry) => ({ ingredientId: entry.ingredientId, qtyUsed: entry.qtyUsed })));
      setError(null);
    } catch (err) {
      setError(handleError(err, 'Recipe could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Inventory" variant="staff">
        <div className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="h-8 w-40 animate-pulse rounded-xl bg-[var(--line)]" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--line)]" />
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--line)]" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (forbidden) {
    return (
      <AppShell title="Inventory" variant="staff">
        <ErrorState
          title="No access to inventory"
          description="Your role cannot view inventory. Ask an administrator for access."
          actionLabel="Retry"
          onAction={() => void fetchInventory()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Inventory" variant="staff">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--brand)]">Inventory</p>
            <h2 className="mt-2 text-3xl font-display font-bold text-[var(--ink)]">Ingredient and recipe stock</h2>
          </div>
          <div className="flex items-center gap-3">
            <LiveIndicator label="Stock" />
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm font-semibold text-[var(--ink-muted)]">
              <Package2 size={16} />
              {ingredients.length} ingredients
            </div>
          </div>
        </div>

        {(() => {
          const low = ingredients.filter((i) => compareDecimal(i.stockQty, i.reorderLevel) <= 0);
          return low.length > 0 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--st-late)]/30 bg-[var(--st-late)]/10 px-4 py-3 text-sm font-semibold text-[var(--st-late)]">
              <AlertTriangle size={16} />
              {low.length} ingredient{low.length === 1 ? '' : 's'} at or below reorder level: {low.map((i) => i.name).join(', ')}
            </div>
          ) : null;
        })()}

        {error ? (
          <ErrorState
            title="Inventory needs attention"
            description={error}
            actionLabel="Retry"
            onAction={() => void fetchInventory()}
          />
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
          <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--ink)]">Ingredient list</h3>
              <span className="rounded-full bg-[var(--bg)] px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                stocked
              </span>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="mb-5 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Ingredient name"
                  aria-label="Ingredient name"
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none ring-0"
                />
                <input
                  value={form.unit}
                  onChange={(event) => setForm({ ...form, unit: event.target.value })}
                  placeholder="Unit"
                  aria-label="Unit"
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none ring-0"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.stockQty}
                  onChange={(event) => setForm({ ...form, stockQty: event.target.value })}
                  placeholder="Stock quantity"
                  aria-label="Stock quantity"
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none ring-0"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.reorderLevel}
                  onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })}
                  placeholder="Reorder level"
                  aria-label="Reorder level"
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none ring-0"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-ink)] disabled:opacity-60"
              >
                <Plus size={16} />
                {saving ? 'Adding...' : 'Add ingredient'}
              </button>
            </form>

            <div className="space-y-2">
              {ingredients.length === 0 ? (
                <EmptyState title="No ingredients yet" description="Add the first ingredient to start tracking stock." />
              ) : (
                ingredients.map((ingredient) => {
                  const lowStock = compareDecimal(ingredient.stockQty, ingredient.reorderLevel) <= 0;
                  return (
                    <div key={ingredient.id} className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{ingredient.name}</p>
                        <p className="text-xs text-[var(--ink-muted)]">
                          {ingredient.stockQty} {ingredient.unit} • reorder at {ingredient.reorderLevel}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {lowStock ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--st-late)]/30 bg-[var(--st-late)]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--st-late)]">
                            <AlertTriangle size={12} /> Low
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openAdjust(ingredient)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-2 text-xs font-semibold text-[var(--ink)] hover:border-[var(--brand)]"
                          aria-label={`Adjust stock of ${ingredient.name}`}
                        >
                          <SlidersHorizontal size={14} /> Adjust
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(ingredient.id)}
                          className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-muted)] hover:text-[var(--st-late)]"
                          aria-label={`Delete ${ingredient.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--ink)]">Recipe mapping</h3>
              <button
                type="button"
                onClick={() => void handleRecipeSave()}
                disabled={saving || recipeLoading || !selectedItemId}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-ink)] disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save recipe'}
              </button>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">Menu item</label>
              <select
                value={selectedItemId}
                onChange={(event) => setSelectedItemId(event.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]"
              >
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.category?.name ?? 'General'} • {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-[var(--ink-muted)]">
                {selectedItem ? `Recipe for ${selectedItem.name}` : 'Select a menu item'}
              </p>
              <button
                type="button"
                onClick={() => setDrafts((current) => [...current, { ingredientId: ingredients[0]?.id ?? '', qtyUsed: '0.1' }])}
                disabled={!ingredients.length}
                className="min-h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
              >
                Add row
              </button>
            </div>

            <div className="space-y-3">
              {recipeLoading ? (
                <div className="h-24 animate-pulse rounded-2xl bg-[var(--line)]" />
              ) : drafts.length === 0 ? (
                <EmptyState title="No recipe rows" description="Add an ingredient row with the quantity used per serving, then save." />
              ) : (
                drafts.map((draft, index) => {
                  const info = ingredients.find((item) => item.id === draft.ingredientId);
                  return (
                    <div key={`${selectedItemId}-${index}`} className="rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
                      <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                        <select
                          value={draft.ingredientId}
                          onChange={(event) => setDrafts((current) => current.map((row, i) => i === index ? { ...row, ingredientId: event.target.value } : row))}
                          aria-label={`Recipe ingredient ${index + 1}`}
                          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"
                        >
                          <option value="">Select ingredient</option>
                          {ingredients.map((ingredient) => (
                            <option key={ingredient.id} value={ingredient.id}>
                              {ingredient.name} ({ingredient.unit})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={draft.qtyUsed}
                          onChange={(event) => setDrafts((current) => current.map((row, i) => i === index ? { ...row, qtyUsed: event.target.value } : row))}
                          aria-label={`Quantity used ${index + 1}`}
                          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"
                        />
                        <button
                          type="button"
                          onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                          aria-label={`Remove recipe row ${index + 1}`}
                          className="min-h-11 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[var(--st-late)]"
                        >
                          Remove
                        </button>
                      </div>
                      {info ? (
                        <p className="mt-1 text-xs text-[var(--ink-muted)]">
                          Stock: {info.stockQty} {info.unit} • reorder at {info.reorderLevel}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
              {recipe.length > 0 && !recipeLoading ? (
                <p className="text-xs text-[var(--ink-muted)]">
                  Saved recipe: {recipe.map((entry) => `${entry.ingredientName} ${entry.qtyUsed}${entry.unit}`).join(', ')}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <section aria-labelledby="stock-history-title" className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <h3 id="stock-history-title" className="text-lg font-bold text-[var(--ink)]">Stock movement history</h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Every manual stock adjustment, most recent first.</p>
          {movements.length === 0 ? (
            <EmptyState title="No stock movements yet" description="Use the Adjust button on an ingredient to record a purchase, waste or correction." />
          ) : (
            <ul className="mt-4 space-y-2">
              {movements.slice(0, 25).map((movement) => (
                <li key={movement.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm">
                  <div>
                    <p className="font-semibold text-[var(--ink)]">{movement.ingredientName} · <span className={movement.delta.startsWith('-') ? 'text-[var(--st-late)]' : 'text-[var(--st-ready)]'}>{movement.delta}</span></p>
                    <p className="text-xs text-[var(--ink-muted)]">{movement.reason}{movement.note ? ` · ${movement.note}` : ''}{movement.user ? ` · by ${movement.user}` : ''}</p>
                  </div>
                  <span className="text-xs text-[var(--ink-muted)]">{new Date(movement.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {adjustTarget ? (
        <div role="dialog" aria-modal="true" aria-labelledby="adjust-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <section className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-5 sm:rounded-[20px]">
            <h2 id="adjust-title" className="font-display text-xl font-bold text-[var(--ink)]">Adjust {adjustTarget.name}</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Current stock: {adjustTarget.stockQty} {adjustTarget.unit}</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-[var(--ink)]">Change by ({adjustTarget.unit})
                <input type="number" step="0.01" value={adjustDelta} onChange={(event) => setAdjustDelta(event.target.value)} placeholder="e.g. 10 or -2" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 font-normal text-[var(--ink)]" />
              </label>
              <label className="block text-sm font-semibold text-[var(--ink)]">Reason
                <select value={adjustReason} onChange={(event) => setAdjustReason(event.target.value as typeof adjustReason)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 font-normal text-[var(--ink)]">
                  <option value="PURCHASE">Purchase (stock received)</option>
                  <option value="WASTE">Waste (spoilage / damage)</option>
                  <option value="CORRECTION">Correction (stocktake)</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-[var(--ink)]">Note (optional)
                <input value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} maxLength={500} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 font-normal text-[var(--ink)]" />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setAdjustTarget(null)} className="min-h-11 flex-1 rounded-lg border border-[var(--line)] font-semibold text-[var(--ink)]">Cancel</button>
              <button onClick={() => void confirmAdjust()} disabled={actionSaving} className="min-h-11 flex-1 rounded-lg bg-[var(--brand)] font-semibold text-[var(--brand-ink)] disabled:opacity-60">{actionSaving ? 'Saving…' : 'Apply adjustment'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

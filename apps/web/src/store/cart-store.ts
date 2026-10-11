'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type CartLine = {
  menuItemId: string;
  quantity: number;
  addonIds: string[];
  notes: string;
};

type CartState = {
  activeToken: string | null;
  cartByToken: Record<string, CartLine[]>;
  setActiveToken: (token: string) => void;
  addItem: (line: Omit<CartLine, 'quantity'>) => void;
  setQuantity: (menuItemId: string, quantity: number, addonIds?: string[]) => void;
  setNotes: (menuItemId: string, addonIds: string[], notes: string) => void;
  clearCart: (token: string) => void;
};

const lineKey = (line: Pick<CartLine, 'menuItemId' | 'addonIds'>) =>
  `${line.menuItemId}:${[...line.addonIds].sort().join(',')}`;

export const useCartStore = create<CartState>()(persist(
  (set, get) => ({
    activeToken: null,
    cartByToken: {},
    setActiveToken: (token) => set({ activeToken: token }),
    addItem: (line) => {
      const token = get().activeToken;
      if (!token) return;
      const current = get().cartByToken[token] ?? [];
      const key = lineKey(line);
      const existing = current.find((item) => lineKey(item) === key);
      const next = existing
        ? current.map((item) => lineKey(item) === key ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...line, quantity: 1 }];
      set({ cartByToken: { ...get().cartByToken, [token]: next } });
    },
    setQuantity: (menuItemId, quantity, addonIds = []) => {
      const token = get().activeToken;
      if (!token) return;
      const current = get().cartByToken[token] ?? [];
      const key = lineKey({ menuItemId, addonIds });
      const next = quantity <= 0
        ? current.filter((item) => lineKey(item) !== key)
        : current.map((item) => lineKey(item) === key ? { ...item, quantity } : item);
      set({ cartByToken: { ...get().cartByToken, [token]: next } });
    },
    setNotes: (menuItemId, addonIds, notes) => {
      const token = get().activeToken;
      if (!token) return;
      const current = get().cartByToken[token] ?? [];
      const key = lineKey({ menuItemId, addonIds });
      const next = current.map((item) => lineKey(item) === key ? { ...item, notes } : item);
      set({ cartByToken: { ...get().cartByToken, [token]: next } });
    },
    clearCart: (token) => set({ cartByToken: { ...get().cartByToken, [token]: [] } }),
  }),
  {
    name: 'tavola-cart-v1',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ cartByToken: state.cartByToken, activeToken: state.activeToken }),
  },
));

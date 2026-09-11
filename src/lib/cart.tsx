import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Enums } from "../types/database";

/**
 * Canvas 1e: "Même panier, un seul paiement." A trip can hold a stay, a car and
 * a table at once, so the cart is keyed by kind — adding a second stay replaces
 * the first rather than stacking, which matches the single-trip summary drawn.
 */
export type CartItem = {
  kind: Enums<"listing_kind">;
  listing_id: string;
  unit_id?: string | null;
  title: string;
  detail: string;
  amount: number;
};

type CartValue = {
  items: CartItem[];
  total: number;
  add: (item: CartItem) => void;
  remove: (kind: CartItem["kind"]) => void;
  clear: () => void;
};

const STORAGE_KEY = "papot.cart.v1";

const CartContext = createContext<CartValue>({
  items: [],
  total: 0,
  add: () => {},
  remove: () => {},
  clear: () => {},
});

function readStored(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* private mode or blocked storage — the cart just won't persist */
    }
  }, [items]);

  const add = useCallback((item: CartItem) => {
    setItems(prev => [...prev.filter(i => i.kind !== item.kind), item]);
  }, []);

  const remove = useCallback((kind: CartItem["kind"]) => {
    setItems(prev => prev.filter(i => i.kind !== kind));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartValue>(
    () => ({
      items,
      total: items.reduce((sum, i) => sum + i.amount, 0),
      add,
      remove,
      clear,
    }),
    [items, add, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);

/** "12 → 16 oct." as drawn on 1e. */
export function formatDateRange(from: string, to: string): string {
  const fmt = (d: string, withMonth: boolean) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "numeric", ...(withMonth ? { month: "short" } : {}) });
  try {
    return `${fmt(from, false)} → ${fmt(to, true)}`;
  } catch {
    return `${from} → ${to}`;
  }
}

export const nightsBetween = (from: string, to: string) => {
  const n = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

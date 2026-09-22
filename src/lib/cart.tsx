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
  /**
   * Set when this line is a promotional package. `create_booking` then reads
   * the price, the title and the annonce from the package itself and ignores
   * everything sent here — so a tampered `amount` buys nothing cheaper.
   */
  package_id?: string | null;
  /** Structured dates, so the customer panel can compute countdowns. */
  starts_on?: string | null;
  ends_on?: string | null;
  start_time?: string | null;
  party?: number | null;
  /**
   * The options a traveller chose on a vehicle. `create_booking` rebuilds the
   * tariff from the catalogue, so it needs to know a driver was taken and which
   * pickup point - it reads these, and never the `amount` beside them. Sending
   * the choice rather than its cost is what makes the figure unforgeable.
   */
  with_driver?: boolean | null;
  pickup?: string | null;
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
  // "2026-10-12" parses as midnight UTC, and formatting it in the browser's own
  // zone printed "11 oct." anywhere west of Greenwich — which is all of Haiti.
  // The date is a calendar day, not an instant, so it is read back in UTC.
  const fmt = (d: string, withMonth: boolean) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
      timeZone: "UTC",
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
    });
  try {
    return `${fmt(from, false)} → ${fmt(to, true)}`;
  } catch {
    return `${from} → ${to}`;
  }
}

/**
 * Nights between two dates. The implementation lives with the rest of the date
 * reasoning in `stayDates`, and is re-exported here because the cart has always
 * been where the rest of the app imported it from.
 */
export { nightsBetween } from "./stayDates";

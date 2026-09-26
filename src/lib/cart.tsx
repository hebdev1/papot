import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Enums } from "../types/database";

/**
 * "Même panier, un seul paiement."
 *
 * The cart used to be keyed by métier: one stay, one car, one table, and adding
 * a second of any kind quietly replaced the first. That is fine for a trip with
 * one of each and wrong the moment someone books two dinners, or a car in the
 * north and another in the south — the first line vanished with no message.
 *
 * A line is now identified by what it actually is: the métier, the annonce, the
 * room type and the moment. Booking the same thing twice updates that line;
 * booking something else adds one. `id` is only a handle for React and for the
 * remove button.
 */
export type CartItem = {
  /** Assigned on add. Not sent to the server, which reprices from the line. */
  id?: string;
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
  count: number;
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "papot.cart.v1";

const CartContext = createContext<CartValue>({
  items: [],
  total: 0,
  count: 0,
  add: () => {},
  remove: () => {},
  clear: () => {},
});

/**
 * What makes two lines the same purchase. Two tables at the same restaurant on
 * different evenings differ by `starts_on`; the same table added twice does
 * not, so the second add refreshes the first instead of duplicating it.
 */
const identity = (i: CartItem) =>
  [i.kind, i.listing_id, i.unit_id ?? "", i.package_id ?? "", i.starts_on ?? "", i.start_time ?? ""].join("|");

function readStored(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // A cart saved before lines had handles still has to be removable.
    return parsed.map((i: CartItem) => (i.id ? i : { ...i, id: crypto.randomUUID() }));
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
    const line: CartItem = { ...item, id: item.id ?? crypto.randomUUID() };
    setItems(prev => {
      const at = prev.findIndex(i => identity(i) === identity(line));
      if (at === -1) return [...prev, line];
      // Same purchase, revisited: keep its place in the list and its handle, so
      // the cart does not reshuffle under someone who only changed an option.
      const next = [...prev];
      next[at] = { ...line, id: prev[at].id };
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartValue>(
    () => ({
      items,
      total: items.reduce((sum, i) => sum + i.amount, 0),
      count: items.length,
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

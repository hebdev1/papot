import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * The food cart, deliberately separate from `useCart`.
 *
 * A trip cart can hold a stay, a car and a table at once. A food order cannot:
 * it belongs to exactly one restaurant, carries a way of collecting it, a time
 * and a tip, and is checked against that restaurant's own minimum. Folding the
 * two together would force every cart screen to know about both.
 */

export type FoodCustomization = {
  kind: "allergy" | "note";
  label: string;
};

/** One answer to a step of a combo or a built plate. */
export type PickedSelection = {
  option_id: string;
  name: string;
  price_delta: number;
  quantity: number;
};

export type PickedModifier = {
  id: string;
  name: string;
  price_delta: number;
  quantity: number;
};

export type FoodCartLine = {
  /** Same dish, different size, options or instructions, is a different line. */
  key: string;
  item_id: string | null;
  /** Includes the portion, so the cart reads the way the menu does. */
  name: string;
  /**
   * Base price plus option deltas. Shown while choosing; `place_food_order`
   * reprices everything from the menu, so this is never what is charged.
   */
  unit_price: number;
  quantity: number;
  note: string | null;
  variation_id: string | null;
  variation_name: string | null;
  modifiers: PickedModifier[];
  /** Set instead of item_id when the line is a combo or a built plate. */
  template_id: string | null;
  selections: PickedSelection[];
  customizations: FoodCustomization[];
};

type NewLine = Omit<FoodCartLine, "key" | "quantity"> & { quantity?: number };

type FoodCartValue = {
  listingId: string | null;
  listingName: string | null;
  lines: FoodCartLine[];
  count: number;
  subtotal: number;
  /** Returns "replaced" when the cart held another restaurant and was emptied. */
  add: (restaurant: { id: string; name: string }, line: NewLine) => "added" | "replaced";
  setQuantity: (key: string, quantity: number) => void;
  setNote: (key: string, note: string) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "papot.foodcart.v2";

type Stored = { listingId: string | null; listingName: string | null; lines: FoodCartLine[] };

const EMPTY: Stored = { listingId: null, listingName: null, lines: [] };

const FoodCartContext = createContext<FoodCartValue>({
  listingId: null,
  listingName: null,
  lines: [],
  count: 0,
  subtotal: 0,
  add: () => "added",
  setQuantity: () => {},
  setNote: () => {},
  remove: () => {},
  clear: () => {},
});

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : EMPTY;
    return parsed && Array.isArray(parsed.lines) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** A line's identity is the dish plus everything chosen on top of it. */
function lineKey(l: {
  item_id: string | null;
  template_id: string | null;
  note: string | null;
  variation_id: string | null;
  modifiers: PickedModifier[];
  selections: PickedSelection[];
  customizations: FoodCustomization[];
}) {
  return [
    l.item_id ?? "",
    l.template_id ?? "",
    l.variation_id ?? "",
    l.note ?? "",
    ...l.modifiers.map(m => m.id + "x" + m.quantity).sort(),
    ...l.selections.map(s => s.option_id + "x" + s.quantity).sort(),
    ...l.customizations.map(c => c.kind + ":" + c.label),
  ].join("|");
}

export function FoodCartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Stored>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* private mode or blocked storage — the cart just won't persist */
    }
  }, [cart]);

  const add = useCallback<FoodCartValue["add"]>((restaurant, line) => {
    let outcome: "added" | "replaced" = "added";
    setCart(prev => {
      const switching = prev.listingId !== null && prev.listingId !== restaurant.id;
      outcome = switching ? "replaced" : "added";
      const base = switching ? [] : prev.lines;
      const note = line.note ?? null;
      const key = lineKey({ ...line, note });
      const qty = Math.max(1, line.quantity ?? 1);
      const existing = base.find(l => l.key === key);
      return {
        listingId: restaurant.id,
        listingName: restaurant.name,
        lines: existing
          ? base.map(l => (l.key === key ? { ...l, quantity: Math.min(99, l.quantity + qty) } : l))
          : [...base, { ...line, note, key, quantity: qty }],
      };
    });
    return outcome;
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setCart(prev => {
      const lines =
        quantity <= 0
          ? prev.lines.filter(l => l.key !== key)
          : prev.lines.map(l => (l.key === key ? { ...l, quantity: Math.min(99, quantity) } : l));
      return lines.length === 0 ? EMPTY : { ...prev, lines };
    });
  }, []);

  const setNote = useCallback((key: string, note: string) => {
    setCart(prev => ({
      ...prev,
      lines: prev.lines.map(l => {
        if (l.key !== key) return l;
        const next = note.trim() || null;
        return { ...l, note: next, key: lineKey({ ...l, note: next }) };
      }),
    }));
  }, []);

  const remove = useCallback((key: string) => {
    setCart(prev => {
      const lines = prev.lines.filter(l => l.key !== key);
      return lines.length === 0 ? EMPTY : { ...prev, lines };
    });
  }, []);

  const clear = useCallback(() => setCart(EMPTY), []);

  const value = useMemo<FoodCartValue>(
    () => ({
      listingId: cart.listingId,
      listingName: cart.listingName,
      lines: cart.lines,
      count: cart.lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: cart.lines.reduce((s, l) => s + l.unit_price * l.quantity, 0),
      add,
      setQuantity,
      setNote,
      remove,
      clear,
    }),
    [cart, add, setQuantity, setNote, remove, clear],
  );

  return <FoodCartContext.Provider value={value}>{children}</FoodCartContext.Provider>;
}

export const useFoodCart = () => useContext(FoodCartContext);

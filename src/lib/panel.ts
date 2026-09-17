import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Enums } from "../types/database";

/** Shapes returned by the my_bookings RPC. */
export type BookingItem = {
  title: string;
  detail: string;
  kind: Enums<"listing_kind">;
  amount: number;
  status: Enums<"booking_status">;
  listing_id: string | null;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  party: number | null;
  img: string | null;
  city: string | null;
  location: string | null;
};

export type Booking = {
  id: string;
  reference: string;
  status: Enums<"booking_status">;
  total: number;
  currency: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  payment_method: string;
  created_at: string;
  items: BookingItem[];
};

/**
 * A date-only column ("2026-09-22") parsed with `new Date()` lands on UTC
 * midnight, which renders as the previous day in any negative-offset
 * timezone. Parse the parts explicitly so a calendar date stays put.
 */
export function parseDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** An item still to come, or with no date at all (a table without a date yet). */
export const isUpcoming = (i: BookingItem) => {
  const ref = i.ends_on ?? i.starts_on;
  return !ref || parseDay(ref) >= startOfToday();
};

export const bookingIsUpcoming = (b: Booking) =>
  b.status !== "cancelled" && b.items.some(isUpcoming);

export const bookingIsPast = (b: Booking) =>
  b.status !== "cancelled" && b.items.length > 0 && !b.items.some(isUpcoming);

/** The soonest dated item across all bookings — the panel's "NEXT UP" (§4). */
export function nextUpItem(bookings: Booking[]): { booking: Booking; item: BookingItem } | null {
  const candidates = bookings
    .filter(b => b.status !== "cancelled")
    .flatMap(b => b.items.map(item => ({ booking: b, item })))
    .filter(({ item }) => item.starts_on && parseDay(item.starts_on) >= startOfToday())
    .sort((a, b) => (a.item.starts_on! < b.item.starts_on! ? -1 : 1));

  return candidates[0] ?? null;
}

export const nightsBetween = (from: string, to: string) => {
  const n = Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** "22 sept." / "22 sept. → 25 sept." */
export function formatDay(date: string) {
  try {
    return parseDay(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return date;
  }
}

export function formatRange(from: string | null, to: string | null) {
  if (!from) return "";
  return to && to !== from ? `${formatDay(from)} → ${formatDay(to)}` : formatDay(from);
}

/** "19:30" from a "19:30:00" time column. */
export const formatTime = (t: string | null) => (t ? t.slice(0, 5) : "");

export function useMyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);

    /**
     * Anything bought before this account existed becomes theirs here.
     *
     * It runs before the read rather than once at sign-up, because the purchase
     * can come after: someone books, then creates the account from the
     * confirmation email. Matching is on a confirmed address only, and the call
     * touches no row that already has an owner — so on every other visit it
     * costs an update of nothing.
     */
    await supabase.rpc("claim_my_purchases");

    const { data, error } = await supabase.rpc("my_bookings");
    if (error) {
      console.error("Failed to load bookings:", error);
      setError(true);
    } else {
      setBookings((data as unknown as Booking[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { bookings, loading, error, reload: load };
}

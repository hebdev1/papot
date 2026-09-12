import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { parseDay } from "./panel";
import type { Enums } from "../types/database";

export type TripItem = {
  title: string;
  detail: string;
  kind: Enums<"listing_kind">;
  amount: number;
  status: Enums<"booking_status">;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  party: number | null;
  reference: string;
  img: string | null;
  city: string | null;
  location: string | null;
};

export type Trip = {
  id: string;
  title: string | null;
  destination: string | null;
  starts_on: string;
  ends_on: string;
  items: TripItem[];
  item_count: number;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const tripIsUpcoming = (t: Trip) => parseDay(t.ends_on) >= startOfToday();
export const tripIsPast = (t: Trip) => parseDay(t.ends_on) < startOfToday();

/** "10 → 16 oct." */
export function tripDates(t: Trip) {
  const from = parseDay(t.starts_on);
  const to = parseDay(t.ends_on);
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const fmtDay = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric" });
  const fmtFull = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  if (t.starts_on === t.ends_on) return fmtFull(from);
  return sameMonth ? `${fmtDay(from)} → ${fmtFull(to)}` : `${fmtFull(from)} → ${fmtFull(to)}`;
}

export const tripNights = (t: Trip) =>
  Math.max(0, Math.round((parseDay(t.ends_on).getTime() - parseDay(t.starts_on).getTime()) / 86_400_000));

export function useMyTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error } = await supabase.rpc("my_trips");
    if (error) {
      console.error("Failed to load trips:", error);
      setError(true);
    } else {
      setTrips((data as unknown as Trip[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { trips, loading, error, reload: load };
}

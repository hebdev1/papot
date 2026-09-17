import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * What is left of a room type or a vehicle, between two dates.
 *
 * The answer comes from `stay_availability()` in the database, which is the
 * same function `create_booking` consults under a lock when the sale is made.
 * One rule, in one place: what the fiche says and what the checkout does cannot
 * drift apart, because they are reading the same code.
 *
 * What the fiche shows is still only a reading — it is true when it is fetched
 * and can stop being true a second later. The binding answer is the locked one
 * taken at the moment of sale. This exists so that the traveller almost never
 * reaches that moment already refused, not to replace it.
 */

export type StayAvailability = {
  available: boolean;
  reason: string | null;
  nights?: number;
  capacity?: number;
  taken?: number;
  left?: number;
  first_blocked?: string;
  min_stay?: number;
};

export function useStayAvailability(
  listingId: string | null | undefined,
  unitId: string | null | undefined,
  checkin: string,
  checkout: string,
  /** Séjours and voitures only — a table is held by the restaurant's own rules. */
  enabled = true,
) {
  const [state, setState] = useState<StayAvailability | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !listingId) {
      setState(null);
      return;
    }

    let live = true;
    setLoading(true);

    void supabase
      .rpc("stay_availability", {
        p_listing: listingId,
        p_from: checkin,
        p_to: checkout,
        // A vehicle has no room type: the argument is left out rather than
        // sent empty, and the function's own default answers for the annonce.
        ...(unitId ? { p_unit: unitId } : {}),
      })
      .then(({ data, error }) => {
        if (!live) return;
        setLoading(false);
        // A lookup that fails is not a refusal. Saying "complet" because the
        // network blinked would cost a partner a sale that was there to make;
        // the locked check at checkout is what actually decides.
        setState(error ? null : (data as unknown as StayAvailability));
      });

    return () => {
      live = false;
    };
  }, [enabled, listingId, unitId, checkin, checkout]);

  return { availability: state, loading };
}

export type AvailabilityNote = { text: string; tone: "warn" | "stop" };

/**
 * The line to print under the price. `null` when there is nothing worth saying —
 * plenty left, or no answer yet.
 *
 * Scarcity is only reported when something has actually gone. A vehicle is
 * always one vehicle and a single-room type is always one room, so "il n'en
 * reste qu'un" would sit permanently under every one of them: true as a
 * sentence, worthless as information, and indistinguishable from the invented
 * urgency other booking sites print. With `taken > 0` the line appears because
 * someone really did take one.
 */
export function availabilityNote(a: StayAvailability | null): AvailabilityNote | null {
  if (!a) return null;
  if (!a.available) return { text: a.reason ?? "Indisponible à ces dates.", tone: "stop" };

  const { left, taken } = a;
  if (typeof left === "number" && typeof taken === "number" && taken > 0 && left > 0 && left <= 3) {
    return {
      text: left === 1 ? "Il n'en reste qu'un à ces dates." : `Il n'en reste que ${left} à ces dates.`,
      tone: "warn",
    };
  }
  return null;
}

/** One row per room type of an annonce, keyed by unit id. */
export type UnitAvailability = {
  available: boolean;
  reason: string | null;
  units_left: number | null;
  units_taken: number | null;
};

/**
 * The whole room list, answered for one window in a single round trip.
 *
 * Asking per row would be a request per room, and the list would assemble its
 * own truth one flicker at a time.
 */
export function useUnitsAvailability(listingId: string | null | undefined, checkin: string, checkout: string) {
  const [byUnit, setByUnit] = useState<Record<string, UnitAvailability>>({});

  useEffect(() => {
    if (!listingId) {
      setByUnit({});
      return;
    }

    let live = true;
    void supabase
      .rpc("stay_availability_units", { p_listing: listingId, p_from: checkin, p_to: checkout })
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) {
          // Same rule as above: a failed lookup is not a refusal. An empty map
          // means the list simply says nothing about dates.
          setByUnit({});
          return;
        }
        const rows = data as unknown as ({ unit_id: string } & UnitAvailability)[];
        setByUnit(Object.fromEntries(rows.map(r => [r.unit_id, r])));
      });

    return () => {
      live = false;
    };
  }, [listingId, checkin, checkout]);

  return byUnit;
}

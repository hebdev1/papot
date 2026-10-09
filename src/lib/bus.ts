import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * The traveller's half of the bus vertical.
 *
 * Every call here goes to a `bus_*` SECURITY DEFINER function, never to a
 * table. The tables are closed — `bus_coaches` has no anonymous read policy at
 * all — and these functions return the shaped, published-only answer a public
 * client needs. It is the same arrangement as the `marketplace_*` family in the
 * sister project, and it is why a fleet number never reaches a browser.
 *
 * The types are written here rather than taken from the generated client
 * because these are function return shapes, and `src/console/data.ts` explains
 * why the runtime-built boundary is cast in one reviewed place instead of
 * sprinkled across call sites.
 */

export { busDuration, busTime, busArrival, citySlug } from "./busFormat";
const rpc = (fn: string, args?: Record<string, unknown>) =>
  supabase.rpc(fn as never, args as never);

export type BusCity = {
  city: string;
  country: string;
  as_origin: number;
  as_destination: number;
};

export type BusResult = {
  departure_id: string;
  listing_id: string;
  route: string;
  operator: string;
  partner_id: string;
  departs_on: string;
  departs_at: string;
  duration_minutes: number;
  origin_city: string;
  origin_terminal: string;
  origin_address: string | null;
  arrive_minutes_before: number;
  destination_city: string;
  destination_terminal: string;
  destination_address: string | null;
  intermediate_stops: number;
  amenities: string[] | null;
  coach_type: string | null;
  seat_pattern: string | null;
  fare: number;
  rating: number | null;
  reviews: number | null;
  seats_total: number;
  seats_left: number;
};

export type BusStop = {
  position: number;
  city: string;
  terminal: string;
  address: string | null;
  /** Null means the company never said when the coach reaches this stop. */
  arrive_offset_minutes: number | null;
  boarding: boolean;
  alighting: boolean;
  arrive_minutes_before: number;
  instructions: string | null;
};

export type BusFare = { class: string; label: string; amount: number };

export type BusLuggage = {
  free_kg: number | null;
  carry_on_kg: number | null;
  extra_price_per_bag: number | null;
  max_extra_bags: number | null;
  oversize_rule: string | null;
  note: string | null;
} | null;

export type BusAvailability = {
  available: boolean;
  reason: string | null;
  status: string;
  seats_total: number;
  sold: number;
  held: number;
  blocked: number;
  left: number;
};

export type BusDetail = {
  departure_id: string;
  listing_id: string;
  route: string;
  operator: string;
  rating: number | null;
  reviews: number | null;
  departs_on: string;
  departs_at: string;
  duration_minutes: number;
  status: string;
  delayed_to: string | null;
  delay_reason: string | null;
  fare: number;
  amenities: string[];
  description: string | null;
  coach: { type: string | null; pattern: string | null; seats: number } | null;
  availability: BusAvailability;
  stops: BusStop[];
  fares: BusFare[];
  luggage: BusLuggage;
};

export type SeatState = "available" | "sold" | "held" | "blocked";
export type BusSeat = { seat_no: number; code: string; class: string | null; state: SeatState };

/** "360" -> "6 h", "95" -> "1 h 35" */
export function useBusCities() {
  const [cities, setCities] = useState<BusCity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void rpc("bus_cities_served").then(({ data, error }) => {
      if (!live) return;
      if (error) console.error("bus_cities_served failed:", error);
      setCities((data as BusCity[] | null) ?? []);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return { cities, loading };
}

export function useBusSearch(
  from: string,
  to: string,
  date: string,
  passengers: number,
  enabled = true,
) {
  const [results, setResults] = useState<BusResult[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !from || !to || !date) {
      setResults([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void rpc("bus_search", {
      p_from: from,
      p_to: to,
      p_date: date,
      p_passengers: passengers,
    }).then(({ data, error }) => {
      if (!live) return;
      if (error) {
        setError(error.message);
        setResults([]);
      } else {
        setError(null);
        setResults((data as BusResult[] | null) ?? []);
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [from, to, date, passengers, enabled]);

  return { results, loading, error };
}

export function useBusDeparture(id: string | undefined) {
  const [detail, setDetail] = useState<BusDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void rpc("bus_departure_detail", { p_departure: id }).then(({ data, error }) => {
      if (!live) return;
      if (error) console.error("bus_departure_detail failed:", error);
      setDetail((data as BusDetail | null) ?? null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [id, nonce]);

  return { detail, loading, reload: () => setNonce(n => n + 1) };
}

export function useSeatMap(id: string | undefined) {
  const [seats, setSeats] = useState<BusSeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void rpc("bus_seat_map", { p_departure: id }).then(({ data, error }) => {
      if (!live) return;
      if (error) console.error("bus_seat_map failed:", error);
      setSeats((data as BusSeat[] | null) ?? []);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [id, nonce]);

  return { seats, loading, reload: useCallback(() => setNonce(n => n + 1), []) };
}

/**
 * Hold the chosen seats while the passenger fills in names and pays.
 *
 * Signed-in travellers only, by design: a ten-minute hold handed to anyone at
 * all is the power to freeze a coach from a loop. A guest gets no hold and
 * claims the seats at payment instead, which is why `bus_hold_seats` refusing
 * with 42501 is not an error to show — it is the normal path for a visitor, and
 * the caller treats it as "no hold, carry on".
 */
export async function holdSeats(departureId: string, seats: number[], qty: number) {
  const { data, error } = await rpc("bus_hold_seats", {
    p_departure: departureId,
    p_qty: qty,
    p_seats: seats.length > 0 ? seats : null,
  });
  if (error) {
    const guest = error.code === "42501" || /Connectez-vous/.test(error.message ?? "");
    return { held: [] as number[], guest, error: guest ? null : error.message };
  }
  const res = data as { seats: number[]; held_until: string; short: boolean } | null;
  return {
    held: res?.seats ?? [],
    heldUntil: res?.held_until ?? null,
    short: res?.short ?? false,
    guest: false,
    error: null as string | null,
  };
}

/**
 * Give the held seats back.
 *
 * Only a signed-in traveller has seats to release — holds are theirs alone — so
 * the caller gates on the session rather than firing a request that `anon` is
 * not allowed to make. A 42501 is still swallowed: it means "you were holding
 * nothing", which is not a failure worth a console error on every page exit.
 */
export async function releaseSeats() {
  const { error } = await rpc("bus_release_seats");
  if (error && error.code !== "42501") {
    console.error("bus_release_seats failed:", error);
  }
}

/* ------------------------------------------------------------------ *
 * Lifecycle: delays, cancellations and what a cancellation is worth.
 * ------------------------------------------------------------------ */

export type RefundOutcome =
  | "REFUNDABLE"
  | "FULL_REFUND"
  | "ALREADY_CANCELLED"
  | "ALREADY_BOARDED";

export type RefundQuote = {
  ticket_id: string;
  ticket_no: string;
  outcome: RefundOutcome;
  amount_paid: number;
  currency: string;
  hours_before: number;
  refund_percent: number;
  fee: number;
  refund: number;
  kept: number;
  policy_source: "route" | "company" | "platform";
  floored_by_platform: boolean;
  departs_at: string;
};

export type RefundTier = {
  hours_before: number;
  refund_percent: number;
  fee_flat: number;
};

export type RefundPolicy = {
  listing_id: string;
  source: "route" | "company" | "platform";
  tiers: RefundTier[];
  protected_hours: number;
  min_percent: number;
};

/**
 * What a passenger would get back, asked before they are asked to confirm.
 *
 * The figure is never computed here. `bus_ticket_refund_quote` rebuilds it
 * from the ladder and the clock, for the same reason a price is rebuilt at
 * checkout: a refund the browser works out is a refund the browser can argue
 * with.
 */
export function useRefundQuote(token: string | undefined, enabled = true) {
  const [quote, setQuote] = useState<RefundQuote | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!token || !enabled) return;
    setLoading(true);
    void rpc("bus_ticket_refund_quote", { p_token: token }).then(({ data, error }) => {
      if (error) console.error("bus_ticket_refund_quote failed:", error);
      setQuote((data as RefundQuote | null) ?? null);
      setLoading(false);
    });
  }, [token, enabled]);

  useEffect(load, [load]);
  return { quote, loading, reload: load };
}

export function useRefundPolicy(listingId: string | undefined) {
  const [policy, setPolicy] = useState<RefundPolicy | null>(null);

  useEffect(() => {
    if (!listingId) return;
    let live = true;
    void rpc("bus_refund_policy", { p_listing: listingId }).then(({ data }) => {
      if (live) setPolicy((data as RefundPolicy | null) ?? null);
    });
    return () => {
      live = false;
    };
  }, [listingId]);

  return policy;
}

/**
 * Nudges the mail worker.
 *
 * Every lifecycle write queues its notices and commits; nothing is sent until
 * something drains the queue, and PAPOT has no scheduler (`pg_cron` and
 * `pg_net` are available on the project but not installed). So the screen that
 * caused the notices asks for them to go out, fire-and-forget — a failure here
 * must never make a completed cancellation look like it failed.
 */
export function dispatchNotifications() {
  void supabase.functions
    .invoke("dispatch-notifications", { body: {} })
    .catch(e => console.error("dispatch-notifications failed:", e));
}

export async function cancelTicketByToken(token: string, reason?: string) {
  const { data, error } = await rpc("bus_cancel_ticket", {
    p_token: token,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  dispatchNotifications();
  return data as RefundQuote & {
    cancelled: true;
    refund_id: string;
    refund_reference: string;
    seat_released: string;
  };
}

export async function cancelTicketFor(ticketId: string, reason?: string) {
  const { data, error } = await rpc("bus_cancel_ticket_for", {
    p_ticket: ticketId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  dispatchNotifications();
  return data as RefundQuote;
}

export async function delayDeparture(departureId: string, newTime: string, reason?: string) {
  const { data, error } = await rpc("bus_delay_departure", {
    p_departure: departureId,
    p_new_time: newTime,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  dispatchNotifications();
  return data as { departure_id: string; delayed_to: string; minutes: number };
}

export async function cancelDeparture(departureId: string, reason?: string) {
  const { data, error } = await rpc("bus_cancel_departure", {
    p_departure: departureId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  dispatchNotifications();
  return data as {
    departure_id: string;
    tickets_refunded: number;
    refund_total: number;
    still_boarded: number;
  };
}

export async function setDepartureStatus(
  departureId: string,
  status: string,
  note?: string,
) {
  const { data, error } = await rpc("bus_set_departure_status", {
    p_departure: departureId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as { departure_id: string; from: string; to: string };
}

/* ------------------------------------------------------------------ *
 * The company's own page, and what travellers said.
 * ------------------------------------------------------------------ */

export type BusCompanyRoute = {
  listing_id: string;
  name: string;
  price: number;
  from: string | null;
  to: string | null;
  next: {
    departure_id: string;
    departs_on: string;
    departs_at: string;
    duration_minutes: number;
  } | null;
};

export type BusCompany = {
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  rating: number | null;
  joined_at: string | null;
  coaches: number;
  terminals: number;
  reviews: { count: number; rating: number | null };
  routes: BusCompanyRoute[];
};

export type RouteReview = {
  rating: number;
  title: string | null;
  body: string | null;
  author: string | null;
  on: string;
  punctuality: number | null;
  comfort: number | null;
  cleanliness: number | null;
  service: number | null;
  reply: string | null;
};

export type RouteReviews = {
  count: number;
  rating: number | null;
  punctuality: number | null;
  comfort: number | null;
  cleanliness: number | null;
  service: number | null;
  reviews: RouteReview[];
};

export type ReviewState = {
  listing_id: string;
  already: boolean;
  travelled: boolean;
  cancelled: boolean;
  can_review: boolean;
};

export function useBusCompany(slug: string | undefined) {
  const [company, setCompany] = useState<BusCompany | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    setLoading(true);
    void rpc("bus_company_public", { p_slug: slug }).then(({ data, error }) => {
      if (!live) return;
      if (error) console.error("bus_company_public failed:", error);
      setCompany((data as BusCompany | null) ?? null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [slug]);

  return { company, loading };
}

export function useRouteReviews(listingId: string | undefined, limit = 6) {
  const [reviews, setReviews] = useState<RouteReviews | null>(null);

  useEffect(() => {
    if (!listingId) return;
    let live = true;
    void rpc("bus_route_reviews", { p_listing: listingId, p_limit: limit }).then(({ data }) => {
      if (live) setReviews((data as RouteReviews | null) ?? null);
    });
    return () => {
      live = false;
    };
  }, [listingId, limit]);

  return reviews;
}

export function useReviewState(token: string | undefined) {
  const [state, setState] = useState<ReviewState | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    void rpc("bus_review_state", { p_token: token }).then(({ data }) => {
      setState((data as ReviewState | null) ?? null);
    });
  }, [token]);

  useEffect(load, [load]);
  return { state, reload: load };
}

export async function submitReviewByToken(
  token: string,
  rating: number,
  extra: {
    title?: string;
    body?: string;
    punctuality?: number | null;
    comfort?: number | null;
    cleanliness?: number | null;
    service?: number | null;
  } = {},
) {
  const { data, error } = await rpc("bus_review_by_token", {
    p_token: token,
    p_rating: rating,
    p_title: extra.title ?? null,
    p_body: extra.body ?? null,
    p_punctuality: extra.punctuality ?? null,
    p_comfort: extra.comfort ?? null,
    p_cleanliness: extra.cleanliness ?? null,
    p_service: extra.service ?? null,
  });
  if (error) throw error;
  return data as { review_id: string; status: string };
}

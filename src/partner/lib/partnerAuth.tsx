import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { rpc } from "../../console/data";

/**
 * Which businesses the signed-in person may act for, and what they may do.
 *
 * A person can belong to more than one business — an owner with two properties,
 * a manager hired by two hotels — so this holds a list and an active choice
 * rather than a single partner. Everything the dashboard renders is scoped to
 * the active one.
 *
 * The permission list comes from partner_me(), computed in the database. The UI
 * uses it to decide what to show; RLS and the RPCs decide what is allowed.
 */

export type PartnerRole =
  | "owner"
  | "manager"
  | "reservations_agent"
  | "front_desk"
  | "finance"
  | "marketing"
  | "viewer";

export const ROLE_LABEL: Record<PartnerRole, string> = {
  owner: "Propriétaire",
  manager: "Gestionnaire",
  reservations_agent: "Agent de réservation",
  front_desk: "Réception",
  finance: "Finance",
  marketing: "Marketing",
  viewer: "Lecture seule",
};

export type PartnerType = "hotel" | "guesthouse" | "car" | "restaurant";

export const TYPE_LABEL: Record<PartnerType, string> = {
  hotel: "Hôtel",
  guesthouse: "Maison d'hôtes",
  car: "Location de voitures",
  restaurant: "Restaurant",
};

export type Membership = {
  partner_id: string;
  business_name: string;
  type: PartnerType;
  status: string;
  verification: string;
  rating: number | null;
  city: string | null;
  role: PartnerRole;
  member_status: string;
  permissions: string[];
};

type PartnerValue = {
  memberships: Membership[];
  active: Membership | null;
  setActive: (partnerId: string) => void;
  loading: boolean;
  /** True when the signed-in user holds this permission for the active business. */
  can: (permission: string) => boolean;
  reload: () => void;
};

const PartnerContext = createContext<PartnerValue>({
  memberships: [],
  active: null,
  setActive: () => {},
  loading: true,
  can: () => false,
  reload: () => {},
});

const ACTIVE_KEY = "papot.partner.active";

export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      // An invitation is written against an email before the person has an
      // account. Claiming it here means signing up after being invited is
      // enough: there is no token to lose and no second flow to maintain.
      await rpc("claim_partner_invitations");
      const { data } = await rpc("partner_me");
      if (cancelled) return;

      const list = (data ?? []) as unknown as Membership[];
      setMemberships(list);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, nonce]);

  const value = useMemo<PartnerValue>(() => {
    const active =
      memberships.find(m => m.partner_id === activeId) ?? memberships[0] ?? null;
    const held = new Set(active?.permissions ?? []);

    return {
      memberships,
      active,
      loading: loading || authLoading,
      can: p => held.has(p),
      setActive: id => {
        localStorage.setItem(ACTIVE_KEY, id);
        setActiveId(id);
      },
      reload: () => setNonce(n => n + 1),
    };
  }, [memberships, activeId, loading, authLoading]);

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}

export const usePartner = () => useContext(PartnerContext);

/**
 * The active business id, or an empty string.
 *
 * Returned as a string rather than null so a query can pass it straight to a
 * filter and disable itself with `enabled`, instead of every caller writing the
 * same guard.
 */
export function usePartnerId(): string {
  return usePartner().active?.partner_id ?? "";
}

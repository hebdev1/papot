import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

/**
 * Which of the three spaces the signed-in person belongs to.
 *
 * PAPOT has a traveller area, a partner dashboard and a staff console. They are
 * separate applications with separate bundles, and each one used to answer for
 * itself whether you belonged — which meant nobody answered whether you
 * belonged *elsewhere*. `my_account_space()` decides once, in the database, and
 * every guard reads the same answer.
 *
 * The routes are still enforced by RLS underneath: this only decides where to
 * send someone, never what they may read.
 */
export type AccountSpace = "anonymous" | "customer" | "partner" | "admin";

export const SPACE_HOME: Record<AccountSpace, string> = {
  anonymous: "/connexion",
  customer: "/compte",
  partner: "/partenaire",
  admin: "/admin",
};

export const SPACE_LABEL: Record<AccountSpace, string> = {
  anonymous: "Visiteur",
  customer: "Espace voyageur",
  partner: "Espace partenaire",
  admin: "Console PAPOT",
};

export function useAccountSpace(): { space: AccountSpace; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const [space, setSpace] = useState<AccountSpace>("anonymous");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSpace("anonymous");
      setLoading(false);
      return;
    }

    let live = true;
    setLoading(true);
    supabase.rpc("my_account_space").then(({ data, error }) => {
      if (!live) return;
      // A failed lookup must not promote anyone: the traveller area is the
      // one place where being wrong costs nothing.
      setSpace(error || !data ? "customer" : (data as AccountSpace));
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [user, authLoading]);

  return { space, loading: loading || authLoading };
}

/** Where to send this person after signing in. */
export async function resolveSpaceHome(): Promise<string> {
  const { data, error } = await supabase.rpc("my_account_space");
  const space = (error || !data ? "customer" : data) as AccountSpace;
  return SPACE_HOME[space] ?? "/compte";
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { adminRpc } from "./adminData";

/**
 * Who the signed-in admin is and what they may do.
 *
 * The permission list comes from admin_me(), which reads it out of
 * role_permissions in the database. The UI uses it only to decide what to
 * render: every read is filtered by RLS and every write is re-checked inside
 * its RPC, so hiding a menu here is a courtesy, never a control.
 */

export type AdminRole =
  | "super_admin"
  | "operations_manager"
  | "partner_manager"
  | "finance_manager"
  | "support_agent"
  | "content_manager"
  | "marketing_manager"
  | "analyst"
  | "risk_manager";

export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super administrateur",
  operations_manager: "Responsable des opérations",
  partner_manager: "Responsable partenaires",
  finance_manager: "Responsable financier",
  support_agent: "Agent de support",
  content_manager: "Responsable du contenu",
  marketing_manager: "Responsable marketing",
  analyst: "Analyste",
  risk_manager: "Responsable risque",
};

export type AdminMe = {
  is_staff: boolean;
  user_id?: string;
  full_name?: string;
  email?: string;
  role?: AdminRole;
  job_title?: string;
  status?: "invited" | "active" | "inactive";
  permissions: string[];
};

type AdminValue = {
  me: AdminMe | null;
  loading: boolean;
  error: string | null;
  /** True when the signed-in user holds this permission. */
  can: (permission: string) => boolean;
  /** True when they hold at least one of these. Used for navigation groups. */
  canAny: (permissions: string[]) => boolean;
  reload: () => void;
};

const AdminContext = createContext<AdminValue>({
  me: null,
  loading: true,
  error: null,
  can: () => false,
  canAny: () => false,
  reload: () => {},
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setMe(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void adminRpc("admin_me").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setMe(null);
      } else {
        setError(null);
        setMe(data as unknown as AdminMe);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, nonce]);

  const value = useMemo<AdminValue>(() => {
    const held = new Set(me?.permissions ?? []);
    return {
      me,
      loading: loading || authLoading,
      error,
      can: p => held.has(p),
      canAny: ps => ps.some(p => held.has(p)),
      reload: () => setNonce(n => n + 1),
    };
  }, [me, loading, authLoading, error]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export const useAdmin = () => useContext(AdminContext);

/**
 * Record that this admin signed in, so the Security Center and the staff table
 * show real last-login times rather than a column that is always empty.
 */
export function useRecordAdminLogin(active: boolean) {
  const { me } = useAdmin();
  const userId = me?.user_id;

  useEffect(() => {
    if (!active || !userId) return;
    const key = `papot.admin.login.${userId}`;
    const last = Number(sessionStorage.getItem(key) ?? 0);
    // Once per browser session, not once per navigation.
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
    void adminRpc("admin_touch_login");
  }, [active, userId]);
}

/** Turn a Postgres error into something an operator can act on (spec §70). */
export function adminError(error: { message?: string; code?: string } | null): string {
  if (!error) return "";
  const msg = error.message ?? "";
  if (error.code === "42501" || msg.includes("Permission requise")) {
    return msg.startsWith("Permission requise")
      ? `Vous n'avez pas la permission requise (${msg.split(":").pop()?.trim()}).`
      : "Vous n'avez pas la permission d'effectuer cette action.";
  }
  if (error.code === "P0002") return msg || "Élément introuvable.";
  if (error.code === "23514") return msg || "Cette action ne respecte pas une règle de la plateforme.";
  if (msg.includes("Failed to fetch")) return "Connexion impossible. Vérifiez votre réseau.";
  return msg || "L'action a échoué.";
}

/** Small helper so pages can call an RPC and surface a usable message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<{ error: { message?: string; code?: string } | null }>) => {
      setBusy(true);
      setError(null);
      const { error } = await fn();
      setBusy(false);
      if (error) {
        setError(adminError(error));
        return false;
      }
      return true;
    },
    [],
  );

  return { busy, error, setError, run };
}

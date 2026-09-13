import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Save, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { Button, Callout, Card, CardHeader, PageHeader, Skeleton } from "../../console/Ui";
import { ConfirmDialog, useConfirm } from "../../console/Dialog";
import { ROLE_LABEL, adminError, useAdmin, type AdminRole } from "../lib/adminAuth";
import { adminRpc,useTable } from "../lib/adminData";
import { count } from "../../console/format";

type Permission = { code: string; label_fr: string; group_name: string; sensitive: boolean; position: number };
type RolePermission = { role: string; permission: string };

const ROLE_ORDER: AdminRole[] = [
  "super_admin",
  "operations_manager",
  "partner_manager",
  "finance_manager",
  "support_agent",
  "content_manager",
  "marketing_manager",
  "analyst",
  "risk_manager",
];

/** Spec §46 — granular permissions, per role. */
export function RolesPermissions() {
  const { me } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [role, setRole] = useState<AdminRole>("operations_manager");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perms = useTable<Permission>({
    from: "admin_permissions",
    sort: { col: "position", dir: "asc" },
    pageSize: 200,
  });

  const rolePerms = useTable<RolePermission>({
    from: "role_permissions",
    select: "role, permission",
    pageSize: 500,
  });

  const staff = useTable<{ user_id: string; role: string; status: string }>({
    from: "staff",
    select: "user_id, role, status",
    pageSize: 200,
  });

  const current = useMemo(
    () => new Set(rolePerms.rows.filter(r => r.role === role).map(r => r.permission)),
    [rolePerms.rows, role],
  );

  useEffect(() => setDraft(new Set(current)), [current]);

  const locked = role === "super_admin";
  const dirty =
    draft.size !== current.size || [...draft].some(p => !current.has(p));

  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of perms.rows) {
      const list = map.get(p.group_name) ?? [];
      list.push(p);
      map.set(p.group_name, list);
    }
    return [...map.entries()];
  }, [perms.rows]);

  const toggle = (code: string) => {
    if (locked) return;
    setDraft(d => {
      const next = new Set(d);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const holders = (r: string) => staff.rows.filter(s => s.role === r && s.status === "active").length;

  const save = () => {
    const added = [...draft].filter(p => !current.has(p));
    const removed = [...current].filter(p => !draft.has(p));
    const affected = holders(role);

    confirm({
      title: `Modifier les permissions de « ${ROLE_LABEL[role]} » ?`,
      consequence:
        `${added.length} permission(s) ajoutée(s), ${removed.length} retirée(s). ` +
        (affected > 0
          ? `${affected} membre(s) du personnel ont ce rôle et verront le changement à leur prochaine action.`
          : "Aucun membre ne porte ce rôle pour le moment.") +
        " Le changement est enregistré au journal d'audit comme critique.",
      confirmLabel: "Enregistrer les permissions",
      danger: removed.length > 0,
      onConfirm: async () => {
        setSaving(true);
        const { error } = await adminRpc("admin_set_role_permissions", {
          p_role: role,
          p_permissions: [...draft],
        });
        setSaving(false);
        if (error) return adminError(error);
        rolePerms.reload();
        setError(null);
        return null;
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Rôles et permissions"
        subtitle="Ce que chaque rôle peut faire. Les permissions sont vérifiées côté base de données, pas seulement dans l'interface."
        actions={
          dirty && !locked ? (
            <Button variant="primary" onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5" aria-hidden />
              Enregistrer
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        {/* Role picker */}
        <Card className="xl:col-span-1">
          <CardHeader title="Rôles" subtitle={`${ROLE_ORDER.length} rôles internes.`} />
          <div className="flex flex-col gap-1">
            {ROLE_ORDER.map(r => {
              const n = rolePerms.rows.filter(x => x.role === r).length;
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                    role === r ? "bg-[#eef3fb] text-[#002089]" : "text-admin-ink-2 hover:bg-admin-canvas",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{ROLE_LABEL[r]}</span>
                    <span className="block text-[11.5px] text-admin-ink-3">
                      {n} permission{n > 1 ? "s" : ""}
                      {holders(r) > 0 ? ` · ${holders(r)} membre(s)` : ""}
                    </span>
                  </span>
                  {r === "super_admin" && <Lock className="h-3.5 w-3.5 shrink-0 text-admin-ink-3" aria-hidden />}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Permission matrix */}
        <div className="flex flex-col gap-4 xl:col-span-3">
          {locked && (
            <Callout tone="warning">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Le super administrateur détient toutes les permissions et n'est pas modifiable : c'est le rôle
              qui permet de réparer les autres, y compris cet écran.
            </Callout>
          )}

          {perms.loading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
            groups.map(([group, list]) => (
              <Card key={group}>
                <CardHeader
                  title={group}
                  subtitle={`${list.filter(p => draft.has(p.code)).length} / ${list.length} accordées`}
                  action={
                    !locked ? (
                      <button
                        onClick={() =>
                          setDraft(d => {
                            const next = new Set(d);
                            const all = list.every(p => next.has(p.code));
                            for (const p of list) {
                              if (all) next.delete(p.code);
                              else next.add(p.code);
                            }
                            return next;
                          })
                        }
                        className="text-[12.5px] font-semibold text-[#002089] hover:underline"
                      >
                        {list.every(p => draft.has(p.code)) ? "Tout retirer" : "Tout accorder"}
                      </button>
                    ) : undefined
                  }
                />

                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {list.map(p => {
                    const on = draft.has(p.code);
                    return (
                      <li key={p.code}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                            locked && "cursor-not-allowed opacity-70",
                            on ? "border-[#002089]/35 bg-[#f4f8fd]" : "border-admin-line hover:bg-admin-canvas",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={locked}
                            onChange={() => toggle(p.code)}
                            className="mt-0.5 h-4 w-4 accent-[#002089]"
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-admin-ink">
                              {p.label_fr}
                              {p.sensitive && (
                                <span className="ml-1.5 rounded bg-[#fdf3f2] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#b3261e]">
                                  sensible
                                </span>
                              )}
                            </span>
                            <code className="block truncate text-[11.5px] text-admin-ink-3">{p.code}</code>
                          </span>
                          {on && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[#002089]" aria-hidden />}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))
          )}

          {dirty && !locked && (
            <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#002089]/25 bg-[#f4f8fd] px-4 py-3 shadow-lg">
              <p className="text-[13px] text-[#1e3a6b]">
                Modifications non enregistrées pour « {ROLE_LABEL[role]} ».
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDraft(new Set(current))}>
                  Annuler
                </Button>
                <Button variant="primary" size="sm" onClick={save} disabled={saving}>
                  Enregistrer
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-[13px] font-medium text-[#b3261e]">{error}</p>}
        </div>
      </div>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export { count };

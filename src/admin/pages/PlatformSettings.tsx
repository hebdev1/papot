import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { Button, Callout, Card, CardHeader, PageHeader, Skeleton, inputClass, labelClass } from "../components/Ui";
import { ConfirmDialog, useConfirm } from "../components/Dialog";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,useTable } from "../lib/adminData";
import { stamp } from "../lib/format";

type Setting = {
  key: string;
  group_name: string;
  label_fr: string;
  value: unknown;
  value_type: "text" | "number" | "boolean" | "select" | "percent" | "money";
  options: string[] | null;
  help_fr: string | null;
  position: number;
  updated_at: string;
};

const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  default_currency: [
    { value: "USD", label: "Dollar américain (USD)" },
    { value: "HTG", label: "Gourde haïtienne (HTG)" },
  ],
  default_language: [
    { value: "fr", label: "Français" },
    { value: "ht", label: "Kreyòl" },
    { value: "en", label: "English" },
  ],
  date_format: [
    { value: "DD/MM/YYYY", label: "31/12/2026" },
    { value: "MM/DD/YYYY", label: "12/31/2026" },
    { value: "YYYY-MM-DD", label: "2026-12-31" },
  ],
  time_format: [
    { value: "24h", label: "24 heures" },
    { value: "12h", label: "12 heures" },
  ],
};

/** Spec §51–§55. */
export function PlatformSettings() {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { rows, loading, reload } = useTable<Setting>({
    from: "platform_settings",
    sort: { col: "position", dir: "asc" },
    pageSize: 200,
  });

  useEffect(() => {
    setDraft(Object.fromEntries(rows.map(r => [r.key, r.value])));
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map<string, Setting[]>();
    for (const s of rows) {
      const list = map.get(s.group_name) ?? [];
      list.push(s);
      map.set(s.group_name, list);
    }
    return [...map.entries()];
  }, [rows]);

  const dirty = (s: Setting) => JSON.stringify(draft[s.key]) !== JSON.stringify(s.value);
  const dirtyKeys = rows.filter(dirty).map(s => s.key);

  const persist = async (s: Setting) => {
    setSaving(s.key);
    setError(null);
    const { error } = await adminRpc("admin_set_setting", { p_key: s.key, p_value: draft[s.key] });
    setSaving(null);
    if (error) {
      setError(adminError(error));
      return false;
    }
    setSaved(s.key);
    setTimeout(() => setSaved(null), 2000);
    reload();
    return true;
  };

  const save = (s: Setting) => {
    // Money and commission settings move real numbers, so they confirm first.
    const sensitive = s.group_name === "Commissions" || s.group_name === "Versements" || s.key === "maintenance_mode";
    if (!sensitive) {
      void persist(s);
      return;
    }

    confirm({
      title: `Modifier « ${s.label_fr} » ?`,
      consequence:
        s.key === "maintenance_mode"
          ? "En mode maintenance, le site public affiche une page d'indisponibilité à tous les visiteurs."
          : "Ce réglage change ce que la plateforme prélève ou verse. Les réservations déjà enregistrées ne sont pas recalculées.",
      confirmLabel: "Enregistrer",
      danger: s.key === "maintenance_mode",
      onConfirm: async () => {
        const ok = await persist(s);
        return ok ? null : "Enregistrement impossible.";
      },
    });
  };

  const control = (s: Setting) => {
    const value = draft[s.key];
    const set = (v: unknown) => setDraft(d => ({ ...d, [s.key]: v }));

    if (s.value_type === "boolean") {
      return (
        <button
          role="switch"
          aria-checked={value === true}
          disabled={!can("manage_platform_settings")}
          onClick={() => set(!value)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
            value === true ? "bg-[#002089]" : "bg-admin-line-strong",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
              value === true ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </button>
      );
    }

    if (s.value_type === "select") {
      const options = SELECT_OPTIONS[s.key] ?? (s.options ?? []).map(o => ({ value: o, label: o }));
      return (
        <select
          value={String(value ?? "")}
          disabled={!can("manage_platform_settings")}
          onChange={e => set(e.target.value)}
          className={cn(inputClass, "max-w-xs cursor-pointer")}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    const numeric = s.value_type === "number" || s.value_type === "percent" || s.value_type === "money";

    return (
      <div className="flex max-w-xs items-center gap-1.5">
        <input
          value={String(value ?? "")}
          disabled={!can("manage_platform_settings")}
          inputMode={numeric ? "decimal" : undefined}
          onChange={e => set(numeric ? Number(e.target.value.replace(",", ".")) || 0 : e.target.value)}
          className={inputClass}
        />
        {s.value_type === "percent" && <span className="text-[13px] text-admin-ink-3">%</span>}
        {s.value_type === "money" && <span className="text-[13px] text-admin-ink-3">$</span>}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Paramètres de la plateforme"
        subtitle="Réglages généraux, règles de réservation, paiements et commissions."
      />

      {dirtyKeys.length > 0 && (
        <div className="mb-5">
          <Callout tone="warning">
            {dirtyKeys.length} réglage(s) modifié(s) et non enregistré(s). Chaque réglage s'enregistre
            individuellement, et chaque enregistrement est tracé au journal d'audit.
          </Callout>
        </div>
      )}

      {error && (
        <div className="mb-5">
          <Callout tone="warning">{error}</Callout>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([group, list]) => (
            <Card key={group}>
              <CardHeader title={group} />
              <ul className="divide-y divide-admin-line">
                {list.map(s => (
                  <li key={s.key} className="flex flex-wrap items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <label className="block text-[13.5px] font-medium text-admin-ink">{s.label_fr}</label>
                      <p className="text-[11.5px] text-admin-ink-3">
                        <code>{s.key}</code>
                        {s.updated_at && ` · modifié ${stamp(s.updated_at)}`}
                      </p>
                      {s.help_fr && <p className="mt-0.5 text-[12px] text-admin-ink-2">{s.help_fr}</p>}
                    </div>

                    {control(s)}

                    <div className="w-24 shrink-0 text-right">
                      {saved === s.key ? (
                        <span className="text-[12.5px] font-semibold text-[#15803d]">Enregistré</span>
                      ) : dirty(s) && can("manage_platform_settings") ? (
                        <Button size="sm" variant="primary" onClick={() => save(s)} disabled={saving === s.key}>
                          {saving === s.key ? (
                            <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />
                          ) : (
                            <Save className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Enregistrer
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

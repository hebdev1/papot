import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  Button,
  Callout,
  Card,
  CardHeader,
  PageHeader,
  Skeleton,
  inputClass,
  labelClass,
  selectClass,
} from "../../console/Ui";
import { StatusBadge } from "../../console/StatusBadge";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminTable,useTable } from "../lib/adminData";
import { day, money, percent } from "../../console/format";
import { PARTNER_TYPE_LABEL } from "./Partners";
import { KIND_LABEL } from "./Listings";

type Rule = {
  id: string;
  scope: string;
  partner_type: string | null;
  partner_id: string | null;
  service_kind: string | null;
  label: string;
  percentage: number | null;
  fixed_fee: number | null;
  min_fee: number | null;
  max_fee: number | null;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
};

const SCOPE_LABEL: Record<string, string> = {
  global: "Globale",
  partner_type: "Par type de partenaire",
  partner: "Partenaire spécifique",
  service: "Par service",
  promotional: "Promotionnelle",
};

/** The order the database resolves rules in, shown so it is not a mystery. */
const PRECEDENCE = ["partner", "service", "partner_type", "global"];

/** Spec §30, §55. */
export function Commissions() {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);

  const { rows, loading, error, reload } = useTable<Rule>({
    from: "commission_rules",
    sort: { col: "scope", dir: "asc" },
    pageSize: 100,
  });

  const remove = (rule: Rule) =>
    confirm({
      title: `Supprimer la règle « ${rule.label} » ?`,
      consequence:
        "Les réservations futures utiliseront la règle suivante dans l'ordre de priorité. Les commissions déjà prélevées ne changent pas.",
      confirmLabel: "Supprimer la règle",
      danger: true,
      onConfirm: async () => {
        const { error } = await adminTable("commission_rules").delete().eq("id", rule.id);
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const toggle = async (rule: Rule) => {
    await adminTable("commission_rules").update({ active: !rule.active }).eq("id", rule.id);
    reload();
  };

  const byScope = PRECEDENCE.map(scope => ({
    scope,
    rules: rows.filter(r => r.scope === scope),
  })).concat({ scope: "promotional", rules: rows.filter(r => r.scope === "promotional") });

  return (
    <>
      <PageHeader
        title="Commissions"
        subtitle="Ce que la plateforme prélève sur chaque réservation, et selon quelle règle."
        actions={
          can("manage_commissions") ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Nouvelle règle
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5">
        <Callout>
          <strong className="font-semibold">Ordre d'application :</strong> partenaire spécifique, puis service,
          puis type de partenaire, puis règle globale. La première règle active qui correspond gagne — c'est la
          même logique côté base de données, donc l'aperçu ci-dessous correspond à ce qui sera réellement
          prélevé.
        </Callout>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <Card>
          <p className="text-[13px] text-[#b3261e]">{error}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {byScope.map(({ scope, rules }) => (
            <Card key={scope}>
              <CardHeader
                title={SCOPE_LABEL[scope] ?? scope}
                subtitle={
                  scope === "partner"
                    ? "Priorité la plus haute : remplace toutes les autres règles."
                    : scope === "global"
                      ? "Filet de sécurité appliqué quand aucune autre règle ne correspond."
                      : undefined
                }
                action={
                  <span className="rounded-md bg-admin-canvas px-2 py-1 text-[11.5px] font-semibold text-admin-ink-3">
                    Priorité {PRECEDENCE.indexOf(scope) >= 0 ? PRECEDENCE.indexOf(scope) + 1 : "—"}
                  </span>
                }
              />

              {rules.length === 0 ? (
                <p className="rounded-lg border border-dashed border-admin-line-strong px-4 py-5 text-center text-[13px] text-admin-ink-3">
                  Aucune règle à ce niveau.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {rules.map(r => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-admin-line px-3.5 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-admin-ink">{r.label}</span>
                        <span className="block truncate text-[12px] text-admin-ink-3">
                          {r.partner_type ? PARTNER_TYPE_LABEL[r.partner_type] : ""}
                          {r.service_kind ? KIND_LABEL[r.service_kind] : ""}
                          {r.starts_on || r.ends_on
                            ? ` · ${r.starts_on ? day(r.starts_on) : "…"} → ${r.ends_on ? day(r.ends_on) : "…"}`
                            : ""}
                          {r.min_fee ? ` · min ${money(r.min_fee)}` : ""}
                          {r.max_fee ? ` · max ${money(r.max_fee)}` : ""}
                        </span>
                      </span>

                      <span className="font-display text-[17px] font-semibold tabular-nums text-admin-ink">
                        {r.percentage !== null ? percent(Number(r.percentage), 0) : money(r.fixed_fee)}
                      </span>

                      <StatusBadge status={r.active ? "active" : "inactive"} />

                      {can("manage_commissions") && (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                            Modifier
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggle(r)}>
                            {r.active ? "Désactiver" : "Activer"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(r)} aria-label="Supprimer">
                            <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <RuleModal rule={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

function RuleModal({
  rule,
  onClose,
  onSaved,
}: {
  rule: Rule | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = rule === "new";
  const current = isNew ? null : rule;

  const [scope, setScope] = useState(current?.scope ?? "partner_type");
  const [label, setLabel] = useState(current?.label ?? "");
  const [partnerType, setPartnerType] = useState(current?.partner_type ?? "hotel");
  const [serviceKind, setServiceKind] = useState(current?.service_kind ?? "stay");
  const [percentage, setPercentage] = useState(current?.percentage?.toString() ?? "");
  const [fixedFee, setFixedFee] = useState(current?.fixed_fee?.toString() ?? "");
  const [minFee, setMinFee] = useState(current?.min_fee?.toString() ?? "");
  const [maxFee, setMaxFee] = useState(current?.max_fee?.toString() ?? "");
  const [startsOn, setStartsOn] = useState(current?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(current?.ends_on ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!rule) return null;

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  const save = async () => {
    if (!label.trim()) {
      setError("Donnez un nom à la règle : il apparaît dans le journal d'audit.");
      return;
    }
    if (num(percentage) === null && num(fixedFee) === null) {
      setError("Indiquez un pourcentage ou un montant fixe.");
      return;
    }

    const payload = {
      scope,
      label: label.trim(),
      partner_type: scope === "partner_type" ? partnerType : null,
      service_kind: scope === "service" ? serviceKind : null,
      percentage: num(percentage),
      fixed_fee: num(fixedFee),
      min_fee: num(minFee),
      max_fee: num(maxFee),
      starts_on: startsOn || null,
      ends_on: endsOn || null,
    };

    setBusy(true);
    const { error } = isNew
      ? await adminTable("commission_rules").insert(payload)
      : await adminTable("commission_rules").update(payload).eq("id", current!.id);
    setBusy(false);

    if (error) {
      setError(adminError(error));
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Nouvelle règle de commission" : "Modifier la règle"}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="rule-label">
            Nom de la règle
          </label>
          <input
            id="rule-label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Hôtels 15 %"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="rule-scope">
            Portée
          </label>
          <select id="rule-scope" value={scope} onChange={e => setScope(e.target.value)} className={selectClass}>
            {Object.entries(SCOPE_LABEL)
              .filter(([k]) => k !== "partner")
              .map(([value, l]) => (
                <option key={value} value={value}>
                  {l}
                </option>
              ))}
          </select>
          <p className="mt-1 text-[11.5px] text-admin-ink-3">
            Les règles propres à un partenaire se définissent depuis sa fiche.
          </p>
        </div>

        {scope === "partner_type" && (
          <div>
            <label className={labelClass} htmlFor="rule-ptype">
              Type de partenaire
            </label>
            <select
              id="rule-ptype"
              value={partnerType}
              onChange={e => setPartnerType(e.target.value)}
              className={selectClass}
            >
              {Object.entries(PARTNER_TYPE_LABEL).map(([value, l]) => (
                <option key={value} value={value}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}

        {scope === "service" && (
          <div>
            <label className={labelClass} htmlFor="rule-kind">
              Service
            </label>
            <select
              id="rule-kind"
              value={serviceKind}
              onChange={e => setServiceKind(e.target.value)}
              className={selectClass}
            >
              {Object.entries(KIND_LABEL).map(([value, l]) => (
                <option key={value} value={value}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="rule-pct">
            Pourcentage
          </label>
          <input
            id="rule-pct"
            value={percentage}
            onChange={e => setPercentage(e.target.value)}
            placeholder="15"
            inputMode="decimal"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="rule-fixed">
            Frais fixe
          </label>
          <input
            id="rule-fixed"
            value={fixedFee}
            onChange={e => setFixedFee(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="rule-min">
            Commission minimum
          </label>
          <input id="rule-min" value={minFee} onChange={e => setMinFee(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="rule-max">
            Commission maximum
          </label>
          <input id="rule-max" value={maxFee} onChange={e => setMaxFee(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="rule-start">
            Début
          </label>
          <input id="rule-start" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="rule-end">
            Fin
          </label>
          <input id="rule-end" type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

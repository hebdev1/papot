import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  Button,
  Callout,
  PageHeader,
  inputClass,
  labelClass,
  selectClass,
} from "../components/Ui";
import { Stat } from "../components/Cards";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { ConfirmDialog, Modal, useConfirm } from "../components/Dialog";
import { StatusBadge } from "../components/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminTable,searchAcross, useDebounced, useTable, type Filter } from "../lib/adminData";
import { count, day, money, percent } from "../lib/format";
import { KIND_LABEL } from "./Listings";

type Promotion = {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  discount_value: number | null;
  usage_limit: number | null;
  used_count: number;
  min_spend: number | null;
  starts_on: string | null;
  ends_on: string | null;
  eligible_kinds: string[] | null;
  status: string;
  created_at: string;
};

const PROMO_KIND: Record<string, string> = {
  percentage: "Remise en pourcentage",
  fixed: "Remise fixe",
  free_service: "Service offert",
  promo_code: "Code promo",
  partner: "Promotion partenaire",
  destination: "Promotion destination",
  seasonal: "Campagne saisonnière",
};

/** Spec §38. */
export function Promotions() {
  return <PromotionsTable title="Promotions" subtitle="Campagnes commerciales actives et à venir." />;
}

/** Spec §38 — promo codes are promotions with a redeemable code. */
export function Coupons() {
  return (
    <PromotionsTable
      title="Codes promo"
      subtitle="Campagnes que les clients activent en saisissant un code."
      onlyCodes
    />
  );
}

function PromotionsTable({
  title,
  subtitle,
  onlyCodes,
}: {
  title: string;
  subtitle: string;
  onlyCodes?: boolean;
}) {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["name", "code"], debounced)];
    if (onlyCodes) f.push({ col: "kind", op: "eq", value: "promo_code" });
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    return f;
  }, [debounced, values, onlyCodes]);

  const { rows, total, loading, error, reload } = useTable<Promotion>({
    from: "promotions",
    filters,
    sort: { col: "created_at", dir: "desc" },
    page,
    pageSize: 25,
  });

  const remove = (p: Promotion) =>
    confirm({
      title: `Supprimer « ${p.name} » ?`,
      consequence:
        Number(p.used_count) > 0
          ? `Cette campagne a déjà été utilisée ${p.used_count} fois. La supprimer efface la règle, pas les réservations qui en ont bénéficié.`
          : "La campagne est supprimée définitivement.",
      confirmLabel: "Supprimer",
      danger: true,
      onConfirm: async () => {
        const { error } = await adminTable("promotions").delete().eq("id", p.id);
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const setStatus = async (p: Promotion, status: string) => {
    await adminTable("promotions").update({ status }).eq("id", p.id);
    reload();
  };

  const columns: Column<Promotion>[] = [
    {
      id: "name",
      header: "Campagne",
      sortable: true,
      mobile: "primary",
      cell: p => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{p.name}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{PROMO_KIND[p.kind] ?? p.kind}</span>
        </span>
      ),
    },
    {
      id: "code",
      header: "Code",
      mobile: "secondary",
      cell: p =>
        p.code ? (
          <code className="rounded bg-admin-canvas px-1.5 py-0.5 text-[12px] font-semibold text-admin-ink">
            {p.code}
          </code>
        ) : (
          "—"
        ),
    },
    {
      id: "discount_value",
      header: "Remise",
      align: "right",
      mobile: "meta",
      cell: p =>
        p.discount_value === null
          ? "—"
          : p.kind === "percentage"
            ? percent(Number(p.discount_value), 0)
            : money(p.discount_value),
    },
    {
      id: "used_count",
      header: "Utilisations",
      sortable: true,
      align: "right",
      mobile: "secondary",
      cell: p => (
        <span>
          {count(p.used_count)}
          {p.usage_limit && <span className="text-admin-ink-3"> / {count(p.usage_limit)}</span>}
        </span>
      ),
    },
    {
      id: "period",
      header: "Période",
      mobile: "hidden",
      cell: p => `${p.starts_on ? day(p.starts_on) : "…"} → ${p.ends_on ? day(p.ends_on) : "…"}`,
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: p => <StatusBadge status={p.status} /> },
  ];

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          can("manage_promotions") ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Nouvelle campagne
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Campagnes" value={count(total)} />
        <Stat label="Actives" value={count(rows.filter(r => r.status === "active").length)} tone="positive" />
        <Stat label="Planifiées" value={count(rows.filter(r => r.status === "scheduled").length)} />
        <Stat label="Utilisations" value={count(rows.reduce((s, r) => s + Number(r.used_count), 0))} />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Nom de campagne ou code…"
        filters={[
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "draft", label: "Brouillon" },
              { value: "scheduled", label: "Planifiée" },
              { value: "active", label: "Active" },
              { value: "paused", label: "En pause" },
              { value: "expired", label: "Expirée" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="promotions"
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={p => p.id}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="promotions"
        actions={[
          { label: "Modifier", hidden: () => !can("manage_promotions"), onClick: setEditing },
          {
            label: "Activer",
            hidden: p => !can("manage_promotions") || p.status === "active",
            onClick: p => setStatus(p, "active"),
          },
          {
            label: "Mettre en pause",
            hidden: p => !can("manage_promotions") || p.status !== "active",
            onClick: p => setStatus(p, "paused"),
          },
          { label: "Supprimer", danger: true, hidden: () => !can("manage_promotions"), onClick: remove },
        ]}
        empty={{
          title: "Aucune campagne",
          body: "Créez une remise, un code promo ou une campagne saisonnière.",
          action: can("manage_promotions") ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              Créer une campagne
            </Button>
          ) : undefined,
        }}
      />

      <PromotionModal
        promotion={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
        defaultKind={onlyCodes ? "promo_code" : "percentage"}
      />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

function PromotionModal({
  promotion,
  onClose,
  onSaved,
  defaultKind,
}: {
  promotion: Promotion | "new" | null;
  onClose: () => void;
  onSaved: () => void;
  defaultKind: string;
}) {
  const isNew = promotion === "new";
  const current = isNew ? null : promotion;

  const [name, setName] = useState(current?.name ?? "");
  const [kind, setKind] = useState(current?.kind ?? defaultKind);
  const [code, setCode] = useState(current?.code ?? "");
  const [value, setValue] = useState(current?.discount_value?.toString() ?? "");
  const [limit, setLimit] = useState(current?.usage_limit?.toString() ?? "");
  const [minSpend, setMinSpend] = useState(current?.min_spend?.toString() ?? "");
  const [startsOn, setStartsOn] = useState(current?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(current?.ends_on ?? "");
  const [kinds, setKinds] = useState<string[]>(current?.eligible_kinds ?? []);
  const [status, setStatus] = useState(current?.status ?? "draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!promotion) return null;

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  const save = async () => {
    if (!name.trim()) {
      setError("Donnez un nom à la campagne.");
      return;
    }
    if (kind === "promo_code" && !code.trim()) {
      setError("Un code promo doit avoir un code : sans lui, personne ne peut l'utiliser.");
      return;
    }

    const payload = {
      name: name.trim(),
      kind,
      code: code.trim() ? code.trim().toUpperCase() : null,
      discount_value: num(value),
      usage_limit: num(limit),
      min_spend: num(minSpend),
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      eligible_kinds: kinds.length ? kinds : null,
      status,
    };

    setBusy(true);
    const { error } = isNew
      ? await adminTable("promotions").insert(payload)
      : await adminTable("promotions").update(payload).eq("id", current!.id);
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
      title={isNew ? "Nouvelle campagne" : "Modifier la campagne"}
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
          <label className={labelClass} htmlFor="promo-name">
            Nom
          </label>
          <input id="promo-name" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-kind">
            Type
          </label>
          <select id="promo-kind" value={kind} onChange={e => setKind(e.target.value)} className={selectClass}>
            {Object.entries(PROMO_KIND).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-code">
            Code {kind === "promo_code" && <span className="text-[#b3261e]">*</span>}
          </label>
          <input
            id="promo-code"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="PAPOT10"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-value">
            {kind === "percentage" ? "Remise (%)" : "Remise ($)"}
          </label>
          <input id="promo-value" value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-limit">
            Limite d'utilisation
          </label>
          <input
            id="promo-limit"
            value={limit}
            onChange={e => setLimit(e.target.value)}
            placeholder="Illimité"
            inputMode="numeric"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-min">
            Dépense minimum
          </label>
          <input id="promo-min" value={minSpend} onChange={e => setMinSpend(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-status">
            Statut
          </label>
          <select id="promo-status" value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
            <option value="draft">Brouillon</option>
            <option value="scheduled">Planifiée</option>
            <option value="active">Active</option>
            <option value="paused">En pause</option>
            <option value="expired">Expirée</option>
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-start">
            Début
          </label>
          <input id="promo-start" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-end">
            Fin
          </label>
          <input id="promo-end" type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} className={inputClass} />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>Services éligibles</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <label
                key={v}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors ${
                  kinds.includes(v) ? "border-[#002089] bg-[#f4f8fd] text-[#002089]" : "border-admin-line"
                }`}
              >
                <input
                  type="checkbox"
                  checked={kinds.includes(v)}
                  onChange={() => setKinds(k => (k.includes(v) ? k.filter(x => x !== v) : [...k, v]))}
                  className="h-3.5 w-3.5 accent-[#002089]"
                />
                {l}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-admin-ink-3">Aucun service coché : la campagne s'applique partout.</p>
        </fieldset>
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ Featured */

type Placement = {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  placement: string;
  priority: number;
  starts_on: string | null;
  ends_on: string | null;
  target_market: string | null;
  active: boolean;
};

const PLACEMENT_LABEL: Record<string, string> = {
  homepage_hero: "Bandeau d'accueil",
  homepage_grid: "Grille d'accueil",
  search_top: "Haut des résultats",
  destination_page: "Page destination",
  newsletter: "Infolettre",
};

/** Spec §39. */
export function Featured() {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [page, setPage] = useState(1);

  const { rows, total, loading, error, reload } = useTable<Placement>({
    from: "featured_placements",
    sort: { col: "priority", dir: "desc" },
    page,
    pageSize: 25,
  });

  const remove = (p: Placement) =>
    confirm({
      title: "Retirer cette mise en avant ?",
      consequence: "L'élément cesse immédiatement d'apparaître à cet emplacement du site public.",
      confirmLabel: "Retirer",
      danger: true,
      onConfirm: async () => {
        const { error } = await adminTable("featured_placements").delete().eq("id", p.id);
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<Placement>[] = [
    {
      id: "entity_label",
      header: "Élément",
      mobile: "primary",
      cell: p => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{p.entity_label ?? p.entity_id}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">
            {p.entity_type === "listing" ? "Annonce" : p.entity_type === "destination" ? "Destination" : "Partenaire"}
          </span>
        </span>
      ),
    },
    {
      id: "placement",
      header: "Emplacement",
      mobile: "secondary",
      cell: p => PLACEMENT_LABEL[p.placement] ?? p.placement,
    },
    { id: "priority", header: "Priorité", sortable: true, align: "right", mobile: "meta", cell: p => p.priority },
    {
      id: "period",
      header: "Période",
      mobile: "secondary",
      cell: p => `${p.starts_on ? day(p.starts_on) : "…"} → ${p.ends_on ? day(p.ends_on) : "…"}`,
    },
    { id: "target_market", header: "Marché", defaultHidden: true, mobile: "hidden", cell: p => p.target_market ?? "Tous" },
    {
      id: "active",
      header: "Statut",
      mobile: "meta",
      cell: p => <StatusBadge status={p.active ? "active" : "inactive"} />,
    },
  ];

  return (
    <>
      <PageHeader title="Mises en avant" subtitle="Ce qui apparaît en tête du site public, et pour combien de temps." />

      <div className="mb-5">
        <Callout>
          Les mises en avant sont lues directement par le site public : une ligne active dont la période
          couvre aujourd'hui est visible par les visiteurs.
        </Callout>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={p => p.id}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="featured"
        actions={[
          {
            label: "Activer / désactiver",
            hidden: () => !can("manage_promotions"),
            onClick: async p => {
              await adminTable("featured_placements").update({ active: !p.active }).eq("id", p.id);
              reload();
            },
          },
          { label: "Retirer", danger: true, hidden: () => !can("manage_promotions"), onClick: remove },
        ]}
        empty={{
          title: "Aucune mise en avant",
          body: "Mettez en avant une annonce ou une destination depuis sa fiche pour qu'elle apparaisse ici.",
        }}
      />

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

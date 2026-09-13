import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Button, PageHeader } from "../components/Ui";
import { Stat } from "../components/Cards";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { ConfirmDialog, useConfirm } from "../components/Dialog";
import { StatusBadge } from "../components/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,exportCsv, searchAcross, useDebounced, useRpc, useTable, type Filter } from "../lib/adminData";
import { ago, count, money } from "../lib/format";

export type ListingRow = {
  id: string;
  name: string;
  kind: string;
  type: string | null;
  city: string | null;
  country: string | null;
  location: string | null;
  price: number;
  currency: string;
  rating: number | null;
  reviews: number;
  status: string;
  img: string | null;
  updated_at: string;
  submitted_at: string | null;
  review_note: string | null;
  partner_id: string | null;
  partner_name: string | null;
  partner_type: string | null;
  bookings: number;
};

export const LISTING_STATUS_OPTIONS = [
  { value: "draft", label: "Brouillon" },
  { value: "pending_review", label: "En attente de revue" },
  { value: "approved", label: "Approuvée" },
  { value: "published", label: "Publiée" },
  { value: "paused", label: "En pause" },
  { value: "rejected", label: "Refusée" },
  { value: "suspended", label: "Suspendue" },
  { value: "archived", label: "Archivée" },
];

export const KIND_LABEL: Record<string, string> = {
  stay: "Hébergement",
  car: "Voiture",
  restaurant: "Restaurant",
};

/** Spec §17–§18. */
export function Listings() {
  return <ListingsTable title="Annonces" subtitle="Toutes les annonces de la plateforme, tous services confondus." />;
}

export function ListingsTable({
  title,
  subtitle,
  lockKind,
  lockPartnerType,
}: {
  title: string;
  subtitle: string;
  lockKind?: string;
  lockPartnerType?: string;
}) {
  const { can } = useAdmin();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { confirm, dialogProps } = useConfirm();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ col: "updated_at", dir: "desc" as const });
  const [selected, setSelected] = useState<string[]>([]);
  const debounced = useDebounced(search);

  const values = useMemo(() => {
    const v: Record<string, string[]> = {};
    for (const key of ["status", "kind", "city"]) {
      const raw = params.get(key);
      if (raw) v[key] = raw.split(",");
    }
    return v;
  }, [params]);

  const setValues = (v: Record<string, string[]>) => {
    const next = new URLSearchParams(params);
    for (const key of ["status", "kind", "city"]) {
      const list = v[key] ?? [];
      if (list.length) next.set(key, list.join(","));
      else next.delete(key);
    }
    setParams(next, { replace: true });
    setPage(1);
  };

  const partnerFilter = params.get("partner");

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["name", "city", "partner_name"], debounced)];
    if (lockKind) f.push({ col: "kind", op: "eq", value: lockKind });
    if (lockPartnerType) f.push({ col: "partner_type", op: "eq", value: lockPartnerType });
    if (partnerFilter) f.push({ col: "partner_id", op: "eq", value: partnerFilter });
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    if (values.kind?.length && !lockKind) f.push({ col: "kind", op: "in", value: values.kind });
    if (values.city?.length) f.push({ col: "city", op: "in", value: values.city });
    return f;
  }, [debounced, values, lockKind, lockPartnerType, partnerFilter]);

  const { rows, total, loading, error, reload } = useTable<ListingRow>({
    from: "admin_listing_rows",
    filters,
    sort,
    page,
    pageSize,
  });

  const { data: stats } = useRpc<{
    total: number;
    published: number;
    pending: number;
    paused: number;
    rejected: number;
  }>("admin_listing_stats");

  // Cities present in the data, so the filter never offers an empty option.
  const { rows: cityRows } = useTable<{ city: string }>({
    from: "admin_listing_rows",
    select: "city",
    pageSize: 200,
  });
  const cities = useMemo(
    () => [...new Set(cityRows.map(c => c.city).filter(Boolean))].sort() as string[],
    [cityRows],
  );

  const setStatus = (row: ListingRow, next: string, label: string, danger = false, needsReason = false) =>
    confirm({
      title: `${label} « ${row.name} » ?`,
      consequence:
        next === "published"
          ? "L'annonce devient immédiatement visible et réservable sur le site public."
          : next === "suspended"
            ? "L'annonce est retirée de la vente. Les réservations existantes ne sont pas annulées."
            : next === "paused"
              ? "L'annonce disparaît des résultats de recherche mais reste modifiable par le partenaire."
              : next === "rejected"
                ? "Le partenaire reçoit le motif et devra soumettre une version corrigée."
                : next === "archived"
                  ? "L'annonce est archivée et sort des listes de travail."
                  : "Le statut de l'annonce est mis à jour.",
      confirmLabel: label,
      danger,
      requireReason: needsReason,
      reasonLabel: next === "rejected" ? "Modifications requises" : "Motif",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_set_listing_status", {
          p_id: row.id,
          p_status: next,
          p_note: reason || null,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const bulkStatus = (ids: string[], next: string, label: string, clear: () => void) =>
    confirm({
      title: `${label} ${ids.length} annonce${ids.length > 1 ? "s" : ""} ?`,
      consequence:
        next === "published"
          ? `${ids.length} annonce(s) deviendront visibles et réservables sur le site public.`
          : `${ids.length} annonce(s) seront retirées de la vente.`,
      confirmLabel: label,
      danger: next !== "published",
      requireReason: next !== "published",
      onConfirm: async reason => {
        for (const id of ids) {
          const { error } = await adminRpc("admin_set_listing_status", {
            p_id: id,
            p_status: next,
            p_note: reason || null,
          });
          if (error) return adminError(error);
        }
        clear();
        reload();
        return null;
      },
    });

  const columns: Column<ListingRow>[] = [
    {
      id: "name",
      header: "Annonce",
      sortable: true,
      mobile: "primary",
      cell: r => (
        <span className="flex items-center gap-2.5">
          {r.img ? (
            <img
              src={r.img}
              alt=""
              loading="lazy"
              className="h-9 w-12 shrink-0 rounded-md border border-admin-line object-cover"
            />
          ) : (
            <span className="h-9 w-12 shrink-0 rounded-md bg-admin-canvas" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-admin-ink">{r.name}</span>
            <span className="block truncate text-[12px] text-admin-ink-3">
              {KIND_LABEL[r.kind] ?? r.kind}
              {r.type ? ` · ${r.type}` : ""}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "partner_name",
      header: "Partenaire",
      sortable: true,
      mobile: "secondary",
      cell: r =>
        r.partner_id ? (
          <span className="truncate">{r.partner_name ?? "—"}</span>
        ) : (
          <span className="text-admin-ink-3">Non rattachée</span>
        ),
    },
    { id: "city", header: "Ville", sortable: true, mobile: "secondary", cell: r => r.city ?? "—" },
    {
      id: "price",
      header: "Prix",
      sortable: true,
      align: "right",
      mobile: "hidden",
      cell: r => (Number(r.price) > 0 ? money(r.price, r.currency) : "—"),
    },
    { id: "bookings", header: "Réservations", sortable: true, align: "right", mobile: "hidden", cell: r => count(r.bookings) },
    {
      id: "rating",
      header: "Note",
      sortable: true,
      align: "right",
      mobile: "hidden",
      cell: r => (r.rating ? `${Number(r.rating).toFixed(1).replace(".", ",")}` : "—"),
    },
    {
      id: "updated_at",
      header: "Mise à jour",
      sortable: true,
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{ago(r.updated_at)}</span>,
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total" value={count(stats?.total ?? total)} />
        <Stat label="Publiées" value={count(stats?.published)} tone="positive" />
        <Stat label="À examiner" value={count(stats?.pending)} />
        <Stat label="En pause ou suspendues" value={count(stats?.paused)} />
        <Stat
          label="Refusées"
          value={count(stats?.rejected)}
          tone={Number(stats?.rejected ?? 0) > 0 ? "negative" : undefined}
        />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Nom de l'annonce, ville, partenaire…"
        filters={[
          { id: "status", label: "Statut", options: LISTING_STATUS_OPTIONS },
          ...(lockKind
            ? []
            : [
                {
                  id: "kind",
                  label: "Service",
                  options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
                },
              ]),
          { id: "city", label: "Ville", options: cities.map(c => ({ value: c, label: c })) },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage={`listings-${lockKind ?? lockPartnerType ?? "all"}`}
        onExport={() =>
          exportCsv("papot-annonces", rows as unknown as Record<string, unknown>[], [
            "name",
            "kind",
            "partner_name",
            "city",
            "price",
            "bookings",
            "rating",
            "status",
          ])
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => r.id}
        rowHref={r => `/admin/annonces/${r.id}`}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={s => {
          setPageSize(s);
          setPage(1);
        }}
        sort={sort}
        onSort={s => setSort(s as typeof sort)}
        selectable={can("moderate_listings")}
        selected={selected}
        onSelect={setSelected}
        storageKey="listings"
        bulkBar={(ids, clear) => (
          <>
            <Button size="sm" variant="primary" onClick={() => bulkStatus(ids, "published", "Publier", clear)}>
              Publier
            </Button>
            <Button size="sm" variant="secondary" onClick={() => bulkStatus(ids, "paused", "Mettre en pause", clear)}>
              Mettre en pause
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => bulkStatus(ids, "suspended", "Suspendre", clear)}>
              Suspendre
            </Button>
            <button onClick={clear} className="text-[12.5px] font-medium text-admin-ink-3 hover:text-admin-ink">
              Annuler
            </button>
          </>
        )}
        actions={[
          { label: "Ouvrir la revue", onClick: r => navigate(`/admin/annonces/${r.id}`) },
          {
            label: "Voir sur le site",
            hidden: r => r.status !== "published",
            onClick: r => window.open(`/p/${r.id}`, "_blank"),
          },
          {
            label: "Publier",
            hidden: r => !can("moderate_listings") || r.status === "published",
            onClick: r => setStatus(r, "published", "Publier"),
          },
          {
            label: "Mettre en pause",
            hidden: r => !can("moderate_listings") || r.status !== "published",
            onClick: r => setStatus(r, "paused", "Mettre en pause"),
          },
          {
            label: "Demander des modifications",
            hidden: r => !can("moderate_listings") || r.status === "rejected",
            onClick: r => setStatus(r, "rejected", "Demander des modifications", false, true),
          },
          {
            label: "Suspendre",
            danger: true,
            hidden: r => !can("moderate_listings") || r.status === "suspended",
            onClick: r => setStatus(r, "suspended", "Suspendre", true, true),
          },
          {
            label: "Archiver",
            danger: true,
            hidden: r => !can("moderate_listings") || r.status === "archived",
            onClick: r => setStatus(r, "archived", "Archiver", true),
          },
        ]}
        empty={{ title: "Aucune annonce", body: "Aucune annonce ne correspond à ces filtres." }}
      />

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

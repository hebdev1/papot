import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Button, PageHeader } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { FilterBar } from "../components/FilterBar";
import { ConfirmDialog, useConfirm } from "../../console/Dialog";
import { StatusBadge } from "../../console/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,exportCsv, searchAcross, useDebounced, useRpc, useTable, type Filter } from "../lib/adminData";
import { count, day, money, percent } from "../../console/format";

export type PartnerRow = {
  id: string;
  business_name: string;
  type: string;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string;
  status: string;
  verification: string;
  rating: number | null;
  commission_override: number | null;
  created_at: string;
  joined_at: string | null;
  listings: number;
  published_listings: number;
  bookings: number;
  revenue: number;
  outstanding_payout: number;
};

export const PARTNER_TYPE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  guesthouse: "Maison d'hôtes",
  car: "Location de voitures",
  restaurant: "Restaurant",
};

/** Spec §13–§14. */
export function Partners() {
  const { can } = useAdmin();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { confirm, dialogProps } = useConfirm();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ col: "business_name", dir: "asc" as const });

  const debounced = useDebounced(search);

  const values = useMemo(() => {
    const v: Record<string, string[]> = {};
    for (const key of ["status", "type", "verification"]) {
      const raw = params.get(key);
      if (raw) v[key] = raw.split(",");
    }
    return v;
  }, [params]);

  const setValues = (v: Record<string, string[]>) => {
    const next = new URLSearchParams(params);
    for (const key of ["status", "type", "verification"]) {
      const list = v[key] ?? [];
      if (list.length) next.set(key, list.join(","));
      else next.delete(key);
    }
    setParams(next, { replace: true });
    setPage(1);
  };

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["business_name", "email", "city", "owner_name"], debounced)];
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    if (values.type?.length) f.push({ col: "type", op: "in", value: values.type });
    if (values.verification?.length) f.push({ col: "verification", op: "in", value: values.verification });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<PartnerRow>({
    from: "admin_partner_rows",
    filters,
    sort,
    page,
    pageSize,
  });

  const { data: stats } = useRpc<{
    total: number;
    active: number;
    pending: number;
    suspended: number;
    unverified: number;
  }>("admin_partner_stats");

  const setStatus = (row: PartnerRow, next: "suspended" | "active") =>
    confirm({
      title: next === "suspended" ? `Suspendre ${row.business_name} ?` : `Réactiver ${row.business_name} ?`,
      consequence:
        next === "suspended"
          ? `Ses ${count(row.published_listings)} annonce(s) publiée(s) seront immédiatement retirées de la vente et le resteront jusqu'à la réactivation du compte.`
          : "Le partenaire pourra de nouveau recevoir des réservations. Ses annonces devront être republiées une par une.",
      confirmLabel: next === "suspended" ? "Suspendre le partenaire" : "Réactiver",
      danger: next === "suspended",
      requireReason: next === "suspended",
      reasonLabel: "Motif de la suspension",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_set_partner_status", {
          p_id: row.id,
          p_status: next,
          p_reason: reason || null,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<PartnerRow>[] = [
    {
      id: "business_name",
      header: "Entreprise",
      sortable: true,
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{r.business_name}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">
            {PARTNER_TYPE_LABEL[r.type] ?? r.type}
            {r.city ? ` · ${r.city}` : ""}
          </span>
        </span>
      ),
    },
    {
      id: "id",
      header: "Identifiant",
      defaultHidden: true,
      mobile: "hidden",
      cell: r => <code className="text-[11.5px] text-admin-ink-3">{r.id.slice(0, 8)}</code>,
    },
    {
      id: "type",
      header: "Type",
      sortable: true,
      defaultHidden: true,
      mobile: "hidden",
      cell: r => PARTNER_TYPE_LABEL[r.type] ?? r.type,
    },
    { id: "owner_name", header: "Responsable", mobile: "hidden", cell: r => r.owner_name ?? "—" },
    { id: "city", header: "Ville", sortable: true, mobile: "secondary", cell: r => r.city ?? "—" },
    {
      id: "listings",
      header: "Annonces",
      sortable: true,
      align: "right",
      mobile: "secondary",
      cell: r => (
        <span>
          {count(r.published_listings)}
          <span className="text-admin-ink-3"> / {count(r.listings)}</span>
        </span>
      ),
    },
    { id: "bookings", header: "Réservations", sortable: true, align: "right", mobile: "hidden", cell: r => count(r.bookings) },
    {
      id: "revenue",
      header: "Revenus",
      sortable: true,
      align: "right",
      mobile: "secondary",
      cell: r => <span className="font-semibold">{money(r.revenue)}</span>,
    },
    {
      id: "outstanding_payout",
      header: "À verser",
      sortable: true,
      align: "right",
      defaultHidden: true,
      mobile: "hidden",
      cell: r => (r.outstanding_payout > 0 ? money(r.outstanding_payout) : "—"),
    },
    {
      id: "rating",
      header: "Note",
      sortable: true,
      align: "right",
      mobile: "hidden",
      cell: r => (r.rating ? `${Number(r.rating).toFixed(1).replace(".", ",")}/5` : "—"),
    },
    {
      id: "verification",
      header: "Vérification",
      sortable: true,
      mobile: "hidden",
      cell: r => <StatusBadge status={r.verification} />,
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Partenaires"
        subtitle="Hôtels, maisons d'hôtes, loueurs de voitures et restaurants présents sur la plateforme."
        actions={
          can("manage_verification") ? (
            <Button as="link" to="/admin/verification" variant="primary">
              File de vérification
              {Number(stats?.pending ?? 0) > 0 && (
                <span className="ml-1 rounded bg-white/20 px-1.5 text-[11px] font-bold">{stats?.pending}</span>
              )}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total partenaires" value={count(stats?.total ?? total)} />
        <Stat label="Actifs" value={count(stats?.active)} tone="positive" />
        <Stat label="En attente d'approbation" value={count(stats?.pending)} />
        <Stat
          label="Suspendus"
          value={count(stats?.suspended)}
          tone={Number(stats?.suspended ?? 0) > 0 ? "negative" : undefined}
        />
        <Stat label="Vérification requise" value={count(stats?.unverified)} />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Nom de l'entreprise, courriel, ville…"
        filters={[
          {
            id: "type",
            label: "Type",
            options: Object.entries(PARTNER_TYPE_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "active", label: "Actif" },
              { value: "pending", label: "En attente" },
              { value: "suspended", label: "Suspendu" },
              { value: "rejected", label: "Refusé" },
              { value: "inactive", label: "Inactif" },
            ],
          },
          {
            id: "verification",
            label: "Vérification",
            options: [
              { value: "verified", label: "Vérifié" },
              { value: "in_review", label: "En examen" },
              { value: "pending", label: "En attente" },
              { value: "unverified", label: "Non vérifié" },
              { value: "expired", label: "Expiré" },
              { value: "rejected", label: "Refusé" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="partners"
        onExport={() =>
          exportCsv("papot-partenaires", rows as unknown as Record<string, unknown>[], [
            "business_name",
            "type",
            "city",
            "status",
            "verification",
            "listings",
            "bookings",
            "revenue",
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
        rowHref={r => `/admin/partenaires/${r.id}`}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={s => {
          setPageSize(s);
          setPage(1);
        }}
        sort={sort}
        onSort={s => setSort(s as typeof sort)}
        storageKey="partners"
        actions={[
          { label: "Voir le partenaire", onClick: r => navigate(`/admin/partenaires/${r.id}`) },
          { label: "Voir ses annonces", onClick: r => navigate(`/admin/annonces?partner=${r.id}`) },
          {
            label: "Suspendre",
            danger: true,
            hidden: r => r.status !== "active" || !can("suspend_partners"),
            onClick: r => setStatus(r, "suspended"),
          },
          {
            label: "Réactiver",
            hidden: r => r.status === "active" || !can("approve_partners"),
            onClick: r => setStatus(r, "active"),
          },
          {
            label: "Contacter",
            hidden: r => !r.email,
            onClick: r => {
              window.location.href = `mailto:${r.email}`;
            },
          },
        ]}
        empty={{
          title: "Aucun partenaire",
          body: "Les entreprises approuvées depuis la file de vérification apparaîtront ici.",
          action: can("manage_verification") ? (
            <Button as="link" to="/admin/verification" variant="primary">
              Ouvrir la file de vérification
            </Button>
          ) : undefined,
        }}
      />

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export { day, percent };

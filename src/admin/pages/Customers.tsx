import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHeader } from "../components/Ui";
import { Stat } from "../components/Cards";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { ConfirmDialog, useConfirm } from "../components/Dialog";
import { StatusBadge } from "../components/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,exportCsv, searchAcross, useDebounced, useRpc, useTable, type Filter } from "../lib/adminData";
import { ago, avatarTint, count, day, initials, money } from "../lib/format";

export type CustomerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  locale: string | null;
  status: string;
  suspended_reason: string | null;
  risk_flags: string[];
  created_at: string;
  last_seen_at: string | null;
  bookings: number;
  total_spend: number;
  last_booking_at: string | null;
};

/** Spec §10–§11. */
export function Customers() {
  const { can } = useAdmin();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { confirm, dialogProps } = useConfirm();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ col: "created_at", dir: "desc" as const });
  const [selected, setSelected] = useState<string[]>([]);
  const debounced = useDebounced(search);

  const values = useMemo(() => {
    const v: Record<string, string[]> = {};
    for (const key of ["status", "country", "activity"]) {
      const raw = params.get(key);
      if (raw) v[key] = raw.split(",");
    }
    return v;
  }, [params]);

  const setValues = (v: Record<string, string[]>) => {
    const next = new URLSearchParams(params);
    for (const key of ["status", "country", "activity"]) {
      const list = v[key] ?? [];
      if (list.length) next.set(key, list.join(","));
      else next.delete(key);
    }
    setParams(next, { replace: true });
    setPage(1);
  };

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["full_name", "email", "phone"], debounced)];
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    if (values.country?.length) f.push({ col: "country", op: "in", value: values.country });
    if (values.activity?.includes("with_bookings")) f.push({ col: "bookings", op: "gt", value: 0 });
    if (values.activity?.includes("no_bookings")) f.push({ col: "bookings", op: "eq", value: 0 });
    if (values.activity?.includes("high_value")) f.push({ col: "total_spend", op: "gte", value: 500 });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<CustomerRow>({
    from: "admin_customer_rows",
    filters,
    sort,
    page,
    pageSize,
  });

  const { data: stats } = useRpc<{ total: number; active: number; new_month: number; suspended: number }>(
    "admin_customer_stats",
  );

  const suspend = (row: CustomerRow) =>
    confirm({
      title: `Suspendre ${row.full_name ?? "ce client"} ?`,
      consequence:
        "Le compte ne pourra plus se connecter ni réserver. Les réservations déjà confirmées ne sont pas annulées automatiquement.",
      confirmLabel: "Suspendre le compte",
      danger: true,
      requireReason: true,
      reasonLabel: "Motif de la suspension",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_set_customer_status", {
          p_id: row.id,
          p_status: "suspended",
          p_reason: reason,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const reactivate = (row: CustomerRow) =>
    confirm({
      title: `Réactiver ${row.full_name ?? "ce client"} ?`,
      consequence: "Le compte pourra de nouveau se connecter et réserver.",
      confirmLabel: "Réactiver",
      onConfirm: async () => {
        const { error } = await adminRpc("admin_set_customer_status", {
          p_id: row.id,
          p_status: "active",
          p_reason: null,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<CustomerRow>[] = [
    {
      id: "full_name",
      header: "Client",
      sortable: true,
      mobile: "primary",
      cell: r => (
        <span className="flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-content-center rounded-full text-[11px] font-bold text-white"
            style={{ background: avatarTint(r.full_name ?? r.email) }}
            aria-hidden
          >
            {initials(r.full_name ?? r.email)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-admin-ink">{r.full_name ?? "Sans nom"}</span>
            <span className="block truncate text-[12px] text-admin-ink-3">{r.email ?? "—"}</span>
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
    { id: "phone", header: "Téléphone", mobile: "secondary", cell: r => r.phone ?? "—" },
    { id: "country", header: "Pays", sortable: true, mobile: "hidden", cell: r => r.country ?? "Haïti" },
    {
      id: "bookings",
      header: "Réservations",
      sortable: true,
      align: "right",
      mobile: "secondary",
      cell: r => count(r.bookings),
    },
    {
      id: "total_spend",
      header: "Total dépensé",
      sortable: true,
      align: "right",
      mobile: "secondary",
      cell: r => <span className="font-semibold">{money(r.total_spend)}</span>,
    },
    {
      id: "last_booking_at",
      header: "Dernière activité",
      sortable: true,
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{ago(r.last_booking_at ?? r.created_at)}</span>,
    },
    {
      id: "created_at",
      header: "Inscription",
      sortable: true,
      defaultHidden: true,
      mobile: "hidden",
      cell: r => day(r.created_at),
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Comptes voyageurs, leurs réservations et leur historique de dépenses."
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total clients" value={count(stats?.total ?? total)} />
        <Stat label="Actifs" value={count(stats?.active)} />
        <Stat label="Nouveaux ce mois" value={count(stats?.new_month)} />
        <Stat
          label="Comptes suspendus"
          value={count(stats?.suspended)}
          tone={Number(stats?.suspended ?? 0) > 0 ? "negative" : undefined}
        />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Nom, courriel, téléphone, identifiant client…"
        filters={[
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "active", label: "Actif" },
              { value: "suspended", label: "Suspendu" },
              { value: "closed", label: "Fermé" },
            ],
          },
          {
            id: "country",
            label: "Pays",
            options: [
              { value: "Haïti", label: "Haïti" },
              { value: "United States", label: "États-Unis" },
              { value: "Canada", label: "Canada" },
              { value: "France", label: "France" },
            ],
          },
          {
            id: "activity",
            label: "Activité",
            options: [
              { value: "with_bookings", label: "A déjà réservé" },
              { value: "no_bookings", label: "Aucune réservation" },
              { value: "high_value", label: "Plus de 500 $ dépensés" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="customers"
        onExport={() =>
          exportCsv("papot-clients", rows as unknown as Record<string, unknown>[], [
            "full_name",
            "email",
            "phone",
            "country",
            "status",
            "bookings",
            "total_spend",
            "created_at",
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
        rowHref={r => `/admin/clients/${r.id}`}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={s => {
          setPageSize(s);
          setPage(1);
        }}
        sort={sort}
        onSort={s => setSort(s as typeof sort)}
        selectable={can("suspend_customers")}
        selected={selected}
        onSelect={setSelected}
        storageKey="customers"
        bulkBar={(ids, clear) => (
          <span className="text-[12.5px] text-admin-ink-2">
            Les actions de masse sur les comptes clients ne sont pas disponibles : chaque suspension exige
            un motif propre au dossier.{" "}
            <button onClick={clear} className="font-semibold text-[#002089] underline-offset-2 hover:underline">
              Désélectionner ({ids.length})
            </button>
          </span>
        )}
        actions={[
          { label: "Voir le profil", onClick: r => navigate(`/admin/clients/${r.id}`) },
          { label: "Voir les réservations", onClick: r => navigate(`/admin/reservations?customer=${r.id}`) },
          {
            label: "Suspendre le compte",
            danger: true,
            hidden: r => r.status !== "active" || !can("suspend_customers"),
            onClick: suspend,
          },
          {
            label: "Réactiver le compte",
            hidden: r => r.status === "active" || !can("suspend_customers"),
            onClick: reactivate,
          },
        ]}
        empty={{
          title: "Aucun client",
          body:
            total === 0 && !search
              ? "Les comptes créés sur le site apparaîtront ici."
              : "Aucun client ne correspond à ces filtres.",
        }}
      />

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export { Users };

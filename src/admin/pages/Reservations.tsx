import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { PageHeader } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { FilterBar } from "../components/FilterBar";
import { ConfirmDialog, useConfirm } from "../../console/Dialog";
import { StatusBadge } from "../../console/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,exportCsv, searchAcross, useDebounced, useRpc, useTable, type Filter } from "../lib/adminData";
import { count, money, range, stamp } from "../../console/format";
import { KIND_LABEL } from "./Listings";

export type ReservationRow = {
  id: string;
  reference: string;
  created_at: string;
  status: string;
  total: number;
  currency: string;
  payment_method: string | null;
  user_id: string | null;
  customer_label: string | null;
  customer_email: string | null;
  kinds: string[] | null;
  item_count: number;
  starts_on: string | null;
  ends_on: string | null;
  first_title: string | null;
  partner_id: string | null;
  partner_name: string | null;
  payment_status: string | null;
  payment_id: string | null;
};

/** Spec §24–§25. */
export function Reservations() {
  const { can } = useAdmin();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { confirm, dialogProps } = useConfirm();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ col: "created_at", dir: "desc" as const });
  const debounced = useDebounced(search);

  const values = useMemo(() => {
    const v: Record<string, string[]> = {};
    for (const key of ["status", "payment", "service"]) {
      const raw = params.get(key);
      if (raw) v[key] = raw.split(",");
    }
    return v;
  }, [params]);

  const setValues = (v: Record<string, string[]>) => {
    const next = new URLSearchParams(params);
    for (const key of ["status", "payment", "service"]) {
      const list = v[key] ?? [];
      if (list.length) next.set(key, list.join(","));
      else next.delete(key);
    }
    setParams(next, { replace: true });
    setPage(1);
  };

  const customerFilter = params.get("customer");

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [
      ...searchAcross(["reference", "customer_label", "customer_email", "partner_name"], debounced),
    ];
    if (customerFilter) f.push({ col: "user_id", op: "eq", value: customerFilter });
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    if (values.payment?.length) f.push({ col: "payment_status", op: "in", value: values.payment });
    return f;
  }, [debounced, values, customerFilter]);

  const { rows, total, loading, error, reload } = useTable<ReservationRow>({
    from: "admin_reservation_rows",
    filters,
    sort,
    page,
    pageSize,
  });

  const { data: stats } = useRpc<{
    today: number;
    upcoming: number;
    pending: number;
    completed: number;
    cancelled: number;
    disputed: number;
  }>("admin_reservation_stats");

  const cancel = (row: ReservationRow) =>
    confirm({
      title: `Annuler la réservation ${row.reference} ?`,
      consequence:
        "La réservation et toutes ses lignes passent en annulé. Le remboursement éventuel doit être traité séparément dans Remboursements.",
      confirmLabel: "Annuler la réservation",
      danger: true,
      requireReason: true,
      reasonLabel: "Motif de l'annulation",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_cancel_booking", {
          p_reference: row.reference,
          p_reason: reason,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<ReservationRow>[] = [
    {
      id: "reference",
      header: "Référence",
      sortable: true,
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-admin-ink">{r.reference}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{r.first_title ?? "—"}</span>
        </span>
      ),
    },
    {
      id: "kinds",
      header: "Service",
      mobile: "hidden",
      cell: r =>
        r.kinds?.length ? (
          <span className="flex flex-wrap gap-1">
            {r.kinds.map(k => (
              <span key={k} className="rounded bg-admin-canvas px-1.5 py-0.5 text-[11.5px] text-admin-ink-2">
                {KIND_LABEL[k] ?? k}
              </span>
            ))}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "customer_label",
      header: "Client",
      sortable: true,
      mobile: "secondary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate">{r.customer_label ?? "—"}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{r.customer_email ?? ""}</span>
        </span>
      ),
    },
    { id: "partner_name", header: "Partenaire", mobile: "hidden", cell: r => r.partner_name ?? "—" },
    {
      id: "starts_on",
      header: "Dates",
      sortable: true,
      mobile: "secondary",
      cell: r => range(r.starts_on, r.ends_on),
    },
    {
      id: "total",
      header: "Montant",
      sortable: true,
      align: "right",
      mobile: "meta",
      cell: r => <span className="font-semibold">{money(r.total, r.currency)}</span>,
    },
    {
      id: "payment_status",
      header: "Paiement",
      mobile: "hidden",
      cell: r => (r.payment_status ? <StatusBadge status={r.payment_status} /> : <span className="text-admin-ink-3">—</span>),
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
    {
      id: "created_at",
      header: "Créée",
      sortable: true,
      defaultHidden: true,
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{stamp(r.created_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Réservations"
        subtitle="Tous les services réservés sur la plateforme, dans une seule vue."
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Aujourd'hui" value={count(stats?.today)} />
        <Stat label="À venir" value={count(stats?.upcoming)} />
        <Stat label="En attente" value={count(stats?.pending)} />
        <Stat label="Terminées" value={count(stats?.completed)} />
        <Stat label="Annulées" value={count(stats?.cancelled)} />
        <Stat
          label="En litige"
          value={count(stats?.disputed)}
          tone={Number(stats?.disputed ?? 0) > 0 ? "negative" : undefined}
        />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Référence, client, partenaire…"
        filters={[
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "confirmed", label: "Confirmée" },
              { value: "pending", label: "En attente" },
              { value: "cancelled", label: "Annulée" },
            ],
          },
          {
            id: "payment",
            label: "Paiement",
            options: [
              { value: "paid", label: "Payé" },
              { value: "pending", label: "En attente" },
              { value: "failed", label: "Échoué" },
              { value: "refunded", label: "Remboursé" },
              { value: "partially_refunded", label: "Partiellement remboursé" },
              { value: "disputed", label: "Contesté" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="reservations"
        onExport={() =>
          exportCsv("papot-reservations", rows as unknown as Record<string, unknown>[], [
            "reference",
            "customer_label",
            "partner_name",
            "starts_on",
            "ends_on",
            "total",
            "status",
            "payment_status",
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
        rowKey={r => r.reference}
        rowHref={r => `/admin/reservations/${r.reference}`}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={s => {
          setPageSize(s);
          setPage(1);
        }}
        sort={sort}
        onSort={s => setSort(s as typeof sort)}
        storageKey="reservations"
        actions={[
          { label: "Voir la réservation", onClick: r => navigate(`/admin/reservations/${r.reference}`) },
          {
            label: "Contacter le client",
            hidden: r => !r.customer_email,
            onClick: r => {
              window.location.href = `mailto:${r.customer_email}`;
            },
          },
          {
            label: "Voir le partenaire",
            hidden: r => !r.partner_id,
            onClick: r => navigate(`/admin/partenaires/${r.partner_id}`),
          },
          {
            label: "Annuler la réservation",
            danger: true,
            hidden: r => !can("cancel_bookings") || r.status === "cancelled",
            onClick: cancel,
          },
        ]}
        empty={{
          title: "Aucune réservation",
          body:
            total === 0
              ? "Les réservations effectuées sur le site apparaîtront ici dès la première commande."
              : "Aucune réservation ne correspond à ces filtres.",
        }}
      />

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

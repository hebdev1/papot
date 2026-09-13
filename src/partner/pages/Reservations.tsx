import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, Inbox, LogIn, LogOut, Mail, XCircle } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, Field, FieldGrid, PageHeader, Skeleton, Tabs } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { StatusBadge } from "../../console/StatusBadge";
import { ConfirmDialog, useConfirm } from "../../console/Dialog";
import { friendlyError, searchAcross, table, useDebounced, useRow, useTable, type Filter } from "../../console/data";
import { count, money, range, stamp } from "../../console/format";
import { FilterBar } from "../components/FilterBar";
import { usePartner } from "../lib/partnerAuth";

type ReservationRow = {
  id: string;
  reference: string;
  created_at: string;
  status: string;
  total: number;
  currency: string;
  customer_label: string | null;
  customer_email: string | null;
  kinds: string[] | null;
  item_count: number;
  starts_on: string | null;
  ends_on: string | null;
  first_title: string | null;
  payment_status: string | null;
  partner_id: string | null;
};

const TABS = [
  { id: "all", label: "Toutes" },
  { id: "today", label: "Aujourd'hui" },
  { id: "upcoming", label: "À venir" },
  { id: "pending", label: "À confirmer" },
  { id: "confirmed", label: "Confirmées" },
  { id: "cancelled", label: "Annulées" },
];

/** Spec §16–§17. */
export function Reservations() {
  const { active } = usePartner();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const today = new Date().toISOString().slice(0, 10);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      ...searchAcross(["reference", "customer_label", "customer_email"], debounced),
    ];
    if (tab === "today") f.push({ col: "starts_on", op: "eq", value: today });
    if (tab === "upcoming") f.push({ col: "starts_on", op: "gt", value: today });
    if (tab === "pending") f.push({ col: "status", op: "eq", value: "pending" });
    if (tab === "confirmed") f.push({ col: "status", op: "eq", value: "confirmed" });
    if (tab === "cancelled") f.push({ col: "status", op: "eq", value: "cancelled" });
    return f;
  }, [active, debounced, tab, today]);

  const { rows, total, loading, error, reload } = useTable<ReservationRow>({
    from: "admin_reservation_rows",
    filters,
    sort: { col: "starts_on", dir: "desc" },
    page,
    pageSize: 25,
    enabled: !!active,
  });

  const columns: Column<ReservationRow>[] = [
    {
      id: "reference",
      header: "Réservation",
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-admin-ink">{r.customer_label ?? r.reference}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{r.reference}</span>
        </span>
      ),
    },
    { id: "first_title", header: "Service", mobile: "secondary", cell: r => r.first_title ?? "—" },
    { id: "starts_on", header: "Dates", sortable: true, mobile: "secondary", cell: r => range(r.starts_on, r.ends_on) },
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
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader title="Réservations" subtitle="Tout ce qui a été réservé chez vous." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total" value={count(total)} />
        <Stat label="Aujourd'hui" value={count(rows.filter(r => r.starts_on === today).length)} />
        <Stat label="À confirmer" value={count(rows.filter(r => r.status === "pending").length)} />
        <Stat label="Confirmées" value={count(rows.filter(r => r.status === "confirmed").length)} />
        <Stat label="Annulées" value={count(rows.filter(r => r.status === "cancelled").length)} />
        <Stat label="Montant listé" value={money(rows.reduce((s, r) => s + Number(r.total), 0))} />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1); }} />

      <FilterBar
        search={search}
        onSearch={v => { setSearch(v); setPage(1); }}
        placeholder="Référence, client, courriel…"
        values={{}}
        onChange={() => {}}
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => r.reference}
        rowHref={r => `/partenaire/reservations/${r.reference}`}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="partner-reservations"
        empty={{
          title: "Aucune réservation",
          body: "Les nouvelles réservations apparaîtront ici dès qu'un client réservera chez vous.",
        }}
      />
    </>
  );
}

type Item = {
  id: string;
  title: string;
  detail: string | null;
  kind: string;
  amount: number;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  party: number | null;
};

/** Spec §18–§21: the detail adapts its wording and actions to the service. */
export function ReservationDetail() {
  const { reference } = useParams();
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();

  const { row, loading, reload } = useRow<ReservationRow>("admin_reservation_rows", {
    reference: reference ?? "",
  });

  const items = useTable<Item>({
    from: "booking_items",
    select: "id, title, detail, kind, amount, status, starts_on, ends_on, start_time, party",
    filters: [{ col: "booking_id", op: "eq", value: row?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 20,
    enabled: !!row?.id,
  });

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!row) {
    return (
      <>
        <PageHeader title="Réservation introuvable" breadcrumb={[{ label: "Réservations", to: "/partenaire/reservations" }]} />
        <EmptyState
          icon={Inbox}
          title="Cette réservation n'existe pas ou ne vous appartient pas."
          action={<Button as="link" to="/partenaire/reservations" variant="secondary">Retour</Button>}
        />
      </>
    );
  }

  const kind = items.rows[0]?.kind ?? "stay";

  const setStatus = (next: string, label: string, consequence: string, danger = false) =>
    confirm({
      title: `${label} la réservation ${row.reference} ?`,
      consequence,
      confirmLabel: label,
      danger,
      onConfirm: async () => {
        const { error } = await table("bookings").update({ status: next }).eq("id", row.id);
        if (error) return friendlyError(error);
        reload();
        return null;
      },
    });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Réservations", to: "/partenaire/reservations" }, { label: row.reference }]}
        title={row.customer_label ?? row.reference}
        subtitle={`${row.reference} · créée le ${stamp(row.created_at)}`}
        actions={
          <>
            {row.customer_email && (
              <Button as="link" to={`mailto:${row.customer_email}`} variant="secondary">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                Écrire au client
              </Button>
            )}
            {can("manage_reservations") && row.status === "pending" && (
              <Button
                variant="primary"
                onClick={() =>
                  setStatus("confirmed", "Confirmer", "Le client reçoit la confirmation et la réservation est garantie.")
                }
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Confirmer
              </Button>
            )}
            {can("manage_reservations") && row.status !== "cancelled" && (
              <Button
                variant="dangerGhost"
                onClick={() =>
                  setStatus(
                    "cancelled",
                    "Annuler",
                    "Le client est prévenu. Une annulation de votre fait peut affecter votre classement et déclencher un remboursement.",
                    true,
                  )
                }
              >
                <XCircle className="h-3.5 w-3.5" aria-hidden />
                Annuler
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} size="medium" />
        {row.payment_status && <StatusBadge status={row.payment_status} size="medium" />}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader title="Client" />
            <FieldGrid cols={2}>
              <Field label="Nom">{row.customer_label ?? "—"}</Field>
              <Field label="Courriel">{row.customer_email ?? "—"}</Field>
              <Field label="Réservé le">{stamp(row.created_at)}</Field>
              <Field label="Lignes">{count(row.item_count)}</Field>
            </FieldGrid>
          </Card>

          <Card padded={false}>
            <div className="border-b border-admin-line px-5 py-4">
              <h2 className="font-display text-[15px] font-semibold text-admin-ink">
                {kind === "car" ? "Véhicule et dates" : kind === "restaurant" ? "Table et heure" : "Séjour"}
              </h2>
            </div>
            {items.loading ? (
              <div className="p-5"><Skeleton className="h-20 w-full" /></div>
            ) : (
              <ul className="divide-y divide-admin-line">
                {items.rows.map(i => (
                  <li key={i.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-admin-ink">{i.title}</p>
                        {i.detail && <p className="text-[12px] text-admin-ink-3">{i.detail}</p>}
                      </div>
                      <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">{money(i.amount)}</span>
                    </div>

                    <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-3">
                      {i.kind === "stay" && (
                        <>
                          <Field label="Arrivée">{range(i.starts_on, null)}</Field>
                          <Field label="Départ">{range(i.ends_on, null)}</Field>
                          <Field label="Voyageurs">{i.party ?? "—"}</Field>
                        </>
                      )}
                      {i.kind === "car" && (
                        <>
                          <Field label="Prise en charge">{range(i.starts_on, null)}</Field>
                          <Field label="Retour">{range(i.ends_on, null)}</Field>
                          <Field label="Heure">{i.start_time?.slice(0, 5) ?? "—"}</Field>
                        </>
                      )}
                      {i.kind === "restaurant" && (
                        <>
                          <Field label="Date">{range(i.starts_on, null)}</Field>
                          <Field label="Heure">{i.start_time?.slice(0, 5) ?? "—"}</Field>
                          <Field label="Couverts">{i.party ?? "—"}</Field>
                        </>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-admin-line bg-admin-raised px-5 py-3.5">
              <span className="text-[13px] font-semibold text-admin-ink">Total</span>
              <span className="font-display text-[17px] font-semibold tabular-nums text-admin-ink">
                {money(row.total, row.currency)}
              </span>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {can("manage_reservations") && (
            <Card>
              <CardHeader
                title="Suivi sur place"
                subtitle={
                  kind === "car"
                    ? "Marquez le départ et le retour du véhicule."
                    : kind === "restaurant"
                      ? "Marquez l'arrivée des convives."
                      : "Marquez l'arrivée et le départ du client."
                }
              />
              <div className="flex flex-col gap-2">
                <Button variant="secondary" className="justify-start" disabled>
                  <LogIn className="h-3.5 w-3.5" aria-hidden />
                  {kind === "car" ? "Véhicule récupéré" : kind === "restaurant" ? "Client installé" : "Arrivée enregistrée"}
                </Button>
                <Button variant="secondary" className="justify-start" disabled>
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  {kind === "car" ? "Véhicule rendu" : "Terminé"}
                </Button>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-admin-ink-3">
                Le suivi d'arrivée et de départ demande une colonne d'état par ligne de
                réservation, qui n'existe pas encore. Confirmer et annuler fonctionnent déjà.
              </p>
            </Card>
          )}

          <Card>
            <CardHeader title="Paiement" />
            <FieldGrid cols={2}>
              <Field label="Statut">
                {row.payment_status ? <StatusBadge status={row.payment_status} /> : "Aucun paiement"}
              </Field>
              <Field label="Montant">{money(row.total, row.currency)}</Field>
            </FieldGrid>
            <p className="mt-3 text-[12px] leading-relaxed text-admin-ink-3">
              Les paiements sont encaissés par PAPOT puis reversés dans votre prochain
              versement, moins la commission.
            </p>
          </Card>
        </div>
      </div>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export { ClipboardCheck, Link };

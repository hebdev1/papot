import { useState } from "react";
import { Coins, Download, FileText, Receipt, Wallet } from "lucide-react";
import { Button, Callout, Card, CardHeader, EmptyState, Field, FieldGrid, PageHeader, Skeleton } from "../../console/Ui";
import { MetricCard, Stat } from "../../console/Cards";
import { StatusBadge } from "../../console/StatusBadge";
import { LineChart } from "../../console/Charts";
import { DataTable, type Column } from "../../console/DataTable";
import { exportCsv, useRpc, useTable } from "../../console/data";
import { count, day, dayShort, money, moneyShort, range, stamp } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type Overview = {
  revenue_month: { current: number; previous: number };
  pending_payout: number;
  next_payout: { amount: number; period_end: string; status: string } | null;
};

type SeriesRow = { day: string; revenue: number; bookings: number };

/** Spec §35–§36. */
export function Finance() {
  const { active } = usePartner();
  const [days, setDays] = useState(30);

  const { data, loading } = useRpc<Overview>("partner_overview", { p_partner: active?.partner_id }, !!active);
  const { data: series } = useRpc<SeriesRow[]>(
    "partner_revenue_series",
    { p_partner: active?.partner_id, p_days: days },
    !!active,
  );

  const payouts = useTable<{ id: string; net: number; status: string }>({
    from: "payouts",
    select: "id, net, status",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    pageSize: 200,
    enabled: !!active,
  });

  const paid = payouts.rows.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.net), 0);
  const gross = (series ?? []).reduce((s, r) => s + Number(r.revenue), 0);

  return (
    <>
      <PageHeader title="Finance" subtitle="Ce que vous avez gagné, et ce qui vous sera versé." />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Revenus ce mois"
          value={moneyShort(data?.revenue_month.current)}
          changePct={null}
          comparison="Réservations non annulées"
          trend={(series ?? []).map(s => Number(s.revenue))}
          loading={loading}
        />
        <MetricCard
          label="En attente de versement"
          value={moneyShort(data?.pending_payout)}
          changePct={null}
          comparison="Prêt, en cours ou retenu"
          tone="orange"
          loading={loading}
          to="/partenaire/versements"
        />
        <MetricCard
          label="Déjà versé"
          value={moneyShort(paid)}
          changePct={null}
          comparison="Total réglé à ce jour"
          loading={payouts.loading}
          to="/partenaire/versements"
        />
      </div>

      {data?.next_payout && (
        <Card className="mb-6 border-[#002089]/25 bg-[#f4f8fd]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[12.5px] font-semibold uppercase tracking-wider text-[#5b7bb5]">
                Prochain versement
              </p>
              <p className="mt-1 font-display text-[28px] font-semibold leading-none text-[#002089]">
                {money(data.next_payout.amount)}
              </p>
              <p className="mt-1.5 text-[13px] text-[#1e3a6b]">
                Période close le {day(data.next_payout.period_end)}
              </p>
            </div>
            <StatusBadge status={data.next_payout.status} size="medium" />
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader
          title="Revenus dans le temps"
          action={
            <div className="flex items-center gap-1">
              {[7, 30, 90, 365].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`rounded-md px-2 py-1 text-[12px] font-semibold transition-colors ${
                    days === d ? "bg-[#002089] text-white" : "text-admin-ink-3 hover:bg-admin-canvas"
                  }`}
                >
                  {d === 365 ? "12 mois" : d === 90 ? "3 mois" : `${d} j`}
                </button>
              ))}
            </div>
          }
        />
        {series ? (
          <LineChart
            labels={series.map(s => dayShort(s.day))}
            series={[{ label: "Revenus", values: series.map(s => Number(s.revenue)), tone: "blue" }]}
            formatValue={v => moneyShort(v)}
          />
        ) : (
          <Skeleton className="h-[240px] w-full" />
        )}
        <p className="mt-3 text-[12.5px] text-admin-ink-3">
          Total sur la période : <strong className="font-semibold text-admin-ink">{money(gross)}</strong>
        </p>
      </Card>

      <Callout>
        PAPOT encaisse le paiement du client, prélève sa commission et vous reverse le reste
        lors du versement suivant. Le détail par réservation est dans Transactions.
      </Callout>
    </>
  );
}

type Payout = {
  id: string;
  reference: string;
  period_start: string;
  period_end: string;
  gross: number;
  commission: number;
  adjustments: number;
  net: number;
  currency: string;
  status: string;
  paid_at: string | null;
};

/** Spec §38–§39. */
export function Payouts() {
  const { active } = usePartner();
  const [page, setPage] = useState(1);

  const { rows, total, loading, error, reload } = useTable<Payout>({
    from: "payouts",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "period_end", dir: "desc" },
    page,
    pageSize: 25,
    enabled: !!active,
  });

  const sum = (status: string) =>
    rows.filter(r => r.status === status).reduce((s, r) => s + Number(r.net), 0);

  const columns: Column<Payout>[] = [
    { id: "reference", header: "Versement", mobile: "primary", cell: p => p.reference },
    { id: "period", header: "Période", mobile: "secondary", cell: p => range(p.period_start, p.period_end) },
    { id: "gross", header: "Brut", align: "right", mobile: "hidden", cell: p => money(p.gross) },
    {
      id: "commission",
      header: "Commission",
      align: "right",
      mobile: "hidden",
      cell: p => <span className="text-admin-ink-3">−{money(p.commission)}</span>,
    },
    {
      id: "net",
      header: "Net",
      align: "right",
      mobile: "meta",
      cell: p => <span className="font-semibold">{money(p.net, p.currency)}</span>,
    },
    { id: "status", header: "Statut", mobile: "meta", cell: p => <StatusBadge status={p.status} /> },
    { id: "paid_at", header: "Réglé le", mobile: "hidden", cell: p => (p.paid_at ? day(p.paid_at) : "—") },
  ];

  return (
    <>
      <PageHeader
        title="Versements"
        subtitle="Ce que PAPOT vous a versé, et ce qui arrive."
        actions={
          <Button variant="secondary" onClick={() => exportCsv("papot-versements", rows as unknown as Record<string, unknown>[])}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter
          </Button>
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Prêt" value={money(sum("ready"))} />
        <Stat label="En traitement" value={money(sum("processing"))} />
        <Stat label="Versé" value={money(sum("paid"))} tone="positive" />
        <Stat label="Retenu" value={money(sum("held"))} tone={sum("held") > 0 ? "negative" : undefined} />
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
        storageKey="partner-payouts"
        empty={{
          title: "Aucun versement",
          body: "Les versements sont générés à partir des paiements encaissés pour vos réservations.",
        }}
      />

      <div className="mt-5">
        <Card>
          <CardHeader title="Coordonnées de versement" subtitle="Masquées pour votre sécurité." />
          <FieldGrid>
            <Field label="Méthode">Virement bancaire</Field>
            <Field label="Compte">•••• ••••</Field>
            <Field label="Devise">USD</Field>
          </FieldGrid>
          <div className="mt-4">
            <Callout>
              Les coordonnées bancaires complètes ne sont jamais stockées par la plateforme :
              seuls les quatre derniers chiffres le sont. Pour les modifier, passez par le
              support, qui vérifie l'identité avant tout changement.
            </Callout>
          </div>
        </Card>
      </div>
    </>
  );
}

type Payment = {
  id: string;
  reference: string;
  booking_ref: string | null;
  customer_label: string | null;
  amount: number;
  commission: number;
  status: string;
  created_at: string;
};

/** Spec §37. */
export function Transactions() {
  const { active } = usePartner();
  const [page, setPage] = useState(1);

  const { rows, total, loading, error, reload } = useTable<Payment>({
    from: "payments",
    select: "id, reference, booking_ref, customer_label, amount, commission, status, created_at",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    page,
    pageSize: 25,
    enabled: !!active,
  });

  const columns: Column<Payment>[] = [
    { id: "reference", header: "Transaction", mobile: "primary", cell: p => p.reference },
    { id: "booking_ref", header: "Réservation", mobile: "secondary", cell: p => p.booking_ref ?? "—" },
    { id: "customer_label", header: "Client", mobile: "secondary", cell: p => p.customer_label ?? "—" },
    { id: "amount", header: "Brut", align: "right", mobile: "meta", cell: p => money(p.amount) },
    {
      id: "commission",
      header: "Commission",
      align: "right",
      mobile: "hidden",
      cell: p => <span className="text-admin-ink-3">−{money(p.commission)}</span>,
    },
    {
      id: "net",
      header: "Net",
      align: "right",
      mobile: "hidden",
      cell: p => <span className="font-semibold">{money(Number(p.amount) - Number(p.commission))}</span>,
    },
    { id: "status", header: "Statut", mobile: "meta", cell: p => <StatusBadge status={p.status} /> },
    { id: "created_at", header: "Date", mobile: "hidden", cell: p => stamp(p.created_at) },
  ];

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Chaque paiement encaissé pour vos réservations."
        actions={
          <Button variant="secondary" onClick={() => exportCsv("papot-transactions", rows as unknown as Record<string, unknown>[])}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter
          </Button>
        }
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
        storageKey="partner-transactions"
        empty={{
          title: "Aucune transaction",
          body: "Les paiements apparaîtront ici dès qu'une réservation sera réglée.",
        }}
      />
    </>
  );
}

/** Spec §40. */
export function Invoices() {
  const { active } = usePartner();
  const [page, setPage] = useState(1);

  const { rows, total, loading, error, reload } = useTable<{
    id: string;
    number: string;
    amount: number;
    currency: string;
    status: string;
    issued_on: string | null;
  }>({
    from: "invoices",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    page,
    pageSize: 25,
    enabled: !!active,
  });

  const columns: Column<(typeof rows)[number]>[] = [
    { id: "number", header: "Facture", mobile: "primary", cell: r => r.number },
    { id: "issued_on", header: "Émise le", mobile: "secondary", cell: r => day(r.issued_on) },
    { id: "amount", header: "Montant", align: "right", mobile: "meta", cell: r => money(r.amount, r.currency) },
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader title="Factures" subtitle="Les documents émis par PAPOT pour la commission." />
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => r.id}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="partner-invoices"
        empty={{
          title: "Aucune facture",
          body: "Les factures sont générées à partir des versements réglés.",
        }}
      />
    </>
  );
}

export { Coins, FileText, Receipt, Wallet, EmptyState, count };

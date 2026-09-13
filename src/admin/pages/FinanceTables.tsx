import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Button, PageHeader } from "../components/Ui";
import { Stat } from "../components/Cards";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { ConfirmDialog, Modal, useConfirm } from "../components/Dialog";
import { StatusBadge } from "../components/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,exportCsv, searchAcross, useDebounced, useRpc, useTable, type Filter } from "../lib/adminData";
import { count, day, money, range, stamp } from "../lib/format";
import { inputClass, labelClass } from "../components/Ui";

/** Shared URL-backed filter state for the finance tables. */
function useFilterState(keys: string[]) {
  const [params, setParams] = useSearchParams();
  const values = useMemo(() => {
    const v: Record<string, string[]> = {};
    for (const k of keys) {
      const raw = params.get(k);
      if (raw) v[k] = raw.split(",");
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, keys.join(",")]);

  const setValues = (v: Record<string, string[]>) => {
    const next = new URLSearchParams(params);
    for (const k of keys) {
      const list = v[k] ?? [];
      if (list.length) next.set(k, list.join(","));
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  return { values, setValues };
}

/* ------------------------------------------------------------------ Payments */

type PaymentRow = {
  id: string;
  reference: string;
  booking_ref: string | null;
  customer_label: string | null;
  amount: number;
  currency: string;
  commission: number;
  method: string;
  processor: string | null;
  processor_ref: string | null;
  status: string;
  failure_reason: string | null;
  risk_score: number | null;
  created_at: string;
};

/** Spec §28. */
export function Payments() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ col: "created_at", dir: "desc" as const });
  const { values, setValues } = useFilterState(["status", "method"]);
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["reference", "booking_ref", "customer_label", "processor_ref"], debounced)];
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    if (values.method?.length) f.push({ col: "method", op: "in", value: values.method });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<PaymentRow>({
    from: "payments",
    filters,
    sort,
    page,
    pageSize: 25,
  });

  const { data: stats } = useRpc<{ collected: number; failed_payments: number; chargebacks: number; payments_count: number }>(
    "admin_finance_stats",
  );

  const columns: Column<PaymentRow>[] = [
    {
      id: "reference",
      header: "Transaction",
      sortable: true,
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-admin-ink">{r.reference}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{r.processor ?? "—"}</span>
        </span>
      ),
    },
    { id: "booking_ref", header: "Réservation", mobile: "secondary", cell: r => r.booking_ref ?? "—" },
    { id: "customer_label", header: "Client", mobile: "secondary", cell: r => r.customer_label ?? "—" },
    {
      id: "amount",
      header: "Montant",
      sortable: true,
      align: "right",
      mobile: "meta",
      cell: r => <span className="font-semibold">{money(r.amount, r.currency)}</span>,
    },
    {
      id: "commission",
      header: "Commission",
      sortable: true,
      align: "right",
      defaultHidden: true,
      mobile: "hidden",
      cell: r => money(r.commission),
    },
    { id: "method", header: "Méthode", sortable: true, mobile: "hidden", cell: r => r.method },
    {
      id: "risk_score",
      header: "Risque",
      sortable: true,
      align: "right",
      defaultHidden: true,
      mobile: "hidden",
      cell: r =>
        r.risk_score === null ? (
          "—"
        ) : (
          <span className={r.risk_score >= 70 ? "font-semibold text-[#b3261e]" : ""}>{r.risk_score}</span>
        ),
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
    {
      id: "created_at",
      header: "Date",
      sortable: true,
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{stamp(r.created_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Paiements" subtitle="Toutes les transactions encaissées par la plateforme." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Encaissé" value={money(stats?.collected)} />
        <Stat label="Transactions" value={count(stats?.payments_count ?? total)} />
        <Stat
          label="Échecs"
          value={count(stats?.failed_payments)}
          tone={Number(stats?.failed_payments ?? 0) > 0 ? "negative" : undefined}
        />
        <Stat
          label="Rétrofacturations"
          value={money(stats?.chargebacks)}
          tone={Number(stats?.chargebacks ?? 0) > 0 ? "negative" : undefined}
        />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Référence, réservation, client, référence processeur…"
        filters={[
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "paid", label: "Payé" },
              { value: "pending", label: "En attente" },
              { value: "failed", label: "Échoué" },
              { value: "refunded", label: "Remboursé" },
              { value: "partially_refunded", label: "Partiellement remboursé" },
              { value: "disputed", label: "Contesté" },
              { value: "chargeback", label: "Rétrofacturation" },
            ],
          },
          {
            id: "method",
            label: "Méthode",
            options: [
              { value: "card", label: "Carte" },
              { value: "mobile_money", label: "Mobile money" },
              { value: "bank_transfer", label: "Virement" },
              { value: "cash", label: "Espèces" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="payments"
        onExport={() => exportCsv("papot-paiements", rows as unknown as Record<string, unknown>[])}
      />

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
        sort={sort}
        onSort={s => setSort(s as typeof sort)}
        storageKey="payments"
        empty={{
          title: "Aucun paiement",
          body:
            total === 0
              ? "Les paiements apparaîtront ici dès qu'une réservation sera réglée. La passerelle de paiement n'est pas encore branchée."
              : "Aucune transaction ne correspond à ces filtres.",
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------- Payouts */

type PayoutRow = {
  id: string;
  reference: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  gross: number;
  commission: number;
  adjustments: number;
  net: number;
  currency: string;
  status: string;
  hold_reason: string | null;
  paid_at: string | null;
};

/** Spec §29. */
export function Payouts() {
  const { can } = useAdmin();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ col: "period_end", dir: "desc" as const });
  const { values, setValues } = useFilterState(["status"]);
  const { confirm, dialogProps } = useConfirm();
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["reference"], debounced)];
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<PayoutRow>({
    from: "payouts",
    filters,
    sort,
    page,
    pageSize: 25,
  });

  const { data: stats } = useRpc<Record<string, number>>("admin_payout_stats");

  const setStatus = (row: PayoutRow, next: string, label: string, danger = false, needsReason = false) =>
    confirm({
      title: `${label} le versement ${row.reference} ?`,
      consequence:
        next === "paid"
          ? `${money(row.net)} sont marqués comme versés au partenaire. Cette écriture est définitive et apparaîtra dans ses relevés.`
          : next === "held"
            ? "Le versement est bloqué et n'entrera pas dans le prochain lot tant qu'il n'est pas libéré."
            : next === "ready"
              ? "Le versement repasse dans le prochain lot de paiement."
              : "Le statut du versement est mis à jour.",
      confirmLabel: label,
      danger,
      requireReason: needsReason,
      reasonLabel: "Motif",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_set_payout_status", {
          p_id: row.id,
          p_status: next,
          p_reason: reason || null,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<PayoutRow>[] = [
    { id: "reference", header: "Versement", sortable: true, mobile: "primary", cell: r => r.reference },
    {
      id: "period_start",
      header: "Période",
      sortable: true,
      mobile: "secondary",
      cell: r => range(r.period_start, r.period_end),
    },
    { id: "gross", header: "Brut", sortable: true, align: "right", mobile: "hidden", cell: r => money(r.gross) },
    {
      id: "commission",
      header: "Commission",
      sortable: true,
      align: "right",
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">−{money(r.commission)}</span>,
    },
    {
      id: "adjustments",
      header: "Ajustements",
      align: "right",
      defaultHidden: true,
      mobile: "hidden",
      cell: r => (Number(r.adjustments) === 0 ? "—" : money(r.adjustments)),
    },
    {
      id: "net",
      header: "Net à verser",
      sortable: true,
      align: "right",
      mobile: "meta",
      cell: r => <span className="font-semibold">{money(r.net, r.currency)}</span>,
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
    {
      id: "paid_at",
      header: "Réglé le",
      sortable: true,
      mobile: "hidden",
      cell: r => (r.paid_at ? day(r.paid_at) : "—"),
    },
  ];

  return (
    <>
      <PageHeader title="Versements" subtitle="Ce que la plateforme doit aux partenaires, par période." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Prêts" value={money(stats?.ready)} />
        <Stat label="En traitement" value={money(stats?.processing)} />
        <Stat label="Versés" value={money(stats?.paid)} tone="positive" />
        <Stat label="Échoués" value={money(stats?.failed)} tone={Number(stats?.failed ?? 0) > 0 ? "negative" : undefined} />
        <Stat label="Retenus" value={money(stats?.held)} />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Référence de versement…"
        filters={[
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "ready", label: "Prêt" },
              { value: "processing", label: "En traitement" },
              { value: "paid", label: "Versé" },
              { value: "failed", label: "Échoué" },
              { value: "held", label: "Retenu" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="payouts"
        onExport={() => exportCsv("papot-versements", rows as unknown as Record<string, unknown>[])}
      />

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
        sort={sort}
        onSort={s => setSort(s as typeof sort)}
        storageKey="payouts"
        actions={[
          {
            label: "Approuver et verser",
            hidden: r => !can("manage_payouts") || r.status === "paid",
            onClick: r => setStatus(r, "paid", "Verser", true),
          },
          {
            label: "Retenir",
            danger: true,
            hidden: r => !can("manage_payouts") || r.status === "held" || r.status === "paid",
            onClick: r => setStatus(r, "held", "Retenir", true, true),
          },
          {
            label: "Libérer",
            hidden: r => !can("manage_payouts") || r.status !== "held",
            onClick: r => setStatus(r, "ready", "Libérer"),
          },
          {
            label: "Relancer",
            hidden: r => !can("manage_payouts") || r.status !== "failed",
            onClick: r => setStatus(r, "processing", "Relancer"),
          },
        ]}
        empty={{
          title: "Aucun versement",
          body:
            total === 0
              ? "Les versements sont générés à partir des paiements encaissés. Aucun paiement n'a encore été réglé."
              : "Aucun versement ne correspond à ces filtres.",
        }}
      />

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/* ------------------------------------------------------------------- Refunds */

type RefundRow = {
  id: string;
  reference: string;
  booking_ref: string | null;
  customer_label: string | null;
  booking_total: number;
  amount_paid: number;
  cancellation_fee: number;
  eligible_amount: number;
  requested_amount: number;
  final_amount: number | null;
  currency: string;
  status: string;
  reason: string | null;
  created_at: string;
};

const REFUND_QUEUES = [
  { id: "requested", label: "Demandés" },
  { id: "under_review", label: "En examen" },
  { id: "approved", label: "Approuvés" },
  { id: "processing", label: "En traitement" },
  { id: "completed", label: "Terminés" },
  { id: "rejected", label: "Refusés" },
];

/** Spec §31. */
export function Refunds() {
  const { can } = useAdmin();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { values, setValues } = useFilterState(["status"]);
  const [decision, setDecision] = useState<RefundRow | null>(null);
  const { confirm, dialogProps } = useConfirm();
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["reference", "booking_ref", "customer_label"], debounced)];
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<RefundRow>({
    from: "refunds",
    filters,
    sort: { col: "created_at", dir: "desc" },
    page,
    pageSize: 25,
  });

  const { data: byStatus } = useRpc<Record<string, number>>("admin_refund_stats");

  const reject = (row: RefundRow) =>
    confirm({
      title: `Refuser le remboursement ${row.reference} ?`,
      consequence: "Le client est informé du refus et du motif. Aucun montant n'est reversé.",
      confirmLabel: "Refuser la demande",
      danger: true,
      requireReason: true,
      reasonLabel: "Motif du refus",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_decide_refund", {
          p_id: row.id,
          p_status: "rejected",
          p_final: null,
          p_note: reason,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<RefundRow>[] = [
    {
      id: "reference",
      header: "Demande",
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-admin-ink">{r.reference}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{r.booking_ref ?? "—"}</span>
        </span>
      ),
    },
    { id: "customer_label", header: "Client", mobile: "secondary", cell: r => r.customer_label ?? "—" },
    { id: "amount_paid", header: "Payé", align: "right", mobile: "hidden", cell: r => money(r.amount_paid) },
    {
      id: "cancellation_fee",
      header: "Frais",
      align: "right",
      mobile: "hidden",
      cell: r => (Number(r.cancellation_fee) > 0 ? `−${money(r.cancellation_fee)}` : "—"),
    },
    {
      id: "requested_amount",
      header: "Demandé",
      align: "right",
      mobile: "secondary",
      cell: r => money(r.requested_amount),
    },
    {
      id: "final_amount",
      header: "Remboursé",
      align: "right",
      mobile: "meta",
      cell: r =>
        r.final_amount === null ? (
          <span className="text-admin-ink-3">—</span>
        ) : (
          <span className="font-semibold">{money(r.final_amount, r.currency)}</span>
        ),
    },
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
    {
      id: "created_at",
      header: "Demandé le",
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{stamp(r.created_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Remboursements" subtitle="File de traitement des demandes, de la réception à la décision." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {REFUND_QUEUES.map(q => (
          <Stat key={q.id} label={q.label} value={count(byStatus?.[q.id] ?? 0)} />
        ))}
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Référence, réservation, client…"
        filters={[{ id: "status", label: "Statut", options: REFUND_QUEUES.map(q => ({ value: q.id, label: q.label })) }]}
        values={values}
        onChange={setValues}
        savedViewsPage="refunds"
        onExport={() => exportCsv("papot-remboursements", rows as unknown as Record<string, unknown>[])}
      />

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
        storageKey="refunds"
        actions={[
          {
            label: "Décider du montant",
            hidden: r => !can("issue_refunds") || ["completed", "rejected"].includes(r.status),
            onClick: setDecision,
          },
          {
            label: "Refuser",
            danger: true,
            hidden: r => !can("issue_refunds") || ["completed", "rejected"].includes(r.status),
            onClick: reject,
          },
        ]}
        empty={{
          title: "Aucune demande de remboursement",
          body: total === 0 ? "Vous êtes à jour." : "Aucune demande ne correspond à ces filtres.",
        }}
      />

      <RefundDecisionModal refund={decision} onClose={() => setDecision(null)} onDone={reload} />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Spec §31: the breakdown an agent needs before choosing an amount. */
function RefundDecisionModal({
  refund,
  onClose,
  onDone,
}: {
  refund: RefundRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!refund) return null;

  const submit = async (status: "approved" | "completed") => {
    const parsed = Number((amount || refund.eligible_amount).toString().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Entrez un montant valide.");
      return;
    }
    if (parsed > Number(refund.amount_paid)) {
      setError(`Le remboursement ne peut pas dépasser le montant payé (${money(refund.amount_paid)}).`);
      return;
    }
    setBusy(true);
    const { error } = await adminRpc("admin_decide_refund", {
      p_id: refund.id,
      p_status: status,
      p_final: parsed,
      p_note: note || null,
    });
    setBusy(false);
    if (error) {
      setError(adminError(error));
      return;
    }
    onDone();
    onClose();
  };

  return (
    <Modal
      open={!!refund}
      onClose={onClose}
      title={`Remboursement ${refund.reference}`}
      subtitle={refund.booking_ref ? `Réservation ${refund.booking_ref}` : undefined}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="secondary" onClick={() => submit("approved")} disabled={busy}>
            Approuver sans régler
          </Button>
          <Button variant="primary" onClick={() => submit("completed")} disabled={busy}>
            Rembourser
          </Button>
        </>
      }
    >
      <dl className="mb-4 divide-y divide-admin-line rounded-lg border border-admin-line">
        {[
          ["Total de la réservation", money(refund.booking_total)],
          ["Montant payé", money(refund.amount_paid)],
          ["Frais d'annulation", Number(refund.cancellation_fee) > 0 ? `−${money(refund.cancellation_fee)}` : "—"],
          ["Montant éligible", money(refund.eligible_amount)],
          ["Montant demandé", money(refund.requested_amount)],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-[13px] text-admin-ink-2">{label}</dt>
            <dd className="text-[13px] font-semibold tabular-nums text-admin-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {refund.reason && (
        <p className="mb-4 rounded-lg bg-admin-canvas px-3.5 py-2.5 text-[13px] leading-relaxed text-admin-ink-2">
          <strong className="font-semibold text-admin-ink">Motif du client :</strong> {refund.reason}
        </p>
      )}

      <label className={labelClass} htmlFor="refund-amount">
        Montant final à rembourser
      </label>
      <input
        id="refund-amount"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder={String(refund.eligible_amount)}
        inputMode="decimal"
        className={inputClass}
      />
      <p className="mt-1 text-[12px] text-admin-ink-3">
        Par défaut, le montant éligible. Un remboursement partiel est possible en saisissant une valeur
        inférieure ; il ne peut jamais dépasser {money(refund.amount_paid)}.
      </p>

      <label className={`${labelClass} mt-4`} htmlFor="refund-note">
        Note de décision
      </label>
      <textarea
        id="refund-note"
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        className={`${inputClass} h-auto py-2`}
      />

      {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

/* -------------------------------------------------------------- Transactions */

/** Spec §27: one journal across payments, refunds and payouts. */
export function Transactions() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { values, setValues } = useFilterState(["kind"]);
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["reference", "label"], debounced)];
    if (values.kind?.length) f.push({ col: "kind", op: "in", value: values.kind });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<{
    id: string;
    kind: string;
    reference: string;
    label: string | null;
    amount: number;
    direction: string;
    status: string;
    at: string;
  }>({
    from: "admin_transactions",
    filters,
    sort: { col: "at", dir: "desc" },
    page,
    pageSize: 50,
  });

  const KIND_LABEL: Record<string, string> = {
    payment: "Paiement",
    refund: "Remboursement",
    payout: "Versement",
  };

  const columns: Column<(typeof rows)[number]>[] = [
    { id: "reference", header: "Référence", mobile: "primary", cell: r => r.reference },
    {
      id: "kind",
      header: "Type",
      mobile: "secondary",
      cell: r => (
        <span className="rounded bg-admin-canvas px-1.5 py-0.5 text-[11.5px] text-admin-ink-2">
          {KIND_LABEL[r.kind] ?? r.kind}
        </span>
      ),
    },
    { id: "label", header: "Détail", mobile: "secondary", cell: r => r.label ?? "—" },
    {
      id: "amount",
      header: "Montant",
      sortable: true,
      align: "right",
      mobile: "meta",
      cell: r => (
        <span className={`font-semibold ${r.direction === "out" ? "text-[#b3261e]" : "text-admin-ink"}`}>
          {r.direction === "out" ? "−" : "+"}
          {money(r.amount)}
        </span>
      ),
    },
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
    { id: "at", header: "Date", sortable: true, mobile: "hidden", cell: r => stamp(r.at) },
  ];

  return (
    <>
      <PageHeader title="Transactions" subtitle="Journal unifié des mouvements d'argent de la plateforme." />

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Référence…"
        filters={[
          {
            id: "kind",
            label: "Type",
            options: [
              { value: "payment", label: "Paiements" },
              { value: "refund", label: "Remboursements" },
              { value: "payout", label: "Versements" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="transactions"
        onExport={() => exportCsv("papot-transactions", rows as unknown as Record<string, unknown>[])}
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => `${r.kind}-${r.id}`}
        page={page}
        pageSize={50}
        onPage={setPage}
        storageKey="transactions"
        empty={{
          title: "Aucune transaction",
          body: "Paiements, remboursements et versements apparaîtront ici dès le premier mouvement.",
        }}
      />
    </>
  );
}

/* ----------------------------------------------------------------- Invoices */

export function Invoices() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const { rows, total, loading, error, reload } = useTable<{
    id: string;
    number: string;
    amount: number;
    currency: string;
    status: string;
    issued_on: string | null;
    due_on: string | null;
  }>({
    from: "invoices",
    filters: searchAcross(["number"], debounced),
    sort: { col: "created_at", dir: "desc" },
    page,
    pageSize: 25,
  });

  const columns: Column<(typeof rows)[number]>[] = [
    { id: "number", header: "Facture", mobile: "primary", cell: r => r.number },
    {
      id: "amount",
      header: "Montant",
      sortable: true,
      align: "right",
      mobile: "meta",
      cell: r => money(r.amount, r.currency),
    },
    { id: "issued_on", header: "Émise le", sortable: true, mobile: "secondary", cell: r => day(r.issued_on) },
    { id: "due_on", header: "Échéance", sortable: true, mobile: "secondary", cell: r => day(r.due_on) },
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader title="Factures" subtitle="Documents émis aux partenaires pour la commission de la plateforme." />

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Numéro de facture…"
        values={{}}
        onChange={() => {}}
        onExport={() => exportCsv("papot-factures", rows as unknown as Record<string, unknown>[])}
      />

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
        storageKey="invoices"
        empty={{
          title: "Aucune facture",
          body: "Les factures de commission sont générées à partir des versements réglés.",
        }}
      />
    </>
  );
}

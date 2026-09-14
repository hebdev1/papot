import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bell, ChefHat, Inbox, Printer, UtensilsCrossed } from "lucide-react";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import {
  Button, Callout, Card, CardHeader, EmptyState, Field, FieldGrid, PageHeader,
  Skeleton, Tabs, inputClass, labelClass, selectClass,
} from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { StatusBadge } from "../../console/StatusBadge";
import { Modal } from "../../console/Dialog";
import { friendlyError, useRow, useTable } from "../../console/data";
import { count, money, stamp } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

/* ── shared ─────────────────────────────────────────────── */

type OrderRow = {
  id: string;
  reference: string;
  listing_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  fulfillment: "dine_in" | "pickup" | "delivery";
  status: string;
  scheduled_for: string | null;
  address: string | null;
  address_notes: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_fee: number;
  service_fee: number;
  tip: number;
  total: number;
  currency: string;
  payment_method: string | null;
  payment_status: string;
  note: string | null;
  rejection_reason: string | null;
  created_at: string;
};

type Customization = { kind: string; label: string; position: number };

type LineRow = {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  note: string | null;
  position: number;
  order_item_customizations: Customization[];
};

const FULFILLMENT: Record<string, string> = {
  dine_in: "Sur place",
  pickup: "À emporter",
  delivery: "Livraison",
};

const PAY_METHOD: Record<string, string> = {
  cash: "Espèces",
  card: "Carte",
  moncash: "MonCash",
  natcash: "NatCash",
};

/** The refusal reasons the specification lists, plus a free one. */
const REJECT_REASONS = [
  "Un plat n'est plus disponible",
  "Le restaurant ferme",
  "Trop de commandes en cours",
  "La demande ne peut pas être satisfaite",
  "Livraison impossible à cette adresse",
  "Autre",
];

const LINE_SELECT =
  "id, name, unit_price, quantity, line_total, note, position, order_item_customizations(kind, label, position)";

function useRestaurant() {
  const { active } = usePartner();
  const listings = useTable<{ id: string; name: string }>({
    from: "listings",
    select: "id, name",
    filters: [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      { col: "kind", op: "eq", value: "restaurant" },
    ],
    sort: { col: "name", dir: "asc" },
    pageSize: 10,
    enabled: !!active,
  });
  return { restaurant: listings.rows[0], loading: listings.loading };
}

const advance = (id: string, status: string, reason?: string) =>
  supabase.rpc("advance_food_order", {
    p_order: id,
    p_status: status,
    p_reason: reason ?? undefined,
  });

/** Minutes since the order landed — what the kitchen actually watches. */
function waitingFor(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`;
}

/* ── 1 — the board ──────────────────────────────────────── */

type TabId = "all" | "received" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "done";

const TAB_STATUSES: Record<TabId, string[]> = {
  all: [],
  received: ["received"],
  confirmed: ["confirmed"],
  preparing: ["preparing"],
  ready: ["ready"],
  out_for_delivery: ["out_for_delivery"],
  done: ["completed", "rejected", "cancelled", "refunded", "partially_refunded"],
};

export function Orders() {
  const { can } = usePartner();
  const { restaurant, loading } = useRestaurant();
  const [tab, setTab] = useState<TabId>("received");

  const orders = useTable<OrderRow>({
    from: "restaurant_orders",
    select:
      "id, reference, listing_id, customer_name, customer_phone, fulfillment, status, scheduled_for, total, currency, payment_status, created_at",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 200,
    enabled: !!restaurant,
  });

  const counts = useMemo(() => {
    const c: Partial<Record<TabId, number>> = { all: orders.rows.length };
    for (const t of Object.keys(TAB_STATUSES) as TabId[]) {
      if (t === "all") continue;
      c[t] = orders.rows.filter(o => TAB_STATUSES[t].includes(o.status)).length;
    }
    return c;
  }, [orders.rows]);

  const shown =
    tab === "all" ? orders.rows : orders.rows.filter(o => TAB_STATUSES[tab].includes(o.status));

  const fresh = orders.rows.filter(o => o.status === "received");
  const live = orders.rows.filter(o =>
    ["received", "confirmed", "preparing", "ready", "out_for_delivery"].includes(o.status),
  );

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!restaurant) {
    return (
      <>
        <PageHeader title="Commandes" subtitle="Les commandes en ligne de votre restaurant." />
        <EmptyState icon={UtensilsCrossed} title="Aucun restaurant" body="Créez d'abord votre fiche restaurant." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Commandes"
        subtitle="Ce que la cuisine doit sortir, et quand."
        actions={
          can("manage_orders") ? (
            <Button as="link" to="/partenaire/cuisine" variant="secondary">
              <ChefHat className="h-3.5 w-3.5" aria-hidden />
              Écran cuisine
            </Button>
          ) : undefined
        }
      />

      {fresh.length > 0 && (
        <div className="mb-5">
          <Callout tone="warning">
            <span className="inline-flex items-center gap-2 font-semibold">
              <Bell className="h-4 w-4" aria-hidden />
              {count(fresh.length)} commande(s) à accepter
            </span>{" "}
            — la plus ancienne attend depuis {waitingFor(fresh[fresh.length - 1].created_at)}.
          </Callout>
        </div>
      )}

      <div className="mb-5 grid gap-2.5 sm:grid-cols-4">
        <Stat label="À accepter" value={count(fresh.length)} />
        <Stat label="En cours" value={count(live.length)} />
        <Stat label="Aujourd'hui" value={count(orders.rows.filter(o =>
          new Date(o.created_at).toDateString() === new Date().toDateString()).length)} />
        <Stat
          label="Panier moyen"
          value={
            orders.rows.length
              ? money(orders.rows.reduce((s, o) => s + Number(o.total), 0) / orders.rows.length)
              : "—"
          }
        />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        counts={counts}
        tabs={[
          { id: "received", label: "Nouvelles" },
          { id: "confirmed", label: "Confirmées" },
          { id: "preparing", label: "En préparation" },
          { id: "ready", label: "Prêtes" },
          { id: "out_for_delivery", label: "En livraison" },
          { id: "done", label: "Terminées" },
          { id: "all", label: "Toutes" },
        ]}
      />

      {orders.loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Rien ici"
          body={
            tab === "received"
              ? "Aucune commande en attente. Les nouvelles commandes apparaissent en haut."
              : "Aucune commande dans cet état."
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map(o => (
            <Link
              key={o.id}
              to={`/partenaire/commandes/${o.reference}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-admin-line bg-admin-surface px-4 py-3 transition-colors hover:border-[#002089]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-admin-ink">
                  {o.reference} · {o.customer_name}
                </span>
                <span className="block text-[12px] text-admin-ink-3">
                  {FULFILLMENT[o.fulfillment]} ·{" "}
                  {o.scheduled_for ? `pour ${stamp(o.scheduled_for)}` : "dès que possible"} ·{" "}
                  reçue il y a {waitingFor(o.created_at)}
                </span>
              </span>
              <StatusBadge status={o.payment_status} />
              <StatusBadge status={o.status} />
              <span className="font-display text-[15px] font-semibold tabular-nums text-admin-ink">
                {money(o.total, o.currency)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/* ── 2 — one order ──────────────────────────────────────── */

export function OrderDetail() {
  const { reference } = useParams();
  const { can } = usePartner();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<"rejected" | "cancelled" | null>(null);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [reasonText, setReasonText] = useState("");

  const { row, loading, reload } = useRow<OrderRow>("restaurant_orders", {
    reference: reference ?? "",
  });

  const lines = useTable<LineRow>({
    from: "restaurant_order_items",
    select: LINE_SELECT,
    filters: [{ col: "order_id", op: "eq", value: row?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 100,
    enabled: !!row?.id,
  });

  const history = useTable<{ status: string; reason: string | null; at: string }>({
    from: "order_status_history",
    select: "status, reason, at",
    filters: [{ col: "order_id", op: "eq", value: row?.id ?? "" }],
    sort: { col: "at", dir: "asc" },
    pageSize: 50,
    enabled: !!row?.id,
  });

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!row) {
    return (
      <>
        <PageHeader title="Commande introuvable" breadcrumb={[{ label: "Commandes", to: "/partenaire/commandes" }]} />
        <EmptyState
          icon={Inbox}
          title="Cette commande n'existe pas ou ne vous appartient pas."
          action={<Button as="link" to="/partenaire/commandes" variant="secondary">Retour</Button>}
        />
      </>
    );
  }

  const markPaid = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("mark_food_order_paid", { p_order: row!.id });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    reload();
  };

  const move = async (status: string, why?: string) => {
    setBusy(true);
    setError(null);
    const { error: err } = await advance(row.id, status, why);
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setRejecting(null);
    reload();
    history.reload();
  };

  const confirmRefusal = () => {
    const why = reason === "Autre" ? reasonText.trim() : reason;
    if (why.length < 3) return setError("Indiquez un motif : le client le verra.");
    move(rejecting as string, why);
  };

  // One primary action at a time, which is what a phone in a kitchen needs.
  const next: { label: string; status: string } | null =
    row.status === "received" ? { label: "Accepter", status: "confirmed" }
    : row.status === "confirmed" ? { label: "Commencer la préparation", status: "preparing" }
    : row.status === "preparing" ? { label: "Marquer prête", status: "ready" }
    : row.status === "ready"
      ? row.fulfillment === "delivery"
        ? { label: "Partie en livraison", status: "out_for_delivery" }
        : { label: "Remise au client", status: "completed" }
    : row.status === "out_for_delivery" ? { label: "Livrée", status: "completed" }
    : null;

  const open = !["completed", "rejected", "cancelled", "refunded"].includes(row.status);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Commandes", to: "/partenaire/commandes" }, { label: row.reference }]}
        title={`${row.customer_name} · ${FULFILLMENT[row.fulfillment]}`}
        subtitle={`${row.reference} · reçue le ${stamp(row.created_at)}`}
        actions={
          can("manage_orders") ? (
            <>
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" aria-hidden />
                Imprimer
              </Button>
              {row.payment_status !== "paid" && row.status !== "rejected" && row.status !== "cancelled" && (
                <Button variant="secondary" disabled={busy} onClick={markPaid}>
                  Marquer payée
                </Button>
              )}
              {open && (
                <Button
                  variant="secondary"
                  onClick={() => setRejecting(row.status === "received" ? "rejected" : "cancelled")}
                >
                  {row.status === "received" ? "Refuser" : "Annuler"}
                </Button>
              )}
              {next && (
                <Button variant="primary" disabled={busy} onClick={() => move(next.status)}>
                  {busy ? "…" : next.label}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} size="medium" />
        <StatusBadge status={row.payment_status} size="medium" />
      </div>

      {error && <p className="mb-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}

      {row.rejection_reason && (
        <div className="mb-5">
          <Callout tone="warning">
            <strong className="font-semibold">Motif communiqué au client :</strong> {row.rejection_reason}
          </Callout>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card padded={false}>
            <div className="border-b border-admin-line px-5 py-4">
              <h2 className="font-display text-[15px] font-semibold text-admin-ink">
                {count(lines.rows.length)} article(s)
              </h2>
            </div>
            {lines.loading ? (
              <div className="p-5"><Skeleton className="h-20 w-full" /></div>
            ) : (
              <ul className="divide-y divide-admin-line">
                {lines.rows.map(li => (
                  <li key={li.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="text-[13.5px] font-medium text-admin-ink">
                          {li.quantity} × {li.name}
                        </span>
                        {(li.order_item_customizations ?? [])
                          .slice()
                          .sort((a, b) => a.position - b.position)
                          .map((c, i) => (
                            <span
                              key={i}
                              className={cn(
                                "mt-1 block text-[12px]",
                                c.kind === "allergy"
                                  ? "font-semibold text-[#b3261e]"
                                  : c.kind === "remove"
                                    ? "font-medium text-[#8a5a07]"
                                    : "text-admin-ink-3",
                              )}
                            >
                              {c.kind === "remove" ? "Sans : " : c.kind === "extra" ? "Extra : " : ""}
                              {c.label}
                            </span>
                          ))}
                        {li.note && (
                          <span className="mt-1 block text-[12px] italic text-admin-ink-3">« {li.note} »</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">
                        {money(li.line_total, row.currency)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Every line of the total, as the specification requires. */}
            <dl className="border-t border-admin-line bg-admin-raised px-5 py-3.5 text-[13px]">
              {[
                ["Sous-total", row.subtotal],
                ["Remise", -row.discount],
                ["Taxe", row.tax],
                ["Livraison", row.delivery_fee],
                ["Frais de service", row.service_fee],
                ["Pourboire", row.tip],
              ]
                .filter(([, v]) => Number(v) !== 0)
                .map(([label, v]) => (
                  <div key={String(label)} className="flex items-center justify-between py-0.5">
                    <dt className="text-admin-ink-2">{label}</dt>
                    <dd className="tabular-nums text-admin-ink">{money(Number(v), row.currency)}</dd>
                  </div>
                ))}
              <div className="mt-1.5 flex items-center justify-between border-t border-admin-line pt-1.5">
                <dt className="font-semibold text-admin-ink">Total</dt>
                <dd className="font-display text-[17px] font-semibold tabular-nums text-admin-ink">
                  {money(row.total, row.currency)}
                </dd>
              </div>
            </dl>
          </Card>

          {row.note && (
            <Card>
              <CardHeader title="Note du client" />
              <p className="text-[13.5px] leading-relaxed text-admin-ink">{row.note}</p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Client" />
            <FieldGrid cols={2}>
              <Field label="Nom">{row.customer_name}</Field>
              <Field label="Téléphone">{row.customer_phone}</Field>
              <Field label="Courriel">{row.customer_email ?? "—"}</Field>
              <Field label="Paiement">
                {row.payment_method ? PAY_METHOD[row.payment_method] ?? row.payment_method : "—"}
              </Field>
            </FieldGrid>
          </Card>

          <Card>
            <CardHeader title={FULFILLMENT[row.fulfillment]} />
            <FieldGrid cols={2}>
              <Field label="Heure">
                {row.scheduled_for ? stamp(row.scheduled_for) : "Dès que possible"}
              </Field>
              {row.fulfillment === "delivery" && (
                <>
                  <Field label="Adresse">{row.address ?? "—"}</Field>
                  <Field label="Indications">{row.address_notes ?? "—"}</Field>
                </>
              )}
            </FieldGrid>
          </Card>

          <Card>
            <CardHeader title="Suivi" />
            <ol className="flex flex-col gap-2">
              {history.rows.map((h, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12.5px]">
                  <StatusBadge status={h.status} />
                  <span className="text-admin-ink-3">
                    {stamp(h.at)}
                    {h.reason ? ` — ${h.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={rejecting === "rejected" ? "Refuser la commande" : "Annuler la commande"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>Revenir</Button>
            <Button variant="primary" disabled={busy} onClick={confirmRefusal}>
              {rejecting === "rejected" ? "Refuser" : "Annuler la commande"}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[13px] text-admin-ink-2">
          Le client reçoit ce motif. Choisissez celui qui correspond le mieux.
        </p>
        <label className={labelClass} htmlFor="o-reason">Motif</label>
        <select id="o-reason" value={reason} onChange={e => setReason(e.target.value)} className={selectClass}>
          {REJECT_REASONS.map(r => <option key={r}>{r}</option>)}
        </select>
        {reason === "Autre" && (
          <div className="mt-3">
            <label className={labelClass} htmlFor="o-reason-text">Précisez</label>
            <input id="o-reason-text" value={reasonText} onChange={e => setReasonText(e.target.value)} className={inputClass} />
          </div>
        )}
        {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>
    </>
  );
}

/* ── 3 — the kitchen ────────────────────────────────────── */

const COLUMNS: { id: string; label: string; next: string; action: string }[] = [
  { id: "received", label: "Nouvelles", next: "confirmed", action: "Accepter" },
  { id: "confirmed", label: "À préparer", next: "preparing", action: "Commencer" },
  { id: "preparing", label: "En cuisson", next: "ready", action: "Prête" },
];

/**
 * A tablet on a hot pass. Big type, one action per card, and no money at all:
 * what matters here is quantities, removals, extras and allergies.
 */
export function KitchenBoard() {
  const { restaurant, loading } = useRestaurant();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orders = useTable<OrderRow>({
    from: "restaurant_orders",
    select: "id, reference, fulfillment, status, scheduled_for, created_at, customer_name",
    filters: [
      { col: "listing_id", op: "eq", value: restaurant?.id ?? "" },
      { col: "status", op: "in", value: ["received", "confirmed", "preparing", "ready"] },
    ],
    sort: { col: "created_at", dir: "asc" },
    pageSize: 100,
    enabled: !!restaurant,
  });

  const lines = useTable<LineRow & { order_id: string }>({
    from: "restaurant_order_items",
    select: `order_id, ${LINE_SELECT}`,
    filters: [
      { col: "order_id", op: "in", value: orders.rows.map(o => o.id) },
    ],
    sort: { col: "position", dir: "asc" },
    pageSize: 500,
    enabled: orders.rows.length > 0,
  });

  const move = async (id: string, status: string) => {
    setBusy(id);
    setError(null);
    const { error: err } = await advance(id, status);
    setBusy(null);
    if (err) return setError(friendlyError(err));
    orders.reload();
  };

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <>
      <PageHeader
        title="Écran cuisine"
        subtitle="Les commandes à sortir, dans l'ordre où elles sont arrivées."
        breadcrumb={[{ label: "Commandes", to: "/partenaire/commandes" }]}
      />

      {error && <p className="mb-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}

      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNS.map(col => {
          const inCol = orders.rows.filter(o => o.status === col.id);
          return (
            <div key={col.id} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between rounded-lg bg-admin-raised px-3.5 py-2.5">
                <h2 className="text-[12px] font-bold uppercase tracking-wider text-admin-ink-2">
                  {col.label}
                </h2>
                <span className="text-[13px] font-semibold tabular-nums text-admin-ink">
                  {inCol.length}
                </span>
              </div>

              {inCol.length === 0 && (
                <p className="rounded-lg border border-dashed border-admin-line px-3.5 py-6 text-center text-[12.5px] text-admin-ink-3">
                  Rien à faire
                </p>
              )}

              {inCol.map(o => {
                const mine = lines.rows.filter(li => li.order_id === o.id);
                return (
                  <Card key={o.id}>
                    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-[17px] font-bold text-admin-ink">
                        {o.reference.replace(/^CMD-\d{4}-/, "#")}
                      </span>
                      <span className="text-[12.5px] font-medium text-admin-ink-3">
                        {FULFILLMENT[o.fulfillment]} · {waitingFor(o.created_at)}
                      </span>
                    </div>

                    <ul className="flex flex-col gap-2">
                      {mine.map(li => (
                        <li key={li.id}>
                          <p className="text-[15px] font-semibold leading-tight text-admin-ink">
                            {li.quantity} × {li.name}
                          </p>
                          {(li.order_item_customizations ?? [])
                            .slice()
                            .sort((a, b) => a.position - b.position)
                            .map((c, i) => (
                              <p
                                key={i}
                                className={cn(
                                  "text-[13px] uppercase leading-snug tracking-wide",
                                  c.kind === "allergy"
                                    ? "font-bold text-[#b3261e]"
                                    : c.kind === "remove"
                                      ? "font-bold text-[#8a5a07]"
                                      : "font-semibold text-admin-ink-2",
                                )}
                              >
                                {c.kind === "remove" ? "SANS " : c.kind === "extra" ? "EXTRA " : ""}
                                {c.label}
                              </p>
                            ))}
                          {li.note && (
                            <p className="text-[13px] font-semibold uppercase leading-snug tracking-wide text-[#002089]">
                              NOTE : {li.note}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>

                    <Button
                      variant="primary"
                      className="mt-3 w-full"
                      disabled={busy === o.id}
                      onClick={() => move(o.id, col.next)}
                    >
                      {busy === o.id ? "…" : col.action}
                    </Button>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader title="Prêtes" subtitle="En attente du client ou du livreur." />
          <div className="flex flex-wrap gap-2">
            {orders.rows.filter(o => o.status === "ready").length === 0 ? (
              <p className="text-[13px] text-admin-ink-3">Aucune commande en attente de retrait.</p>
            ) : (
              orders.rows
                .filter(o => o.status === "ready")
                .map(o => (
                  <span
                    key={o.id}
                    className="rounded-lg border border-admin-line bg-admin-canvas px-3 py-2 text-[13.5px] font-semibold text-admin-ink"
                  >
                    {o.reference.replace(/^CMD-\d{4}-/, "#")} · {o.customer_name}
                  </span>
                ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

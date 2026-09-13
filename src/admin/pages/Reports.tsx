import { useState } from "react";
import { Download, FileBarChart, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, Callout, Card, CardHeader, PageHeader, inputClass, labelClass } from "../../console/Ui";
import { adminTable,exportCsv } from "../lib/adminData";
import { adminError } from "../lib/adminAuth";

/**
 * Spec §42 — exportable reports.
 *
 * Each report is a real query against the admin views, run on demand and
 * downloaded as CSV. Nothing is precomputed, so a report can never disagree
 * with the screen it came from.
 */

type Report = {
  id: string;
  title: string;
  description: string;
  source: string;
  columns: string[];
  /** Applied as a date range on this column when the operator sets one. */
  dateColumn?: string;
  order?: { col: string; dir: "asc" | "desc" };
};

const REPORTS: Report[] = [
  {
    id: "reservations",
    title: "Réservations",
    description: "Toutes les réservations avec client, partenaire, dates, montant et statut de paiement.",
    source: "admin_reservation_rows",
    columns: [
      "reference",
      "created_at",
      "customer_label",
      "customer_email",
      "partner_name",
      "starts_on",
      "ends_on",
      "total",
      "status",
      "payment_status",
    ],
    dateColumn: "created_at",
    order: { col: "created_at", dir: "desc" },
  },
  {
    id: "customers",
    title: "Clients",
    description: "Comptes voyageurs, nombre de réservations et dépense cumulée.",
    source: "admin_customer_rows",
    columns: ["full_name", "email", "phone", "country", "status", "bookings", "total_spend", "created_at"],
    dateColumn: "created_at",
    order: { col: "created_at", dir: "desc" },
  },
  {
    id: "partners",
    title: "Partenaires",
    description: "Entreprises, annonces publiées, réservations et revenus générés.",
    source: "admin_partner_rows",
    columns: [
      "business_name",
      "type",
      "city",
      "status",
      "verification",
      "listings",
      "published_listings",
      "bookings",
      "revenue",
      "outstanding_payout",
    ],
    order: { col: "revenue", dir: "desc" },
  },
  {
    id: "listings",
    title: "Annonces",
    description: "Catalogue complet avec partenaire, prix, note et statut de publication.",
    source: "admin_listing_rows",
    columns: ["name", "kind", "partner_name", "city", "price", "rating", "reviews", "bookings", "status"],
    order: { col: "name", dir: "asc" },
  },
  {
    id: "payments",
    title: "Paiements",
    description: "Transactions encaissées, commission prélevée et statut.",
    source: "payments",
    columns: ["reference", "created_at", "booking_ref", "customer_label", "amount", "commission", "method", "status"],
    dateColumn: "created_at",
    order: { col: "created_at", dir: "desc" },
  },
  {
    id: "payouts",
    title: "Versements",
    description: "Sommes dues et versées aux partenaires par période.",
    source: "payouts",
    columns: ["reference", "period_start", "period_end", "gross", "commission", "adjustments", "net", "status"],
    dateColumn: "period_end",
    order: { col: "period_end", dir: "desc" },
  },
  {
    id: "refunds",
    title: "Remboursements",
    description: "Demandes, montants éligibles et décisions rendues.",
    source: "refunds",
    columns: ["reference", "created_at", "booking_ref", "amount_paid", "requested_amount", "final_amount", "status"],
    dateColumn: "created_at",
    order: { col: "created_at", dir: "desc" },
  },
  {
    id: "audit",
    title: "Journal d'audit",
    description: "Actions d'administration horodatées, avec auteur et motif.",
    source: "admin_audit_log",
    columns: ["at", "admin_label", "action", "entity_type", "entity_label", "reason", "severity"],
    dateColumn: "at",
    order: { col: "at", dir: "desc" },
  },
];

export function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<Record<string, number>>({});

  const run = async (report: Report) => {
    setRunning(report.id);
    setError(null);

    let q = adminTable(report.source).select(report.columns.join(","));
    if (report.dateColumn && from) q = q.gte(report.dateColumn, from);
    if (report.dateColumn && to) q = q.lte(report.dateColumn, `${to}T23:59:59`);
    if (report.order) q = q.order(report.order.col, { ascending: report.order.dir === "asc" });

    const { data, error } = await q.limit(5000);
    setRunning(null);

    if (error) {
      setError(adminError(error));
      return;
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    setLastCount(c => ({ ...c, [report.id]: rows.length }));

    if (rows.length === 0) {
      setError(`Le rapport « ${report.title} » ne contient aucune ligne pour cette période.`);
      return;
    }

    exportCsv(`papot-${report.id}`, rows, report.columns);
  };

  return (
    <>
      <PageHeader
        title="Rapports"
        subtitle="Exports CSV générés à la demande, à partir des mêmes données que les écrans."
      />

      <Card className="mb-5">
        <CardHeader title="Période" subtitle="S'applique aux rapports qui portent une date." />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass} htmlFor="r-from">
              Du
            </label>
            <input id="r-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="r-to">
              Au
            </label>
            <input id="r-to" type="date" value={to} onChange={e => setTo(e.target.value)} className={inputClass} />
          </div>
          {(from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Effacer
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <div className="mb-5">
          <Callout tone="warning">{error}</Callout>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(r => (
          <Card key={r.id} className="flex flex-col">
            <div className="mb-3 flex items-start gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-admin-canvas text-[#002089]">
                <FileBarChart className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-[14.5px] font-semibold text-admin-ink">{r.title}</h3>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-admin-ink-3">{r.description}</p>
              </div>
            </div>

            <p className="mb-3 text-[11.5px] text-admin-ink-3">
              {r.columns.length} colonnes
              {r.dateColumn ? " · filtrable par date" : " · période non applicable"}
              {lastCount[r.id] !== undefined ? ` · ${lastCount[r.id]} ligne(s) au dernier export` : ""}
            </p>

            <Button
              variant="secondary"
              className="mt-auto w-full"
              onClick={() => run(r)}
              disabled={running === r.id}
            >
              {running === r.id ? (
                <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden />
              )}
              Exporter en CSV
            </Button>
          </Card>
        ))}
      </div>

      <div className="mt-5">
        <Callout>
          Les exports sont plafonnés à 5 000 lignes par fichier et encodés en UTF-8 avec séparateur
          point-virgule, pour s'ouvrir correctement dans Excel en français.
        </Callout>
      </div>
    </>
  );
}

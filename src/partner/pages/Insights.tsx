import { useState } from "react";
import { Download, FileBarChart, Loader2 } from "lucide-react";
import { Button, Callout, Card, CardHeader, PageHeader, Skeleton, inputClass, labelClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { BarList, LineChart } from "../../console/Charts";
import { StatusBadge } from "../../console/StatusBadge";
import { exportCsv, friendlyError, table, useRpc } from "../../console/data";
import { count, dayShort, money, moneyShort, percent } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type SeriesRow = { day: string; revenue: number; bookings: number };
type PerfRow = {
  listing_id: string;
  name: string;
  status: string;
  reservations: number;
  revenue: number;
  rating: number | null;
  reviews: number;
};
type Insights = {
  busiest_weekday: string | null;
  top_listing: string | null;
  avg_stay_nights: number | null;
  avg_lead_days: number | null;
  avg_booking_value: number | null;
  avg_party: number | null;
  cancel_rate: number;
  repeat_customers: number;
};

/** Spec §41–§43. */
export function Analytics() {
  const { active } = usePartner();
  const [days, setDays] = useState(30);

  const { data: series } = useRpc<SeriesRow[]>(
    "partner_revenue_series",
    { p_partner: active?.partner_id, p_days: days },
    !!active,
  );
  const { data: perf, loading } = useRpc<PerfRow[]>(
    "partner_listing_performance",
    { p_partner: active?.partner_id },
    !!active,
  );
  const { data: insights } = useRpc<Insights>("partner_insights", { p_partner: active?.partner_id }, !!active);

  const rows = perf ?? [];
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
  const totalBookings = rows.reduce((s, r) => s + Number(r.reservations), 0);
  const isStay = active?.type === "hotel" || active?.type === "guesthouse";

  return (
    <>
      <PageHeader
        title="Analyses"
        subtitle="Ce qui marche, ce qui attire, et ce qui vous coûte des réservations."
        actions={
          <div className="flex items-center gap-1">
            {[7, 30, 90, 365].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  days === d ? "bg-[#002089] text-white" : "text-admin-ink-3 hover:bg-admin-canvas"
                }`}
              >
                {d === 365 ? "12 mois" : d === 90 ? "3 mois" : `${d} j`}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Réservations" value={count(totalBookings)} />
        <Stat label="Revenus" value={money(totalRevenue)} />
        <Stat label="Panier moyen" value={money(insights?.avg_booking_value ?? 0)} />
        <Stat
          label="Taux d'annulation"
          value={percent(Number(insights?.cancel_rate ?? 0))}
          tone={Number(insights?.cancel_rate ?? 0) > 20 ? "negative" : undefined}
        />
      </div>

      <Card className="mb-5">
        <CardHeader title="Revenus et réservations" subtitle={`Sur ${days} jours.`} />
        {series ? (
          <LineChart
            labels={series.map(s => dayShort(s.day))}
            series={[
              { label: "Revenus", values: series.map(s => Number(s.revenue)), tone: "blue" },
              { label: "Réservations", values: series.map(s => Number(s.bookings)), tone: "orange" },
            ]}
            formatValue={v => moneyShort(v)}
          />
        ) : (
          <Skeleton className="h-[240px] w-full" />
        )}
      </Card>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="border-b border-admin-line px-5 py-4">
            <h2 className="font-display text-[15px] font-semibold text-admin-ink">
              Performance par annonce
            </h2>
            <p className="text-[12.5px] text-admin-ink-3">Classées par revenus.</p>
          </div>
          {loading ? (
            <div className="p-5"><Skeleton className="h-32 w-full" /></div>
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-admin-ink-3">
              Aucune annonce à analyser.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-admin-line bg-admin-raised">
                    {["Annonce", "Statut", "Réservations", "Revenus", "Note"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3 ${
                          i >= 2 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-line">
                  {rows.map(r => (
                    <tr key={r.listing_id} className="hover:bg-admin-canvas">
                      <td className="px-5 py-3 text-[13px] font-medium text-admin-ink">{r.name}</td>
                      <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums">{count(r.reservations)}</td>
                      <td className="px-5 py-3 text-right text-[13px] font-semibold tabular-nums">
                        {money(r.revenue)}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums">
                        {r.rating ? Number(r.rating).toFixed(1).replace(".", ",") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Ce que disent vos données" subtitle="Tendances de la demande." />
          <ul className="flex flex-col gap-3 text-[13px]">
            {[
              { label: "Jour le plus réservé", value: insights?.busiest_weekday?.trim() ?? "—" },
              { label: "Annonce la plus demandée", value: insights?.top_listing ?? "—" },
              isStay
                ? { label: "Durée moyenne", value: insights?.avg_stay_nights ? `${insights.avg_stay_nights} nuits` : "—" }
                : { label: "Taille moyenne du groupe", value: insights?.avg_party ? String(insights.avg_party) : "—" },
              { label: "Réservé en avance de", value: insights?.avg_lead_days ? `${insights.avg_lead_days} jours` : "—" },
              { label: "Clients fidèles", value: count(insights?.repeat_customers) },
            ].map(x => (
              <li key={x.label} className="flex items-center justify-between gap-3 border-b border-admin-line pb-2 last:border-0">
                <span className="text-admin-ink-2">{x.label}</span>
                <span className="font-semibold text-admin-ink">{x.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Réservations par annonce" />
        <BarList
          items={rows.slice(0, 8).map(r => ({ label: r.name, value: Number(r.reservations) }))}
          emptyLabel="Aucune réservation à répartir."
        />
      </Card>
    </>
  );
}

const REPORTS = [
  {
    id: "reservations",
    title: "Réservations",
    description: "Toutes vos réservations avec client, dates, montant et statut.",
    source: "admin_reservation_rows",
    columns: ["reference", "created_at", "customer_label", "first_title", "starts_on", "ends_on", "total", "status", "payment_status"],
  },
  {
    id: "listings",
    title: "Annonces",
    description: "Votre catalogue avec prix, note et statut de publication.",
    source: "listings",
    columns: ["name", "kind", "type", "city", "price", "rating", "reviews", "status"],
  },
  {
    id: "payouts",
    title: "Versements",
    description: "Ce qui vous a été versé, par période.",
    source: "payouts",
    columns: ["reference", "period_start", "period_end", "gross", "commission", "net", "status", "paid_at"],
  },
  {
    id: "transactions",
    title: "Transactions",
    description: "Paiements encaissés et commission prélevée.",
    source: "payments",
    columns: ["reference", "created_at", "booking_ref", "customer_label", "amount", "commission", "status"],
  },
];

export function Reports() {
  const { active } = usePartner();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (r: (typeof REPORTS)[number]) => {
    if (!active) return;
    setRunning(r.id);
    setError(null);

    const { data, error } = await table(r.source)
      .select(r.columns.join(","))
      .eq("partner_id", active.partner_id)
      .limit(5000);

    setRunning(null);
    if (error) return setError(friendlyError(error));

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) return setError(`Le rapport « ${r.title} » ne contient aucune ligne.`);
    exportCsv(`papot-${r.id}`, rows, r.columns);
  };

  return (
    <>
      <PageHeader title="Rapports" subtitle="Exports CSV de vos données, générés à la demande." />

      {error && (
        <div className="mb-5">
          <Callout tone="warning">{error}</Callout>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
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
          Les fichiers sont encodés en UTF-8 avec séparateur point-virgule, pour s'ouvrir
          correctement dans Excel en français.
        </Callout>
      </div>
    </>
  );
}

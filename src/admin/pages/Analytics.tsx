import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Callout, Card, CardHeader, PageHeader, Tabs } from "../components/Ui";
import { Stat } from "../components/Cards";
import { BarList, Donut, Funnel, LineChart } from "../components/Charts";
import { useRpc } from "../lib/adminData";
import { count, dayShort, money, moneyShort, percent } from "../lib/format";
import { PARTNER_TYPE_LABEL } from "./Partners";

type SeriesRow = { day: string; gbv: number; revenue: number; refunds: number; payouts: number };
type GeoRow = { city: string; listings: number; partners: number; bookings: number; revenue: number };
type Distribution = { by_service: Record<string, number>; by_status: Record<string, number>; by_partner_type: Record<string, number> };
type CustomerAnalytics = {
  new_month: number;
  active: number;
  returning: number;
  lifetime_value: number;
  avg_booking: number;
  repeat_rate: number;
  cancel_rate: number;
};
type PartnerAnalytics = {
  new_month: number;
  active: number;
  avg_rating: number | null;
  avg_revenue: number;
  top: { name: string; revenue: number }[];
};

const TABS = [
  { id: "revenue", label: "Revenus" },
  { id: "customers", label: "Clients" },
  { id: "partners", label: "Partenaires" },
  { id: "marketplace", label: "Marché" },
  { id: "geography", label: "Géographie" },
] as const;

/** Spec §42–§45. */
export function Analytics() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("revenue");
  const [days, setDays] = useState(30);

  const { data: series } = useRpc<SeriesRow[]>("admin_revenue_series", { p_days: days });
  const { data: dist } = useRpc<Distribution>("admin_booking_distribution");
  const { data: geo } = useRpc<GeoRow[]>("admin_geo_performance");
  const { data: customers } = useRpc<CustomerAnalytics>("admin_customer_analytics");
  const { data: partners } = useRpc<PartnerAnalytics>("admin_partner_analytics");
  const { data: funnel } = useRpc<{ stage: string; value: number }[]>("admin_funnel");

  const labels = (series ?? []).map(s => dayShort(s.day));

  return (
    <>
      <PageHeader
        title="Analyses"
        subtitle="Revenus, clients, partenaires et conversion, mesurés sur les données réelles."
        actions={
          <div className="flex items-center gap-1">
            {[7, 30, 90, 365].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  days === d ? "bg-[#002089] text-white" : "text-admin-ink-3 hover:bg-admin-canvas hover:text-admin-ink"
                }`}
              >
                {d === 365 ? "12 mois" : d === 90 ? "3 mois" : `${d} j`}
              </button>
            ))}
          </div>
        }
      />

      <Tabs tabs={TABS.map(t => ({ id: t.id, label: t.label }))} active={tab} onChange={setTab} />

      {tab === "revenue" && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Revenus et volume" subtitle={`Sur ${days} jours.`} />
            <LineChart
              labels={labels}
              series={[
                { label: "Volume réservé", values: (series ?? []).map(s => Number(s.gbv)), tone: "blue" },
                { label: "Revenu plateforme", values: (series ?? []).map(s => Number(s.revenue)), tone: "orange" },
                { label: "Remboursements", values: (series ?? []).map(s => Number(s.refunds)), tone: "muted" },
              ]}
              formatValue={v => moneyShort(v)}
              height={280}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Réservations par service" />
              <Donut
                slices={[
                  { label: "Hébergements", value: Number(dist?.by_service?.stay ?? 0), color: "#002089" },
                  { label: "Voitures", value: Number(dist?.by_service?.car ?? 0), color: "#e76f2e" },
                  { label: "Restaurants", value: Number(dist?.by_service?.restaurant ?? 0), color: "#00508a" },
                ]}
              />
            </Card>

            <Card>
              <CardHeader title="Réservations par statut" />
              <BarList
                items={Object.entries(dist?.by_status ?? {}).map(([k, v]) => ({
                  label: k === "confirmed" ? "Confirmées" : k === "pending" ? "En attente" : "Annulées",
                  value: Number(v),
                }))}
                emptyLabel="Aucune réservation enregistrée."
              />
            </Card>
          </div>
        </div>
      )}

      {tab === "customers" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Nouveaux ce mois" value={count(customers?.new_month)} />
            <Stat label="Clients actifs" value={count(customers?.active)} hint="ayant réservé sur 90 jours" />
            <Stat label="Clients fidèles" value={count(customers?.returning)} hint="plus d'une réservation" />
            <Stat label="Valeur vie client" value={money(customers?.lifetime_value)} />
            <Stat label="Panier moyen" value={money(customers?.avg_booking)} />
            <Stat label="Taux de réachat" value={percent(Number(customers?.repeat_rate ?? 0))} />
            <Stat
              label="Taux d'annulation"
              value={percent(Number(customers?.cancel_rate ?? 0))}
              tone={Number(customers?.cancel_rate ?? 0) > 20 ? "negative" : undefined}
            />
          </div>

          <Card>
            <CardHeader title="Comment lire ces chiffres" />
            <p className="text-[13px] leading-relaxed text-admin-ink-2">
              La valeur vie client est la dépense moyenne par compte ayant réservé au moins une fois ; le
              panier moyen porte sur les réservations non annulées. Les deux se calculent sur l'ensemble de
              l'historique et ne dépendent pas de la période choisie en haut de page.
            </p>
          </Card>
        </div>
      )}

      {tab === "partners" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Nouveaux ce mois" value={count(partners?.new_month)} />
            <Stat label="Partenaires actifs" value={count(partners?.active)} />
            <Stat
              label="Note moyenne"
              value={partners?.avg_rating ? `${Number(partners.avg_rating).toFixed(2).replace(".", ",")}/5` : "—"}
            />
            <Stat label="Revenu moyen par partenaire" value={money(partners?.avg_revenue)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Meilleurs partenaires" subtitle="Par revenus cumulés." />
              <BarList
                items={(partners?.top ?? []).map(t => ({ label: t.name, value: Number(t.revenue) }))}
                formatValue={v => money(v)}
                emptyLabel="Aucun revenu partenaire enregistré."
              />
            </Card>

            <Card>
              <CardHeader title="Répartition par type" />
              <BarList
                items={Object.entries(dist?.by_partner_type ?? {}).map(([k, v]) => ({
                  label: PARTNER_TYPE_LABEL[k] ?? k,
                  value: Number(v),
                  tone: "orange" as const,
                }))}
                emptyLabel="Aucun partenaire actif."
              />
            </Card>
          </div>
        </div>
      )}

      {tab === "marketplace" && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Entonnoir de conversion"
              subtitle="De la recherche à la réservation confirmée."
            />
            <Funnel
              steps={[
                { label: "Recherches", value: Number(funnel?.find(f => f.stage === "search")?.value ?? 0) },
                { label: "Annonces consultées", value: Number(funnel?.find(f => f.stage === "listing_view")?.value ?? 0) },
                { label: "Paiements ouverts", value: Number(funnel?.find(f => f.stage === "checkout")?.value ?? 0) },
                { label: "Paiements réglés", value: Number(funnel?.find(f => f.stage === "payment")?.value ?? 0) },
                { label: "Réservations confirmées", value: Number(funnel?.find(f => f.stage === "confirmed")?.value ?? 0) },
              ]}
            />

            <div className="mt-5">
              <Callout tone="warning">
                Les deux premières étapes demandent un suivi des événements côté site public, qui n'est pas
                encore branché : elles restent à zéro tant qu'aucune recherche n'est enregistrée. Les étapes
                paiement et réservation viennent, elles, des tables réelles.
              </Callout>
            </div>
          </Card>
        </div>
      )}

      {tab === "geography" && (
        <Card padded={false}>
          <div className="border-b border-admin-line px-5 py-4">
            <h2 className="font-display text-[15px] font-semibold text-admin-ink">Performance par ville</h2>
            <p className="text-[12.5px] text-admin-ink-3">Annonces, partenaires, réservations et revenus.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-admin-line bg-admin-raised">
                  {["Ville", "Annonces", "Partenaires", "Réservations", "Revenus"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3 ${
                        i > 0 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {(geo ?? []).map(g => (
                  <tr key={g.city} className="hover:bg-admin-canvas">
                    <td className="px-5 py-3 text-[13px] font-medium text-admin-ink">{g.city}</td>
                    <td className="px-5 py-3 text-right text-[13px] tabular-nums">{count(g.listings)}</td>
                    <td className="px-5 py-3 text-right text-[13px] tabular-nums">{count(g.partners)}</td>
                    <td className="px-5 py-3 text-right text-[13px] tabular-nums">{count(g.bookings)}</td>
                    <td className="px-5 py-3 text-right text-[13px] font-semibold tabular-nums">
                      {money(g.revenue)}
                    </td>
                  </tr>
                ))}
                {(geo ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-admin-ink-3">
                      Aucune ville à afficher.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

export { Download, Button };

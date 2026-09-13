import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileBarChart,
  RefreshCcw,
  Sparkles,
  Users,
} from "lucide-react";
import { Button, Card, CardHeader, PageHeader } from "../components/Ui";
import { HealthCard, MetricCard } from "../components/Cards";
import { ActivityFeed, type FeedEvent } from "../components/Panels";
import { BarList, Donut, GeoMap, LineChart } from "../components/Charts";
import { useRpc } from "../lib/adminData";
import { useAdmin } from "../lib/adminAuth";
import { change, count, dayShort, money, moneyShort } from "../lib/format";
import type { BadgeCounts } from "../lib/nav";

type Overview = {
  gbv: { current: number; previous: number };
  revenue: { current: number; previous: number };
  payments_volume: { current: number; previous: number };
  active_reservations: number;
  customers: { current: number; previous: number };
  partners_active: number;
  listings_published: number;
  health: BadgeCounts & {
    urgent_tickets: number;
    risk_alerts: number;
    payout_failures: number;
    listings_attention: number;
    expiring_verifications: number;
  };
};

type SeriesRow = { day: string; gbv: number; revenue: number; refunds: number; payouts: number };
type GeoRow = { city: string; listings: number; partners: number; bookings: number; revenue: number };
type Distribution = {
  by_service: Record<string, number>;
  by_status: Record<string, number>;
  by_partner_type: Record<string, number>;
};

const RANGES = [
  { id: 7, label: "7 jours" },
  { id: 30, label: "30 jours" },
  { id: 90, label: "3 mois" },
  { id: 365, label: "12 mois" },
];

const SERVICE_LABEL: Record<string, string> = {
  stay: "Hébergements",
  car: "Voitures",
  restaurant: "Restaurants",
};

const PARTNER_LABEL: Record<string, string> = {
  hotel: "Hôtels",
  guesthouse: "Maisons d'hôtes",
  car: "Location de voitures",
  restaurant: "Restaurants",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

/** Spec §3–§9 and §66: health before analytics, always. */
export function Overview() {
  const { me, can } = useAdmin();
  const [days, setDays] = useState(30);
  const [compare, setCompare] = useState(true);
  const [metric, setMetric] = useState<"bookings" | "revenue" | "listings">("bookings");

  const { data, loading, error, reload } = useRpc<Overview>("admin_overview");
  const { data: series, loading: seriesLoading } = useRpc<SeriesRow[]>("admin_revenue_series", { p_days: days });
  const { data: dist } = useRpc<Distribution>("admin_booking_distribution");
  const { data: geo } = useRpc<GeoRow[]>("admin_geo_performance");
  const { data: feed, loading: feedLoading } = useRpc<FeedEvent[]>("admin_activity_feed", { p_limit: 12 });

  const h = data?.health;

  /** Critical first (spec §66): anything that means money or trust is at risk. */
  const critical = useMemo(() => {
    if (!h) return [];
    return [
      { n: Number(h.payment_issues ?? 0), label: "paiements en échec ou contestés", to: "/admin/paiements?status=failed" },
      { n: Number(h.payout_failures ?? 0), label: "versements en échec", to: "/admin/versements?status=failed" },
      { n: Number(h.open_disputes ?? 0), label: "litiges ouverts", to: "/admin/litiges" },
      { n: Number(h.urgent_tickets ?? 0), label: "tickets urgents", to: "/admin/support?priority=urgent" },
      { n: Number(h.risk_alerts ?? 0), label: "alertes de sécurité", to: "/admin/securite" },
    ].filter(x => x.n > 0);
  }, [h]);

  const labels = (series ?? []).map(r => dayShort(r.day));
  const gbvSeries = (series ?? []).map(r => Number(r.gbv));
  const revenueSeries = (series ?? []).map(r => Number(r.revenue));
  const refundSeries = (series ?? []).map(r => Number(r.refunds));

  const half = Math.floor(gbvSeries.length / 2);
  const previousHalf = compare ? gbvSeries.slice(0, half) : null;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${me?.full_name?.split(" ")[0] ?? "Admin"}`}
        subtitle="Voici ce qui se passe sur la plateforme aujourd'hui."
        actions={
          <>
            {can("view_analytics") && (
              <Button as="link" to="/admin/rapports" variant="secondary">
                <FileBarChart className="h-3.5 w-3.5" aria-hidden />
                Voir les rapports
              </Button>
            )}
            {can("manage_content") && (
              <Button as="link" to="/admin/notifications" variant="primary">
                <Bell className="h-3.5 w-3.5" aria-hidden />
                Créer une annonce
              </Button>
            )}
          </>
        }
      />

      {/* 1. Critical issues */}
      {critical.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-xl border border-[#f0cfcd] bg-[#fdf3f2]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <p className="text-[13px] font-semibold text-[#8a2b24]">Demande une action immédiate</p>
            {critical.map(c => (
              <Link
                key={c.label}
                to={c.to}
                className="flex items-center gap-1.5 text-[13px] text-[#8a2b24] underline-offset-2 hover:underline"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#b3261e]" aria-hidden />
                <strong className="font-bold">{c.n}</strong> {c.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 2. Platform health (spec §5) */}
      <section className="mb-6">
        <h2 className="mb-2.5 font-display text-[15px] font-semibold text-admin-ink">Santé de la plateforme</h2>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <HealthCard
            label="Partenaires à approuver"
            value={Number(h?.pending_partner_approvals ?? 0)}
            severity={Number(h?.pending_partner_approvals ?? 0) > 5 ? "urgent" : "attention"}
            to="/admin/verification"
            loading={loading}
          />
          <HealthCard
            label="Annonces à examiner"
            value={Number(h?.pending_listing_reviews ?? 0)}
            severity="attention"
            to="/admin/annonces?status=pending_review"
            loading={loading}
          />
          <HealthCard
            label="Problèmes de paiement"
            value={Number(h?.payment_issues ?? 0)}
            severity="critical"
            to="/admin/paiements?status=failed"
            loading={loading}
          />
          <HealthCard
            label="Demandes de remboursement"
            value={Number(h?.refund_requests ?? 0)}
            severity="attention"
            to="/admin/remboursements"
            loading={loading}
          />
          <HealthCard
            label="Litiges ouverts"
            value={Number(h?.open_disputes ?? 0)}
            severity="critical"
            to="/admin/litiges"
            loading={loading}
          />
          <HealthCard
            label="Tickets de support"
            value={Number(h?.support_tickets ?? 0)}
            severity="normal"
            to="/admin/support"
            loading={loading}
          />
          <HealthCard
            label="Alertes risque et fraude"
            value={Number(h?.risk_alerts ?? 0)}
            severity="critical"
            to="/admin/securite"
            loading={loading}
          />
          <HealthCard
            label="Annonces à corriger"
            value={Number(h?.listings_attention ?? 0)}
            severity="attention"
            to="/admin/annonces?status=rejected"
            loading={loading}
          />
        </div>
      </section>

      {/* 3. Revenue and bookings (spec §4) */}
      <section className="mb-6">
        <h2 className="mb-2.5 font-display text-[15px] font-semibold text-admin-ink">Activité commerciale</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Volume de réservations"
            value={moneyShort(data?.gbv.current)}
            changePct={data ? change(Number(data.gbv.current), Number(data.gbv.previous)) : null}
            trend={gbvSeries}
            tooltip="Somme des réservations non annulées créées sur les 30 derniers jours."
            loading={loading}
            to="/admin/reservations"
          />
          <MetricCard
            label="Revenu de la plateforme"
            value={moneyShort(data?.revenue.current)}
            changePct={data ? change(Number(data.revenue.current), Number(data.revenue.previous)) : null}
            trend={revenueSeries}
            tone="orange"
            tooltip="Commission encaissée sur les paiements réglés."
            loading={loading}
            to="/admin/finance"
          />
          <MetricCard
            label="Paiements encaissés"
            value={moneyShort(data?.payments_volume.current)}
            changePct={
              data ? change(Number(data.payments_volume.current), Number(data.payments_volume.previous)) : null
            }
            tooltip="Montant total réglé par les clients sur la période."
            loading={loading}
            to="/admin/paiements"
          />
          <MetricCard
            label="Réservations actives"
            value={count(data?.active_reservations)}
            comparison="Confirmées, à venir ou en cours"
            changePct={null}
            loading={loading}
            to="/admin/reservations?status=confirmed"
          />
          <MetricCard
            label="Clients"
            value={count(data?.customers.current)}
            changePct={data ? change(Number(data.customers.current), Number(data.customers.previous)) : null}
            comparison="Comptes créés au total"
            loading={loading}
            to="/admin/clients"
          />
          <MetricCard
            label="Partenaires actifs"
            value={count(data?.partners_active)}
            changePct={null}
            comparison="Entreprises pouvant recevoir des réservations"
            loading={loading}
            to="/admin/partenaires?status=active"
          />
          <MetricCard
            label="Annonces publiées"
            value={count(data?.listings_published)}
            changePct={null}
            comparison="Visibles sur le site public"
            loading={loading}
            to="/admin/annonces?status=published"
          />
          <MetricCard
            label="Vérifications en attente"
            value={count(h?.pending_partner_approvals)}
            changePct={null}
            comparison="Dossiers partenaires à traiter"
            tone="orange"
            loading={loading}
            to="/admin/verification"
          />
        </div>
      </section>

      {/* 4. Revenue over time + distribution (spec §7, §8) */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Revenus dans le temps"
            subtitle="Volume réservé, revenu de la plateforme et remboursements."
            action={
              <div className="flex flex-wrap items-center gap-1">
                {RANGES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setDays(r.id)}
                    className={`rounded-md px-2 py-1 text-[12px] font-semibold transition-colors ${
                      days === r.id
                        ? "bg-[#002089] text-white"
                        : "text-admin-ink-3 hover:bg-admin-canvas hover:text-admin-ink"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
                <label className="ml-1.5 flex cursor-pointer items-center gap-1.5 text-[12px] text-admin-ink-2">
                  <input
                    type="checkbox"
                    checked={compare}
                    onChange={e => setCompare(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#002089]"
                  />
                  Comparer
                </label>
              </div>
            }
          />
          {seriesLoading ? (
            <div className="h-[240px] animate-pulse rounded-lg bg-admin-line/50" />
          ) : (
            <LineChart
              labels={labels}
              series={[
                { label: "Volume réservé", values: gbvSeries, tone: "blue" },
                { label: "Revenu plateforme", values: revenueSeries, tone: "orange" },
                ...(refundSeries.some(v => v > 0)
                  ? [{ label: "Remboursements", values: refundSeries, tone: "muted" as const }]
                  : []),
                ...(previousHalf && previousHalf.length > 1
                  ? [{ label: "Période précédente", values: previousHalf, tone: "muted" as const }]
                  : []),
              ]}
              formatValue={v => moneyShort(v)}
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Répartition des réservations" subtitle="Par service et par statut." />
          <Donut
            slices={[
              { label: "Hébergements", value: Number(dist?.by_service?.stay ?? 0), color: "#002089" },
              { label: "Voitures", value: Number(dist?.by_service?.car ?? 0), color: "#e76f2e" },
              { label: "Restaurants", value: Number(dist?.by_service?.restaurant ?? 0), color: "#00508a" },
            ]}
          />

          <div className="mt-5 border-t border-admin-line pt-4">
            <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-admin-ink-3">
              Par statut
            </p>
            <BarList
              items={Object.entries(dist?.by_status ?? {}).map(([k, v]) => ({
                label:
                  k === "confirmed" ? "Confirmées" : k === "pending" ? "En attente" : k === "cancelled" ? "Annulées" : k,
                value: Number(v),
              }))}
              emptyLabel="Aucune réservation enregistrée."
            />
          </div>
        </Card>
      </div>

      {/* 5. Geography (spec §9) */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Performance géographique"
            subtitle="Villes où la plateforme est présente."
            action={
              <div className="flex items-center gap-1">
                {(
                  [
                    ["bookings", "Réservations"],
                    ["revenue", "Revenus"],
                    ["listings", "Annonces"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setMetric(id)}
                    className={`rounded-md px-2 py-1 text-[12px] font-semibold transition-colors ${
                      metric === id
                        ? "bg-[#002089] text-white"
                        : "text-admin-ink-3 hover:bg-admin-canvas hover:text-admin-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />
          <GeoMap points={geo ?? []} metric={metric} />
        </Card>

        <Card>
          <CardHeader title="Principales villes" subtitle="Classées par revenus puis par annonces." />
          <BarList
            items={(geo ?? []).slice(0, 8).map(g => ({
              label: g.city,
              value: metric === "revenue" ? Number(g.revenue) : metric === "listings" ? Number(g.listings) : Number(g.bookings),
              hint: `${count(g.listings)} annonces`,
            }))}
            formatValue={v => (metric === "revenue" ? money(v) : count(v))}
            emptyLabel="Aucune ville à afficher."
          />

          <div className="mt-5 border-t border-admin-line pt-4">
            <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-admin-ink-3">
              Partenaires par type
            </p>
            <BarList
              items={Object.entries(dist?.by_partner_type ?? {}).map(([k, v]) => ({
                label: PARTNER_LABEL[k] ?? k,
                value: Number(v),
                tone: "orange" as const,
              }))}
              emptyLabel="Aucun partenaire actif."
            />
          </div>
        </Card>
      </div>

      {/* 6. Activity + quick actions (spec §6, §58) */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Activité récente"
            subtitle="Candidatures, réservations, remboursements et actions d'administration."
            action={
              can("view_audit_logs") ? (
                <Button as="link" to="/admin/audit" variant="ghost" size="sm">
                  Tout voir
                </Button>
              ) : undefined
            }
          />
          <ActivityFeed events={feed ?? []} loading={feedLoading} />
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Actions rapides" />
            <div className="flex flex-col gap-1.5">
              {[
                { label: "Examiner un partenaire", to: "/admin/verification", Icon: Building2, perm: "manage_verification" },
                { label: "Examiner une annonce", to: "/admin/annonces?status=pending_review", Icon: ClipboardCheck, perm: "moderate_listings" },
                { label: "Ouvrir une réservation", to: "/admin/reservations", Icon: ClipboardCheck, perm: "view_bookings" },
                { label: "Traiter un remboursement", to: "/admin/remboursements", Icon: RefreshCcw, perm: "issue_refunds" },
                { label: "Créer une promotion", to: "/admin/promotions", Icon: Sparkles, perm: "manage_promotions" },
                { label: "Envoyer une notification", to: "/admin/notifications", Icon: Bell, perm: "manage_content" },
              ]
                .filter(a => can(a.perm))
                .map(a => (
                  <Link
                    key={a.to}
                    to={a.to}
                    className="flex items-center gap-2.5 rounded-lg border border-admin-line px-3 py-2.5 text-[13px] font-medium text-admin-ink transition-colors hover:border-[#002089]/35 hover:bg-admin-canvas"
                  >
                    <a.Icon className="h-4 w-4 shrink-0 text-[#002089]" aria-hidden />
                    {a.label}
                  </Link>
                ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Exporter" subtitle="Données de la période affichée." />
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                const rows = (series ?? []).map(r => ({
                  jour: r.day,
                  volume_reserve: r.gbv,
                  revenu_plateforme: r.revenue,
                  remboursements: r.refunds,
                  versements: r.payouts,
                }));
                if (rows.length === 0) return;
                const csv = [
                  Object.keys(rows[0]).join(";"),
                  ...rows.map(r => Object.values(r).join(";")),
                ].join("\n");
                const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `papot-revenus-${days}j.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Exporter le revenu ({days} j)
            </Button>
          </Card>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Button variant="secondary" onClick={reload}>
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            Recharger les indicateurs
          </Button>
        </div>
      )}
    </>
  );
}

export { CircleDollarSign, Users };

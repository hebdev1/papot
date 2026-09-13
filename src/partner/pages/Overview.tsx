import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Car,
  ClipboardCheck,
  LogIn,
  LogOut,
  MessageSquare,
  Plus,
  Star,
  Users,
  Wrench,
} from "lucide-react";
import { Button, Card, CardHeader, EmptyState, PageHeader, Skeleton } from "../../console/Ui";
import { MetricCard } from "../../console/Cards";
import { StatusBadge } from "../../console/StatusBadge";
import { LineChart } from "../../console/Charts";
import { useRpc, useTable } from "../../console/data";
import { change, count, dayShort, money, moneyShort, range } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type Overview = {
  revenue_month: { current: number; previous: number };
  reservations_today: number;
  reservations_upcoming: number;
  pending_payout: number;
  next_payout: { amount: number; period_end: string; status: string } | null;
  rating: number | null;
  reviews_count: number;
  occupancy: number;
  listings: { total: number; published: number; draft: number; pending: number; paused: number; needs_changes: number };
  action_required: {
    pending_confirmation: number;
    listings_need_changes: number;
    unread_messages: number;
    unanswered_reviews: number;
    payout_incomplete: boolean;
  };
  today: {
    check_ins: number; check_outs: number; pickups: number; returns: number;
    covers: number; large_parties: number; in_maintenance: number;
  };
};

type SeriesRow = { day: string; revenue: number; bookings: number };

type UpcomingRow = {
  reference: string;
  customer_label: string | null;
  first_title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  total: number;
  status: string;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

/** Spec §5–§9 and §96: today, then what needs you, then the numbers. */
export function Overview() {
  const { active, can } = usePartner();
  const partnerId = active?.partner_id;

  const { data, loading } = useRpc<Overview>("partner_overview", { p_partner: partnerId }, !!partnerId);
  const { data: series } = useRpc<SeriesRow[]>(
    "partner_revenue_series",
    { p_partner: partnerId, p_days: 30 },
    !!partnerId && can("view_analytics"),
  );

  const upcoming = useTable<UpcomingRow>({
    from: "admin_reservation_rows",
    select: "reference, customer_label, first_title, starts_on, ends_on, total, status",
    filters: [{ col: "partner_id", op: "eq", value: partnerId ?? "" }],
    sort: { col: "starts_on", dir: "asc" },
    pageSize: 6,
    enabled: !!partnerId && can("view_reservations"),
  });

  const a = data?.action_required;
  const t = data?.today;
  const isStay = active?.type === "hotel" || active?.type === "guesthouse";

  const actions = [
    { n: Number(a?.pending_confirmation ?? 0), label: "réservations à confirmer", to: "/partenaire/reservations?status=pending" },
    { n: Number(a?.listings_need_changes ?? 0), label: "annonces à corriger", to: "/partenaire/annonces?status=rejected" },
    { n: Number(a?.unanswered_reviews ?? 0), label: "avis sans réponse", to: "/partenaire/avis" },
    { n: Number(a?.unread_messages ?? 0), label: "conversations clients", to: "/partenaire/messages" },
  ].filter(x => x.n > 0);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${active?.business_name ?? "partenaire"}`}
        subtitle="Voici où en est votre activité aujourd'hui."
        actions={
          <>
            {can("manage_listings") && (
              <Button as="link" to="/partenaire/annonces/nouveau" variant="primary">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Ajouter une annonce
              </Button>
            )}
            {can("view_reservations") && (
              <Button as="link" to="/partenaire/calendrier" variant="secondary">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Calendrier
              </Button>
            )}
            {can("manage_availability") && (
              <Button as="link" to="/partenaire/disponibilite" variant="secondary">
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                Disponibilité
              </Button>
            )}
          </>
        }
      />

      {/* 1. What needs you (spec §7, §96) */}
      {actions.length > 0 && (
        <Card className="mb-5 border-[#f3e2c4] bg-[#fdf8ee]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className="text-[13px] font-semibold text-[#7a5b12]">Demande votre attention</p>
              {actions.map(x => (
                <Link
                  key={x.label}
                  to={x.to}
                  className="flex items-center gap-1.5 text-[13px] text-[#7a5b12] underline-offset-2 hover:underline"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#e76f2e]" aria-hidden />
                  <strong className="font-bold">{x.n}</strong> {x.label}
                </Link>
              ))}
            </div>
            <Button as="link" to={actions[0].to} variant="accent" size="sm">
              Traiter maintenant
            </Button>
          </div>
        </Card>
      )}

      {/* 2. Today's operations (spec §8), phrased for the business type */}
      <section className="mb-6">
        <h2 className="mb-2.5 font-display text-[15px] font-semibold text-admin-ink">Aujourd'hui</h2>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {isStay && (
            <>
              <TodayCard icon={LogIn} label="Arrivées" value={t?.check_ins ?? 0} to="/partenaire/reservations" />
              <TodayCard icon={LogOut} label="Départs" value={t?.check_outs ?? 0} to="/partenaire/reservations" />
              <TodayCard icon={ClipboardCheck} label="À confirmer" value={a?.pending_confirmation ?? 0} to="/partenaire/reservations?status=pending" />
              <TodayCard icon={CalendarDays} label="Taux d'occupation" value={`${count(data?.occupancy)} %`} to="/partenaire/disponibilite" />
            </>
          )}
          {active?.type === "car" && (
            <>
              <TodayCard icon={LogOut} label="Départs de véhicules" value={t?.pickups ?? 0} to="/partenaire/reservations" />
              <TodayCard icon={LogIn} label="Retours" value={t?.returns ?? 0} to="/partenaire/reservations" />
              <TodayCard icon={Wrench} label="En maintenance" value={t?.in_maintenance ?? 0} to="/partenaire/flotte" />
              <TodayCard icon={ClipboardCheck} label="À confirmer" value={a?.pending_confirmation ?? 0} to="/partenaire/reservations?status=pending" />
            </>
          )}
          {active?.type === "restaurant" && (
            <>
              <TodayCard icon={ClipboardCheck} label="Réservations" value={data?.reservations_today ?? 0} to="/partenaire/reservations" />
              <TodayCard icon={Users} label="Couverts attendus" value={t?.covers ?? 0} to="/partenaire/reservations" />
              <TodayCard icon={Users} label="Grandes tablées" value={t?.large_parties ?? 0} to="/partenaire/reservations" />
              <TodayCard icon={CalendarDays} label="Tables" value={0} to="/partenaire/tables" />
            </>
          )}
        </div>
      </section>

      {/* 3. The numbers (spec §6) */}
      <section className="mb-6">
        <h2 className="mb-2.5 font-display text-[15px] font-semibold text-admin-ink">Vos indicateurs</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Revenus ce mois"
            value={moneyShort(data?.revenue_month.current)}
            changePct={data ? change(Number(data.revenue_month.current), Number(data.revenue_month.previous)) : null}
            comparison="vs 30 jours précédents"
            trend={(series ?? []).map(s => Number(s.revenue))}
            loading={loading}
            to="/partenaire/finance"
          />
          <MetricCard
            label="Réservations à venir"
            value={count(data?.reservations_upcoming)}
            changePct={null}
            comparison={`${count(data?.reservations_today)} aujourd'hui`}
            loading={loading}
            to="/partenaire/reservations"
          />
          <MetricCard
            label="Prochain versement"
            value={moneyShort(data?.next_payout?.amount ?? data?.pending_payout)}
            changePct={null}
            comparison={
              data?.next_payout
                ? `Période close le ${dayShort(data.next_payout.period_end)}`
                : "Aucun versement programmé"
            }
            tone="orange"
            loading={loading}
            to="/partenaire/versements"
          />
          <MetricCard
            label={isStay ? "Taux d'occupation" : "Taux d'utilisation"}
            value={`${count(data?.occupancy)} %`}
            changePct={null}
            comparison="30 prochains jours"
            loading={loading}
            to="/partenaire/disponibilite"
          />
          <MetricCard
            label="Note moyenne"
            value={data?.rating ? `${Number(data.rating).toFixed(1).replace(".", ",")} / 5` : "—"}
            changePct={null}
            comparison={`${count(data?.reviews_count)} avis publiés`}
            loading={loading}
            to="/partenaire/avis"
          />
          <MetricCard
            label="Annonces publiées"
            value={count(data?.listings.published)}
            changePct={null}
            comparison={`${count(data?.listings.total)} au total`}
            loading={loading}
            to="/partenaire/annonces"
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* 4. Upcoming reservations (spec §9) */}
        <Card className="xl:col-span-2" padded={false}>
          <div className="flex items-center justify-between border-b border-admin-line px-5 py-4">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-admin-ink">
                Prochaines réservations
              </h2>
              <p className="text-[12.5px] text-admin-ink-3">Les six plus proches.</p>
            </div>
            <Button as="link" to="/partenaire/reservations" variant="ghost" size="sm">
              Tout voir
            </Button>
          </div>

          {upcoming.loading ? (
            <div className="p-5">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : upcoming.rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ClipboardCheck}
                title="Aucune réservation pour l'instant"
                body="Les nouvelles réservations apparaîtront ici dès qu'un client réservera."
              />
            </div>
          ) : (
            <ul className="divide-y divide-admin-line">
              {upcoming.rows.map(r => (
                <li key={r.reference}>
                  <Link
                    to={`/partenaire/reservations/${r.reference}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-admin-canvas"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-admin-ink">
                        {r.customer_label ?? r.reference}
                      </span>
                      <span className="block truncate text-[12px] text-admin-ink-3">
                        {r.first_title ?? "—"} · {range(r.starts_on, r.ends_on)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">
                      {money(r.total)}
                    </span>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {can("view_analytics") && (
            <Card>
              <CardHeader title="Revenus (30 jours)" />
              {series && series.length > 1 ? (
                <LineChart
                  labels={series.map(s => dayShort(s.day))}
                  series={[{ label: "Revenus", values: series.map(s => Number(s.revenue)), tone: "blue" }]}
                  formatValue={v => moneyShort(v)}
                  height={180}
                />
              ) : (
                <Skeleton className="h-[180px] w-full" />
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Vos annonces" />
            <ul className="flex flex-col gap-1.5">
              {[
                { label: "Publiées", n: data?.listings.published, to: "/partenaire/annonces?status=published" },
                { label: "Brouillons", n: data?.listings.draft, to: "/partenaire/annonces?status=draft" },
                { label: "En attente de revue", n: data?.listings.pending, to: "/partenaire/annonces?status=pending_review" },
                { label: "En pause", n: data?.listings.paused, to: "/partenaire/annonces?status=paused" },
                { label: "À corriger", n: data?.listings.needs_changes, to: "/partenaire/annonces?status=rejected" },
              ].map(x => (
                <li key={x.label}>
                  <Link
                    to={x.to}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-admin-canvas"
                  >
                    <span className="text-admin-ink-2">{x.label}</span>
                    <span className="font-semibold tabular-nums text-admin-ink">{count(x.n)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function TodayCard({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  to: string;
}) {
  const empty = value === 0 || value === "0 %";
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-admin-line bg-admin-surface p-3.5 transition-shadow hover:shadow-md"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-content-center rounded-lg ${
          empty ? "bg-admin-canvas text-admin-ink-3" : "bg-[#eef3fb] text-[#002089]"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[19px] font-semibold leading-none text-admin-ink">
          {value}
        </span>
        <span className="mt-1 block truncate text-[12px] text-admin-ink-3">{label}</span>
      </span>
      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 text-admin-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </Link>
  );
}

export { Star, MessageSquare, Car };

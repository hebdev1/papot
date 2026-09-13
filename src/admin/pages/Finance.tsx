import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, PageHeader } from "../../console/Ui";
import { MetricCard } from "../../console/Cards";
import { BarList, Donut, LineChart } from "../../console/Charts";
import { useRpc } from "../lib/adminData";
import { count, dayShort, money, moneyShort, percent } from "../../console/format";

type FinanceStats = {
  gbv: number;
  net_revenue: number;
  collected: number;
  partner_payouts: number;
  pending_payouts: number;
  held_payouts: number;
  refunds: number;
  refunds_pending: number;
  chargebacks: number;
  failed_payments: number;
  payments_count: number;
  by_method: Record<string, number>;
  by_status: Record<string, number>;
};

type SeriesRow = { day: string; gbv: number; revenue: number; refunds: number; payouts: number };

const METHOD_LABEL: Record<string, string> = {
  card: "Carte bancaire",
  mobile_money: "Mobile money",
  bank_transfer: "Virement",
  cash: "Espèces",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Payé",
  pending: "En attente",
  failed: "Échoué",
  refunded: "Remboursé",
  partially_refunded: "Partiellement remboursé",
  disputed: "Contesté",
  chargeback: "Rétrofacturation",
};

/** Spec §27. */
export function FinanceDashboard() {
  const [days, setDays] = useState(30);
  const { data, loading } = useRpc<FinanceStats>("admin_finance_stats");
  const { data: series } = useRpc<SeriesRow[]>("admin_revenue_series", { p_days: days });

  const takeRate =
    data && Number(data.collected) > 0 ? (Number(data.net_revenue) / Number(data.collected)) * 100 : null;

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Encaissements, commissions, versements aux partenaires et remboursements."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Volume de réservations"
          value={moneyShort(data?.gbv)}
          changePct={null}
          comparison="Toutes réservations non annulées"
          loading={loading}
          trend={(series ?? []).map(s => Number(s.gbv))}
        />
        <MetricCard
          label="Revenu net de la plateforme"
          value={moneyShort(data?.net_revenue)}
          changePct={null}
          comparison={takeRate !== null ? `Taux de prise ${percent(takeRate)}` : "Commission encaissée"}
          tone="orange"
          loading={loading}
          trend={(series ?? []).map(s => Number(s.revenue))}
        />
        <MetricCard
          label="Versements aux partenaires"
          value={moneyShort(data?.partner_payouts)}
          changePct={null}
          comparison="Déjà réglés"
          loading={loading}
          to="/admin/versements"
        />
        <MetricCard
          label="Versements en attente"
          value={moneyShort(data?.pending_payouts)}
          changePct={null}
          comparison="Prêts ou en cours de traitement"
          loading={loading}
          to="/admin/versements?status=ready"
        />
        <MetricCard
          label="Remboursements"
          value={moneyShort(data?.refunds)}
          changePct={null}
          comparison={`${count(data?.refunds_pending)} demande(s) en attente`}
          tone="red"
          loading={loading}
          to="/admin/remboursements"
        />
        <MetricCard
          label="Rétrofacturations"
          value={moneyShort(data?.chargebacks)}
          changePct={null}
          comparison="Montant contesté par les banques"
          tone="red"
          loading={loading}
          to="/admin/paiements?status=chargeback"
        />
        <MetricCard
          label="Paiements en échec"
          value={count(data?.failed_payments)}
          changePct={null}
          comparison="À relancer ou investiguer"
          tone="red"
          loading={loading}
          to="/admin/paiements?status=failed"
        />
        <MetricCard
          label="Montant encaissé"
          value={moneyShort(data?.collected)}
          changePct={null}
          comparison={`${count(data?.payments_count)} transaction(s)`}
          loading={loading}
          to="/admin/paiements"
        />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Flux financiers"
            subtitle="Volume réservé, commission, remboursements et versements."
            action={
              <div className="flex items-center gap-1">
                {[7, 30, 90, 365].map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`rounded-md px-2 py-1 text-[12px] font-semibold transition-colors ${
                      days === d ? "bg-[#002089] text-white" : "text-admin-ink-3 hover:bg-admin-canvas hover:text-admin-ink"
                    }`}
                  >
                    {d === 365 ? "12 mois" : d === 90 ? "3 mois" : `${d} j`}
                  </button>
                ))}
              </div>
            }
          />
          <LineChart
            labels={(series ?? []).map(s => dayShort(s.day))}
            series={[
              { label: "Volume réservé", values: (series ?? []).map(s => Number(s.gbv)), tone: "blue" },
              { label: "Commission", values: (series ?? []).map(s => Number(s.revenue)), tone: "orange" },
              { label: "Remboursements", values: (series ?? []).map(s => Number(s.refunds)), tone: "muted" },
            ]}
            formatValue={v => moneyShort(v)}
          />
        </Card>

        <Card>
          <CardHeader title="Moyens de paiement" subtitle="Répartition des montants encaissés." />
          <Donut
            slices={Object.entries(data?.by_method ?? {}).map(([k, v], i) => ({
              label: METHOD_LABEL[k] ?? k,
              value: Number(v),
              color: ["#002089", "#e76f2e", "#00508a", "#7a6355"][i % 4],
            }))}
          />

          <div className="mt-5 border-t border-admin-line pt-4">
            <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-admin-ink-3">
              Statut des paiements
            </p>
            <BarList
              items={Object.entries(data?.by_status ?? {}).map(([k, v]) => ({
                label: STATUS_LABEL[k] ?? k,
                value: Number(v),
              }))}
              emptyLabel="Aucun paiement enregistré."
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Sections financières" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { to: "/admin/paiements", label: "Paiements", hint: "Transactions clients, échecs et litiges" },
            { to: "/admin/versements", label: "Versements", hint: "Ce que la plateforme doit aux partenaires" },
            { to: "/admin/remboursements", label: "Remboursements", hint: "File de traitement et décisions" },
            { to: "/admin/commissions", label: "Commissions", hint: "Règles par type, service et partenaire" },
            { to: "/admin/transactions", label: "Transactions", hint: "Journal unifié des mouvements" },
            { to: "/admin/factures", label: "Factures", hint: "Documents émis aux partenaires" },
          ].map(s => (
            <Link
              key={s.to}
              to={s.to}
              className="group flex items-center gap-3 rounded-lg border border-admin-line px-3.5 py-3 transition-colors hover:border-[#002089]/35 hover:bg-admin-canvas"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-admin-ink">{s.label}</span>
                <span className="block truncate text-[12px] text-admin-ink-3">{s.hint}</span>
              </span>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-admin-ink-3 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

export { money };

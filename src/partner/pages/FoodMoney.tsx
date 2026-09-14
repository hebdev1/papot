import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "../../lib/utils";
import { Callout, Card, CardHeader, EmptyState, PageHeader, Skeleton, Tabs } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { useRpc } from "../../console/data";
import { count, money } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type Finance = {
  du: string;
  au: string;
  nourriture: {
    commandes: number;
    plats: number;
    remises: number;
    taxes: number;
    livraison: number;
    service: number;
    pourboires: number;
    encaisse: number;
    rembourse: number;
    panier_moyen: number;
    a_emporter: number;
    sur_place: number;
    livrees: number;
  };
  tables: { reservations: number; couverts: number; encaisse: number };
  commission: { prelevee: number; net: number; regle: number };
  taux: { nourriture: number | null; livraison: number | null; pourboire: number | null };
};

type Stats = {
  depuis: string;
  plats: { nom: string; vendus: number; revenu: number; commandes: number }[];
  heures: { heure: number; commandes: number }[];
  composants: { nom: string; choisi: number }[];
};

const pct = (v: number | null) => (v === null ? "—" : `${Number(v)} %`);

export function FoodMoney() {
  const { active } = usePartner();
  const [tab, setTab] = useState<"argent" | "plats">("argent");

  const fin = useRpc<Finance>("restaurant_finance", { p_partner: active?.partner_id }, !!active);
  const stats = useRpc<Stats>(
    "restaurant_food_stats",
    { p_partner: active?.partner_id, p_days: 30 },
    !!active,
  );

  if (fin.loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!fin.data) {
    return (
      <>
        <PageHeader title="Restauration" />
        <EmptyState
          icon={UtensilsCrossed}
          title="Rien à afficher"
          body="Les chiffres apparaissent dès la première commande réglée."
        />
      </>
    );
  }

  const f = fin.data.nourriture;
  const t = fin.data.tables;
  const c = fin.data.commission;
  const peak = (stats.data?.heures ?? []).reduce(
    (best, h) => (best === null || h.commandes > best.commandes ? h : best),
    null as { heure: number; commandes: number } | null,
  );
  const busiest = Math.max(1, ...(stats.data?.heures ?? []).map(h => h.commandes));

  return (
    <>
      <PageHeader
        title="Restauration"
        subtitle={`Du ${fin.data.du} au ${fin.data.au}. Les tables et la nourriture comptent séparément.`}
        breadcrumb={[{ label: "Finance", to: "/partenaire/finance" }]}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "argent", label: "Argent" },
          { id: "plats", label: "Plats et heures" },
        ]}
      />

      {tab === "argent" ? (
        <>
          <div className="mb-5 grid gap-2.5 sm:grid-cols-4">
            <Stat label="Encaissé (nourriture)" value={money(f.encaisse)} />
            <Stat label="Commission PAPOT" value={money(c.prelevee)} />
            <Stat label="Net" value={money(c.net)} />
            <Stat label="Panier moyen" value={money(f.panier_moyen)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="flex flex-col gap-4 xl:col-span-2">
              <Card padded={false}>
                <CardHeader title="Nourriture" subtitle={`${count(f.commandes)} commande(s) sur la période.`} />
                <dl className="px-5 pb-4 text-[13.5px]">
                  {[
                    ["Plats", f.plats],
                    ["Remises", -f.remises],
                    ["Taxes", f.taxes],
                    ["Frais de livraison", f.livraison],
                    ["Frais de service", f.service],
                    ["Pourboires", f.pourboires],
                  ]
                    .filter(([, v]) => Number(v) !== 0)
                    .map(([label, v]) => (
                      <div key={String(label)} className="flex items-center justify-between py-1">
                        <dt className="text-admin-ink-2">{label}</dt>
                        <dd className="tabular-nums text-admin-ink">{money(Number(v))}</dd>
                      </div>
                    ))}
                  <div className="mt-1.5 flex items-center justify-between border-t border-admin-line pt-2">
                    <dt className="font-semibold text-admin-ink">Encaissé</dt>
                    <dd className="font-display text-[17px] font-semibold tabular-nums text-admin-ink">
                      {money(f.encaisse)}
                    </dd>
                  </div>
                  {Number(f.rembourse) > 0 && (
                    <div className="flex items-center justify-between py-1">
                      <dt className="text-[#b3261e]">Remboursé</dt>
                      <dd className="tabular-nums text-[#b3261e]">{money(f.rembourse)}</dd>
                    </div>
                  )}
                </dl>
              </Card>

              <Card>
                <CardHeader
                  title="Commission"
                  subtitle="Chaque type de recette a son propre taux."
                />
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <Stat label="Sur la nourriture" value={pct(fin.data.taux.nourriture)} />
                  <Stat label="Sur la livraison" value={pct(fin.data.taux.livraison)} />
                  <Stat label="Sur le pourboire" value={pct(fin.data.taux.pourboire)} />
                </div>
                <p className="mt-3 text-[12.5px] text-admin-ink-3">
                  {count(c.regle)} commande(s) réglée(s) et portée(s) au grand livre. Une commande
                  encaissée à la remise n'entre dans ce total qu'une fois marquée payée.
                </p>
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader title="Tables" subtitle="Réserver une table ne coûte rien au client." />
                <div className="flex flex-col gap-2.5">
                  <Stat label="Réservations" value={count(t.reservations)} />
                  <Stat label="Couverts" value={count(t.couverts)} />
                  <Stat label="Encaissé" value={money(t.encaisse)} />
                </div>
              </Card>

              <Card>
                <CardHeader title="Retrait" />
                <div className="flex flex-col gap-2.5">
                  <Stat label="À emporter" value={count(f.a_emporter)} />
                  <Stat label="Sur place" value={count(f.sur_place)} />
                  <Stat label="Livrées" value={count(f.livrees)} />
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : stats.loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (stats.data?.plats.length ?? 0) === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="Aucune vente" body="Les plats apparaissent dès la première commande." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card padded={false} className="xl:col-span-2">
            <CardHeader title="Plats les plus vendus" subtitle="Sur 30 jours, par recette." />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-admin-line bg-admin-raised">
                    <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Plat</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Vendus</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Commandes</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Recette</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-line">
                  {stats.data?.plats.map(p => (
                    <tr key={p.nom}>
                      <td className="px-5 py-2.5 text-admin-ink">{p.nom}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-admin-ink-2">{count(p.vendus)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-admin-ink-2">{count(p.commandes)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-admin-ink">{money(p.revenu)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader
                title="Heures de pointe"
                subtitle={peak ? `Le plus chargé : ${peak.heure} h.` : "Pas encore de tendance."}
              />
              <div className="flex flex-col gap-1.5">
                {(stats.data?.heures ?? []).map(h => (
                  <div key={h.heure} className="flex items-center gap-2.5">
                    <span className="w-10 shrink-0 text-[12.5px] tabular-nums text-admin-ink-3">{h.heure} h</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-admin-canvas">
                      <span
                        className={cn("block h-full rounded-full bg-[#002089]")}
                        style={{ width: `${Math.round((h.commandes / busiest) * 100)}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right text-[12.5px] tabular-nums text-admin-ink">
                      {h.commandes}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {(stats.data?.composants.length ?? 0) > 0 && (
              <Card>
                <CardHeader title="Composants les plus choisis" subtitle="Dans les assiettes à composer." />
                <div className="flex flex-col gap-1.5">
                  {stats.data?.composants.map(c2 => (
                    <div key={c2.nom} className="flex items-center justify-between text-[13px]">
                      <span className="text-admin-ink">{c2.nom}</span>
                      <span className="tabular-nums text-admin-ink-2">{count(c2.choisi)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <div className="mt-5">
        <Callout tone="info">
          Les vues et les ajouts au panier ne sont pas mesurés : rien ne les enregistre encore, et
          un taux de conversion calculé sans eux ressemblerait à une mesure sans en être une.
        </Callout>
      </div>
    </>
  );
}

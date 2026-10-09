import { useEffect, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  Button,
  Callout,
  Card,
  PageHeader,
  Skeleton,
  inputClass,
  labelClass,
  selectClass,
} from "../../console/Ui";
import { ConfirmDialog, useConfirm } from "../../console/Dialog";
import { friendlyError, table, useTable } from "../../console/data";
import { usePartner } from "../lib/partnerAuth";
import { useRefundPolicy } from "../../lib/bus";

/**
 * Conditions d'annulation.
 *
 * A policy is a ladder: the further ahead a passenger cancels, the more they
 * get back. A quote walks down the rungs and takes the first one it is still
 * above, so "48 h → 90 %" means *at least* 48 hours before departure.
 *
 * Two rules decide which ladder applies, and both are shown rather than
 * implied, because a company editing one screen must be able to predict what a
 * passenger will be quoted:
 *
 *   * A route's own rungs REPLACE the company's, as a whole set. Merging them
 *     rung by rung would produce a ladder neither screen ever showed.
 *   * PAPOT keeps a floor. A cancellation made beyond the protected window is
 *     never refunded below the platform minimum, whatever the rungs say — and
 *     because the floor is applied to the computed figure rather than to each
 *     rung, simply not writing a generous rung does not get round it.
 *
 * A company that has never opened this screen still has a policy: the
 * platform's own ladder stands in. The alternative, no rules meaning no
 * refund, would be the harshest possible terms arrived at by silence.
 */

type Rule = {
  id: string;
  partner_id: string;
  listing_id: string | null;
  hours_before: number;
  refund_percent: number;
  fee_flat: number;
  active: boolean;
};

type Route = { id: string; name: string };

const pct = (n: number) => `${Number(n) % 1 === 0 ? Number(n).toFixed(0) : Number(n)} %`;
const usd = (n: number) => `${Number(n).toFixed(2).replace(".", ",")} $`;

/** "48" -> "48 h avant", "0" -> "jusqu'au départ" */
const rung = (hours: number) =>
  Number(hours) === 0 ? "jusqu'au départ" : `${hours} h avant ou plus`;

export function BusPolicy() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const [scope, setScope] = useState<string>("");
  const [hours, setHours] = useState("");
  const [percent, setPercent] = useState("");
  const [fee, setFee] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const routes = useTable<Route>({
    from: "listings",
    select: "id, name",
    filters: [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      { col: "kind", op: "eq", value: "bus" },
    ],
    sort: { col: "name", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  const rules = useTable<Rule>({
    from: "bus_cancellation_rules",
    select: "id, partner_id, listing_id, hours_before, refund_percent, fee_flat, active",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "hours_before", dir: "desc" },
    pageSize: 100,
    enabled: !!active,
  });

  // The effective ladder for the route being edited, straight from the server,
  // so this screen can never show terms the quote will not apply.
  const effective = useRefundPolicy(scope || routes.rows[0]?.id);

  useEffect(() => {
    setError(null);
  }, [scope]);

  const mine = rules.rows.filter(r =>
    scope === "" ? r.listing_id === null : r.listing_id === scope,
  );

  const add = async () => {
    setError(null);
    const h = Number(hours);
    const p = Number(percent);
    const f = Number(fee || 0);
    if (!Number.isFinite(h) || h < 0) return setError("Indiquez un délai en heures.");
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return setError("Le remboursement va de 0 à 100 %.");
    }
    if (!Number.isFinite(f) || f < 0) return setError("Les frais ne peuvent pas être négatifs.");

    setBusy(true);
    const { error: e } = await table("bus_cancellation_rules").insert({
      partner_id: active?.partner_id,
      listing_id: scope === "" ? null : scope,
      hours_before: Math.round(h),
      refund_percent: p,
      fee_flat: f,
    } as never);
    setBusy(false);
    if (e) return setError(friendlyError(e));
    setHours("");
    setPercent("");
    setFee("0");
    rules.reload();
  };

  if (routes.loading) return <Skeleton className="h-40 w-full rounded-xl" />;

  return (
    <>
      <PageHeader
        title="Conditions d'annulation"
        subtitle="Ce qu'un passager récupère selon le moment où il annule. Le calcul est fait par PAPOT au moment de l'annulation, à partir de ces règles."
      />

      <div className="mb-4 max-w-md">
        <label className={labelClass} htmlFor="scope">Ces règles s'appliquent à</label>
        <select
          id="scope"
          value={scope}
          onChange={e => setScope(e.target.value)}
          className={selectClass}
        >
          <option value="">Toutes mes lignes</option>
          {routes.rows.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {scope !== "" && (
          <p className="mt-1 text-[12px] text-admin-ink-3">
            Les règles d'une ligne remplacent entièrement celles de la compagnie — elles ne
            s'additionnent pas.
          </p>
        )}
      </div>

      {effective && (
        <div className="mb-4">
          <Callout tone={effective.source === "platform" ? "warning" : "info"}>
            {effective.source === "platform" ? (
              <>
                Vous n'avez défini aucune règle : la politique par défaut de PAPOT s'applique
                ({effective.tiers.map(t => `${t.hours_before} h → ${pct(t.refund_percent)}`).join(", ")}).
              </>
            ) : (
              <>
                Politique appliquée : celle{" "}
                {effective.source === "route" ? "de cette ligne" : "de la compagnie"}.
              </>
            )}
          </Callout>
        </div>
      )}

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-admin-ink-3" />
          <p className="text-[13px] text-admin-ink-2">
            PAPOT garantit au moins{" "}
            <strong>{pct(effective?.min_percent ?? 50)}</strong> de remboursement pour une
            annulation faite plus de{" "}
            <strong>{effective?.protected_hours ?? 48} h</strong> avant le départ. Une règle
            moins généreuse que ce plancher sera relevée automatiquement.
          </p>
        </div>

        {rules.loading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : mine.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-admin-ink-3">
            Aucune règle ici. Ajoutez-en une ci-dessous, ou laissez la politique PAPOT
            s'appliquer.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-admin-line">
                  {["Le passager annule", "Remboursé", "Frais retenus", ""].map(h => (
                    <th
                      key={h || "x"}
                      className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {mine.map(r => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 text-[13px] font-medium text-admin-ink">
                      {rung(r.hours_before)}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums">{pct(r.refund_percent)}</td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums">
                      {Number(r.fee_flat) > 0 ? usd(r.fee_flat) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {can("manage_pricing") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            confirm({
                              title: "Retirer cette règle ?",
                              consequence:
                                "Les annulations retomberont sur la règle suivante, ou sur la politique PAPOT s'il n'en reste aucune.",
                              confirmLabel: "Retirer",
                              danger: true,
                              onConfirm: async () => {
                                const del = await table("bus_cancellation_rules")
                                  .delete()
                                  .eq("id", r.id);
                                if (del.error) return friendlyError(del.error);
                                rules.reload();
                                return null;
                              },
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {can("manage_pricing") && (
        <Card className="mt-4">
          <p className="mb-3 text-[13px] font-semibold text-admin-ink">Ajouter une règle</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <label className={labelClass} htmlFor="r-hours">Heures avant</label>
              <input
                id="r-hours"
                value={hours}
                onChange={e => setHours(e.target.value)}
                inputMode="numeric"
                className={inputClass}
                placeholder="48"
              />
            </div>
            <div className="w-40">
              <label className={labelClass} htmlFor="r-pct">Remboursé (%)</label>
              <input
                id="r-pct"
                value={percent}
                onChange={e => setPercent(e.target.value)}
                inputMode="decimal"
                className={inputClass}
                placeholder="90"
              />
            </div>
            <div className="w-40">
              <label className={labelClass} htmlFor="r-fee">Frais fixes ($)</label>
              <input
                id="r-fee"
                value={fee}
                onChange={e => setFee(e.target.value)}
                inputMode="decimal"
                className={inputClass}
                placeholder="0"
              />
            </div>
            <Button variant="primary" disabled={busy} onClick={add}>
              <Plus className="mr-1 h-4 w-4" />
              {busy ? "Ajout…" : "Ajouter"}
            </Button>
          </div>
          {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
          <p className="mt-3 text-[12px] text-admin-ink-3">
            Exemple d'échelle : 48 h → 90 %, 24 h → 50 %, 0 h → 0 %. Un passager qui annule
            30 h avant tombe sur la règle des 24 h.
          </p>
        </Card>
      )}

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  Button, Callout, Card, EmptyState, PageHeader, Skeleton, inputClass, labelClass,
} from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { friendlyError, table, useTable } from "../../console/data";
import { count } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type Dish = { id: string; name: string; sold_out: boolean; available: boolean; position: number };
type Row = {
  item_id: string;
  day: string;
  prepared: number;
  sold: number;
  remaining: number;
  low_threshold: number | null;
};

/** Today in Port-au-Prince, which is the day the kitchen is actually cooking. */
const todayInHaiti = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port-au-Prince" }).format(new Date());

type State = "untracked" | "out" | "low" | "ok" | "hidden";

const STATE_STYLE: Record<State, string> = {
  untracked: "border-admin-line bg-admin-canvas text-admin-ink-3",
  out: "border-[#f5c2bd] bg-[#fdecea] text-[#b3261e]",
  low: "border-[#f3e2c4] bg-[#fdf8ee] text-[#7a5b12]",
  ok: "border-[#d7e6d9] bg-[#eef7f0] text-[#15803d]",
  hidden: "border-admin-line bg-admin-canvas text-admin-ink-3",
};

const STATE_LABEL: Record<State, string> = {
  untracked: "Non compté",
  out: "Épuisé",
  low: "Bas",
  ok: "Disponible",
  hidden: "Hors menu",
};

export function Stock() {
  const { active, can } = usePartner();
  const editable = can("manage_inventory");
  const [day, setDay] = useState(todayInHaiti());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const listings = useTable<{ id: string; name: string }>({
    from: "listings",
    select: "id, name",
    filters: [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      { col: "kind", op: "eq", value: "restaurant" },
    ],
    pageSize: 10,
    enabled: !!active,
  });
  const restaurant = listings.rows[0];

  const dishes = useTable<Dish>({
    from: "menu_items",
    select: "id, name, sold_out, available, position",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 300,
    enabled: !!restaurant,
  });

  const stock = useTable<Row>({
    from: "restaurant_inventory",
    select: "item_id, day, prepared, sold, remaining, low_threshold",
    filters: [
      { col: "item_id", op: "in", value: dishes.rows.map(d => d.id) },
      { col: "day", op: "eq", value: day },
    ],
    pageSize: 300,
    enabled: dishes.rows.length > 0,
  });

  const rowOf = (id: string) => stock.rows.find(r => r.item_id === id);

  const stateOf = (d: Dish): State => {
    if (!d.available) return "hidden";
    const r = rowOf(d.id);
    if (!r) return d.sold_out ? "out" : "untracked";
    if (d.sold_out || r.remaining <= 0) return "out";
    if (r.low_threshold !== null && r.remaining <= r.low_threshold) return "low";
    return "ok";
  };

  const save = async (fn: () => Promise<{ error: unknown }>, id: string) => {
    setBusy(id);
    setError(null);
    const { error: err } = await fn();
    setBusy(null);
    if (err) return setError(friendlyError(err as { message?: string; code?: string }));
    stock.reload();
    dishes.reload();
  };

  /** Start counting a dish for this day. */
  const track = (d: Dish) =>
    save(
      () => table("restaurant_inventory").insert({ item_id: d.id, day, prepared: 0 }) as Promise<{ error: unknown }>,
      d.id,
    );

  const untrack = (d: Dish) =>
    save(
      () => table("restaurant_inventory").delete().eq("item_id", d.id).eq("day", day) as Promise<{ error: unknown }>,
      d.id,
    );

  const setPrepared = (d: Dish, next: number) => {
    const r = rowOf(d.id);
    if (!r) return;
    // Never below what has already gone out the door.
    const value = Math.max(r.sold, Math.min(999, next));
    save(
      () =>
        table("restaurant_inventory")
          .update({ prepared: value })
          .eq("item_id", d.id)
          .eq("day", day) as Promise<{ error: unknown }>,
      d.id,
    );
  };

  const markOut = (d: Dish) => {
    const r = rowOf(d.id);
    if (r) return setPrepared(d, r.sold);
    save(
      () => table("menu_items").update({ sold_out: true }).eq("id", d.id) as Promise<{ error: unknown }>,
      d.id,
    );
  };

  const toggleSoldOut = (d: Dish) =>
    save(
      () => table("menu_items").update({ sold_out: !d.sold_out }).eq("id", d.id) as Promise<{ error: unknown }>,
      d.id,
    );

  if (listings.loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!restaurant) {
    return (
      <>
        <PageHeader title="Disponibilité" />
        <EmptyState icon={UtensilsCrossed} title="Aucun restaurant" body="Créez d'abord votre fiche restaurant." />
      </>
    );
  }

  const tracked = dishes.rows.filter(d => rowOf(d.id));
  const out = dishes.rows.filter(d => stateOf(d) === "out");
  const low = dishes.rows.filter(d => stateOf(d) === "low");

  return (
    <>
      <PageHeader
        title="Disponibilité"
        subtitle="Ce qui est prêt, ce qui est parti, ce qu'il reste — pour le service du jour."
        actions={
          <div>
            <label className={labelClass} htmlFor="stock-day">Service du</label>
            <input
              id="stock-day"
              type="date"
              value={day}
              onChange={e => setDay(e.target.value)}
              className={cn(inputClass, "w-44")}
            />
          </div>
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-4">
        <Stat label="Plats suivis" value={count(tracked.length)} />
        <Stat label="Portions prêtes" value={count(stock.rows.reduce((s, r) => s + r.prepared, 0))} />
        <Stat label="Vendues" value={count(stock.rows.reduce((s, r) => s + r.sold, 0))} />
        <Stat label="Épuisés" value={count(out.length)} />
      </div>

      {low.length > 0 && (
        <div className="mb-5">
          <Callout tone="warning">
            <strong className="font-semibold">Bientôt épuisé :</strong>{" "}
            {low.map(d => `${d.name} (${rowOf(d.id)?.remaining})`).join(", ")}.
          </Callout>
        </div>
      )}

      {error && <p className="mb-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}

      {dishes.loading || stock.loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : dishes.rows.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="Aucun plat" body="Composez d'abord votre menu." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {dishes.rows.map(d => {
            const r = rowOf(d.id);
            const state = stateOf(d);
            return (
              <Card key={d.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-admin-ink">{d.name}</span>
                    <span className="block text-[12.5px] text-admin-ink-3">
                      {r
                        ? `${count(r.prepared)} préparées · ${count(r.sold)} vendues · ${count(r.remaining)} restantes`
                        : "Ce plat n'est pas compté : il reste commandable sans limite."}
                    </span>
                  </span>

                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
                      STATE_STYLE[state],
                    )}
                  >
                    {STATE_LABEL[state]}
                  </span>

                  {editable && r && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Retirer une portion de ${d.name}`}
                        disabled={busy === d.id || r.prepared <= r.sold}
                        onClick={() => setPrepared(d, r.prepared - 1)}
                      >
                        −
                      </Button>
                      <span className="w-10 text-center font-display text-[16px] font-bold tabular-nums text-admin-ink">
                        {r.prepared}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Ajouter une portion de ${d.name}`}
                        disabled={busy === d.id}
                        onClick={() => setPrepared(d, r.prepared + 1)}
                      >
                        +
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === d.id}
                        onClick={() => setPrepared(d, r.prepared + 10)}
                      >
                        +10
                      </Button>
                    </span>
                  )}

                  {editable && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      {r ? (
                        <>
                          <Button size="sm" variant="secondary" disabled={busy === d.id} onClick={() => markOut(d)}>
                            Épuisé
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => untrack(d)}>
                            Ne plus compter
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="primary" disabled={busy === d.id} onClick={() => track(d)}>
                            Compter
                          </Button>
                          <Button
                            size="sm"
                            variant={d.sold_out ? "primary" : "secondary"}
                            disabled={busy === d.id}
                            onClick={() => toggleSoldOut(d)}
                          >
                            {d.sold_out ? "Épuisé" : "Disponible"}
                          </Button>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-[11.5px] text-admin-ink-3">
        Une commande confirmée décompte les portions dans la même transaction que la commande :
        la dernière ne peut pas partir deux fois. Une commande annulée avant que la cuisine ne
        commence les rend ; après, la portion est consommée.
      </p>
    </>
  );
}

import { useState } from "react";
import { ArrowDown, CalendarClock, Clock, Plus, Route, Trash2 } from "lucide-react";
import {
  Button,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  inputClass,
  labelClass,
  selectClass,
} from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { StatusBadge } from "../../console/StatusBadge";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { friendlyError, rpc, table, useTable } from "../../console/data";
import { count, day, money } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";
import { cancelDeparture, delayDeparture } from "../../lib/bus";

/**
 * A route, its itinerary, its timetable, and the departures that go on sale.
 *
 * The division of labour matters here. A route *is* a listings row, so its
 * name, its fare and whether it is published are edited on the existing
 * Annonces screen like every other annonce. What has no other home — and what
 * these screens own — is the itinerary (which gares, in which order), the
 * recurring timetable, and the dated departures a passenger actually buys.
 */

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** "360" -> "6 h", "95" -> "1 h 35" */
const asDuration = (minutes: number | null | undefined) => {
  const m = Number(minutes) || 0;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} h ${rest}` : `${h} h`;
};

/** "06:00:00" -> "06:00" */
const asTime = (t: string | null | undefined) => (t ?? "").slice(0, 5);

type BusListing = { id: string; name: string; price: number; status: string; published: boolean };

function useMyRoutes() {
  const { active } = usePartner();
  return useTable<BusListing>({
    from: "listings",
    select: "id, name, price, status, published",
    filters: [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      { col: "kind", op: "eq", value: "bus" },
    ],
    sort: { col: "name", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });
}

/* ─── Itinéraires ─────────────────────────────────────── */

type Stop = {
  id: string;
  listing_id: string;
  position: number;
  terminal_id: string;
  arrive_offset_minutes: number | null;
  boarding: boolean;
  alighting: boolean;
};

export function BusRoutes() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const routes = useMyRoutes();
  const [adding, setAdding] = useState<string | null>(null);
  const [terminal, setTerminal] = useState("");
  const [offset, setOffset] = useState("");
  const [boarding, setBoarding] = useState(true);
  const [alighting, setAlighting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stops = useTable<Stop>({
    from: "bus_route_stops",
    select: "id, listing_id, position, terminal_id, arrive_offset_minutes, boarding, alighting",
    sort: { col: "position", dir: "asc" },
    pageSize: 500,
    enabled: !!active,
  });

  const gares = useTable<{ id: string; name: string; city: string }>({
    from: "bus_terminals",
    select: "id, name, city",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "city", dir: "asc" },
    pageSize: 200,
    enabled: !!active,
  });

  const gareName = (id: string) => {
    const g = gares.rows.find(x => x.id === id);
    return g ? `${g.name} — ${g.city}` : "Gare supprimée";
  };
  const ofRoute = (id: string) => stops.rows.filter(s => s.listing_id === id);

  const add = async () => {
    if (!adding) return;
    if (!terminal) return setError("Choisissez une gare.");
    const next = ofRoute(adding).length;
    const { error } = await table("bus_route_stops").insert({
      listing_id: adding,
      position: next,
      terminal_id: terminal,
      // Left empty on purpose when the company does not know: a stop that
      // claims to be reached at departure time would be printed on a timetable
      // as fact.
      arrive_offset_minutes: offset.trim() ? Number(offset) : null,
      boarding,
      alighting,
    });
    if (error) return setError(friendlyError(error));
    setTerminal("");
    setOffset("");
    setBoarding(true);
    setAlighting(true);
    setAdding(null);
    setError(null);
    stops.reload();
  };

  return (
    <>
      <PageHeader
        title="Itinéraires"
        subtitle="Les gares de chaque trajet, dans l'ordre. Le nom et le tarif se modifient dans Annonces."
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
        <Stat label="Trajets" value={count(routes.rows.length)} />
        <Stat label="Publiés" value={count(routes.rows.filter(r => r.published).length)} />
        <Stat label="Gares" value={count(gares.rows.length)} />
      </div>

      {gares.rows.length === 0 && !gares.loading && (
        <div className="mb-4">
          <Callout tone="warning">
            Vous n'avez pas encore de gare. Un itinéraire se construit à partir de vos
            gares : ajoutez-les d'abord dans « Gares ».
          </Callout>
        </div>
      )}

      {routes.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : routes.rows.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Aucun trajet"
          body="Créez une annonce de transport pour chaque trajet que vous vendez."
          action={
            <Button as="link" to="/partenaire/annonces/nouveau" variant="primary">
              Ajouter une annonce
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {routes.rows.map(r => {
            const list = ofRoute(r.id);
            return (
              <Card key={r.id} padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-line px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="font-display text-[15px] font-semibold text-admin-ink">{r.name}</h2>
                    <p className="text-[12.5px] text-admin-ink-3">
                      {count(list.length)} arrêt(s) · {money(r.price)} par place
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    {can("manage_network") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={gares.rows.length === 0}
                        onClick={() => { setAdding(r.id); setError(null); }}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Ajouter un arrêt
                      </Button>
                    )}
                  </div>
                </div>

                {list.length === 0 ? (
                  <p className="px-5 py-6 text-center text-[13px] text-admin-ink-3">
                    Aucun arrêt. Un trajet sans gare de départ ne peut pas être vendu.
                  </p>
                ) : (
                  <ol className="divide-y divide-admin-line">
                    {list.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-admin-raised text-[11px] font-semibold text-admin-ink-2">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-admin-ink">
                            {gareName(s.terminal_id)}
                          </p>
                          <p className="text-[12.5px] text-admin-ink-3">
                            {[
                              s.arrive_offset_minutes === null
                                ? "heure non précisée"
                                : s.arrive_offset_minutes === 0
                                  ? "départ"
                                  : `+ ${asDuration(s.arrive_offset_minutes)}`,
                              s.boarding ? "embarquement" : null,
                              s.alighting ? "débarquement" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        {i < list.length - 1 && (
                          <ArrowDown className="h-3.5 w-3.5 shrink-0 text-admin-ink-3" aria-hidden />
                        )}
                        {can("manage_network") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              confirm({
                                title: "Retirer cet arrêt ?",
                                consequence:
                                  "Les arrêts suivants seront renumérotés pour rester consécutifs.",
                                confirmLabel: "Retirer",
                                danger: true,
                                onConfirm: async () => {
                                  const del = await table("bus_route_stops").delete().eq("id", s.id);
                                  if (del.error) return friendlyError(del.error);
                                  // `unique (listing_id, position)` means a gap
                                  // is harmless but a reorder is not: the rows
                                  // after this one shift down one by one.
                                  const after = list.filter(x => x.position > s.position);
                                  for (const x of after) {
                                    const up = await table("bus_route_stops")
                                      .update({ position: x.position - 1 })
                                      .eq("id", x.id);
                                    if (up.error) return friendlyError(up.error);
                                  }
                                  stops.reload();
                                  return null;
                                },
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!adding}
        onClose={() => setAdding(null)}
        title="Ajouter un arrêt"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(null)}>Annuler</Button>
            <Button variant="primary" onClick={add}>Ajouter</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="s-gare">Gare</label>
            <select
              id="s-gare"
              value={terminal}
              onChange={e => setTerminal(e.target.value)}
              className={selectClass}
            >
              <option value="">Choisir…</option>
              {gares.rows.map(g => (
                <option key={g.id} value={g.id}>{g.name} — {g.city}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="s-offset">
              Minutes après le départ
            </label>
            <input
              id="s-offset"
              value={offset}
              onChange={e => setOffset(e.target.value)}
              inputMode="numeric"
              className={inputClass}
              placeholder="0 pour la gare de départ, 360 pour une arrivée 6 h plus tard"
            />
            <p className="mt-1 text-[12px] text-admin-ink-3">
              Laissez vide si vous ne connaissez pas encore l'heure : l'arrêt s'affichera
              sans horaire plutôt qu'avec un horaire faux.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-admin-ink">
            <input type="checkbox" checked={boarding} onChange={e => setBoarding(e.target.checked)} />
            On peut monter ici
          </label>
          <label className="flex items-center gap-2 text-[13px] text-admin-ink">
            <input type="checkbox" checked={alighting} onChange={e => setAlighting(e.target.checked)} />
            On peut descendre ici
          </label>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/* ─── Horaires ────────────────────────────────────────── */

type Schedule = {
  id: string;
  listing_id: string;
  coach_id: string;
  weekdays: number[];
  departs_at: string;
  duration_minutes: number;
  starts_on: string;
  ends_on: string | null;
  fare: number | null;
  active: boolean;
};

export function BusSchedules() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const routes = useMyRoutes();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form, setForm] = useState<Partial<Schedule> & { weekdaysSet?: number[] }>({});
  const [error, setError] = useState<string | null>(null);

  const schedules = useTable<Schedule>({
    from: "bus_schedules",
    select:
      "id, listing_id, coach_id, weekdays, departs_at, duration_minutes, starts_on, ends_on, fare, active",
    sort: { col: "departs_at", dir: "asc" },
    pageSize: 300,
    enabled: !!active,
  });

  const coaches = useTable<{ id: string; fleet_no: string; seat_capacity: number; status: string }>({
    from: "bus_coaches",
    select: "id, fleet_no, seat_capacity, status",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "fleet_no", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  const ofRoute = (id: string) => schedules.rows.filter(s => s.listing_id === id);
  const coachName = (id: string) =>
    coaches.rows.find(c => c.id === id)?.fleet_no ?? "Véhicule supprimé";

  const start = (listingId: string, s?: Schedule) => {
    setEditing(s ?? null);
    setForm(
      s
        ? { ...s, weekdaysSet: s.weekdays ?? [] }
        : {
            listing_id: listingId,
            weekdaysSet: [0, 1, 2, 3, 4, 5, 6],
            starts_on: new Date().toISOString().slice(0, 10),
            active: true,
          },
    );
    setError(null);
    setOpen(true);
  };

  const toggleDay = (d: number) =>
    setForm(p => {
      const cur = p.weekdaysSet ?? [];
      return {
        ...p,
        weekdaysSet: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort((a, b) => a - b),
      };
    });

  const save = async () => {
    const days = form.weekdaysSet ?? [];
    const dur = Number(form.duration_minutes);
    if (!form.coach_id) return setError("Choisissez un véhicule.");
    if (!form.departs_at) return setError("Indiquez l'heure de départ.");
    if (!dur || dur < 5) return setError("Indiquez la durée du trajet en minutes.");
    if (days.length === 0) return setError("Choisissez au moins un jour de service.");

    const payload = {
      coach_id: form.coach_id,
      weekdays: days,
      departs_at: form.departs_at,
      duration_minutes: dur,
      starts_on: form.starts_on,
      ends_on: form.ends_on || null,
      fare: form.fare ? Number(form.fare) : null,
      active: form.active ?? true,
    };

    const { error } = editing
      ? await table("bus_schedules").update(payload).eq("id", editing.id)
      : await table("bus_schedules").insert({ ...payload, listing_id: form.listing_id });
    if (error) return setError(friendlyError(error));
    setOpen(false);
    setEditing(null);
    schedules.reload();
  };

  const usable = coaches.rows.filter(c => c.status === "active");

  return (
    <>
      <PageHeader
        title="Horaires"
        subtitle="Vos départs récurrents. Ils ne sont mis en vente qu'une fois publiés dans « Départs »."
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
        <Stat label="Trajets" value={count(routes.rows.length)} />
        <Stat label="Horaires actifs" value={count(schedules.rows.filter(s => s.active).length)} />
        <Stat label="Véhicules en service" value={count(usable.length)} />
      </div>

      {usable.length === 0 && !coaches.loading && (
        <div className="mb-4">
          <Callout tone="warning">
            Aucun véhicule en service. Un horaire a besoin d'un autocar : sa capacité
            devient le nombre de places de chaque départ.
          </Callout>
        </div>
      )}

      {routes.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : routes.rows.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Aucun trajet"
          body="Créez d'abord une annonce de transport, puis donnez-lui un horaire."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {routes.rows.map(r => {
            const list = ofRoute(r.id);
            return (
              <Card key={r.id} padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-line px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="font-display text-[15px] font-semibold text-admin-ink">{r.name}</h2>
                    <p className="text-[12.5px] text-admin-ink-3">{count(list.length)} horaire(s)</p>
                  </div>
                  {can("manage_departures") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={usable.length === 0}
                      onClick={() => start(r.id)}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      Ajouter un horaire
                    </Button>
                  )}
                </div>

                {list.length === 0 ? (
                  <p className="px-5 py-6 text-center text-[13px] text-admin-ink-3">
                    Aucun horaire. Ce trajet n'a donc aucun départ à vendre.
                  </p>
                ) : (
                  <div className="divide-y divide-admin-line">
                    {list.map(s => (
                      <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="w-16 shrink-0 font-display text-[15px] font-semibold text-admin-ink tabular-nums">
                          {asTime(s.departs_at)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-admin-ink">
                            {(s.weekdays ?? []).length === 7
                              ? "Tous les jours"
                              : (s.weekdays ?? []).map(d => DAYS[d]).join(" ")}
                          </p>
                          <p className="text-[12.5px] text-admin-ink-3">
                            {[
                              asDuration(s.duration_minutes),
                              coachName(s.coach_id),
                              s.fare !== null ? `tarif ${money(s.fare)}` : null,
                              s.ends_on ? `jusqu'au ${day(s.ends_on)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <StatusBadge status={s.active ? "active" : "paused"} />
                        {can("manage_departures") && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => start(r.id, s)}>
                              Modifier
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                confirm({
                                  title: s.active
                                    ? `Mettre en pause le départ de ${asTime(s.departs_at)} ?`
                                    : `Réactiver le départ de ${asTime(s.departs_at)} ?`,
                                  consequence: s.active
                                    ? "Aucun nouveau départ ne sera créé. Les départs déjà en vente ne changent pas — annulez-les un par un si besoin."
                                    : "Les prochaines publications créeront de nouveau ce départ.",
                                  confirmLabel: s.active ? "Mettre en pause" : "Réactiver",
                                  onConfirm: async () => {
                                    const { error } = await table("bus_schedules")
                                      .update({ active: !s.active })
                                      .eq("id", s.id);
                                    if (error) return friendlyError(error);
                                    schedules.reload();
                                    return null;
                                  },
                                })
                              }
                            >
                              {s.active ? "Pause" : "Réactiver"}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Modifier l'horaire" : "Ajouter un horaire"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={save}>{editing ? "Enregistrer" : "Ajouter"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="h-time">Heure de départ</label>
            <input
              id="h-time"
              type="time"
              value={asTime(form.departs_at)}
              onChange={e => setForm(p => ({ ...p, departs_at: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="h-dur">Durée (minutes)</label>
            <input
              id="h-dur"
              value={form.duration_minutes ?? ""}
              onChange={e => setForm(p => ({ ...p, duration_minutes: Number(e.target.value) }))}
              inputMode="numeric"
              className={inputClass}
              placeholder="360"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="h-coach">Véhicule</label>
            <select
              id="h-coach"
              value={form.coach_id ?? ""}
              onChange={e => setForm(p => ({ ...p, coach_id: e.target.value }))}
              className={selectClass}
            >
              <option value="">Choisir…</option>
              {usable.map(c => (
                <option key={c.id} value={c.id}>
                  {c.fleet_no} — {c.seat_capacity} places
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="h-fare">Tarif de cet horaire</label>
            <input
              id="h-fare"
              value={form.fare ?? ""}
              onChange={e => setForm(p => ({ ...p, fare: Number(e.target.value) }))}
              inputMode="decimal"
              className={inputClass}
              placeholder="vide = le tarif de l'annonce"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="h-from">À partir du</label>
            <input
              id="h-from"
              type="date"
              value={form.starts_on ?? ""}
              onChange={e => setForm(p => ({ ...p, starts_on: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="h-to">Jusqu'au</label>
            <input
              id="h-to"
              type="date"
              value={form.ends_on ?? ""}
              onChange={e => setForm(p => ({ ...p, ends_on: e.target.value }))}
              className={inputClass}
            />
            <p className="mt-1 text-[12px] text-admin-ink-3">Vide = sans date de fin.</p>
          </div>
          <div className="sm:col-span-2">
            <p className={labelClass}>Jours de service</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = (form.weekdaysSet ?? []).includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={
                      on
                        ? "h-10 w-12 rounded-lg border-2 border-admin-accent bg-admin-raised text-[12px] font-semibold text-admin-ink"
                        : "h-10 w-12 rounded-lg border border-admin-line text-[12px] font-medium text-admin-ink-3"
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/* ─── Départs ─────────────────────────────────────────── */

type DepartureRow = {
  id: string;
  listing_id: string;
  route: string;
  fleet_no: string | null;
  departs_on: string;
  departs_at: string;
  duration_minutes: number;
  seats_total: number;
  status: string;
  delayed_to: string | null;
  fare: number;
  sold: number;
  free: number;
  held: number;
  blocked: number;
};

export function BusDepartures() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const routes = useMyRoutes();
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delaying, setDelaying] = useState<DepartureRow | null>(null);
  const [newTime, setNewTime] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [delayError, setDelayError] = useState<string | null>(null);

  const routeId = selected || routes.rows[0]?.id || "";

  const status = useTable<{ listing_id: string; departs_on: string }>({
    // A tiny query whose only job is the horizon, so the page can say how far
    // the timetable is published without loading every departure.
    from: "bus_departure_rows",
    select: "listing_id, departs_on",
    filters: routeId ? [{ col: "listing_id", op: "eq", value: routeId }] : [],
    sort: { col: "departs_on", dir: "desc" },
    pageSize: 1,
    enabled: !!active && !!routeId,
  });

  const departures = useTable<DepartureRow>({
    from: "bus_departure_rows",
    select:
      "id, listing_id, route, fleet_no, departs_on, departs_at, duration_minutes, seats_total, status, delayed_to, fare, sold, free, held, blocked",
    filters: [
      ...(routeId ? [{ col: "listing_id", op: "eq" as const, value: routeId }] : []),
      { col: "departs_on", op: "gte", value: new Date().toISOString().slice(0, 10) },
    ],
    sort: { col: "departs_on", dir: "asc" },
    pageSize: 60,
    enabled: !!active && !!routeId,
  });

  const horizon = status.rows[0]?.departs_on ?? null;
  const daysPublished = horizon
    ? Math.round((new Date(horizon).getTime() - Date.now()) / 86_400_000)
    : 0;

  const publish = async (days: number) => {
    if (!routeId) return;
    setBusy(true);
    setNote(null);
    const until = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await rpc("bus_publish_timetable", {
      p_listing: routeId,
      p_until: until,
    });
    setBusy(false);
    if (error) return setNote(friendlyError(error));
    const res = data as { schedules: number; created: number; horizon: string | null } | null;
    setNote(
      res?.schedules
        ? `${count(res.created)} nouveau(x) départ(s) créé(s) à partir de ${count(res.schedules)} horaire(s). ` +
          (res.horizon ? `En vente jusqu'au ${day(res.horizon)}.` : "")
        : "Ce trajet n'a aucun horaire actif : ajoutez-en un dans « Horaires ».",
    );
    status.reload();
    departures.reload();
  };

  const sold = departures.rows.reduce((s, d) => s + Number(d.sold ?? 0), 0);
  const seats = departures.rows.reduce((s, d) => s + Number(d.seats_total ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Départs"
        subtitle="Les départs réellement en vente. Publier un horaire crée les dates ; repasser dessus les prolonge."
      />

      {routes.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : routes.rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Aucun trajet"
          body="Créez une annonce de transport, donnez-lui un horaire, puis publiez-le ici."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className={labelClass} htmlFor="d-route">Trajet</label>
              <select
                id="d-route"
                value={routeId}
                onChange={e => { setSelected(e.target.value); setNote(null); }}
                className={selectClass}
              >
                {routes.rows.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {can("manage_departures") && (
              <div className="flex gap-2">
                <Button variant="primary" disabled={busy} onClick={() => publish(90)}>
                  {busy ? "Publication…" : "Publier 3 mois"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => publish(180)}>
                  Prolonger à 6 mois
                </Button>
              </div>
            )}
          </div>

          <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
            <Stat label="Départs à venir" value={count(departures.rows.length)} />
            <Stat label="Places vendues" value={count(sold)} />
            <Stat
              label="Taux de remplissage"
              value={seats > 0 ? `${Math.round((sold / seats) * 100)} %` : "—"}
            />
          </div>

          {note && (
            <div className="mb-4">
              <Callout tone="info">{note}</Callout>
            </div>
          )}

          {/* The horizon is the one thing a company cannot see anywhere else, and
              running out of it is silent: the route simply stops appearing in
              search. So it is said in words, with the number of days. */}
          {!status.loading && (
            <div className="mb-4">
              {horizon === null ? (
                <Callout tone="warning">
                  Ce trajet n'a aucun départ en vente. Publiez son horaire pour ouvrir les
                  places.
                </Callout>
              ) : daysPublished <= 14 ? (
                <Callout tone="warning">
                  En vente jusqu'au {day(horizon)} — {count(Math.max(daysPublished, 0))} jour(s).
                  Au-delà, ce trajet disparaît des recherches : prolongez l'horaire.
                </Callout>
              ) : (
                <Callout tone="info">
                  En vente jusqu'au {day(horizon)}, soit {count(daysPublished)} jours.
                </Callout>
              )}
            </div>
          )}

          {departures.loading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : departures.rows.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Aucun départ à venir"
              body="Publiez l'horaire de ce trajet pour créer les dates et ouvrir les places."
            />
          ) : (
            <Card padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-admin-line bg-admin-raised">
                      {["Date", "Départ", "Durée", "Véhicule", "Tarif", "Vendues", "Libres", "État", ""].map(
                        (h, i) => (
                          <th
                            key={h || "actions"}
                            className={`px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3 ${
                              i >= 4 && i <= 6 ? "text-right" : ""
                            }`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-line">
                    {departures.rows.map(d => (
                      <tr key={d.id}>
                        <td className="px-5 py-3 text-[13px] font-medium text-admin-ink">
                          {day(d.departs_on)}
                        </td>
                        <td className="px-5 py-3 text-[13px] tabular-nums">
                          {asTime(d.departs_at)}
                          {d.delayed_to && (
                            <span className="ml-1 font-semibold text-[#8a6d1f]">
                              → {asTime(d.delayed_to)}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[13px]">{asDuration(d.duration_minutes)}</td>
                        <td className="px-5 py-3 text-[13px]">{d.fleet_no ?? "—"}</td>
                        <td className="px-5 py-3 text-right text-[13px] tabular-nums">
                          {money(d.fare)}
                        </td>
                        <td className="px-5 py-3 text-right text-[13px] font-semibold tabular-nums">
                          {d.sold} / {d.seats_total}
                        </td>
                        <td className="px-5 py-3 text-right text-[13px] tabular-nums">
                          {d.free}
                          {Number(d.held) > 0 && (
                            <span className="ml-1 text-[12px] text-admin-ink-3">
                              ({d.held} en cours)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {can("manage_departures") && d.status !== "cancelled" && (
                            <>
                              {d.status !== "departed" &&
                                d.status !== "arrived" &&
                                d.status !== "completed" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setDelaying(d);
                                      setNewTime(asTime(d.delayed_to ?? d.departs_at));
                                      setDelayReason("");
                                      setDelayError(null);
                                    }}
                                  >
                                    Reporter
                                  </Button>
                                )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  confirm({
                                    title: `Annuler le départ du ${day(d.departs_on)} à ${asTime(d.departs_at)} ?`,
                                    // Said in full, because it is irreversible and it
                                    // moves money: a company that expected "hide it
                                    // from search" must not discover the refunds after.
                                    consequence:
                                      `Les ${count(Number(d.sold ?? 0))} place(s) vendue(s) seront annulées et ` +
                                      "remboursées intégralement, sans frais, et chaque passager sera prévenu. " +
                                      "C'est définitif.",
                                    confirmLabel: "Annuler le départ",
                                    danger: true,
                                    onConfirm: async () => {
                                      try {
                                        const r = await cancelDeparture(d.id);
                                        setNote(
                                          `Départ annulé : ${count(r.tickets_refunded)} billet(s) remboursé(s) ` +
                                            `pour ${money(r.refund_total)}.` +
                                            (r.still_boarded > 0
                                              ? ` ${count(r.still_boarded)} passager(s) déjà embarqué(s) n'ont pas été touchés.`
                                              : ""),
                                        );
                                        departures.reload();
                                      } catch (e) {
                                        return friendlyError(e as never);
                                      }
                                      return null;
                                    },
                                  })
                                }
                              >
                                Annuler
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Reporter un départ : une heure, un motif, et tout le monde est prévenu. */}
      <Modal
        open={!!delaying}
        onClose={() => setDelaying(null)}
        title="Reporter ce départ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDelaying(null)}>Fermer</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!delaying) return;
                setDelayError(null);
                try {
                  const r = await delayDeparture(delaying.id, newTime, delayReason);
                  setNote(
                    `Départ reporté à ${asTime(r.delayed_to)} (+${count(r.minutes)} min). ` +
                      "Les passagers ont été prévenus.",
                  );
                  setDelaying(null);
                  departures.reload();
                } catch (e) {
                  setDelayError(friendlyError(e as never));
                }
              }}
            >
              Reporter et prévenir
            </Button>
          </>
        }
      >
        {delaying && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-admin-ink-2">
              {delaying.route} — {day(delaying.departs_on)}, prévu à {asTime(delaying.departs_at)}.
              {Number(delaying.sold ?? 0) > 0 && (
                <> {count(Number(delaying.sold))} passager(s) recevront la nouvelle heure.</>
              )}
            </p>
            <div>
              <label className={labelClass} htmlFor="delay-time">Nouvelle heure de départ</label>
              <input
                id="delay-time"
                type="time"
                value={newTime}
                onChange={e => setNewTime(e.target.value)}
                className={inputClass}
              />
              {/* A time of day cannot say "tomorrow", so the server reads an
                  earlier time as the next day — which is what an overnight
                  delay means. Saying so stops it looking like a mistake. */}
              <p className="mt-1 text-[12px] text-admin-ink-3">
                Une heure plus petite que l'heure prévue est comprise comme le lendemain
                (23:00 reporté à 01:00 = deux heures plus tard). Au-delà de 24 h, annulez
                plutôt le départ.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="delay-why">Motif</label>
              <input
                id="delay-why"
                value={delayReason}
                onChange={e => setDelayReason(e.target.value)}
                className={inputClass}
                placeholder="Route bloquée, panne, attente de correspondance…"
              />
            </div>
            {delayError && (
              <p className="text-[13px] font-medium text-[#b3261e]">{delayError}</p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

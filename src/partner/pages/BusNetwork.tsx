import { useState } from "react";
import { Bus, LayoutGrid, MapPin, Plus, Trash2 } from "lucide-react";
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
import { count } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

/**
 * What a transport company owns: its coaches and the gares they leave from.
 *
 * Both are private. A plate and a fleet number are the company's business — the
 * public surface (bus_search, bus_departure_detail) hands a traveller the coach
 * type and its amenities and nothing else — so neither table has an anon read
 * policy and both screens live behind a capability.
 */

type Coach = {
  id: string;
  fleet_no: string;
  plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  coach_type: string | null;
  seat_capacity: number;
  seat_pattern: string;
  status: string;
  note: string | null;
};

const PATTERNS = ["2+2", "2+1", "1+1", "custom"] as const;

const COACH_STATUS: Record<string, string> = {
  active: "En service",
  maintenance: "En entretien",
  out_of_service: "Hors service",
  archived: "Archivé",
};

export function BusFleet() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const [editing, setEditing] = useState<Coach | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Coach>>({});
  const [error, setError] = useState<string | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);

  const coaches = useTable<Coach>({
    from: "bus_coaches",
    select:
      "id, fleet_no, plate, make, model, year, coach_type, seat_capacity, seat_pattern, status, note",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "fleet_no", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  /** How many seats each coach has a drawn plan for, so the card can say. */
  const plans = useTable<{ coach_id: string }>({
    from: "bus_coach_seats",
    select: "coach_id",
    pageSize: 2000,
    enabled: !!active,
  });
  const planned = (id: string) => plans.rows.filter(s => s.coach_id === id).length;

  const start = (c?: Coach) => {
    setEditing(c ?? null);
    setForm(c ? { ...c } : { seat_pattern: "2+2", status: "active" });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!active) return;
    const fleet = (form.fleet_no ?? "").trim();
    const seats = Number(form.seat_capacity);
    if (!fleet) return setError("Donnez un nom ou un numéro de parc à ce véhicule.");
    if (!seats || seats < 1) return setError("Indiquez le nombre de places.");

    const payload = {
      fleet_no: fleet,
      plate: (form.plate ?? "").trim() || null,
      make: (form.make ?? "").trim() || null,
      model: (form.model ?? "").trim() || null,
      year: form.year ? Number(form.year) : null,
      coach_type: (form.coach_type ?? "").trim() || null,
      seat_capacity: seats,
      seat_pattern: form.seat_pattern ?? "2+2",
      status: form.status ?? "active",
      note: (form.note ?? "").trim() || null,
    };

    const { error } = editing
      ? await table("bus_coaches").update(payload).eq("id", editing.id)
      : await table("bus_coaches").insert({ ...payload, partner_id: active.partner_id });
    if (error) return setError(friendlyError(error));
    setOpen(false);
    setEditing(null);
    coaches.reload();
    plans.reload();
  };

  /**
   * Draw the seat plan.
   *
   * The plan is optional: a company that sells "30 places" and never draws one
   * gets departures numbered 1..N, which is what it meant. Drawing one is what
   * puts 1A/1B/1C/1D on the boarding pass. Departures already created keep the
   * seats they materialised — the plan is copied onto a departure, not read
   * through it — so this changes what the *next* departures look like.
   */
  const drawPlan = async (c: Coach) => {
    setPlanNote(null);
    const { data, error } = await rpc("bus_generate_coach_seats", { p_coach: c.id });
    if (error) return setPlanNote(friendlyError(error));
    setPlanNote(
      `${c.fleet_no} : ${count(Number(data) || 0)} places numérotées. ` +
        "Les départs déjà créés gardent leur numérotation.",
    );
    plans.reload();
  };

  const seatsTotal = coaches.rows.reduce((s, c) => s + (c.seat_capacity ?? 0), 0);
  const inService = coaches.rows.filter(c => c.status === "active").length;

  return (
    <>
      <PageHeader
        title="Flotte"
        subtitle="Vos autocars. Le nombre de places devient la capacité de chaque départ."
        actions={
          can("manage_fleet") ? (
            <Button variant="primary" onClick={() => start()}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter un autocar
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
        <Stat label="Autocars" value={count(coaches.rows.length)} />
        <Stat label="En service" value={count(inService)} />
        <Stat label="Places au total" value={count(seatsTotal)} />
      </div>

      {planNote && (
        <div className="mb-4">
          <Callout tone="info">{planNote}</Callout>
        </div>
      )}

      {coaches.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : coaches.rows.length === 0 ? (
        <EmptyState
          icon={Bus}
          title="Aucun autocar"
          body="Ajoutez vos véhicules : leur capacité est ce qui ouvre les places à la vente."
          action={
            can("manage_fleet") ? (
              <Button variant="primary" onClick={() => start()}>Ajouter un autocar</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {coaches.rows.map(c => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[14.5px] font-semibold text-admin-ink">
                    {c.fleet_no}
                  </h3>
                  <p className="text-[12.5px] text-admin-ink-3">
                    {[
                      `${c.seat_capacity} places`,
                      c.seat_pattern,
                      c.coach_type,
                      [c.make, c.model, c.year].filter(Boolean).join(" ") || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {c.plate && (
                    <p className="mt-1 text-[12.5px] text-admin-ink-2">Plaque {c.plate}</p>
                  )}
                  <p className="mt-1 text-[12.5px] text-admin-ink-3">
                    {planned(c.id) > 0
                      ? `Plan de sièges : ${count(planned(c.id))} places numérotées`
                      : "Pas de plan de sièges — les places seront numérotées 1 à N"}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </div>

              {can("manage_fleet") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => start(c)}>
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      confirm({
                        title: `Dessiner le plan de « ${c.fleet_no} » ?`,
                        consequence:
                          c.seat_pattern === "custom"
                            ? "Un plan personnalisé ne se génère pas : il se dessine à la main."
                            : `${c.seat_capacity} places seront numérotées selon la disposition ${c.seat_pattern}. Les départs déjà créés gardent la leur.`,
                        confirmLabel: "Dessiner",
                        onConfirm: async () => {
                          await drawPlan(c);
                          return null;
                        },
                      })
                    }
                  >
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                    Plan de sièges
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      confirm({
                        title: `Supprimer « ${c.fleet_no} » ?`,
                        consequence:
                          "Un véhicule utilisé par un horaire ou un départ ne peut pas être supprimé : mettez-le hors service à la place.",
                        confirmLabel: "Supprimer",
                        danger: true,
                        onConfirm: async () => {
                          const { error } = await table("bus_coaches").delete().eq("id", c.id);
                          if (error) return friendlyError(error);
                          coaches.reload();
                          return null;
                        },
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                    Supprimer
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Modifier « ${editing.fleet_no} »` : "Ajouter un autocar"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={save}>{editing ? "Enregistrer" : "Ajouter"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="c-fleet">Nom / numéro de parc</label>
            <input
              id="c-fleet"
              value={form.fleet_no ?? ""}
              onChange={e => setForm(p => ({ ...p, fleet_no: e.target.value }))}
              className={inputClass}
              placeholder="Autocar 52 places"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-seats">Nombre de places</label>
            <input
              id="c-seats"
              value={form.seat_capacity ?? ""}
              onChange={e => setForm(p => ({ ...p, seat_capacity: Number(e.target.value) }))}
              inputMode="numeric"
              className={inputClass}
              placeholder="52"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-pattern">Disposition des sièges</label>
            <select
              id="c-pattern"
              value={form.seat_pattern ?? "2+2"}
              onChange={e => setForm(p => ({ ...p, seat_pattern: e.target.value }))}
              className={selectClass}
            >
              {PATTERNS.map(p => (
                <option key={p} value={p}>{p === "custom" ? "Personnalisée" : p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="c-status">État</label>
            <select
              id="c-status"
              value={form.status ?? "active"}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className={selectClass}
            >
              {Object.entries(COACH_STATUS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="c-type">Type d'autocar</label>
            <input
              id="c-type"
              value={form.coach_type ?? ""}
              onChange={e => setForm(p => ({ ...p, coach_type: e.target.value }))}
              className={inputClass}
              placeholder="Autocar climatisé"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-plate">Plaque</label>
            <input
              id="c-plate"
              value={form.plate ?? ""}
              onChange={e => setForm(p => ({ ...p, plate: e.target.value }))}
              className={inputClass}
              placeholder="AA-12345"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-make">Marque</label>
            <input
              id="c-make"
              value={form.make ?? ""}
              onChange={e => setForm(p => ({ ...p, make: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-model">Modèle</label>
            <input
              id="c-model"
              value={form.model ?? ""}
              onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-year">Année</label>
            <input
              id="c-year"
              value={form.year ?? ""}
              onChange={e => setForm(p => ({ ...p, year: Number(e.target.value) }))}
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="c-note">Note interne</label>
            <input
              id="c-note"
              value={form.note ?? ""}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
              className={inputClass}
              placeholder="Visible par votre équipe uniquement"
            />
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

type Terminal = {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  instructions: string | null;
  arrive_minutes_before: number;
  active: boolean;
};

export function BusTerminals() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Terminal | null>(null);
  const [form, setForm] = useState<Partial<Terminal>>({});
  const [error, setError] = useState<string | null>(null);

  const gares = useTable<Terminal>({
    from: "bus_terminals",
    select:
      "id, name, city, country, address, phone, hours, instructions, arrive_minutes_before, active",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "city", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  const start = (t?: Terminal) => {
    setEditing(t ?? null);
    setForm(t ? { ...t } : { country: "Haïti", arrive_minutes_before: 30, active: true });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!active) return;
    const name = (form.name ?? "").trim();
    const city = (form.city ?? "").trim();
    if (!name) return setError("Donnez un nom à cette gare.");
    if (!city) return setError("Indiquez la ville.");

    const payload = {
      name,
      city,
      country: (form.country ?? "").trim() || "Haïti",
      address: (form.address ?? "").trim() || null,
      phone: (form.phone ?? "").trim() || null,
      hours: (form.hours ?? "").trim() || null,
      instructions: (form.instructions ?? "").trim() || null,
      arrive_minutes_before: Number(form.arrive_minutes_before ?? 30),
      active: form.active ?? true,
    };

    const { error } = editing
      ? await table("bus_terminals").update(payload).eq("id", editing.id)
      : await table("bus_terminals").insert({ ...payload, partner_id: active.partner_id });
    if (error) return setError(friendlyError(error));
    setOpen(false);
    setEditing(null);
    gares.reload();
  };

  const cities = new Set(gares.rows.map(g => g.city)).size;
  const missingAddress = gares.rows.filter(g => !g.address).length;

  return (
    <>
      <PageHeader
        title="Gares"
        subtitle="Les points de départ et d'arrivée de vos trajets, tels que les voyageurs les voient."
        actions={
          can("manage_network") ? (
            <Button variant="primary" onClick={() => start()}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter une gare
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
        <Stat label="Gares" value={count(gares.rows.length)} />
        <Stat label="Villes desservies" value={count(cities)} />
        <Stat label="Sans adresse" value={count(missingAddress)} />
      </div>

      {/* The generator creates a gare per declared town but only knows the
          address of the company's own, so the rest arrive as a name on a map.
          Saying so is better than letting a passenger reach "Gare Gonaïves"
          with nothing to go on. */}
      {missingAddress > 0 && (
        <div className="mb-4">
          <Callout tone="warning">
            {count(missingAddress)} gare(s) n'ont pas encore d'adresse. Un voyageur qui
            achète un billet doit savoir où se présenter : complétez-les avant de publier
            le trajet.
          </Callout>
        </div>
      )}

      {gares.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : gares.rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aucune gare"
          body="Ajoutez les gares d'où partent vos autocars : un trajet ne peut pas être publié sans elles."
          action={
            can("manage_network") ? (
              <Button variant="primary" onClick={() => start()}>Ajouter une gare</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {gares.rows.map(g => (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[14.5px] font-semibold text-admin-ink">
                    {g.name}
                  </h3>
                  <p className="text-[12.5px] text-admin-ink-3">
                    {g.city}
                    {g.country && g.country !== "Haïti" ? `, ${g.country}` : ""}
                  </p>
                  {g.address ? (
                    <p className="mt-1 text-[12.5px] text-admin-ink-2">{g.address}</p>
                  ) : (
                    <p className="mt-1 text-[12.5px] font-medium text-[#8a6d1f]">
                      Adresse à compléter
                    </p>
                  )}
                  {g.hours && <p className="mt-1 text-[12.5px] text-admin-ink-3">{g.hours}</p>}
                  <p className="mt-1 text-[12.5px] text-admin-ink-3">
                    Se présenter {g.arrive_minutes_before} min avant le départ
                  </p>
                </div>
                <StatusBadge status={g.active ? "active" : "inactive"} />
              </div>

              {can("manage_network") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => start(g)}>Modifier</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      confirm({
                        title: `Supprimer « ${g.name} » ?`,
                        consequence:
                          "Une gare utilisée par un trajet ne peut pas être supprimée : retirez-la d'abord de l'itinéraire.",
                        confirmLabel: "Supprimer",
                        danger: true,
                        onConfirm: async () => {
                          const { error } = await table("bus_terminals").delete().eq("id", g.id);
                          if (error) return friendlyError(error);
                          gares.reload();
                          return null;
                        },
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                    Supprimer
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Modifier « ${editing.name} »` : "Ajouter une gare"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={save}>{editing ? "Enregistrer" : "Ajouter"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="g-name">Nom</label>
            <input
              id="g-name"
              value={form.name ?? ""}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={inputClass}
              placeholder="Gare Portail Saint-Joseph"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="g-city">Ville</label>
            <input
              id="g-city"
              value={form.city ?? ""}
              onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
              className={inputClass}
              placeholder="Port-au-Prince"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="g-addr">Adresse</label>
            <input
              id="g-addr"
              value={form.address ?? ""}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="g-phone">Téléphone</label>
            <input
              id="g-phone"
              value={form.phone ?? ""}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="g-arrive">
              Se présenter (min avant)
            </label>
            <input
              id="g-arrive"
              value={form.arrive_minutes_before ?? 30}
              onChange={e =>
                setForm(p => ({ ...p, arrive_minutes_before: Number(e.target.value) }))
              }
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="g-hours">Horaires d'ouverture</label>
            <input
              id="g-hours"
              value={form.hours ?? ""}
              onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
              className={inputClass}
              placeholder="Ouvert tous les jours, 5 h – 19 h"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="g-instr">Instructions d'accès</label>
            <input
              id="g-instr"
              value={form.instructions ?? ""}
              onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))}
              className={inputClass}
              placeholder="En face de la station, portail bleu"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-[13px] text-admin-ink">
              <input
                type="checkbox"
                checked={form.active ?? true}
                onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
              />
              Gare en service
            </label>
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

import { useEffect, useState } from "react";
import { Bell, Plus, X, CreditCard, LifeBuoy, Loader2, Plug, Shield } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, Callout, Card, CardHeader, Field, FieldGrid, PageHeader, Skeleton, inputClass, labelClass, selectClass } from "../../console/Ui";
import { StatusBadge } from "../../console/StatusBadge";
import { friendlyError, table, useRow, useTable } from "../../console/data";
import { money, stamp } from "../../console/format";
import { useAuth } from "../../lib/auth";
import { usePartner } from "../lib/partnerAuth";

type RSettings = {
  listing_id: string;
  accept_online_reservations: boolean;
  max_advance_days: number;
  min_notice_minutes: number;
  same_day_allowed: boolean;
  default_duration_minutes: number;
  grace_period_minutes: number;
  min_party: number;
  max_party: number;
  auto_confirm: boolean;
  cancellation_deadline_hours: number | null;
  cancellation_policy: string | null;
  no_show_policy: string | null;
  deposit_required: boolean;
  deposit_amount: number | string | null;
  accept_online_orders: boolean;
  allow_dine_in_orders: boolean;
  allow_pickup: boolean;
  allow_delivery: boolean;
  order_prep_minutes: number;
  order_min_total: number | string | null;
  delivery_eta_minutes: number;
  delivery_free_over: number | string | null;
  pickup_instructions: string | null;
  delivery_instructions: string | null;
  order_max_advance_days: number;
};

type HourRow = { id: string; weekday: number; opens_at: string; closes_at: string };

type Draft = {
  accept_online_reservations: boolean;
  same_day_allowed: boolean;
  auto_confirm: boolean;
  deposit_required: boolean;
  min_notice_minutes: string;
  max_advance_days: string;
  default_duration_minutes: string;
  grace_period_minutes: string;
  min_party: string;
  max_party: string;
  cancellation_deadline_hours: string;
  cancellation_policy: string;
  no_show_policy: string;
  deposit_amount: string;
  accept_online_orders: boolean;
  allow_dine_in_orders: boolean;
  allow_pickup: boolean;
  allow_delivery: boolean;
  order_prep_minutes: string;
  order_min_total: string;
  delivery_eta_minutes: string;
  delivery_free_over: string;
  pickup_instructions: string;
  delivery_instructions: string;
  order_max_advance_days: string;
};

/** Monday first, the way `restaurant_hours.weekday` is numbered. */
const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const draftFrom = (s: RSettings | null): Draft => ({
  accept_online_reservations: s?.accept_online_reservations ?? true,
  same_day_allowed: s?.same_day_allowed ?? true,
  auto_confirm: s?.auto_confirm ?? true,
  deposit_required: s?.deposit_required ?? false,
  min_notice_minutes: String(s?.min_notice_minutes ?? 120),
  max_advance_days: String(s?.max_advance_days ?? 60),
  default_duration_minutes: String(s?.default_duration_minutes ?? 90),
  grace_period_minutes: String(s?.grace_period_minutes ?? 15),
  min_party: String(s?.min_party ?? 1),
  max_party: String(s?.max_party ?? 12),
  cancellation_deadline_hours:
    s?.cancellation_deadline_hours == null ? "" : String(s.cancellation_deadline_hours),
  cancellation_policy: s?.cancellation_policy ?? "",
  no_show_policy: s?.no_show_policy ?? "",
  deposit_amount: s?.deposit_amount == null ? "" : String(s.deposit_amount),
  accept_online_orders: s?.accept_online_orders ?? false,
  allow_dine_in_orders: s?.allow_dine_in_orders ?? false,
  allow_pickup: s?.allow_pickup ?? true,
  allow_delivery: s?.allow_delivery ?? false,
  order_prep_minutes: String(s?.order_prep_minutes ?? 25),
  order_min_total: s?.order_min_total == null ? "" : String(s.order_min_total),
  delivery_eta_minutes: String(s?.delivery_eta_minutes ?? 45),
  delivery_free_over: s?.delivery_free_over == null ? "" : String(s.delivery_free_over),
  pickup_instructions: s?.pickup_instructions ?? "",
  delivery_instructions: s?.delivery_instructions ?? "",
  order_max_advance_days: String(s?.order_max_advance_days ?? 7),
});

const CANCELLATION_CHOICES = [
  { v: "free_24h", t: "Souple", d: "Annulation gratuite jusqu'à 24 h avant." },
  { v: "free_2h", t: "Modérée", d: "Annulation gratuite jusqu'à 2 h avant." },
  { v: "non_refundable", t: "Stricte", d: "Non remboursable. Plus de sécurité, moins de réservations." },
];

/** An on/off row, shaped like the radio rows it sits beside. */
function Switch({
  checked,
  onChange,
  title,
  detail,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-3 transition-colors",
        checked ? "border-[#002089] bg-[#f4f8fd]" : "border-admin-line hover:bg-admin-canvas",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 accent-[#002089]"
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-admin-ink">{title}</span>
        <span className="block text-[12px] leading-relaxed text-admin-ink-3">{detail}</span>
      </span>
    </label>
  );
}

/**
 * Opening hours: one row per weekday, as many services per day as the kitchen
 * actually runs. A day with no service is closed — that is what an empty row
 * means, so there is no separate "closed" switch to fall out of sync with it.
 */
function OpeningHours({ listingId, canEdit }: { listingId: string; canEdit: boolean }) {
  const hours = useTable<HourRow>({
    from: "restaurant_hours",
    select: "id, weekday, opens_at, closes_at",
    filters: [{ col: "listing_id", op: "eq", value: listingId }],
    sort: { col: "opens_at", dir: "asc" },
    pageSize: 100,
    enabled: !!listingId,
  });

  const [draft, setDraft] = useState<Record<number, { from: string; to: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const at = (d: number) => draft[d] ?? { from: "", to: "" };
  const setAt = (d: number, patch: Partial<{ from: string; to: string }>) =>
    setDraft(p => ({ ...p, [d]: { ...at(d), ...patch } }));

  const add = async (weekday: number) => {
    const { from, to } = at(weekday);
    if (!from || !to) return setError("Indiquez une heure d'ouverture et une heure de fermeture.");
    setError(null);
    const { error: err } = await table("restaurant_hours").insert({
      listing_id: listingId,
      weekday,
      opens_at: from,
      closes_at: to,
    });
    if (err) return setError(friendlyError(err));
    setDraft(p => ({ ...p, [weekday]: { from: "", to: "" } }));
    hours.reload();
  };

  const remove = async (id: string) => {
    const { error: err } = await table("restaurant_hours").delete().eq("id", id);
    if (err) return setError(friendlyError(err));
    hours.reload();
  };

  const hhmm = (t: string) => t.slice(0, 5);

  return (
    <Card>
      <CardHeader
        title="Horaires d'ouverture"
        subtitle="Les créneaux proposés aux clients en découlent directement. Un jour sans service est fermé."
      />
      <div className="flex flex-col gap-1.5">
        {WEEKDAYS.map((name, d) => {
          const services = hours.rows.filter(h => h.weekday === d);
          return (
            <div
              key={name}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-admin-line px-3 py-2.5"
            >
              <span className="w-24 shrink-0 text-[13px] font-medium text-admin-ink">{name}</span>

              {services.length === 0 && <span className="text-[12.5px] text-admin-ink-3">Fermé</span>}

              {services.map(s => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-admin-line bg-admin-canvas px-2.5 py-1 text-[12.5px] text-admin-ink"
                >
                  {hhmm(s.opens_at)} – {hhmm(s.closes_at)}
                  {canEdit && (
                    <button
                      onClick={() => remove(s.id)}
                      aria-label={"Supprimer le service " + hhmm(s.opens_at) + " – " + hhmm(s.closes_at) + " du " + name.toLowerCase()}
                      className="text-admin-ink-3 transition-colors hover:text-[#b3261e]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </span>
              ))}

              {canEdit && (
                <span className="ml-auto flex items-center gap-1.5">
                  <input
                    type="time"
                    value={at(d).from}
                    onChange={e => setAt(d, { from: e.target.value })}
                    aria-label={"Ouverture — " + name}
                    className={cn(inputClass, "w-28 py-1")}
                  />
                  <input
                    type="time"
                    value={at(d).to}
                    onChange={e => setAt(d, { to: e.target.value })}
                    aria-label={"Fermeture — " + name}
                    className={cn(inputClass, "w-28 py-1")}
                  />
                  <Button variant="secondary" onClick={() => add(d)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Ajouter
                  </Button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      <p className="mt-3 text-[11.5px] text-admin-ink-3">
        Un service qui se termine après minuit n'est pas encore géré : saisissez-le en deux
        temps.
      </p>
    </Card>
  );
}

/**
 * Where the restaurant delivers and what it costs.
 *
 * The specification bands zones by distance ("0–3 miles"). PAPOT holds no
 * coordinates for anyone, so a distance would be guessed: zones are the
 * neighbourhoods the restaurant actually names, which is what a courier works
 * from anyway.
 */
function DeliveryZones({ listingId, canEdit }: { listingId: string; canEdit: boolean }) {
  const zones = useTable<{
    id: string;
    name: string;
    fee: number;
    min_order: number | null;
    eta_minutes: number | null;
    active: boolean;
  }>({
    from: "delivery_zones",
    select: "id, name, fee, min_order, eta_minutes, active",
    filters: [{ col: "listing_id", op: "eq", value: listingId }],
    sort: { col: "position", dir: "asc" },
    pageSize: 100,
    enabled: !!listingId,
  });

  const [draft, setDraft] = useState({ name: "", fee: "", min_order: "", eta: "" });
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!draft.name.trim()) return setError("Donnez un nom à la zone.");
    setError(null);
    const { error: err } = await table("delivery_zones").insert({
      listing_id: listingId,
      name: draft.name.trim(),
      fee: Number(draft.fee.replace(",", ".")) || 0,
      min_order: draft.min_order ? Number(draft.min_order.replace(",", ".")) : null,
      eta_minutes: draft.eta ? Number(draft.eta) : null,
      position: zones.rows.length,
    });
    if (err) return setError(friendlyError(err));
    setDraft({ name: "", fee: "", min_order: "", eta: "" });
    zones.reload();
  };

  const remove = async (id: string) => {
    const { error: err } = await table("delivery_zones").delete().eq("id", id);
    if (err) return setError(friendlyError(err));
    zones.reload();
  };

  return (
    <div className="mt-4 border-t border-admin-line pt-4">
      <p className="mb-2 text-[12px] font-semibold text-admin-ink-2">Zones de livraison</p>

      <div className="flex flex-col gap-1.5">
        {zones.rows.length === 0 && (
          <p className="text-[12.5px] text-admin-ink-3">
            Aucune zone : la livraison reste gratuite et sans minimum tant que vous n'en ajoutez pas.
          </p>
        )}
        {zones.rows.map(z => (
          <div
            key={z.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-admin-line px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-[13px] font-medium text-admin-ink">{z.name}</span>
            <span className="text-[12.5px] tabular-nums text-admin-ink-2">
              {Number(z.fee) === 0 ? "gratuite" : money(z.fee)}
              {z.min_order !== null ? ` · min. ${money(z.min_order)}` : ""}
              {z.eta_minutes !== null ? ` · ${z.eta_minutes} min` : ""}
            </span>
            {canEdit && (
              <button
                onClick={() => remove(z.id)}
                aria-label={`Supprimer la zone ${z.name}`}
                className="text-admin-ink-3 transition-colors hover:text-[#b3261e]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Pétion-Ville"
            aria-label="Nom de la zone"
            className={cn(inputClass, "w-40 py-1")}
          />
          <input
            value={draft.fee}
            onChange={e => setDraft(d => ({ ...d, fee: e.target.value }))}
            placeholder="Frais"
            inputMode="decimal"
            aria-label="Frais de livraison"
            className={cn(inputClass, "w-24 py-1")}
          />
          <input
            value={draft.min_order}
            onChange={e => setDraft(d => ({ ...d, min_order: e.target.value }))}
            placeholder="Minimum"
            inputMode="decimal"
            aria-label="Commande minimum pour cette zone"
            className={cn(inputClass, "w-28 py-1")}
          />
          <input
            value={draft.eta}
            onChange={e => setDraft(d => ({ ...d, eta: e.target.value }))}
            placeholder="Délai"
            inputMode="numeric"
            aria-label="Délai de livraison en minutes"
            className={cn(inputClass, "w-24 py-1")}
          />
          <Button variant="secondary" onClick={add}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Zone
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      <p className="mt-2 text-[11.5px] text-admin-ink-3">
        Dès qu'une zone existe, le client doit en choisir une pour se faire livrer, et c'est elle
        qui fixe les frais et le minimum.
      </p>
    </div>
  );
}

/** Spec §54–§56, and §4 steps 4–5 of the restaurant specification. */
export function BookingSettings() {
  const { active, can } = usePartner();
  const editable = can("manage_settings");
  const isRestaurant = active?.type === "restaurant";

  // Reservation rules belong to the restaurant listing, not to the business:
  // a partner could one day run two dining rooms with different services.
  const listings = useTable<{ id: string; name: string }>({
    from: "listings",
    select: "id, name",
    filters: [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      { col: "kind", op: "eq", value: "restaurant" },
    ],
    sort: { col: "name", dir: "asc" },
    pageSize: 10,
    enabled: !!active && isRestaurant,
  });
  const restaurant = listings.rows[0];

  const { row: settings, loading, reload } = useRow<RSettings>(
    "restaurant_settings",
    { listing_id: restaurant?.id ?? "" },
    "*",
    !!restaurant,
  );

  const [form, setForm] = useState<Draft>(() => draftFrom(null));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The row arrives after the first render, so the draft is seeded from it.
  useEffect(() => {
    if (restaurant) setForm(draftFrom(settings));
  }, [settings, restaurant?.id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setForm(f => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const save = async () => {
    if (!restaurant) return;
    setBusy(true);
    setError(null);
    const { error: err } = await table("restaurant_settings").upsert({
      listing_id: restaurant.id,
      accept_online_reservations: form.accept_online_reservations,
      same_day_allowed: form.same_day_allowed,
      auto_confirm: form.auto_confirm,
      min_notice_minutes: num(form.min_notice_minutes) ?? 120,
      max_advance_days: num(form.max_advance_days) ?? 60,
      default_duration_minutes: num(form.default_duration_minutes) ?? 90,
      grace_period_minutes: num(form.grace_period_minutes) ?? 15,
      min_party: num(form.min_party) ?? 1,
      max_party: num(form.max_party) ?? 12,
      cancellation_policy: form.cancellation_policy || null,
      cancellation_deadline_hours:
        form.cancellation_deadline_hours === "" ? null : num(form.cancellation_deadline_hours),
      no_show_policy: form.no_show_policy.trim() || null,
      deposit_required: form.deposit_required,
      deposit_amount: form.deposit_required ? num(form.deposit_amount) : null,
      accept_online_orders: form.accept_online_orders,
      allow_dine_in_orders: form.allow_dine_in_orders,
      allow_pickup: form.allow_pickup,
      allow_delivery: form.allow_delivery,
      order_prep_minutes: num(form.order_prep_minutes) ?? 25,
      order_min_total: form.order_min_total === "" ? null : num(form.order_min_total),
      delivery_eta_minutes: num(form.delivery_eta_minutes) ?? 45,
      delivery_free_over: form.delivery_free_over === "" ? null : num(form.delivery_free_over),
      pickup_instructions: form.pickup_instructions.trim() || null,
      delivery_instructions: form.delivery_instructions.trim() || null,
      order_max_advance_days: num(form.order_max_advance_days) ?? 7,
    });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setSaved(true);
    reload();
  };

  // Hotels and rentals never had these columns and still do not: their rules
  // are collected at application time and applied by PAPOT.
  if (!isRestaurant) {
    return (
      <>
        <PageHeader
          title="Règles de réservation"
          subtitle="Comment et quand les voyageurs peuvent réserver chez vous."
        />
        <Callout tone="warning">
          Pour votre type d'établissement, ces règles n'ont pas encore de colonne : elles sont
          collectées à la candidature et appliquées par PAPOT. Les restaurants disposent déjà de
          l'écran complet.
        </Callout>
      </>
    );
  }

  if (listings.loading || loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!restaurant) {
    return (
      <>
        <PageHeader
          title="Règles de réservation"
          subtitle="Comment et quand les clients peuvent réserver une table."
        />
        <Callout tone="warning">
          Aucune fiche restaurant n'est encore rattachée à votre compte. Créez-la d'abord :
          les règles ci-dessous se rattachent à elle.
        </Callout>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Règles de réservation"
        subtitle={"Ce qui décide des créneaux proposés sur la fiche de " + restaurant.name + "."}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader title="Confirmation" subtitle="Instantanée, ou validée par vous." />
            <div className="flex flex-col gap-2">
              {[
                {
                  v: true,
                  t: "Confirmation instantanée",
                  d: "Le client réserve et la table est retenue. Plus de réservations, moins de contrôle.",
                },
                {
                  v: false,
                  t: "Validation manuelle",
                  d: "La table est retenue mais la réservation reste en attente jusqu'à votre accord.",
                },
              ].map(o => (
                <label
                  key={String(o.v)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-3 transition-colors",
                    form.auto_confirm === o.v
                      ? "border-[#002089] bg-[#f4f8fd]"
                      : "border-admin-line hover:bg-admin-canvas",
                  )}
                >
                  <input
                    type="radio"
                    name="confirmation"
                    checked={form.auto_confirm === o.v}
                    onChange={() => set("auto_confirm", o.v)}
                    disabled={!editable}
                    className="mt-0.5 h-4 w-4 accent-[#002089]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-admin-ink">{o.t}</span>
                    <span className="block text-[12px] leading-relaxed text-admin-ink-3">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Fenêtre de réservation"
              subtitle="Jusqu'à quand, et à partir de quand, un client peut réserver."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="s-notice">Préavis minimum (minutes)</label>
                <input
                  id="s-notice"
                  value={form.min_notice_minutes}
                  onChange={e => set("min_notice_minutes", e.target.value)}
                  inputMode="numeric"
                  disabled={!editable}
                  className={inputClass}
                />
                <p className="mt-1 text-[11.5px] text-admin-ink-3">
                  Les créneaux plus proches que ce délai disparaissent de la fiche.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="s-window">Réservation à l'avance (jours)</label>
                <input
                  id="s-window"
                  value={form.max_advance_days}
                  onChange={e => set("max_advance_days", e.target.value)}
                  inputMode="numeric"
                  disabled={!editable}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-3">
              <Switch
                checked={form.same_day_allowed}
                onChange={v => set("same_day_allowed", v)}
                disabled={!editable}
                title="Accepter les réservations pour le jour même"
                detail="Le préavis minimum s'applique quand même."
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Le repas"
              subtitle="La durée décide du nombre de services qu'une table peut faire."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="s-duration">Table gardée (minutes)</label>
                <input
                  id="s-duration"
                  value={form.default_duration_minutes}
                  onChange={e => set("default_duration_minutes", e.target.value)}
                  inputMode="numeric"
                  disabled={!editable}
                  className={inputClass}
                />
                <p className="mt-1 text-[11.5px] text-admin-ink-3">
                  Entre 15 et 600. Une table n'est proposée à nouveau qu'après ce délai.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="s-grace">Retard toléré (minutes)</label>
                <input
                  id="s-grace"
                  value={form.grace_period_minutes}
                  onChange={e => set("grace_period_minutes", e.target.value)}
                  inputMode="numeric"
                  disabled={!editable}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="s-minparty">Convives minimum</label>
                <input
                  id="s-minparty"
                  value={form.min_party}
                  onChange={e => set("min_party", e.target.value)}
                  inputMode="numeric"
                  disabled={!editable}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="s-maxparty">Convives maximum</label>
                <input
                  id="s-maxparty"
                  value={form.max_party}
                  onChange={e => set("max_party", e.target.value)}
                  inputMode="numeric"
                  disabled={!editable}
                  className={inputClass}
                />
                <p className="mt-1 text-[11.5px] text-admin-ink-3">
                  Un groupe reste tributaire de vos tables : il faut une table qui l'accepte.
                </p>
              </div>
            </div>
          </Card>

          <OpeningHours listingId={restaurant.id} canEdit={editable} />

          <Card>
            <CardHeader
              title="Commande en ligne"
              subtitle="La vente de plats, séparée de la réservation de table : un restaurant peut n'en faire qu'une."
            />
            <Switch
              checked={form.accept_online_orders}
              onChange={v => set("accept_online_orders", v)}
              disabled={!editable}
              title="Accepter les commandes en ligne"
              detail="Ouvre la file de la cuisine et l'écran Commandes du tableau de bord."
            />

            {form.accept_online_orders && (
              <>
                <p className="mt-4 mb-2 text-[12px] font-semibold text-admin-ink-2">
                  Comment le client récupère sa commande
                </p>
                <div className="flex flex-col gap-2">
                  <Switch
                    checked={form.allow_pickup}
                    onChange={v => set("allow_pickup", v)}
                    disabled={!editable}
                    title="À emporter"
                    detail="Le client vient chercher sa commande au comptoir."
                  />
                  <Switch
                    checked={form.allow_dine_in_orders}
                    onChange={v => set("allow_dine_in_orders", v)}
                    disabled={!editable}
                    title="Sur place"
                    detail="Commander depuis la table, sans attendre le service."
                  />
                  <Switch
                    checked={form.allow_delivery}
                    onChange={v => set("allow_delivery", v)}
                    disabled={!editable}
                    title="Livraison"
                    detail="Les frais et les zones de livraison arrivent avec le module de livraison ; pour l'instant la livraison est facturée 0."
                  />
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="o-prep">Préparation (minutes)</label>
                    <input
                      id="o-prep"
                      value={form.order_prep_minutes}
                      onChange={e => set("order_prep_minutes", e.target.value)}
                      inputMode="numeric"
                      disabled={!editable}
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11.5px] text-admin-ink-3">
                      L'heure annoncée au client quand il commande « dès que possible ».
                    </p>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="o-min">Commande minimum (USD)</label>
                    <input
                      id="o-min"
                      value={form.order_min_total}
                      onChange={e => set("order_min_total", e.target.value)}
                      inputMode="decimal"
                      placeholder="Aucun minimum"
                      disabled={!editable}
                      className={inputClass}
                    />
                  </div>
                </div>

                {!form.allow_pickup && !form.allow_dine_in_orders && !form.allow_delivery && (
                  <p className="mt-3 text-[13px] font-medium text-[#b3261e]">
                    Choisissez au moins un mode de retrait : sans cela, personne ne peut récupérer
                    sa commande et l'enregistrement sera refusé.
                  </p>
                )}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="o-advance">Précommande (jours à l'avance)</label>
                    <input
                      id="o-advance"
                      value={form.order_max_advance_days}
                      onChange={e => set("order_max_advance_days", e.target.value)}
                      inputMode="numeric"
                      disabled={!editable}
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11.5px] text-admin-ink-3">
                      0 pour n'accepter que le jour même. Utile pour les plats du dimanche et les
                      commandes de fête.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="o-pickup-notes">Instructions de retrait</label>
                    <input
                      id="o-pickup-notes"
                      value={form.pickup_instructions}
                      onChange={e => set("pickup_instructions", e.target.value)}
                      placeholder="Comptoir à droite en entrant"
                      disabled={!editable}
                      className={inputClass}
                    />
                  </div>
                </div>

                {form.allow_delivery && (
                  <div className="mt-4 rounded-lg border border-admin-line px-3.5 py-3.5">
                    <p className="mb-3 text-[12px] font-semibold text-admin-ink-2">Livraison</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass} htmlFor="o-eta">Délai de livraison (minutes)</label>
                        <input
                          id="o-eta"
                          value={form.delivery_eta_minutes}
                          onChange={e => set("delivery_eta_minutes", e.target.value)}
                          inputMode="numeric"
                          disabled={!editable}
                          className={inputClass}
                        />
                        <p className="mt-1 text-[11.5px] text-admin-ink-3">
                          S'ajoute au temps de préparation. Une zone peut avoir le sien.
                        </p>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="o-free">Livraison offerte à partir de (USD)</label>
                        <input
                          id="o-free"
                          value={form.delivery_free_over}
                          onChange={e => set("delivery_free_over", e.target.value)}
                          inputMode="decimal"
                          placeholder="Jamais offerte"
                          disabled={!editable}
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor="o-deliv-notes">Instructions de livraison</label>
                        <input
                          id="o-deliv-notes"
                          value={form.delivery_instructions}
                          onChange={e => set("delivery_instructions", e.target.value)}
                          placeholder="Appelez en arrivant, le portail est vert"
                          disabled={!editable}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <DeliveryZones listingId={restaurant.id} canEdit={editable} />
                  </div>
                )}

                <p className="mt-3 text-[11.5px] text-admin-ink-3">
                  Rien n'est encaissé en ligne : le client règle à la remise, et vous marquez le
                  paiement sur la commande.
                </p>
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Annulation et absence" />
            <div className="flex flex-col gap-2">
              {CANCELLATION_CHOICES.map(o => (
                <label
                  key={o.v}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-3 transition-colors",
                    form.cancellation_policy === o.v
                      ? "border-[#002089] bg-[#f4f8fd]"
                      : "border-admin-line hover:bg-admin-canvas",
                  )}
                >
                  <input
                    type="radio"
                    name="cancellation"
                    checked={form.cancellation_policy === o.v}
                    onChange={() => set("cancellation_policy", o.v)}
                    disabled={!editable}
                    className="mt-0.5 h-4 w-4 accent-[#002089]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-admin-ink">{o.t}</span>
                    <span className="block text-[12px] text-admin-ink-3">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="s-deadline">Annulation possible jusqu'à (heures avant)</label>
                <input
                  id="s-deadline"
                  value={form.cancellation_deadline_hours}
                  onChange={e => set("cancellation_deadline_hours", e.target.value)}
                  inputMode="numeric"
                  placeholder="Non précisée"
                  disabled={!editable}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="s-noshow">En cas d'absence</label>
                <input
                  id="s-noshow"
                  value={form.no_show_policy}
                  onChange={e => set("no_show_policy", e.target.value)}
                  placeholder="La table est libérée après le retard toléré."
                  disabled={!editable}
                  className={inputClass}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Acompte" subtitle="Rien n'est encaissé en ligne pour l'instant : ce montant est annoncé au client." />
            <Switch
              checked={form.deposit_required}
              onChange={v => set("deposit_required", v)}
              disabled={!editable}
              title="Demander un acompte"
              detail="Affiché sur la fiche. Le montant est obligatoire si vous cochez cette case."
            />
            {form.deposit_required && (
              <div className="mt-3 max-w-xs">
                <label className={labelClass} htmlFor="s-deposit">Montant par personne (USD)</label>
                <input
                  id="s-deposit"
                  value={form.deposit_amount}
                  onChange={e => set("deposit_amount", e.target.value)}
                  inputMode="decimal"
                  disabled={!editable}
                  className={inputClass}
                />
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Réservation en ligne" />
            <Switch
              checked={form.accept_online_reservations}
              onChange={v => set("accept_online_reservations", v)}
              disabled={!editable}
              title="Accepter les réservations en ligne"
              detail="Décochez pour retirer le module de réservation de votre fiche publique."
            />

            <div className="mt-4 rounded-lg bg-admin-canvas px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                Ce que verra le client
              </p>
              <p className="mt-1 text-[13px] text-admin-ink">
                {form.accept_online_reservations
                  ? "Réservation jusqu'à " +
                    form.min_notice_minutes +
                    " minutes avant, et " +
                    form.max_advance_days +
                    " jours à l'avance. Table gardée " +
                    form.default_duration_minutes +
                    " minutes."
                  : "Aucun créneau ne sera proposé sur votre fiche."}
              </p>
            </div>

            {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
            {saved && !error && (
              <p className="mt-3 text-[13px] font-medium text-[#15803d]">Règles enregistrées.</p>
            )}

            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={save}
              disabled={!editable || busy}
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {!editable && (
              <p className="mt-2 text-[11.5px] text-admin-ink-3">
                Votre rôle ne permet pas de modifier ces règles.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

const EVENTS = [
  ["new_reservation", "Nouvelle réservation"],
  ["cancellation", "Annulation"],
  ["payment", "Paiement reçu"],
  ["message", "Message client"],
  ["review", "Nouvel avis"],
  ["payout", "Versement"],
  ["verification", "Vérification"],
  ["document_expiry", "Document qui expire"],
  ["announcement", "Annonce PAPOT"],
];

const CHANNELS = [
  ["in_app", "Dans l'app"],
  ["email", "Courriel"],
  ["sms", "SMS"],
  ["push", "Push"],
];

/** Spec §57. */
export function Notifications() {
  const { active, can } = usePartner();
  const [busy, setBusy] = useState<string | null>(null);

  const { rows, reload } = useTable<{ event: string; channels: string[] }>({
    from: "partner_notification_prefs",
    select: "event, channels",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    pageSize: 50,
    enabled: !!active,
  });

  const channelsFor = (event: string) =>
    rows.find(r => r.event === event)?.channels ?? ["in_app"];

  const toggle = async (event: string, channel: string) => {
    if (!active || !can("manage_settings")) return;
    const current = channelsFor(event);
    const next = current.includes(channel)
      ? current.filter(c => c !== channel)
      : [...current, channel];

    setBusy(event);
    await table("partner_notification_prefs").upsert({
      partner_id: active.partner_id,
      event,
      channels: next,
    });
    setBusy(null);
    reload();
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Ce dont vous voulez être prévenu, et comment." />

      <div className="mb-5">
        <Callout tone="warning">
          Les canaux courriel et SMS dépendent de fournisseurs qui ne sont pas encore
          configurés : votre choix est enregistré, mais seules les notifications dans
          l'application sont réellement envoyées pour l'instant.
        </Callout>
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-admin-line bg-admin-raised">
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                  Événement
                </th>
                {CHANNELS.map(([, label]) => (
                  <th
                    key={label}
                    className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-line">
              {EVENTS.map(([event, label]) => (
                <tr key={event} className={busy === event ? "opacity-60" : ""}>
                  <td className="px-5 py-3 text-[13px] font-medium text-admin-ink">{label}</td>
                  {CHANNELS.map(([channel]) => (
                    <td key={channel} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={channelsFor(event).includes(channel)}
                        onChange={() => toggle(event, channel)}
                        disabled={!can("manage_settings")}
                        aria-label={`${label} par ${channel}`}
                        className="h-4 w-4 accent-[#002089]"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/** Spec §61–§62. */
export function Integrations() {
  const { active } = usePartner();

  const { rows, loading } = useTable<{
    id: string;
    kind: string;
    status: string;
    last_synced_at: string | null;
  }>({
    from: "partner_integrations",
    select: "id, kind, status, last_synced_at",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    pageSize: 20,
    enabled: !!active,
  });

  const available = [
    { kind: "google_calendar", name: "Google Agenda", desc: "Exportez vos réservations vers votre agenda." },
    { kind: "ical", name: "iCal", desc: "Synchronisez avec un autre site de réservation." },
    ...(active?.type === "hotel"
      ? [{ kind: "channel_manager", name: "Channel manager", desc: "Reliez votre PMS et vos autres canaux." }]
      : []),
    ...(active?.type === "restaurant"
      ? [{ kind: "pos", name: "Caisse (POS)", desc: "Reliez votre système d'encaissement." }]
      : []),
    { kind: "accounting", name: "Comptabilité", desc: "Exportez vos transactions vers votre comptable." },
  ];

  return (
    <>
      <PageHeader title="Intégrations" subtitle="Reliez PAPOT aux outils que vous utilisez déjà." />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {available.map(i => {
            const row = rows.find(r => r.kind === i.kind);
            return (
              <Card key={i.kind}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-[14.5px] font-semibold text-admin-ink">{i.name}</h3>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-admin-ink-3">{i.desc}</p>
                  </div>
                  <StatusBadge status={row?.status ?? "disconnected"} />
                </div>
                {row?.last_synced_at && (
                  <p className="mt-2 text-[12px] text-admin-ink-3">
                    Dernière synchronisation : {stamp(row.last_synced_at)}
                  </p>
                )}
                <Button variant="secondary" className="mt-4 w-full" disabled>
                  Connecter
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        <Callout>
          Une intégration se connecte avec une clé posée côté serveur, jamais depuis le
          navigateur. Les emplacements sont prêts ; le branchement se fait au moment où vous
          choisissez un fournisseur.
        </Callout>
      </div>
    </>
  );
}

/** Spec §58–§59. */
export function Account() {
  const { user } = useAuth();
  const { active, memberships } = usePartner();

  return (
    <>
      <PageHeader title="Mon compte" subtitle="Vos informations personnelles et votre sécurité." />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Informations" />
          <FieldGrid>
            <Field label="Courriel">{user?.email ?? "—"}</Field>
            <Field label="Établissements">{memberships.length}</Field>
            <Field label="Établissement actif">{active?.business_name ?? "—"}</Field>
          </FieldGrid>
          <div className="mt-4">
            <Callout>
              Votre mot de passe et vos options de connexion se gèrent depuis votre compte
              PAPOT, pas depuis ce tableau de bord.
            </Callout>
          </div>
          <Button as="link" to="/compte/profil" variant="secondary" className="mt-4">
            Gérer mon compte PAPOT
          </Button>
        </Card>

        <Card>
          <CardHeader title="Sécurité" />
          <div className="flex flex-col gap-2">
            <Button variant="secondary" className="justify-start" disabled>
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Authentification à deux facteurs
            </Button>
            <Button variant="secondary" className="justify-start" disabled>
              Déconnecter les autres appareils
            </Button>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-admin-ink-3">
            Ces actions passent par l'API d'administration de Supabase, qui exige une clé de
            service : elles s'exécutent côté serveur, jamais depuis le navigateur.
          </p>
        </Card>
      </div>
    </>
  );
}

/** Spec §39 — payout settings, masked. */
export function PaymentSettings() {
  const { can } = usePartner();

  return (
    <>
      <PageHeader title="Paiements et versements" subtitle="Où PAPOT vous envoie votre argent." />

      <Card className="max-w-2xl">
        <CardHeader title="Coordonnées de versement" />
        <FieldGrid cols={2}>
          <Field label="Méthode">Virement bancaire</Field>
          <Field label="Titulaire">•••••</Field>
          <Field label="Banque">•••••</Field>
          <Field label="Compte">•••• ••••</Field>
          <Field label="Devise">USD</Field>
        </FieldGrid>

        <div className="mt-4">
          <Callout tone="warning">
            Le numéro de compte complet n'est jamais enregistré par PAPOT : seuls les quatre
            derniers chiffres le sont. Changer ces coordonnées passe par le support, qui
            vérifie l'identité — c'est la protection la plus utile contre le détournement de
            versement.
          </Callout>
        </div>

        <Button as="link" to="/partenaire/support" variant="secondary" className="mt-4" disabled={!can("manage_payouts")}>
          <CreditCard className="h-3.5 w-3.5" aria-hidden />
          Demander une modification
        </Button>
      </Card>
    </>
  );
}

const CATEGORIES = [
  "Problème de réservation",
  "Problème de paiement",
  "Problème de versement",
  "Problème d'annonce",
  "Vérification",
  "Problème avec un client",
  "Problème technique",
];

/** Spec §63–§64. */
export function Support() {
  const { active } = usePartner();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const tickets = useTable<{ id: string; reference: string; subject: string; status: string; updated_at: string }>({
    from: "support_tickets",
    select: "id, reference, subject, status, updated_at",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "updated_at", dir: "desc" },
    pageSize: 20,
    enabled: !!active,
  });

  const submit = async () => {
    if (!active) return;
    if (!subject.trim() || !body.trim()) return setError("Sujet et description sont obligatoires.");

    setBusy(true);
    const { error } = await table("support_tickets").insert({
      reference: `SUP-${Date.now().toString(36).toUpperCase()}`,
      subject: subject.trim(),
      category,
      partner_id: active.partner_id,
      requester_label: active.business_name,
      priority,
      status: "new",
    });
    setBusy(false);

    if (error) return setError(friendlyError(error));
    setSubject("");
    setBody("");
    setError(null);
    setSent(true);
    tickets.reload();
  };

  return (
    <>
      <PageHeader title="Support" subtitle="Comment pouvons-nous vous aider ?" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Créer un ticket" />
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass} htmlFor="t-subject">Sujet</label>
              <input id="t-subject" value={subject} onChange={e => setSubject(e.target.value)} className={inputClass} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="t-cat">Catégorie</label>
                <select id="t-cat" value={category} onChange={e => setCategory(e.target.value)} className={selectClass}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="t-pri">Priorité</label>
                <select id="t-pri" value={priority} onChange={e => setPriority(e.target.value)} className={selectClass}>
                  <option value="low">Basse</option>
                  <option value="normal">Normale</option>
                  <option value="high">Haute</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="t-body">Description</label>
              <textarea
                id="t-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                className={cn(inputClass, "h-auto py-2 leading-relaxed")}
              />
            </div>

            {error && <p className="text-[13px] font-medium text-[#b3261e]">{error}</p>}
            {sent && (
              <p className="rounded-lg bg-[#eef7f0] px-3 py-2 text-[13px] font-medium text-[#15803d]">
                Ticket créé. L'équipe vous répond par courriel.
              </p>
            )}

            <div>
              <Button variant="primary" onClick={submit} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />}
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
                Envoyer
              </Button>
            </div>
          </div>
        </Card>

        <Card padded={false}>
          <div className="border-b border-admin-line px-5 py-4">
            <h2 className="font-display text-[15px] font-semibold text-admin-ink">Vos tickets</h2>
          </div>
          {tickets.rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-admin-ink-3">Aucun ticket ouvert.</p>
          ) : (
            <ul className="divide-y divide-admin-line">
              {tickets.rows.map(t => (
                <li key={t.id} className="px-5 py-3">
                  <p className="truncate text-[13px] font-medium text-admin-ink">{t.subject}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-admin-ink-3">
                    {t.reference}
                    <StatusBadge status={t.status} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export { Bell, Plug };

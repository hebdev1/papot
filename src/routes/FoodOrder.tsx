import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatUsd } from "../lib/currency";
import { useFoodCart } from "../lib/foodCart";

/* ── shared ─────────────────────────────────────────────── */

type Settings = {
  accept_online_orders: boolean;
  allow_dine_in_orders: boolean;
  allow_pickup: boolean;
  allow_delivery: boolean;
  order_prep_minutes: number;
  order_max_advance_days: number;
  order_min_total: number | string | null;
  delivery_eta_minutes: number;
  delivery_free_over: number | string | null;
  pickup_instructions: string | null;
  delivery_instructions: string | null;
};

type Zone = {
  id: string;
  name: string;
  fee: number;
  min_order: number | null;
  eta_minutes: number | null;
};

const MODE_LABEL: Record<string, string> = {
  pickup: "À emporter",
  dine_in: "Sur place",
  delivery: "Livraison",
};

const MODE_HINT: Record<string, string> = {
  pickup: "Vous venez chercher votre commande au comptoir.",
  dine_in: "Vous commandez depuis votre table.",
  delivery: "Le restaurant vous livre.",
};

const PAY_LABEL: Record<string, string> = {
  cash: "Espèces",
  moncash: "MonCash",
  natcash: "NatCash",
  card: "Carte",
};

/**
 * `datetime-local` veut `AAAA-MM-JJTHH:MM` dans l'heure du navigateur --
 * `toISOString()` donnerait de l'UTC et décalerait les bornes.
 */
const localInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const card = "bg-white rounded-2xl border border-[#e2d5c3] p-6";
const label = "text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold";
const input =
  "w-full mt-1 px-3.5 py-2.5 rounded-xl border-2 border-[#e2d5c3] text-sm text-[#3E2C23] outline-none focus:border-[#002089]";
const cta =
  "w-full bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors";

const hhmm = (d: Date) =>
  d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/* ── 1 — checkout ───────────────────────────────────────── */

export function FoodCheckout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cart = useFoodCart();

  const [restaurant, setRestaurant] = useState<{ id: string; name: string } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<string>("");
  const [when, setWhen] = useState<"asap" | "later">("asap");
  const [scheduled, setScheduled] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [method, setMethod] = useState("cash");
  const [tipChoice, setTipChoice] = useState<"0" | "10" | "15" | "custom">("0");
  const [tipCustom, setTipCustom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [l, s, z] = await Promise.all([
        supabase.from("listings").select("id, name").eq("id", id).maybeSingle(),
        supabase.from("restaurant_settings").select("*").eq("listing_id", id).maybeSingle(),
        supabase
          .from("delivery_zones")
          .select("id, name, fee, min_order, eta_minutes")
          .eq("listing_id", id)
          .eq("active", true)
          .order("position"),
      ]);
      if (cancelled) return;
      setRestaurant((l.data as { id: string; name: string } | null) ?? null);
      setSettings((s.data as unknown as Settings | null) ?? null);
      setZones((z.data ?? []) as Zone[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const modes = useMemo(() => {
    if (!settings) return [];
    return [
      settings.allow_pickup ? "pickup" : null,
      settings.allow_dine_in_orders ? "dine_in" : null,
      settings.allow_delivery ? "delivery" : null,
    ].filter(Boolean) as string[];
  }, [settings]);

  useEffect(() => {
    if (!mode && modes.length > 0) setMode(modes[0]);
  }, [modes, mode]);

  const tip = useMemo(() => {
    if (tipChoice === "custom") return Math.max(0, Number(tipCustom.replace(",", ".")) || 0);
    return Math.round(cart.subtotal * (Number(tipChoice) / 100) * 100) / 100;
  }, [tipChoice, tipCustom, cart.subtotal]);

  const zone = zones.find(z => z.id === zoneId) ?? null;
  const freeOver = settings?.delivery_free_over == null ? null : Number(settings.delivery_free_over);
  // The restaurant's own rule, mirrored so the total is never a surprise;
  // place_food_order recomputes it from the zone regardless.
  const deliveryFee =
    mode !== "delivery" || !zone ? 0 : freeOver !== null && cart.subtotal >= freeOver ? 0 : Number(zone.fee);

  const total = cart.subtotal + deliveryFee + tip;
  const minimum = settings?.order_min_total == null ? null : Number(settings.order_min_total);
  const zoneMinimum = zone?.min_order == null ? null : Number(zone.min_order);
  const belowMinimum =
    (minimum !== null && cart.subtotal < minimum) ||
    (zoneMinimum !== null && cart.subtotal < zoneMinimum);
  const needsZone = mode === "delivery" && zones.length > 0 && !zone;
  const readyAt = settings ? new Date(Date.now() + settings.order_prep_minutes * 60_000) : null;

  if (loading) {
    return <main className="max-w-5xl mx-auto px-4 py-16 text-[#7a6355]">Chargement…</main>;
  }

  if (!restaurant || !settings?.accept_online_orders) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#3E2C23] mb-2">
          Ce restaurant ne prend pas de commande en ligne
        </h1>
        <Link to="/search?kind=restaurant" className="text-[#002089] font-semibold underline">
          Voir les autres restaurants
        </Link>
      </main>
    );
  }

  if (cart.lines.length === 0 || cart.listingId !== restaurant.id) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#3E2C23] mb-2">Votre panier est vide</h1>
        <p className="text-[#7a6355] mb-6">Choisissez des plats sur la carte du restaurant.</p>
        <Link to={`/p/${restaurant.id}`} className="text-[#002089] font-semibold underline">
          Retour à {restaurant.name}
        </Link>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { data, error: err } = await supabase.rpc("place_food_order", {
      p_payload: {
        listing_id: restaurant.id,
        fulfillment: mode,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_email: email.trim() || null,
        scheduled_for: when === "later" && scheduled ? new Date(scheduled).toISOString() : null,
        address: mode === "delivery" ? address.trim() : null,
        delivery_zone_id: mode === "delivery" && zoneId ? zoneId : null,
        address_notes: mode === "delivery" ? addressNotes.trim() : null,
        payment_method: method,
        tip: String(tip),
        note: note.trim() || null,
        items: cart.lines.map(l => ({
          item_id: l.item_id,
          template_id: l.template_id,
          variation_id: l.variation_id,
          selections: l.selections.map(s => ({ option_id: s.option_id, quantity: s.quantity })),
          quantity: l.quantity,
          note: l.note,
          // Ids only. The RPC reads every price from the menu.
          modifiers: l.modifiers.map(m => ({ id: m.id, quantity: m.quantity })),
          customizations: l.customizations,
        })),
      },
    });

    setBusy(false);
    if (err || !data) {
      // The RPC raises readable French for every rule it enforces.
      setError(err?.message?.replace(/^.*?:\s*/, "") ?? "La commande n'a pas pu être envoyée.");
      return;
    }

    const reference = (data as { reference: string }).reference;
    cart.clear();
    navigate(`/commande/${reference}?tel=${encodeURIComponent(phone.trim())}`);
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 lg:py-10">
      <p className="text-xs text-[#7a6355] mb-1">
        <Link to={`/p/${restaurant.id}`} className="hover:underline">
          {restaurant.name}
        </Link>{" "}
        · Commande
      </p>
      <h1 className="font-display text-3xl font-bold text-[#3E2C23] mb-6">Votre commande</h1>

      <form onSubmit={submit} className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* ── the cart itself ── */}
          <section className={card}>
            <h2 className="font-display text-lg font-bold text-[#002089] mb-4">Vos plats</h2>
            <ul className="flex flex-col gap-4">
              {cart.lines.map(l => (
                <li key={l.key} className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-[#3E2C23]">{l.name}</p>
                    {l.selections.length > 0 && (
                      <p className="text-xs text-[#7a6355]">
                        {l.selections
                          .map(s => (s.quantity > 1 ? `${s.quantity} × ${s.name}` : s.name))
                          .join(" · ")}
                      </p>
                    )}
                    {l.modifiers.length > 0 && (
                      <p className="text-xs text-[#7a6355]">
                        {l.modifiers
                          .map(m => m.name + (m.price_delta ? ` (${m.price_delta > 0 ? "+" : "−"}${formatUsd(Math.abs(m.price_delta))})` : ""))
                          .join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-[#7a6355]">{formatUsd(l.unit_price)} l'unité</p>
                    <label htmlFor={`note-${l.key}`} className="sr-only">
                      Instructions pour {l.name}
                    </label>
                    <input
                      id={`note-${l.key}`}
                      value={l.note ?? ""}
                      onChange={e => cart.setNote(l.key, e.target.value)}
                      placeholder="Instructions (ex. sauce à part)"
                      className="mt-1.5 w-full px-3 py-1.5 rounded-lg border border-[#e2d5c3] text-xs text-[#3E2C23] outline-none focus:border-[#002089]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Retirer un ${l.name}`}
                      onClick={() => cart.setQuantity(l.key, l.quantity - 1)}
                      className="w-8 h-8 rounded-lg border-2 border-[#e2d5c3] text-[#3E2C23] font-bold hover:border-[#002089]"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Ajouter un ${l.name}`}
                      onClick={() => cart.setQuantity(l.key, l.quantity + 1)}
                      className="w-8 h-8 rounded-lg border-2 border-[#e2d5c3] text-[#3E2C23] font-bold hover:border-[#002089]"
                    >
                      +
                    </button>
                  </div>

                  <span className="w-20 text-right text-sm font-semibold text-[#3E2C23] shrink-0">
                    {formatUsd(l.unit_price * l.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[#7a6355]">
              Le restaurant ne peut pas toujours satisfaire chaque demande particulière.
            </p>
          </section>

          {/* ── how and when ── */}
          <section className={card}>
            <h2 className="font-display text-lg font-bold text-[#002089] mb-4">Retrait</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {modes.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`p-3.5 rounded-xl border-2 text-left transition-colors ${
                    mode === m ? "border-[#e76f2e] bg-[#fff5f0]" : "border-[#e2d5c3] hover:border-[#6ad7fb]"
                  }`}
                >
                  <span className={`block text-sm font-bold ${mode === m ? "text-[#e76f2e]" : "text-[#3E2C23]"}`}>
                    {MODE_LABEL[m]}
                  </span>
                  {/* `pickup_instructions` et `delivery_instructions` étaient
                      chargés depuis la base puis remplacés à l'écran par
                      MODE_HINT : les mots du restaurateur étaient lus, puis
                      jetés. Il connaît son comptoir mieux que nous. La phrase
                      générique ne sert que lorsqu'il n'a rien écrit. */}
                  <span className="mt-0.5 block text-xs text-[#7a6355]">
                    {(m === "pickup" ? settings.pickup_instructions : null) ??
                      (m === "delivery" ? settings.delivery_instructions : null) ??
                      MODE_HINT[m]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              {(["asap", "later"] as const).map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWhen(w)}
                  aria-pressed={when === w}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    when === w
                      ? "bg-[#002089] border-[#002089] text-white"
                      : "bg-white border-[#e2d5c3] text-[#002089]"
                  }`}
                >
                  {w === "asap" ? "Dès que possible" : "Plus tard"}
                </button>
              ))}
              {when === "asap" && readyAt && (
                <span className="self-center text-xs text-[#7a6355]">
                  Prêt vers {hhmm(readyAt)} — environ {settings.order_prep_minutes} minutes.
                </span>
              )}
            </div>

            {when === "later" && (
              <div className="max-w-xs">
                <label className={label} htmlFor="sched">Heure souhaitée</label>
                {/* Le champ n'avait ni plancher ni plafond : on pouvait
                    demander hier, ou dans trois mois, et le serveur refusait
                    après coup. `order_max_advance_days` disait depuis le début
                    jusqu'où ce restaurant accepte. */}
                <input
                  id="sched"
                  type="datetime-local"
                  value={scheduled}
                  onChange={e => setScheduled(e.target.value)}
                  min={localInput(new Date(Date.now() + settings.order_prep_minutes * 60_000))}
                  max={localInput(
                    new Date(Date.now() + settings.order_max_advance_days * 86_400_000),
                  )}
                  className={input}
                  required
                />
                <p className="mt-1 text-xs text-[#7a6355]">
                  Jusqu'à {settings.order_max_advance_days} jour
                  {settings.order_max_advance_days > 1 ? "s" : ""} à l'avance.
                </p>
              </div>
            )}

            {mode === "delivery" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {zones.length > 0 && (
                  <div className="sm:col-span-2">
                    <label className={label} htmlFor="zone">Zone de livraison</label>
                    <select
                      id="zone"
                      value={zoneId}
                      onChange={e => setZoneId(e.target.value)}
                      className={input}
                      required
                    >
                      <option value="">Choisissez votre zone…</option>
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                          {Number(z.fee) > 0 ? ` — ${formatUsd(Number(z.fee))}` : " — gratuite"}
                          {z.min_order !== null ? ` (min. ${formatUsd(Number(z.min_order))})` : ""}
                        </option>
                      ))}
                    </select>
                    {/* Une zone sans `eta_minutes` faisait disparaître
                        l'estimation entière, alors que le serveur retombe sur
                        `delivery_eta_minutes` :
                        `coalesce(z.eta_minutes, s.delivery_eta_minutes, 45)`.
                        On reprend le même repli plutôt que de ne rien dire. */}
                    {zone && settings && (
                      <p className="mt-1 text-xs text-[#7a6355]">
                        Environ{" "}
                        {settings.order_prep_minutes +
                          (zone.eta_minutes ?? settings.delivery_eta_minutes ?? 45)}{" "}
                        minutes au total.
                      </p>
                    )}
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="addr">Adresse de livraison</label>
                  <input id="addr" value={address} onChange={e => setAddress(e.target.value)} className={input} required />
                </div>
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="addr-notes">Indications</label>
                  <input
                    id="addr-notes"
                    value={addressNotes}
                    onChange={e => setAddressNotes(e.target.value)}
                    placeholder="Portail vert, deuxième étage"
                    className={input}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ── who ── */}
          <section className={card}>
            <h2 className="font-display text-lg font-bold text-[#002089] mb-4">Vos coordonnées</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="nom">Nom</label>
                <input id="nom" value={name} onChange={e => setName(e.target.value)} className={input} required />
              </div>
              <div>
                <label className={label} htmlFor="tel">Téléphone</label>
                <input id="tel" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={input} required />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="mail">Courriel (facultatif)</label>
                <input id="mail" type="email" value={email} onChange={e => setEmail(e.target.value)} className={input} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="onote">Note pour le restaurant</label>
                <input id="onote" value={note} onChange={e => setNote(e.target.value)} className={input} />
              </div>
            </div>
          </section>

          {/* ── money ── */}
          <section className={card}>
            <h2 className="font-display text-lg font-bold text-[#002089] mb-1">Paiement</h2>
            <p className="text-xs text-[#7a6355] mb-4">
              Rien n'est débité en ligne : vous réglez à la remise de la commande.
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {Object.entries(PAY_LABEL).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMethod(v)}
                  aria-pressed={method === v}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    method === v
                      ? "bg-[#002089] border-[#002089] text-white"
                      : "bg-white border-[#e2d5c3] text-[#002089]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <p className={label}>Pourboire</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {(["0", "10", "15", "custom"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipChoice(t)}
                  aria-pressed={tipChoice === t}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    tipChoice === t
                      ? "bg-[#002089] border-[#002089] text-white"
                      : "bg-white border-[#e2d5c3] text-[#002089]"
                  }`}
                >
                  {t === "custom" ? "Autre" : t === "0" ? "Aucun" : `${t} %`}
                </button>
              ))}
              {tipChoice === "custom" && (
                <input
                  aria-label="Pourboire en dollars"
                  value={tipCustom}
                  onChange={e => setTipCustom(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-28 px-3 py-2 rounded-xl border-2 border-[#e2d5c3] text-sm outline-none focus:border-[#002089]"
                />
              )}
            </div>
          </section>
        </div>

        {/* ── summary ── */}
        <aside className="w-full lg:w-[330px] shrink-0 lg:sticky lg:top-24">
          <div className={card}>
            <p className="font-display font-bold text-[#3E2C23]">{restaurant.name}</p>
            <p className="text-sm text-[#7a6355] mt-0.5">
              {cart.count} article{cart.count > 1 ? "s" : ""} · {MODE_LABEL[mode] ?? "—"}
            </p>

            <dl className="mt-5 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[#7a6355]">Sous-total</dt>
                <dd className="text-[#3E2C23] font-medium">{formatUsd(cart.subtotal)}</dd>
              </div>
              {mode === "delivery" && (
                <div className="flex items-center justify-between">
                  <dt className="text-[#7a6355]">Livraison</dt>
                  <dd className="text-[#3E2C23] font-medium">
                    {deliveryFee === 0 ? "Offerte" : formatUsd(deliveryFee)}
                  </dd>
                </div>
              )}
              {tip > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-[#7a6355]">Pourboire</dt>
                  <dd className="text-[#3E2C23] font-medium">{formatUsd(tip)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[#e2d5c3] pt-2 mt-1">
                <dt className="font-bold text-[#3E2C23]">Total</dt>
                <dd className="font-display text-lg font-bold text-[#3E2C23]">{formatUsd(total)}</dd>
              </div>
            </dl>

            {belowMinimum && (
              <p className="mt-4 text-xs text-[#b3261e] bg-[#fdecea] border border-[#f5c2bd] rounded-xl px-3 py-2.5">
                {zoneMinimum !== null && cart.subtotal < zoneMinimum
                  ? `La commande minimum pour ${zone?.name} est de ${formatUsd(zoneMinimum)}.`
                  : `La commande minimum de ce restaurant est de ${formatUsd(minimum as number)}.`}
              </p>
            )}

            {error && (
              <p className="mt-4 text-[13px] text-[#b3261e] bg-[#fdecea] border border-[#f5c2bd] rounded-xl px-3.5 py-2.5">
                {error}
              </p>
            )}

            {needsZone && (
              <p className="mt-4 text-xs text-[#7a6355]">Choisissez votre zone de livraison.</p>
            )}

            {/* Le bouton est désactivé par quatre termes et trois seulement
                disaient pourquoi. Sans celui-ci, un restaurant sans aucun mode
                de retrait laissait un bouton mort et muet : rien à cliquer,
                rien à lire, rien à corriger. */}
            {!mode && (
              <p className="mt-4 text-xs text-[#b3261e] bg-[#fdecea] border border-[#f5c2bd] rounded-xl px-3 py-2.5">
                Ce restaurant n'a indiqué aucun mode de retrait. Contactez-le directement.
              </p>
            )}

            <button
              type="submit"
              disabled={busy || belowMinimum || !mode || needsZone}
              className={`${cta} mt-5`}
            >
              {busy ? "Envoi…" : "Envoyer la commande"}
            </button>
            <p className="mt-2 text-[11px] text-[#7a6355] text-center">
              Le restaurant confirme avant de préparer.
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}

/* ── 2 — tracking ───────────────────────────────────────── */

type Tracked = {
  reference: string;
  restaurant: string;
  restaurant_id: string;
  status: string;
  fulfillment: string;
  scheduled_for: string | null;
  created_at: string;
  expected_at: string | null;
  zone: string | null;
  subtotal: number;
  delivery_fee: number;
  tip: number;
  total: number;
  payment_status: string;
  payment_method: string | null;
  rejection_reason: string | null;
  address: string | null;
  items: {
    name: string;
    quantity: number;
    line_total: number;
    note: string | null;
    customizations: { kind: string; label: string }[];
  }[];
  history: { status: string; at: string }[];
};

const PICKUP_STEPS = [
  ["received", "Commande reçue"],
  ["confirmed", "Confirmée par le restaurant"],
  ["preparing", "En préparation"],
  ["ready", "Prête"],
  ["completed", "Récupérée"],
];

const DELIVERY_STEPS = [
  ["received", "Commande reçue"],
  ["confirmed", "Confirmée par le restaurant"],
  ["preparing", "En préparation"],
  ["ready", "Prête"],
  ["out_for_delivery", "En route"],
  ["completed", "Livrée"],
];

const STOPPED: Record<string, string> = {
  rejected: "Le restaurant n'a pas pu accepter cette commande.",
  cancelled: "Cette commande a été annulée.",
  refunded: "Cette commande a été remboursée.",
};

/**
 * La porte d'entrée du suivi, pour qui n'a plus le lien.
 *
 * Le formulaire référence+téléphone existait déjà, mais il vivait *dans*
 * `/commande/:reference` : il fallait connaître l'adresse pour atteindre la
 * porte qui devait vous la donner. Rien, nulle part dans le site, ne menait
 * à une commande passée -- l'URL de confirmation était la seule copie, et
 * fermer l'onglet la perdait.
 *
 * Ici on demande les deux et on redirige vers la page de suivi, qui refait
 * la vérification pour de bon. Cet écran ne prouve rien tout seul.
 */
export function OrderLookup() {
  const navigate = useNavigate();
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <main className="max-w-md mx-auto px-4 py-8 lg:py-10">
      <h1 className="font-display text-2xl font-bold text-[#3E2C23] mb-2">Suivre une commande</h1>
      <p className="text-sm text-[#7a6355] mb-6">
        La référence figure sur l'écran de confirmation, sous la forme CMD-2026-0000.
      </p>
      <form
        onSubmit={e => {
          e.preventDefault();
          const ref = reference.trim().toUpperCase();
          if (!ref || !phone.trim()) return;
          navigate(`/commande/${encodeURIComponent(ref)}?tel=${encodeURIComponent(phone.trim())}`);
        }}
        className={card}
      >
        <label className={label} htmlFor="lookup-ref">Référence</label>
        <input
          id="lookup-ref"
          value={reference}
          onChange={e => setReference(e.target.value)}
          placeholder="CMD-2026-0000"
          className={input}
          required
        />
        <label className={`${label} block mt-4`} htmlFor="lookup-tel">Téléphone</label>
        <input
          id="lookup-tel"
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+509 0000 0000"
          className={input}
          required
        />
        <button type="submit" className={`${cta} mt-5`}>
          Voir ma commande
        </button>
      </form>
      <p className="text-xs text-[#7a6355] mt-4 leading-relaxed">
        Le numéro demandé est celui laissé au restaurant : la référence seule ne suffit pas à
        ouvrir une commande, la vôtre pas plus que celle d'un autre.
      </p>
    </main>
  );
}

/** Rien ne bougera plus : inutile de continuer à demander. */
const TERMINAL = new Set(["completed", "cancelled", "rejected", "refunded"]);

export function OrderTracking() {
  const { reference } = useParams();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState(params.get("tel") ?? "");
  const [order, setOrder] = useState<Tracked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  /**
   * `quiet` distingue les deux appels. Le premier, celui qu'on attend, a le
   * droit de vider l'écran et d'afficher une erreur. Ceux du sondage n'ont
   * pas ce droit : un réseau qui hoquette une fois ne doit pas effacer la
   * commande qu'on est en train de regarder.
   *
   * Mémoïsée parce qu'un intervalle la capture : reconstruite à chaque
   * rendu, elle relancerait le minuteur sans fin.
   */
  const load = useCallback(
    async (tel: string, quiet = false) => {
      if (!reference || !tel.trim()) return;
      if (!quiet) {
        setBusy(true);
        setError(null);
      }
      const { data, error: err } = await supabase.rpc("track_food_order", {
        p_reference: reference,
        p_phone: tel.trim(),
      });
      if (!quiet) setBusy(false);
      if (err || !data) {
        if (quiet) return;
        setOrder(null);
        setError(err?.message?.replace(/^.*?:\s*/, "") ?? "Commande introuvable.");
        return;
      }
      setOrder(data as unknown as Tracked);
      setCheckedAt(new Date());
    },
    [reference],
  );

  // A link from the checkout already carries the number, so the order shows
  // straight away; anyone arriving cold is asked for it.
  useEffect(() => {
    const tel = params.get("tel");
    if (tel) void load(tel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  /**
   * La cuisine avance sans nous prévenir, alors on redemande.
   *
   * Un sondage et non le temps réel, et ce n'est pas un choix de confort : la
   * publication `supabase_realtime` ne contient aucune table, et `anon` n'a
   * aucune policy de lecture sur `restaurant_orders`. Un invité ne recevrait
   * jamais rien. `track_food_order` est le seul chemin qu'il peut lire.
   *
   * On s'arrête dès que le statut ne peut plus changer, et on se tait quand
   * l'onglet est caché -- sonder une page que personne ne regarde coûte à
   * tout le monde et ne sert personne. Au retour, on redemande tout de suite.
   */
  const liveStatus = order && !TERMINAL.has(order.status) ? order.status : null;
  useEffect(() => {
    if (!liveStatus || !phone.trim()) return;
    const ask = () => {
      if (document.visibilityState === "visible") void load(phone, true);
    };
    const timer = window.setInterval(ask, 20_000);
    document.addEventListener("visibilitychange", ask);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [liveStatus, phone, load]);

  const cancel = async () => {
    if (!order) return;
    setCancelling(true);
    const { error: err } = await supabase.rpc("cancel_food_order", {
      p_reference: order.reference,
      p_phone: phone.trim(),
    });
    setCancelling(false);
    setConfirmingCancel(false);
    if (err) {
      setError(err.message.replace(/^.*?:\s*/, ""));
      return;
    }
    void load(phone, true);
  };

  if (!order) {
    return (
      <main className="max-w-md mx-auto px-4 py-8 lg:py-10">
        <h1 className="font-display text-2xl font-bold text-[#3E2C23] mb-2">Suivre la commande</h1>
        <p className="text-sm text-[#7a6355] mb-6">
          Commande {reference}. Indiquez le numéro de téléphone laissé au restaurant.
        </p>
        <form
          onSubmit={e => {
            e.preventDefault();
            load(phone);
          }}
          className={card}
        >
          <label className={label} htmlFor="track-tel">Téléphone</label>
          <input
            id="track-tel"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className={input}
            required
          />
          {error && <p className="mt-3 text-[13px] text-[#b3261e]">{error}</p>}
          <button type="submit" disabled={busy} className={`${cta} mt-4`}>
            {busy ? "Recherche…" : "Voir ma commande"}
          </button>
        </form>
      </main>
    );
  }

  const steps = order.fulfillment === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS;
  const reached = new Set(order.history.map(h => h.status));
  // L'heure de chaque étape voyageait déjà dans `history` et finissait à la
  // poubelle avec le reste de la ligne. « Confirmée » sans heure ne dit pas
  // si c'était il y a deux minutes ou il y a une heure.
  const reachedAt = new Map(order.history.map(h => [h.status, h.at]));
  const stopped = STOPPED[order.status];
  const live = !TERMINAL.has(order.status);
  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 lg:py-10">
      <p className="text-xs text-[#7a6355] mb-1">
        <Link to={`/p/${order.restaurant_id}`} className="hover:underline">
          {order.restaurant}
        </Link>
      </p>
      <h1 className="font-display text-3xl font-bold text-[#3E2C23]">{order.reference}</h1>
      <p className="text-sm text-[#7a6355] mt-1 mb-7">
        {MODE_LABEL[order.fulfillment]}
        {order.zone ? ` · ${order.zone}` : ""} ·{" "}
        {order.scheduled_for
          ? `pour ${new Date(order.scheduled_for).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`
          : order.expected_at
            ? `attendue vers ${new Date(order.expected_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
            : "dès que possible"}
      </p>

      {stopped ? (
        <div className="bg-[#fdecea] border border-[#f5c2bd] rounded-2xl px-5 py-4 mb-6">
          <p className="font-semibold text-[#b3261e]">{stopped}</p>
          {order.rejection_reason && (
            <p className="text-sm text-[#7a6355] mt-1">Motif : {order.rejection_reason}</p>
          )}
        </div>
      ) : (
        <ol className="flex flex-col gap-0 mb-8">
          {steps.map(([key, text], i) => {
            const done = reached.has(key);
            const current = order.status === key;
            return (
              <li key={key} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center text-[11px] font-bold ${
                      done ? "bg-[#002089] border-[#002089] text-white" : "border-[#e2d5c3] bg-white"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  {i < steps.length - 1 && (
                    <span className={`w-0.5 flex-1 min-h-7 ${done ? "bg-[#002089]" : "bg-[#e2d5c3]"}`} />
                  )}
                </div>
                <div className="pb-6">
                  <p
                    className={`text-sm ${
                      current ? "font-bold text-[#002089]" : done ? "text-[#3E2C23]" : "text-[#b0a090]"
                    }`}
                  >
                    {text}
                  </p>
                  {done && reachedAt.get(key) && (
                    <p className="text-xs text-[#7a6355] mt-0.5 tabular-nums">
                      {hhmm(reachedAt.get(key) as string)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Tant que la cuisine peut encore bouger, la page se remet à jour
          toute seule. On le dit, sinon un écran qui change sous les yeux
          ressemble à un bug -- et on laisse un bouton pour ceux qui
          n'attendront pas les vingt secondes. */}
      {live && (
        <div className="flex flex-wrap items-center gap-3 mb-6 text-xs text-[#7a6355]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]" aria-hidden />
            Suivi en direct
            {checkedAt && <> · vérifié à {hhmm(checkedAt.toISOString())}</>}
          </span>
          <button
            type="button"
            onClick={() => void load(phone, true)}
            className="font-semibold text-[#002089] hover:underline"
          >
            Actualiser
          </button>
        </div>
      )}

      {/* L'annulation n'existe que depuis « reçue » : une fois la cuisine
          lancée, la portion est dépensée et c'est au téléphone que ça se
          règle. La RPC applique la même règle, celle-ci ne fait que ne pas
          proposer un bouton qui serait refusé. */}
      {order.status === "received" && (
        <div className="mb-6">
          {confirmingCancel ? (
            <div className="bg-[#fdecea] border border-[#f5c2bd] rounded-2xl px-5 py-4">
              <p className="text-sm font-semibold text-[#3E2C23]">Annuler cette commande ?</p>
              <p className="text-xs text-[#7a6355] mt-1">
                Le restaurant en sera informé. C'est sans retour : il faudra recommander.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => void cancel()}
                  disabled={cancelling}
                  className="bg-[#b3261e] hover:bg-[#8f1e18] text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
                >
                  {cancelling ? "Annulation…" : "Oui, annuler"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  className="border-2 border-[#e2d5c3] text-[#3E2C23] font-semibold px-4 py-2 rounded-xl text-sm"
                >
                  Garder ma commande
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="text-sm font-semibold text-[#b3261e] hover:underline"
            >
              Annuler ma commande
            </button>
          )}
          {error && <p className="mt-2 text-[13px] text-[#b3261e]">{error}</p>}
        </div>
      )}

      <section className={card}>
        <h2 className="font-display text-lg font-bold text-[#002089] mb-4">Votre commande</h2>
        <ul className="flex flex-col gap-3">
          {order.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#3E2C23]">
                  {it.quantity} × {it.name}
                </p>
                {it.customizations.map((c, j) => (
                  <p key={j} className="text-xs text-[#7a6355]">
                    {c.kind === "remove" ? "Sans " : c.kind === "extra" ? "Extra " : ""}
                    {c.label}
                  </p>
                ))}
                {it.note && <p className="text-xs italic text-[#7a6355]">« {it.note} »</p>}
              </div>
              <span className="text-sm font-semibold text-[#3E2C23] shrink-0">
                {formatUsd(Number(it.line_total))}
              </span>
            </li>
          ))}
        </ul>
        <dl className="border-t border-[#e2d5c3] mt-4 pt-3 flex flex-col gap-1.5 text-sm">
          {Number(order.delivery_fee) > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-[#7a6355]">Livraison</dt>
              <dd className="text-[#3E2C23]">{formatUsd(Number(order.delivery_fee))}</dd>
            </div>
          )}
          {Number(order.tip) > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-[#7a6355]">Pourboire</dt>
              <dd className="text-[#3E2C23]">{formatUsd(Number(order.tip))}</dd>
            </div>
          )}
        </dl>
        <div className="flex items-center justify-between border-t border-[#e2d5c3] mt-3 pt-3">
          <span className="font-bold text-[#3E2C23]">Total</span>
          <span className="font-display text-lg font-bold text-[#3E2C23]">
            {formatUsd(Number(order.total))}
          </span>
        </div>
        <p className="text-xs text-[#7a6355] mt-2">
          {order.payment_status === "paid"
            ? "Payée."
            : `À régler à la remise${order.payment_method ? ` — ${PAY_LABEL[order.payment_method] ?? order.payment_method}` : ""}.`}
        </p>
      </section>
    </main>
  );
}

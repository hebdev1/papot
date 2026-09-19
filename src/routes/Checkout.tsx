import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatHtg, formatUsd, useUsdHtgRate } from "../lib/currency";
import { useCart } from "../lib/cart";
import { useAuth } from "../lib/auth";
import { emailReturnUrl } from "../lib/authRedirect";

const STEPS = ["Votre réservation", "Paiement", "Confirmation"];

const METHODS = [
  { id: "card", label: "Carte bancaire", sub: "Visa, Mastercard" },
  { id: "moncash", label: "MonCash", sub: "Depuis Haïti" },
  { id: "natcash", label: "NatCash", sub: "Depuis Haïti" },
];

/**
 * The instruments the demo gateway accepts.
 *
 * Shown on the page rather than hidden in a wiki: the point of a test gateway
 * is that anyone can walk the journey, including the refusals, without being
 * told which numbers to type. The database holds the same list and is what
 * actually decides — this is a legend, not a rule.
 */
const DEMO_CARDS = [
  { number: "4242 4242 4242 4242", outcome: "Paiement accepté", ok: true },
  { number: "4000 0000 0000 0002", outcome: "Carte refusée", ok: false },
  { number: "4000 0000 0000 9995", outcome: "Provision insuffisante", ok: false },
  { number: "4000 0000 0000 0069", outcome: "Carte expirée", ok: false },
];

const DEMO_MOBILE = [
  { number: "+509 0000 0000", outcome: "Paiement accepté", ok: true },
  { number: "+509 0000 0001", outcome: "Refusé par l'opérateur", ok: false },
  { number: "+509 0000 0002", outcome: "Solde insuffisant", ok: false },
];

const KIND_LABEL: Record<string, string> = {
  stay: "Hébergement",
  car: "Voiture",
  restaurant: "Restaurant",
};

const input =
  "w-full p-3.5 rounded-xl border-2 border-[#e2d5c3] focus:border-[#6ad7fb] bg-white text-sm text-[#002089] placeholder:text-[#b0a090] outline-none transition-colors";
const label = "text-[12.5px] font-semibold text-[#3E2C23]";

/** Canvas 1e — /checkout/:id, multi-service cart with a single payment. */
export function Checkout() {
  const navigate = useNavigate();
  const rate = useUsdHtgRate();
  const { items, total, clear } = useCart();
  const { user } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState("card");
  const [instrument, setInstrument] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<boolean | null>(null);
  // Coché par défaut : presque personne ne le décoche, et celui qui le décoche
  // est pressé — lui imposer un compte au moment le plus fragile du parcours
  // coûterait la vente. Sa réservation reste rattachable par courriel.
  const [createAccount, setCreateAccount] = useState(true);
  const [password, setPassword] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

  // Whether the demo gateway is open is a platform setting, and the table that
  // holds it is staff-only, so the page asks for the single boolean instead.
  useEffect(() => {
    let live = true;
    supabase.rpc("demo_payments_enabled").then(({ data }) => {
      if (live) setDemo(data === true);
    });
    return () => {
      live = false;
    };
  }, []);

  const isCard = method === "card";

  if (items.length === 0) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#002089]">Votre panier est vide</h1>
        <p className="text-[#7a6355] mt-2">Ajoutez un hébergement, une voiture ou une table pour continuer.</p>
        <Link
          to="/search?kind=stay"
          className="inline-block mt-5 bg-[#e76f2e] hover:bg-[#d05e20] text-white font-bold px-5 py-3 rounded-xl transition-colors"
        >
          Parcourir
        </Link>
      </main>
    );
  }

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // The gateway books and takes payment in one transaction. A refused
    // instrument leaves nothing behind — no booking, no payment row — so the
    // refusal path is the same code the real one will be.
    /**
     * Le compte d'abord, la réservation ensuite.
     *
     * Dans l'autre ordre, un échec de création laisse une réservation que
     * personne ne peut suivre — précisément le problème qu'on répare. Un compte
     * créé pour une réservation qui échoue ne coûte rien.
     *
     * Si la confirmation par courriel est exigée, signUp ne rend pas de session
     * et la réservation part sans propriétaire : elle porte l'adresse, et
     * claim_my_purchases() la rattachera à la première connexion.
     */
    if (!user && createAccount) {
      const { data: signUp, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: emailReturnUrl("/compte"),
          data: {
            full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            phone: phone.trim() ? `+509 ${phone.trim()}` : null,
          },
        },
      });

      // Supabase ne dit pas « cette adresse existe » — il rend un utilisateur
      // sans identité, pour ne pas laisser énumérer les comptes. C'est le seul
      // signal disponible, et il faut le lire plutôt que créer un doublon.
      const alreadyRegistered =
        signUpError?.message?.toLowerCase().includes("already") ||
        (signUp?.user && (signUp.user.identities?.length ?? 0) === 0);

      if (alreadyRegistered) {
        setBusy(false);
        setNeedsSignIn(true);
        setError(
          "Un compte existe déjà avec cette adresse. Connectez-vous pour que la réservation s'y ajoute.",
        );
        return;
      }
      if (signUpError) {
        setBusy(false);
        setError(
          signUpError.message.toLowerCase().includes("password")
            ? "Le mot de passe doit faire au moins 8 caractères."
            : "Le compte n'a pas pu être créé. Réessayez, ou décochez la case pour continuer sans compte.",
        );
        return;
      }
    }

    const { data, error } = await supabase.rpc("demo_checkout", {
      p_number: instrument.trim(),
      p_payload: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        payment_method: method,
        items: items.map(i => ({
          kind: i.kind,
          listing_id: i.listing_id,
          unit_id: i.unit_id ?? null,
          title: i.title,
          detail: i.detail,
          amount: i.amount,
          package_id: i.package_id ?? null,
          // Structured dates let the customer panel compute countdowns.
          starts_on: i.starts_on ?? null,
          ends_on: i.ends_on ?? null,
          start_time: i.start_time ?? null,
          party: i.party ?? null,
        })),
      },
    });

    setBusy(false);
    if (error || !data) {
      console.error("Booking failed:", error);
      // The gateway answers in French and says why — "Carte refusée par la
      // banque", "Provision insuffisante". Replacing that with a generic
      // sentence would throw away the only useful part of a decline.
      setError(error?.message || "Le paiement n'a pas pu être finalisé. Réessayez.");
      return;
    }

    const reference = (data as { reference: string }).reference;
    clear();
    navigate(`/booking/${reference}/confirmed`);
  };

  const byKind = (kind: string) => items.filter(i => i.kind === kind).reduce((s, i) => s + i.amount, 0);

  return (
    <main className="max-w-6xl mx-auto px-4 lg:px-8 py-8 lg:py-10">
      <div className="flex items-center gap-2 text-sm mb-8">
        <span className="font-display font-bold text-[#002089]">Paiement sécurisé</span>
        <span className="flex-1" />
        {STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                i === 0 ? "bg-[#002089] text-white" : "bg-[#e2d5c3] text-[#7a6355]"
              }`}
            >
              {i + 1}
            </span>
            <span className={i === 0 ? "text-[#002089] font-semibold" : "text-[#7a6355]"}>{s}</span>
          </span>
        ))}
      </div>

      <form onSubmit={pay} className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <section className="bg-white rounded-2xl border border-[#e2d5c3] p-6">
            <h2 className="font-display text-xl font-bold text-[#002089] mb-4">Votre voyage</h2>
            <div className="flex flex-col gap-3">
              {items.map(i => (
                <div key={i.kind} className="flex items-start justify-between gap-4 pb-3 border-b border-[#e2d5c3] last:border-0 last:pb-0">
                  <div>
                    <p className="font-display font-bold text-[#3E2C23]">{i.title}</p>
                    <p className="text-xs text-[#7a6355] mt-0.5">{i.detail}</p>
                  </div>
                  <span className="text-sm font-semibold text-[#3E2C23] shrink-0">
                    {i.amount > 0 ? formatUsd(i.amount) : "Sans frais"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-[#e2d5c3] p-6">
            <h2 className="font-display text-xl font-bold text-[#002089] mb-4">Coordonnées du voyageur</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className={label}>Prénom</span>
                <input required placeholder="Roselaine" value={firstName} onChange={e => setFirstName(e.target.value)} className={input} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={label}>Nom</span>
                <input required placeholder="Duval" value={lastName} onChange={e => setLastName(e.target.value)} className={input} />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <span className={label}>Courriel</span>
                <input required type="email" placeholder="r.duval@exemple.com" value={email} onChange={e => setEmail(e.target.value)} className={input} />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <span className={label}>Téléphone · WhatsApp</span>
                <div className="flex gap-2">
                  <span className="flex items-center px-3.5 rounded-xl border-2 border-[#e2d5c3] bg-white text-sm font-semibold text-[#7a6355]">
                    +509
                  </span>
                  <input required placeholder="3712 4408" value={phone} onChange={e => setPhone(e.target.value)} className={input} />
                </div>
              </div>
            </div>

            {/* Rien de tout cela pour quelqu'un déjà connecté : sa réservation
                lui appartient dès qu'elle est écrite. */}
            {!user && (
              <div className="mt-5 pt-5 border-t border-[#e2d5c3]">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createAccount}
                    onChange={e => {
                      setCreateAccount(e.target.checked);
                      setNeedsSignIn(false);
                      setError(null);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#002089]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#3E2C23]">
                      Créer mon compte pour suivre cette réservation
                    </span>
                    <span className="block text-xs text-[#7a6355] mt-0.5 leading-relaxed">
                      Vous retrouvez vos réservations, vos messages et vos reçus dans votre espace.
                    </span>
                  </span>
                </label>

                {createAccount && (
                  <div className="mt-3 flex flex-col gap-1.5 max-w-sm">
                    <span className={label}>Mot de passe</span>
                    <input
                      required
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="8 caractères minimum"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={input}
                    />
                  </div>
                )}

                {!createAccount && (
                  <p className="mt-3 text-xs text-[#7a6355] bg-[#DAF5FE] rounded-xl p-3 leading-relaxed">
                    Sans compte, la réservation part quand même et la référence vous est envoyée par
                    courriel. Si vous créez un compte plus tard avec cette adresse, elle s'y ajoutera
                    toute seule.
                  </p>
                )}

                {needsSignIn && (
                  <Link
                    to={`/login?next=${encodeURIComponent(window.location.pathname)}`}
                    className="inline-block mt-3 text-sm font-semibold text-[#002089] underline"
                  >
                    Se connecter avec cette adresse
                  </Link>
                )}
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-[#e2d5c3] p-6">
            <h2 className="font-display text-xl font-bold text-[#002089] mb-4">Moyen de paiement</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {METHODS.map(m => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${
                    method === m.id ? "border-[#002089] bg-[#EAF8FF]" : "border-[#e2d5c3] hover:border-[#002089]"
                  }`}
                >
                  <p className="font-semibold text-sm text-[#3E2C23]">{m.label}</p>
                  <p className="text-xs text-[#7a6355] mt-0.5">{m.sub}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-3 mt-4">
              <div className="col-span-4 flex flex-col gap-1.5">
                <label className={label} htmlFor="instrument">
                  {isCard ? "Numéro de carte" : "Numéro du compte"}
                </label>
                <input
                  id="instrument"
                  value={instrument}
                  onChange={e => setInstrument(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={isCard ? "4242 4242 4242 4242" : "+509 0000 0000"}
                  className={input}
                />
              </div>
              {isCard && (
                <>
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <label className={label} htmlFor="expiry">MM / AA</label>
                    <input
                      id="expiry"
                      value={expiry}
                      onChange={e => setExpiry(e.target.value)}
                      placeholder="12 / 30"
                      autoComplete="off"
                      className={input}
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <label className={label} htmlFor="cvc">CVC</label>
                    <input
                      id="cvc"
                      value={cvc}
                      onChange={e => setCvc(e.target.value)}
                      placeholder="123"
                      inputMode="numeric"
                      autoComplete="off"
                      className={input}
                    />
                  </div>
                </>
              )}
            </div>

            {/* The expiry and CVC are collected because a payment form that did
                not ask for them would not be the form we are testing. The demo
                gateway ignores them: only the number decides, so every outcome
                is reachable without memorising a second field. */}
            {demo === true ? (
              <div className="mt-4 bg-[#DAF5FE] rounded-xl p-4">
                <p className="text-[13px] font-bold text-[#3E2C23]">
                  Mode démonstration — aucun argent ne circule
                </p>
                <p className="text-xs text-[#7a6355] mt-1 leading-relaxed">
                  Aucune vraie carte n'est acceptée et rien n'est débité. Utilisez l'un de ces
                  numéros pour parcourir le site comme un client, y compris les refus.
                </p>
                <ul className="mt-3 flex flex-col gap-1">
                  {(isCard ? DEMO_CARDS : DEMO_MOBILE).map(d => (
                    <li key={d.number} className="flex items-center justify-between gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setInstrument(d.number)}
                        className="font-mono font-semibold text-[#002089] hover:underline"
                      >
                        {d.number}
                      </button>
                      <span className={d.ok ? "text-[#15803d]" : "text-[#b3261e]"}>{d.outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-[#7a6355] mt-4 bg-[#DAF5FE] rounded-xl p-3 leading-relaxed">
                Passerelle de paiement à confirmer — section 6.1 du spec. Aucun débit réel n'est
                effectué.
              </p>
            )}
          </section>
        </div>

        <aside className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-24">
          <div className="bg-white rounded-2xl border border-[#e2d5c3] p-6">
            <h2 className="font-display text-xl font-bold text-[#002089] mb-4">Récapitulatif</h2>
            <div className="flex flex-col gap-2 text-sm">
              {(["stay", "car", "restaurant"] as const)
                .filter(k => items.some(i => i.kind === k))
                .map(k => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-[#7a6355]">{KIND_LABEL[k]}</span>
                    <span className="text-[#3E2C23] font-medium">{formatUsd(byKind(k))}</span>
                  </div>
                ))}
              <div className="border-t border-[#e2d5c3] pt-2.5 mt-1 flex items-center justify-between">
                <span className="font-display font-bold text-[#3E2C23]">À payer</span>
                <span className="font-display font-bold text-xl text-[#3E2C23]">{formatUsd(total)}</span>
              </div>
              <p className="text-xs text-[#7a6355]">≈ {formatHtg(total, rate)}</p>
            </div>

            {error && (
              <p className="text-[13px] text-[#b3261e] bg-[#fdecea] border border-[#f5c2bd] rounded-xl px-3.5 py-2.5 mt-4">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full mt-4 py-3.5 rounded-xl bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-50 text-white font-display font-bold text-[15px] shadow-[0_6px_18px_rgba(231,111,46,.3)] transition-colors"
            >
              {busy ? "Traitement…" : `Payer ${formatUsd(total)}`}
            </button>

            <p className="text-xs text-[#7a6355] mt-3 leading-relaxed">
              Annulation gratuite jusqu'à 24 h avant l'arrivée pour l'hébergement. Chaque prestataire applique sa
              propre politique.
            </p>
            <p className="text-xs text-[#7a6355] mt-2 leading-relaxed">
              En payant, vous acceptez les conditions générales de PAPOT.
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}

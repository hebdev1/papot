import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabase";
import { formatUsd } from "../../lib/currency";
import {
  busDuration,
  busTime,
  busArrival,
  useRefundQuote,
  cancelTicketByToken,
  useReviewState,
  submitReviewByToken,
} from "../../lib/bus";

/**
 * Un billet, ouvert depuis son propre lien.
 *
 * The URL carries a 128-bit token and nothing else, which is the whole
 * credential — `bus_ticket_by_token` takes no email beside it, unlike
 * `get_booking`, because a token is not a short readable reference someone can
 * guess their way through.
 *
 * It is built to be looked at on a phone at a gare, in daylight, by someone
 * holding a bag: the QR is the largest thing on the screen, the seat and the
 * time are next, and everything else is below the fold. `print:` rules make the
 * browser's own Print produce the same thing on paper, so "download" needs no
 * second implementation of the layout.
 */

type Ticket = {
  ticket_no: string;
  qr_code: string;
  status: string;
  passenger: string;
  seat: string | null;
  fare_class: string;
  amount: number;
  checked_in_at: string | null;
  route: string;
  operator: string;
  departs_on: string;
  departs_at: string;
  duration_minutes: number;
  departure_status: string;
  delayed_to: string | null;
  delay_reason: string | null;
  reference: string;
  origin: {
    city: string;
    terminal: string;
    address: string | null;
    arrive_minutes_before: number;
    instructions: string | null;
  } | null;
  destination: { city: string; terminal: string } | null;
};

const FARE_LABEL: Record<string, string> = {
  standard: "Plein tarif",
  child: "Enfant",
  senior: "Senior",
  promo: "Promotion",
  vip: "VIP",
};

export function BusTicket() {
  const { token } = useParams<{ token: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);

  const load = useCallback(() => {
    void supabase
      .rpc("bus_ticket_by_token" as never, { p_token: token } as never)
      .then(({ data, error }) => {
        if (error) console.error("bus_ticket_by_token failed:", error);
        setTicket((data as Ticket | null) ?? null);
        setLoading(false);
      });
  }, [token]);

  useEffect(load, [load]);

  // Drawn locally from the code the server gave us: the QR never travels as an
  // image, so no third party ever sees a ticket's credential in a URL.
  useEffect(() => {
    if (!ticket || !canvas.current) return;
    void QRCode.toCanvas(canvas.current, ticket.qr_code, {
      width: 260,
      margin: 1,
      color: { dark: "#002089ff", light: "#ffffffff" },
    });
  }, [ticket]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="h-96 rounded-2xl bg-white/60 animate-pulse" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <span className="text-4xl block mb-3" aria-hidden>🎫</span>
        <h1 className="font-display text-2xl font-bold text-[#002089] mb-2">
          Ce billet est introuvable
        </h1>
        <p className="text-[#7a6355] text-sm mb-6">
          Le lien est peut-être incomplet. Vérifiez le courriel que nous vous avons envoyé,
          ou retrouvez vos billets depuis la page de confirmation avec votre référence.
        </p>
        <Link
          to="/bus"
          className="inline-flex bg-[#002089] hover:bg-[#001b6e] text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          Chercher un autocar
        </Link>
      </div>
    );
  }

  const arrival = busArrival(ticket.departs_at, ticket.duration_minutes);
  const cancelled = ticket.status === "cancelled" || ticket.status === "refunded";
  const departureOff = ticket.departure_status === "cancelled";
  const used = ticket.status === "checked_in";

  return (
    <div className="max-w-md mx-auto px-4 py-6 lg:py-10 print:max-w-none print:py-0">
      <div className="bg-white rounded-2xl border border-[#e2d5c3] overflow-hidden print:border-0">
        <div className="bg-[#002089] px-5 py-4 flex items-center justify-between print:bg-white print:border-b print:border-black">
          <div>
            <p className="font-display font-black text-white text-lg print:text-black">PAPOT</p>
            <p className="text-[#a8d8f0] text-[12px] print:text-black">Billet d'autocar</p>
          </div>
          <p className="font-mono text-white text-sm tracking-wide print:text-black">
            {ticket.ticket_no}
          </p>
        </div>

        {(cancelled || departureOff) && (
          <div className="bg-[#fdecea] border-b border-[#f5c2bd] px-5 py-3 text-[13px] text-[#b3261e]">
            {departureOff
              ? "Ce départ a été annulé par la compagnie. Ce billet ne permet pas d'embarquer."
              : "Ce billet a été annulé."}
          </div>
        )}
        {used && !cancelled && !departureOff && (
          <div className="bg-[#E9F9FE] border-b border-[#c8e6f5] px-5 py-3 text-[13px] text-[#00508a]">
            Déjà embarqué
            {ticket.checked_in_at &&
              ` le ${new Date(ticket.checked_in_at).toLocaleString("fr-FR", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}`}
            . Ce QR ne peut plus servir.
          </div>
        )}
        {ticket.delayed_to && (
          <div className="bg-[#fff8e1] border-b border-[#f0dca8] px-5 py-3 text-[13px] text-[#8a6d1f]">
            Départ retardé : {busTime(ticket.departs_at)} →{" "}
            <strong>{busTime(ticket.delayed_to)}</strong>
            {ticket.delay_reason ? ` — ${ticket.delay_reason}` : ""}
          </div>
        )}

        <div className="px-5 py-5">
          <h1 className="font-display text-xl font-bold text-[#002089]">{ticket.route}</h1>
          <p className="text-[13px] text-[#7a6355] mt-0.5">
            {ticket.operator} ·{" "}
            {new Date(`${ticket.departs_on}T12:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>

          <div className="grid grid-cols-3 gap-2 mt-5 pb-5 border-b border-[#e2d5c3]">
            <Fact label="Départ" value={busTime(ticket.departs_at)} big />
            <Fact
              label="Arrivée"
              value={`${arrival.label}${arrival.nextDay ? " +1" : ""}`}
              big
            />
            <Fact label="Place" value={ticket.seat ?? "—"} big />
          </div>

          {/* The thing an agent actually scans. */}
          <div className="flex flex-col items-center py-6">
            <canvas
              ref={canvas}
              className={cancelled || departureOff || used ? "opacity-25" : ""}
              aria-label="QR code du billet"
            />
            <p className="text-[12px] text-[#7a6355] mt-3 text-center max-w-[260px]">
              Présentez ce QR à l'embarquement. Il n'est valable qu'une fois.
            </p>
          </div>

          <dl className="text-[13px] flex flex-col gap-2 pt-4 border-t border-[#e2d5c3]">
            <Line label="Passager" value={ticket.passenger} />
            {ticket.origin && (
              <Line
                label="Gare de départ"
                value={`${ticket.origin.terminal} — ${ticket.origin.city}`}
              />
            )}
            {ticket.origin?.address && <Line label="Adresse" value={ticket.origin.address} />}
            {ticket.destination && (
              <Line
                label="Arrivée"
                value={`${ticket.destination.terminal} — ${ticket.destination.city}`}
              />
            )}
            <Line label="Durée" value={busDuration(ticket.duration_minutes)} />
            <Line
              label="Tarif"
              value={`${FARE_LABEL[ticket.fare_class] ?? ticket.fare_class} · ${formatUsd(ticket.amount)}`}
            />
            <Line label="Référence" value={ticket.reference} />
          </dl>

          {ticket.origin && (
            <p className="mt-4 bg-[#E9F9FE] rounded-xl px-3.5 py-3 text-[12.5px] text-[#00508a] leading-relaxed">
              Présentez-vous à la gare{" "}
              <strong>{ticket.origin.arrive_minutes_before} minutes avant le départ</strong>, avec
              une pièce d'identité au nom du billet.
              {ticket.origin.instructions ? ` ${ticket.origin.instructions}` : ""}
            </p>
          )}
        </div>
      </div>

      {!cancelled && !used && token && (
        <CancelTicket token={token} onCancelled={load} />
      )}

      {token && <LeaveReview token={token} />}

      <div className="flex gap-2 mt-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex-1 bg-[#002089] hover:bg-[#001b6e] text-white font-bold py-3 rounded-xl transition-colors"
        >
          Imprimer / enregistrer en PDF
        </button>
      </div>
      <p className="text-[12px] text-[#7a6355] text-center mt-3 print:hidden">
        Gardez ce lien : il ouvre votre billet sans mot de passe.
      </p>
    </div>
  );
}

function Fact({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#7a6355]">{label}</p>
      <p
        className={`font-display font-bold text-[#3E2C23] tabular-nums ${
          big ? "text-xl" : "text-base"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[#7a6355] shrink-0">{label}</dt>
      <dd className="text-[#3E2C23] font-medium text-right">{value}</dd>
    </div>
  );
}

/**
 * Annuler son billet, en sachant d'avance ce qu'on récupère.
 *
 * The figure shown is the one the server will apply: it comes from
 * `bus_ticket_refund_quote`, the same function the write path calls. Showing a
 * number computed in the browser and then refunding a different one is how a
 * cancellation screen becomes a complaint.
 *
 * A refund of nothing is still offered, and said plainly rather than hidden —
 * cancelling late frees the seat for somebody else and stops the passenger
 * being marked a no-show, which is worth doing even when no money comes back.
 */
function CancelTicket({ token, onCancelled }: { token: string; onCancelled: () => void }) {
  const { quote, loading } = useRefundQuote(token);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ refund: number; reference: string } | null>(null);

  if (done) {
    return (
      <div className="mt-4 rounded-2xl border border-[#e2d5c3] bg-white p-5 print:hidden">
        <p className="font-display font-bold text-[#002089] mb-1">Billet annulé</p>
        <p className="text-[13px] text-[#3E2C23]">
          {done.refund > 0 ? (
            <>
              Un remboursement de <strong>{formatUsd(done.refund)}</strong> a été demandé
              (référence {done.reference}). Il sera traité par PAPOT sous quelques jours
              ouvrables.
            </>
          ) : (
            <>
              Aucun remboursement n'était dû à ce stade. Votre place a été remise en vente.
            </>
          )}
        </p>
      </div>
    );
  }

  if (loading || !quote) return null;
  if (quote.outcome !== "REFUNDABLE" && quote.outcome !== "FULL_REFUND") return null;

  const nothingBack = quote.refund <= 0;

  return (
    <div className="mt-4 rounded-2xl border border-[#e2d5c3] bg-white p-5 print:hidden">
      {!open ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-bold text-[#3E2C23]">Besoin d'annuler ?</p>
            <p className="text-[12.5px] text-[#7a6355] mt-0.5">
              {nothingBack
                ? "Plus de remboursement à ce stade, mais votre place sera libérée."
                : `${formatUsd(quote.refund)} vous seraient remboursés.`}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 text-[13px] font-bold text-[#b3261e] hover:underline"
          >
            Annuler
          </button>
        </div>
      ) : (
        <>
          <p className="font-display font-bold text-[#002089] mb-2">Annuler ce billet</p>

          <dl className="text-[13px] flex flex-col gap-1.5 mb-3">
            <Line label="Payé" value={formatUsd(quote.amount_paid)} />
            <Line
              label="Remboursement"
              value={`${quote.refund_percent} % · ${formatUsd(quote.refund)}`}
            />
            {quote.fee > 0 && <Line label="Frais d'annulation" value={`− ${formatUsd(quote.fee)}`} />}
            <Line label="Retenu" value={formatUsd(quote.kept)} />
          </dl>

          {quote.floored_by_platform && (
            <p className="text-[12px] text-[#00508a] bg-[#E9F9FE] rounded-xl px-3 py-2 mb-3">
              PAPOT applique un remboursement minimum de {quote.refund_percent} % parce que
              vous annulez plus de {Math.floor(quote.hours_before)} heures avant le départ.
            </p>
          )}
          {nothingBack && (
            <p className="text-[12px] text-[#8a6d1f] bg-[#fff8e1] rounded-xl px-3 py-2 mb-3">
              Le départ est trop proche pour un remboursement. Vous pouvez tout de même
              annuler : la place repartira à la vente.
            </p>
          )}

          <label className="block text-[12px] font-bold text-[#7a6355] mb-1">
            Motif (facultatif)
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-[#e2d5c3] px-3 py-2 text-[13px] mb-3"
            placeholder="Un imprévu, un changement de date…"
          />

          {error && (
            <p className="text-[12.5px] text-[#b3261e] bg-[#fdecea] rounded-xl px-3 py-2 mb-3">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const r = await cancelTicketByToken(token, reason);
                  setDone({ refund: Number(r.refund), reference: r.refund_reference });
                  onCancelled();
                } catch (e) {
                  setError((e as { message?: string }).message ?? "L'annulation a échoué.");
                  setBusy(false);
                }
              }}
              className="flex-1 bg-[#b3261e] hover:bg-[#8f1e18] disabled:opacity-60 text-white font-bold py-2.5 rounded-xl transition-colors text-[14px]"
            >
              {busy ? "Annulation…" : "Confirmer l'annulation"}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-[#e2d5c3] text-[14px] font-bold text-[#3E2C23]"
            >
              Garder
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Laisser un avis, depuis le billet, une fois le voyage fait.
 *
 * The server decides whether the form may appear at all — `bus_review_state`
 * answers travelled / already / cancelled — rather than this component
 * guessing from the dates it happens to have. The write path enforces the same
 * rules, so a stale page cannot slip a review past them.
 *
 * The four sub-scores are optional and start unset. A default of 5 would
 * manufacture praise nobody gave, and a default of 0 would be a complaint; an
 * unanswered question has to stay unanswered.
 */
function LeaveReview({ token }: { token: string }) {
  const { state, reload } = useReviewState(token);
  const [rating, setRating] = useState(0);
  const [subs, setSubs] = useState<Record<string, number>>({});
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="mt-4 rounded-2xl border border-[#e2d5c3] bg-white p-5 print:hidden">
        <p className="font-display font-bold text-[#002089] mb-1">Merci pour votre avis</p>
        <p className="text-[13px] text-[#3E2C23]">
          Il sera publié après vérification par PAPOT.
        </p>
      </div>
    );
  }

  if (!state) return null;
  if (state.already) {
    return (
      <div className="mt-4 rounded-2xl border border-[#e2d5c3] bg-white p-5 print:hidden">
        <p className="text-[13px] text-[#7a6355]">
          Vous avez déjà laissé un avis pour ce trajet. Merci.
        </p>
      </div>
    );
  }
  if (!state.can_review) return null;

  const SUBS: [string, string][] = [
    ["punctuality", "Ponctualité"],
    ["comfort", "Confort"],
    ["cleanliness", "Propreté"],
    ["service", "Service"],
  ];

  return (
    <div className="mt-4 rounded-2xl border border-[#e2d5c3] bg-white p-5 print:hidden">
      <p className="font-display font-bold text-[#002089] mb-1">Comment s'est passé le voyage ?</p>
      <p className="text-[12.5px] text-[#7a6355] mb-3">
        Votre avis aide les prochains passagers à choisir.
      </p>

      <Stars value={rating} onChange={setRating} label="Note générale" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 mb-3">
        {SUBS.map(([key, label]) => (
          <Stars
            key={key}
            value={subs[key] ?? 0}
            onChange={v => setSubs(s => ({ ...s, [key]: v }))}
            label={label}
            small
          />
        ))}
      </div>

      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-[#e2d5c3] px-3 py-2 text-[13px] mb-3"
        placeholder="Parti à l'heure ? Le chauffeur, la climatisation, la gare…"
      />

      {error && (
        <p className="text-[12.5px] text-[#b3261e] bg-[#fdecea] rounded-xl px-3 py-2 mb-3">{error}</p>
      )}

      <button
        disabled={busy || rating < 1}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await submitReviewByToken(token, rating, {
              body,
              punctuality: subs.punctuality || null,
              comfort: subs.comfort || null,
              cleanliness: subs.cleanliness || null,
              service: subs.service || null,
            });
            setSent(true);
            reload();
          } catch (e) {
            setError((e as { message?: string }).message ?? "L'envoi a échoué.");
            setBusy(false);
          }
        }}
        className="w-full bg-[#002089] hover:bg-[#001b6e] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors text-[14px]"
      >
        {busy ? "Envoi…" : rating < 1 ? "Choisissez une note" : "Envoyer mon avis"}
      </button>
    </div>
  );
}

function Stars({
  value,
  onChange,
  label,
  small,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  small?: boolean;
}) {
  return (
    <div>
      <p className={`font-bold text-[#7a6355] ${small ? "text-[11px]" : "text-[12px]"} mb-0.5`}>
        {label}
      </p>
      <div className="flex gap-0.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} sur 5`}
            onClick={() => onChange(n)}
            className={`${small ? "text-lg" : "text-2xl"} leading-none transition-colors ${
              n <= value ? "text-[#f0a500]" : "text-[#e2d5c3] hover:text-[#d9c3a5]"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

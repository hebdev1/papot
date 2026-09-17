import * as React from "react";
import { CheckCircle2, CreditCard, Smartphone } from "lucide-react";
import { cn } from "../../lib/utils";
import { formatUsd } from "../../lib/currency";

/**
 * A receipt drawn as a ticket.
 *
 * Adapted from a shadcn component. PAPOT is not a shadcn project — it has no
 * `bg-card`, `text-muted-foreground` or `border-border`, and in Tailwind v4 a
 * utility that is not defined simply does not exist, so the original rendered
 * with no ground and no border. Rather than drag a second colour system into a
 * project that already has one, it wears PAPOT's: cream, brand blue, the warm
 * border, the same ink as every other card.
 *
 * The confetti is opt-in. It belongs to the moment money changes hands, not to
 * a receipt someone opens in March to check what they paid in January.
 */

export type TicketMethod = "card" | "mobile_money" | "bank_transfer" | "cash";

export interface TicketReceiptProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The payment's own reference — what support will ask for. */
  reference: string;
  amount: number;
  date: Date;
  payerName: string;
  method: TicketMethod;
  /** The four digits kept of the instrument, when there are any. */
  last4?: string | null;
  /** Printed under the barcode: the booking this paid for. */
  barcodeValue: string;
  title?: string;
  subtitle?: string;
  /** Fires the confetti once. For the moment of purchase only. */
  celebrate?: boolean;
  /** The ground the notches are cut out of. Match the surface behind the card. */
  notchClass?: string;
}

const METHOD_LABEL: Record<TicketMethod, string> = {
  card: "Carte bancaire",
  mobile_money: "Paiement mobile",
  bank_transfer: "Virement",
  cash: "Espèces",
};

/* ── the barcode ──────────────────────────────────────────────────────────
   Bars are derived from the value, so the same reference always draws the
   same code. A random barcode would change on every render and look like a
   defect. It is decoration, not a scannable symbology — the reference is
   printed underneath, which is what anyone actually reads out.               */

const hash = (s: string) =>
  s.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);

function Barcode({ value }: { value: string }) {
  const seed = hash(value);
  const rand = (n: number) => {
    const x = Math.sin(seed + n) * 10000;
    return x - Math.floor(x);
  };

  const bars = Array.from({ length: 56 }, (_, i) => (rand(i) > 0.7 ? 2.5 : 1.5));
  const gap = 1.5;
  const width = 250;
  const total = bars.reduce((a, w) => a + w + gap, 0) - gap;
  let x = (width - total) / 2;

  return (
    <div className="flex flex-col items-center pt-1">
      <svg
        width={width}
        height={62}
        viewBox={`0 0 ${width} 62`}
        role="img"
        aria-label={`Code-barres de la référence ${value}`}
        className="fill-[#3E2C23]"
      >
        {bars.map((w, i) => {
          const at = x;
          x += w + gap;
          return <rect key={i} x={at} y={8} width={w} height={44} />;
        })}
      </svg>
      <p className="mt-2 font-mono text-[13px] tracking-[0.22em] text-[#7a6355]">{value}</p>
    </div>
  );
}

/* ── confetti ─────────────────────────────────────────────────────────── */

function Confetti() {
  const colors = ["#002089", "#e76f2e", "#6ad7fb", "#15803d", "#eab308"];
  const pieces = React.useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 2.5 + Math.random() * 2.5,
        rotate: Math.random() * 360,
        color: colors[i % colors.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <>
      <style>{`
        @keyframes papot-confetti {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .papot-confetti-piece { display: none; }
        }
      `}</style>
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
        {pieces.map((p, i) => (
          <div
            key={i}
            className="papot-confetti-piece absolute h-4 w-2"
            style={{
              left: `${p.left}%`,
              top: "-10%",
              backgroundColor: p.color,
              transform: `rotate(${p.rotate}deg)`,
              animation: `papot-confetti ${p.duration}s ${p.delay}s linear forwards`,
            }}
          />
        ))}
      </div>
    </>
  );
}

/* ── the ticket ───────────────────────────────────────────────────────── */

export const TicketReceipt = React.forwardRef<HTMLDivElement, TicketReceiptProps>(
  (
    {
      className,
      reference,
      amount,
      date,
      payerName,
      method,
      last4,
      barcodeValue,
      title = "Paiement reçu",
      subtitle = "Votre reçu, à garder.",
      celebrate = false,
      notchClass = "bg-[#F5E9D8]",
      ...props
    },
    ref,
  ) => {
    const [confetti, setConfetti] = React.useState(false);

    React.useEffect(() => {
      if (!celebrate) return;
      const on = setTimeout(() => setConfetti(true), 120);
      const off = setTimeout(() => setConfetti(false), 6000);
      return () => {
        clearTimeout(on);
        clearTimeout(off);
      };
    }, [celebrate]);

    const Glyph = method === "card" ? CreditCard : Smartphone;

    const when = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);

    return (
      <>
        {confetti && <Confetti />}

        <div
          ref={ref}
          className={cn(
            "relative z-10 w-full max-w-sm rounded-2xl border border-[#e2d5c3] bg-white shadow-lg",
            className,
          )}
          {...props}
        >
          {/* The notches read as a torn stub only if they are the colour of
              what is behind the card, so the ground is a prop. */}
          <div className={cn("absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full", notchClass)} />
          <div className={cn("absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full", notchClass)} />

          <div className="flex flex-col items-center px-7 pt-7 text-center">
            <span className="grid h-14 w-14 place-content-center rounded-full bg-[#EAF8FF]">
              <CheckCircle2 className="h-7 w-7 text-[#002089]" aria-hidden />
            </span>
            <h3 className="mt-3 font-display text-xl font-bold text-[#3E2C23]">{title}</h3>
            <p className="mt-1 text-sm text-[#7a6355]">{subtitle}</p>
          </div>

          <div className="space-y-5 px-7 pb-7 pt-5">
            <div className="border-t-2 border-dashed border-[#e2d5c3]" aria-hidden />

            <dl className="grid grid-cols-2 gap-4 text-left">
              <div className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-[#7a6355]">Référence</dt>
                <dd className="truncate font-mono text-[13px] font-medium text-[#3E2C23]">{reference}</dd>
              </div>
              <div className="text-right">
                <dt className="text-[11px] uppercase tracking-wide text-[#7a6355]">Montant</dt>
                <dd className="font-display text-lg font-bold tabular-nums text-[#3E2C23]">
                  {formatUsd(amount)}
                </dd>
              </div>
            </dl>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#7a6355]">Date et heure</p>
              <p className="text-sm font-medium text-[#3E2C23]">{when}</p>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-[#F5E9D8] p-4">
              <Glyph className="h-5 w-5 shrink-0 text-[#002089]" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#3E2C23]">{payerName}</p>
                <p className="font-mono text-[13px] tracking-wider text-[#7a6355]">
                  {/* The brand is not stored, so none is drawn: a Mastercard
                      logo over a Visa would be a small lie on a receipt. */}
                  {METHOD_LABEL[method]}
                  {last4 ? ` · •••• ${last4}` : ""}
                </p>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-[#e2d5c3]" aria-hidden />

            <Barcode value={barcodeValue} />
          </div>
        </div>
      </>
    );
  },
);

TicketReceipt.displayName = "TicketReceipt";

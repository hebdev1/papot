import { parseDay } from "../../lib/panel";
import {
  AlertTriangle,
  BedDouble,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  Star,
  Luggage,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";

/**
 * Status system (spec §14). Never colour alone — every badge carries an icon
 * and a word, so meaning survives colour blindness and greyscale printing.
 */
export type StatusTone = "positive" | "neutral" | "warning" | "negative";

const TONE: Record<StatusTone, { cls: string; Icon: typeof CheckCircle2 }> = {
  positive: { cls: "bg-green-50 text-[#15803d] border-green-200", Icon: CheckCircle2 },
  neutral: { cls: "bg-[#F5E9D8] text-[#7a6355] border-[#e2d5c3]", Icon: Clock },
  warning: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertTriangle },
  negative: { cls: "bg-red-50 text-[#b3261e] border-red-200", Icon: XCircle },
};

/** Maps the booking vocabulary onto a tone, so callers pass a status not a colour. */
const STATUS_TONE: Record<string, StatusTone> = {
  confirmed: "positive",
  completed: "positive",
  paid: "positive",
  pending: "neutral",
  awaiting: "neutral",
  processing: "neutral",
  payment_required: "warning",
  action_needed: "warning",
  verification_required: "warning",
  cancelled: "negative",
  payment_failed: "negative",
  rejected: "negative",
  expired: "negative",
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmé",
  completed: "Terminé",
  paid: "Payé",
  pending: "En attente",
  awaiting: "En attente de confirmation",
  processing: "En traitement",
  payment_required: "Paiement requis",
  action_needed: "Action requise",
  verification_required: "Vérification requise",
  cancelled: "Annulé",
  payment_failed: "Paiement échoué",
  rejected: "Refusé",
  expired: "Expiré",
};

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  const { cls, Icon } = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls} ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Service icons (spec §46) — one icon per service, used everywhere. */
export const SERVICE = {
  stay: { label: "Hébergement", Icon: BedDouble },
  car: { label: "Voiture", Icon: Car },
  restaurant: { label: "Restaurant", Icon: UtensilsCrossed },
  trip: { label: "Voyage", Icon: Luggage },
  payment: { label: "Paiement", Icon: CreditCard },
  review: { label: "Avis", Icon: Star },
} as const;

export type ServiceKind = keyof typeof SERVICE;

export function ServiceBadge({ kind }: { kind: ServiceKind }) {
  const { label, Icon } = SERVICE[kind];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7a6355]">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

/** Countdown (spec §4): "Check-in in 10 days", phrased in French. */
export function CountdownBadge({ date }: { date: string }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((parseDay(date).getTime() - today.getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return null;

  const text =
    days > 1 ? `Arrivée dans ${days} jours`
    : days === 1 ? "Arrivée demain"
    : days === 0 ? "Arrivée aujourd'hui"
    : "Séjour passé";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF8FF] px-3 py-1 text-xs font-semibold text-[#00508a]">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

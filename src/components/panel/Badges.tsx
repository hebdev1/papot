import {
  AlertTriangle,
  BedDouble,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  Luggage,
  Star,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { Badge } from "../ui/cvui-badge";
import { parseDay } from "../../lib/panel";

/**
 * Every badge on the site routes through the shared `Badge` component, so
 * status, service and countdown pills share one shape, one motion and one
 * palette instead of each growing its own.
 *
 * Status is never colour alone (spec §14): each variant also carries an icon
 * and a word.
 */

type Variant = "primary" | "secondary" | "success" | "warning" | "error" | "info";

const STATUS: Record<string, { variant: Variant; label: string; Icon: typeof CheckCircle2 }> = {
  confirmed: { variant: "success", label: "Confirmé", Icon: CheckCircle2 },
  completed: { variant: "success", label: "Terminé", Icon: CheckCircle2 },
  paid: { variant: "success", label: "Payé", Icon: CheckCircle2 },

  pending: { variant: "secondary", label: "En attente", Icon: Clock },
  awaiting: { variant: "secondary", label: "En attente de confirmation", Icon: Clock },
  processing: { variant: "secondary", label: "En traitement", Icon: Clock },

  payment_required: { variant: "warning", label: "Paiement requis", Icon: AlertTriangle },
  action_needed: { variant: "warning", label: "Action requise", Icon: AlertTriangle },
  verification_required: { variant: "warning", label: "Vérification requise", Icon: AlertTriangle },

  cancelled: { variant: "error", label: "Annulé", Icon: XCircle },
  payment_failed: { variant: "error", label: "Paiement échoué", Icon: XCircle },
  rejected: { variant: "error", label: "Refusé", Icon: XCircle },
  expired: { variant: "error", label: "Expiré", Icon: XCircle },
};

export function StatusBadge({
  status,
  className = "",
  animate = false,
}: {
  status: string;
  className?: string;
  animate?: boolean;
}) {
  const s = STATUS[status] ?? { variant: "secondary" as Variant, label: status, Icon: Clock };
  return (
    <Badge
      label={s.label}
      variant={s.variant}
      appearance="subtle"
      size="medium"
      icon={<s.Icon className="h-3.5 w-3.5" aria-hidden />}
      className={className}
      animate={animate}
    />
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

export function ServiceBadge({ kind, animate = false }: { kind: ServiceKind; animate?: boolean }) {
  const { label, Icon } = SERVICE[kind];
  return (
    <Badge
      label={label}
      variant="secondary"
      appearance="subtle"
      size="small"
      icon={<Icon className="h-3.5 w-3.5" aria-hidden />}
      animate={animate}
    />
  );
}

/** Countdown (spec §4): "Arrivée dans 10 jours". */
export function CountdownBadge({ date, animate = true }: { date: string; animate?: boolean }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((parseDay(date).getTime() - today.getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return null;

  const label =
    days > 1 ? `Arrivée dans ${days} jours`
    : days === 1 ? "Arrivée demain"
    : days === 0 ? "Arrivée aujourd'hui"
    : "Séjour passé";

  return (
    <Badge
      label={label}
      variant="primary"
      appearance="subtle"
      size="medium"
      icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
      animate={animate}
    />
  );
}

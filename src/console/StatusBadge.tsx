import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Hourglass,
  Loader2,
  Pause,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "../components/ui/cvui-badge";

/**
 * The status system (spec §61). One table maps every status string the platform
 * produces to a tone, a word and an icon, so the same state never appears green
 * on one screen and grey on another — and so status is never colour alone.
 */

type Tone = "primary" | "secondary" | "success" | "warning" | "error" | "info";
type Entry = { tone: Tone; label: string; Icon: typeof Circle };

const STATUS: Record<string, Entry> = {
  // Positive
  active: { tone: "success", label: "Actif", Icon: CheckCircle2 },
  approved: { tone: "success", label: "Approuvé", Icon: CheckCircle2 },
  published: { tone: "success", label: "Publié", Icon: CheckCircle2 },
  confirmed: { tone: "success", label: "Confirmé", Icon: CheckCircle2 },
  paid: { tone: "success", label: "Payé", Icon: CheckCircle2 },
  verified: { tone: "success", label: "Vérifié", Icon: CheckCircle2 },
  completed: { tone: "success", label: "Terminé", Icon: CheckCircle2 },
  resolved: { tone: "success", label: "Résolu", Icon: CheckCircle2 },
  operational: { tone: "success", label: "Opérationnel", Icon: CheckCircle2 },
  sent: { tone: "success", label: "Envoyé", Icon: CheckCircle2 },
  issued: { tone: "success", label: "Émis", Icon: CheckCircle2 },

  // Neutral
  draft: { tone: "secondary", label: "Brouillon", Icon: FileText },
  pending: { tone: "secondary", label: "En attente", Icon: Clock },
  new: { tone: "info", label: "Nouveau", Icon: Circle },
  open: { tone: "info", label: "Ouvert", Icon: Circle },
  processing: { tone: "secondary", label: "En traitement", Icon: Loader2 },
  under_review: { tone: "secondary", label: "En examen", Icon: Eye },
  pending_review: { tone: "secondary", label: "En attente de revue", Icon: Eye },
  reviewing: { tone: "secondary", label: "En examen", Icon: Eye },
  in_review: { tone: "secondary", label: "En examen", Icon: Eye },
  investigating: { tone: "secondary", label: "En enquête", Icon: Eye },
  requested: { tone: "secondary", label: "Demandé", Icon: Hourglass },
  uploaded: { tone: "secondary", label: "Téléversé", Icon: FileText },
  invited: { tone: "secondary", label: "Invité", Icon: Clock },
  scheduled: { tone: "info", label: "Planifié", Icon: Clock },
  ready: { tone: "info", label: "Prêt", Icon: Circle },
  unverified: { tone: "secondary", label: "Non vérifié", Icon: Circle },
  inactive: { tone: "secondary", label: "Inactif", Icon: Circle },
  closed: { tone: "secondary", label: "Fermé", Icon: CheckCircle2 },
  archived: { tone: "secondary", label: "Archivé", Icon: Trash2 },
  sending: { tone: "info", label: "Envoi en cours", Icon: Loader2 },

  // Warning
  action_needed: { tone: "warning", label: "Action requise", Icon: AlertTriangle },
  payment_required: { tone: "warning", label: "Paiement requis", Icon: AlertTriangle },
  needs_changes: { tone: "warning", label: "Modifications requises", Icon: AlertTriangle },
  held: { tone: "warning", label: "Retenu", Icon: Pause },
  paused: { tone: "warning", label: "En pause", Icon: Pause },
  waiting_customer: { tone: "warning", label: "Attente client", Icon: Hourglass },
  waiting_partner: { tone: "warning", label: "Attente partenaire", Icon: Hourglass },
  escalated: { tone: "warning", label: "Escaladé", Icon: ShieldAlert },
  partially_refunded: { tone: "warning", label: "Partiellement remboursé", Icon: AlertTriangle },
  degraded: { tone: "warning", label: "Dégradé", Icon: AlertTriangle },
  maintenance: { tone: "warning", label: "Maintenance", Icon: Pause },
  flagged: { tone: "warning", label: "Signalé", Icon: Flag },
  awaiting_evidence: { tone: "warning", label: "Preuves attendues", Icon: Hourglass },
  overdue: { tone: "warning", label: "En retard", Icon: AlertTriangle },

  // Negative
  rejected: { tone: "error", label: "Refusé", Icon: XCircle },
  suspended: { tone: "error", label: "Suspendu", Icon: Ban },
  cancelled: { tone: "error", label: "Annulé", Icon: XCircle },
  failed: { tone: "error", label: "Échoué", Icon: XCircle },
  disputed: { tone: "error", label: "Litige", Icon: ShieldAlert },
  chargeback: { tone: "error", label: "Rétrofacturation", Icon: ShieldAlert },
  expired: { tone: "error", label: "Expiré", Icon: XCircle },
  refunded: { tone: "error", label: "Remboursé", Icon: XCircle },
  removed: { tone: "error", label: "Retiré", Icon: Trash2 },
  hidden: { tone: "error", label: "Masqué", Icon: EyeOff },
  outage: { tone: "error", label: "Panne", Icon: XCircle },
  suspicious: { tone: "error", label: "Suspect", Icon: ShieldAlert },
  void: { tone: "error", label: "Annulé", Icon: XCircle },
  closed_account: { tone: "error", label: "Fermé", Icon: Ban },
};

export function statusEntry(status: string | null | undefined): Entry {
  if (!status) return { tone: "secondary", label: "—", Icon: Circle };
  return STATUS[status] ?? { tone: "secondary", label: status.replace(/_/g, " "), Icon: Circle };
}

export function StatusBadge({
  status,
  size = "small",
  className,
}: {
  status: string | null | undefined;
  size?: "small" | "medium" | "large";
  className?: string;
}) {
  const s = statusEntry(status);
  return (
    <Badge
      label={s.label}
      variant={s.tone}
      appearance="subtle"
      size={size}
      icon={<s.Icon className="h-3.5 w-3.5" aria-hidden />}
      animate={false}
      className={className}
    />
  );
}

/** Priority on support tickets (spec §34). */
const PRIORITY: Record<string, Entry> = {
  low: { tone: "secondary", label: "Basse", Icon: Circle },
  normal: { tone: "info", label: "Normale", Icon: Circle },
  high: { tone: "warning", label: "Haute", Icon: AlertTriangle },
  urgent: { tone: "error", label: "Urgente", Icon: ShieldAlert },
};

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  const p = PRIORITY[priority ?? ""] ?? PRIORITY.normal;
  return (
    <Badge
      label={p.label}
      variant={p.tone}
      appearance="subtle"
      size="small"
      icon={<p.Icon className="h-3.5 w-3.5" aria-hidden />}
      animate={false}
    />
  );
}

/** Severity, shared by health cards, alerts, audit rows and security events. */
export const SEVERITY: Record<string, { tone: Tone; label: string; ring: string; text: string; dot: string }> = {
  normal: { tone: "success", label: "Normal", ring: "border-[#d7e6d9]", text: "text-[#15803d]", dot: "bg-[#15803d]" },
  info: { tone: "info", label: "Info", ring: "border-[#dbe4f3]", text: "text-[#002089]", dot: "bg-[#002089]" },
  notice: { tone: "info", label: "À surveiller", ring: "border-[#dbe4f3]", text: "text-[#002089]", dot: "bg-[#002089]" },
  attention: { tone: "warning", label: "Attention", ring: "border-[#f3e2c4]", text: "text-[#a16207]", dot: "bg-amber-500" },
  warning: { tone: "warning", label: "Attention", ring: "border-[#f3e2c4]", text: "text-[#a16207]", dot: "bg-amber-500" },
  urgent: { tone: "error", label: "Urgent", ring: "border-[#f0cfcd]", text: "text-[#b3261e]", dot: "bg-[#b3261e]" },
  critical: { tone: "error", label: "Critique", ring: "border-[#f0cfcd]", text: "text-[#b3261e]", dot: "bg-[#b3261e]" },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  return <Badge label={s.label} variant={s.tone} appearance="subtle" size="small" animate={false} />;
}

/** Risk flags on a customer or a transaction (spec §12, §49). */
export function RiskBadge({ flag }: { flag: string }) {
  const LABELS: Record<string, string> = {
    chargeback: "Rétrofacturation",
    multiple_cards: "Cartes multiples",
    velocity: "Réservations rapprochées",
    failed_payments: "Paiements échoués",
    disputed_booking: "Litige ouvert",
    manual_review: "Revue manuelle",
  };
  return (
    <Badge
      label={LABELS[flag] ?? flag.replace(/_/g, " ")}
      variant="error"
      appearance="outline"
      size="small"
      icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden />}
      animate={false}
    />
  );
}

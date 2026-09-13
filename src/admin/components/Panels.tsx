import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ClipboardCheck,
  Coins,
  FileText,
  LifeBuoy,
  Loader2,
  Lock,
  RefreshCcw,
  ScrollText,
  ShieldAlert,
  StickyNote,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, Card, CardHeader, EmptyState, Skeleton, inputClass } from "../../console/Ui";
import { SEVERITY } from "../../console/StatusBadge";
import { ago, avatarTint, initials, stamp } from "../../console/format";
import { useAuditTrail, useInternalNotes, type AuditEntry } from "../lib/adminData";

/** Live operations feed (spec §6). */
export type FeedEvent = {
  at: string;
  event: string;
  entity_type: string;
  entity_id: string | null;
  label: string | null;
  actor: string | null;
  severity: string;
};

const EVENT_COPY: Record<string, { text: string; Icon: typeof FileText; href?: (e: FeedEvent) => string }> = {
  partner_application: { text: "Nouvelle candidature partenaire", Icon: Building2, href: e => `/admin/verification/${e.entity_id}` },
  booking_created: { text: "Réservation créée", Icon: ClipboardCheck, href: e => `/admin/reservations/${e.entity_id}` },
  refund_requested: { text: "Demande de remboursement", Icon: RefreshCcw, href: () => "/admin/remboursements" },
  dispute_opened: { text: "Litige ouvert", Icon: ShieldAlert, href: e => `/admin/litiges/${e.entity_id}` },
  payout_paid: { text: "Versement effectué", Icon: Coins, href: () => "/admin/versements" },
  ticket_created: { text: "Ticket de support créé", Icon: LifeBuoy, href: e => `/admin/support/${e.entity_id}` },
  admin_action: { text: "Action administrateur", Icon: ScrollText, href: () => "/admin/audit" },
};

export function ActivityFeed({
  events,
  loading,
  limit,
}: {
  events: FeedEvent[];
  loading?: boolean;
  limit?: number;
}) {
  const shown = limit ? events.slice(0, limit) : events;

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-1.5 h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (shown.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Aucune activité pour le moment"
        body="Les candidatures, réservations, remboursements et actions d'administration apparaîtront ici."
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {shown.map((e, i) => {
        const copy = EVENT_COPY[e.event] ?? { text: e.event.replace(/_/g, " "), Icon: FileText };
        const Icon = copy.Icon;
        const href = copy.href?.(e);
        const sev = SEVERITY[e.severity] ?? SEVERITY.info;

        const inner = (
          <>
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-content-center rounded-lg",
                e.severity === "warning" || e.severity === "critical"
                  ? "bg-[#fdf3f2] text-[#b3261e]"
                  : "bg-admin-canvas text-admin-ink-2",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-admin-ink">
                {copy.text}
                {e.label && <span className="font-normal text-admin-ink-2"> · {e.label}</span>}
              </span>
              <span className="block truncate text-[11.5px] text-admin-ink-3">
                {e.actor ? `${e.actor} · ` : ""}
                {ago(e.at)}
              </span>
            </span>
            {(e.severity === "warning" || e.severity === "critical") && (
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sev.dot)} aria-hidden />
            )}
          </>
        );

        return (
          <li key={`${e.at}-${i}`} className="border-b border-admin-line last:border-0">
            {href ? (
              <Link to={href} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-admin-canvas">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Internal notes (spec §63). Never visible to customers or partners — the
 * SELECT policy on internal_notes requires staff, so that is enforced in the
 * database, not by this component. Notes are append-only history.
 */
export function InternalNotes({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string | undefined;
}) {
  const { notes, loading, add } = useInternalNotes(entityType, entityId);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (body.trim().length === 0) return;
    setBusy(true);
    const err = await add(body.trim());
    setBusy(false);
    if (err) setError(err);
    else {
      setBody("");
      setError(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Notes internes"
        subtitle="Visibles uniquement par le personnel PAPOT."
        action={
          <span className="flex items-center gap-1 rounded-md bg-admin-canvas px-2 py-1 text-[11px] font-semibold text-admin-ink-3">
            <Lock className="h-3 w-3" aria-hidden />
            Privé
          </span>
        }
      />

      <div className="mb-4">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={2}
          placeholder="Ajouter une note pour l'équipe…"
          className={cn(inputClass, "h-auto py-2 leading-relaxed")}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {error ? (
            <p className="text-[12.5px] text-[#b3261e]">{error}</p>
          ) : (
            <p className="text-[11.5px] text-admin-ink-3">Les notes ne peuvent pas être modifiées après envoi.</p>
          )}
          <Button variant="primary" size="sm" onClick={submit} disabled={busy || !body.trim()}>
            {busy && <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />}
            Ajouter
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : notes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-admin-line-strong px-4 py-6 text-center text-[13px] text-admin-ink-3">
          Aucune note interne.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map(n => (
            <li key={n.id} className="flex gap-2.5">
              <span
                className="mt-0.5 grid h-7 w-7 shrink-0 place-content-center rounded-full text-[10.5px] font-bold text-white"
                style={{ background: avatarTint(n.author_label) }}
                aria-hidden
              >
                {initials(n.author_label)}
              </span>
              <div className="min-w-0 flex-1 rounded-lg bg-admin-canvas px-3 py-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                  <span className="font-semibold text-admin-ink">{n.author_label ?? "Administrateur"}</span>
                  <span className="text-admin-ink-3">{stamp(n.created_at)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-admin-ink">{n.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const ACTION_LABEL: Record<string, string> = {
  customer_status_changed: "Statut du client modifié",
  partner_status_changed: "Statut du partenaire modifié",
  application_accept: "Candidature acceptée",
  application_reject: "Candidature refusée",
  application_request_changes: "Modifications demandées",
  application_escalate: "Candidature escaladée",
  booking_cancelled: "Réservation annulée",
  setting_changed: "Réglage modifié",
  role_permissions_changed: "Permissions d'un rôle modifiées",
  staff_invited: "Membre du personnel ajouté",
  staff_role_changed: "Rôle du personnel modifié",
};

export function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  if (action.startsWith("listing_")) return `Annonce : ${action.replace("listing_", "")}`;
  if (action.startsWith("refund_")) return `Remboursement : ${action.replace("refund_", "")}`;
  if (action.startsWith("payout_")) return `Versement : ${action.replace("payout_", "")}`;
  if (action.startsWith("review_")) return `Avis : ${action.replace("review_", "")}`;
  if (action.startsWith("document_")) return `Document : ${action.replace("document_", "")}`;
  if (action.startsWith("insert_")) return `Création · ${action.replace("insert_", "")}`;
  if (action.startsWith("update_")) return `Modification · ${action.replace("update_", "")}`;
  if (action.startsWith("delete_")) return `Suppression · ${action.replace("delete_", "")}`;
  return action.replace(/_/g, " ");
}

/** Which fields actually changed, so an audit row reads as a diff (spec §48). */
export function diffFields(entry: AuditEntry): { key: string; from: unknown; to: unknown }[] {
  const prev = entry.previous ?? {};
  const next = entry.next ?? {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys]
    .filter(k => JSON.stringify(prev[k]) !== JSON.stringify(next[k]))
    .map(k => ({ key: k, from: prev[k], to: next[k] }));
}

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

/** Audit trail for one entity (spec §12, §48). */
export function AuditTrail({
  entityType,
  entityId,
  title = "Journal d'audit",
}: {
  entityType: string;
  entityId: string | undefined;
  title?: string;
}) {
  const { rows, loading, error } = useAuditTrail(entityType, entityId);

  return (
    <Card>
      <CardHeader title={title} subtitle="Qui a fait quoi, et quand." />
      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : error ? (
        <p className="text-[13px] text-admin-ink-3">Journal indisponible.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-admin-line-strong px-4 py-6 text-center text-[13px] text-admin-ink-3">
          Aucune action enregistrée pour cet élément.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map(e => {
            const changes = diffFields(e);
            return (
              <li key={e.id} className="border-l-2 border-admin-line pl-3">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-semibold text-admin-ink">{actionLabel(e.action)}</span>
                  <span className="text-[11.5px] text-admin-ink-3">
                    {e.admin_label ?? "Système"} · {stamp(e.at)}
                  </span>
                </p>
                {changes.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {changes.slice(0, 4).map(c => (
                      <li key={c.key} className="text-[12px] text-admin-ink-2">
                        <span className="text-admin-ink-3">{c.key} :</span>{" "}
                        <span className="line-through decoration-admin-ink-3/50">{show(c.from)}</span>
                        {" → "}
                        <span className="font-medium text-admin-ink">{show(c.to)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {e.reason && (
                  <p className="mt-1 flex items-start gap-1.5 text-[12px] italic text-admin-ink-2">
                    <StickyNote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    {e.reason}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Inbox, Mail, MessageSquare, KeyRound, ShieldAlert, Ban, CheckCircle2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, Card, CardHeader, EmptyState, Field, FieldGrid, PageHeader, Skeleton, Tabs } from "../components/Ui";
import { Stat } from "../components/Cards";
import { StatusBadge, RiskBadge } from "../components/StatusBadge";
import { AuditTrail, InternalNotes } from "../components/Panels";
import { ConfirmDialog, useConfirm } from "../components/Dialog";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,useRow, useTable } from "../lib/adminData";
import { ago, avatarTint, count, day, initials, money, range, stamp } from "../lib/format";
import type { CustomerRow } from "./Customers";

type TabId = "overview" | "bookings" | "payments" | "refunds" | "reviews" | "support" | "activity" | "security";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "bookings", label: "Réservations" },
  { id: "payments", label: "Paiements" },
  { id: "refunds", label: "Remboursements" },
  { id: "reviews", label: "Avis" },
  { id: "support", label: "Support" },
  { id: "activity", label: "Activité" },
  { id: "security", label: "Sécurité" },
];

/** Spec §12. */
export function CustomerDetail() {
  const { id } = useParams();
  const { can } = useAdmin();
  const [tab, setTab] = useState<TabId>("overview");
  const { confirm, dialogProps } = useConfirm();

  const { row, loading, error, reload } = useRow<CustomerRow>("admin_customer_rows", { id: id ?? "" });

  const bookings = useTable<{
    reference: string;
    created_at: string;
    status: string;
    total: number;
    first_title: string | null;
    starts_on: string | null;
    ends_on: string | null;
    partner_name: string | null;
  }>({
    from: "admin_reservation_rows",
    select: "reference, created_at, status, total, first_title, starts_on, ends_on, partner_name",
    filters: [{ col: "user_id", op: "eq", value: id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && (tab === "bookings" || tab === "overview"),
  });

  const payments = useTable<{ id: string; reference: string; amount: number; status: string; method: string; created_at: string }>({
    from: "payments",
    select: "id, reference, amount, status, method, created_at",
    filters: [{ col: "customer_id", op: "eq", value: id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "payments",
  });

  const refunds = useTable<{ id: string; reference: string; final_amount: number | null; requested_amount: number; status: string; created_at: string }>({
    from: "refunds",
    select: "id, reference, final_amount, requested_amount, status, created_at",
    filters: [{ col: "customer_id", op: "eq", value: id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "refunds",
  });

  const reviews = useTable<{ id: string; rating: number; title: string | null; body: string | null; status: string; created_at: string }>({
    from: "reviews",
    select: "id, rating, title, body, status, created_at",
    filters: [{ col: "customer_id", op: "eq", value: id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "reviews",
  });

  const tickets = useTable<{ id: string; reference: string; subject: string; status: string; priority: string; updated_at: string }>({
    from: "support_tickets",
    select: "id, reference, subject, status, priority, updated_at",
    filters: [{ col: "customer_id", op: "eq", value: id ?? "" }],
    sort: { col: "updated_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "support",
  });

  const security = useTable<{ id: number; kind: string; severity: string; ip: string | null; at: string }>({
    from: "security_events",
    select: "id, kind, severity, ip, at",
    filters: [{ col: "user_id", op: "eq", value: id ?? "" }],
    sort: { col: "at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "security",
  });

  if (loading) {
    return (
      <>
        <Skeleton className="mb-3 h-4 w-48" />
        <Skeleton className="mb-6 h-9 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </>
    );
  }

  if (error || !row) {
    return (
      <>
        <PageHeader title="Client introuvable" breadcrumb={[{ label: "Clients", to: "/admin/clients" }]} />
        <EmptyState
          icon={Inbox}
          title="Ce client n'existe pas ou n'est plus accessible."
          action={
            <Button as="link" to="/admin/clients" variant="secondary">
              Retour à la liste
            </Button>
          }
        />
      </>
    );
  }

  const setStatus = (next: "suspended" | "active") =>
    confirm({
      title: next === "suspended" ? `Suspendre ${row.full_name ?? "ce client"} ?` : "Réactiver ce compte ?",
      consequence:
        next === "suspended"
          ? "Le compte ne pourra plus se connecter ni réserver. Les réservations déjà confirmées ne sont pas annulées automatiquement."
          : "Le compte pourra de nouveau se connecter et réserver.",
      confirmLabel: next === "suspended" ? "Suspendre le compte" : "Réactiver",
      danger: next === "suspended",
      requireReason: next === "suspended",
      reasonLabel: "Motif de la suspension",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_set_customer_status", {
          p_id: row.id,
          p_status: next,
          p_reason: reason || null,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Clients", to: "/admin/clients" }, { label: row.full_name ?? "Client" }]}
        title={row.full_name ?? "Client sans nom"}
        subtitle={`Inscrit le ${day(row.created_at)} · ${row.email ?? "courriel inconnu"}`}
        actions={
          <>
            {row.email && (
              <Button as="link" to={`mailto:${row.email}`} variant="secondary">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                Contacter
              </Button>
            )}
            {can("suspend_customers") &&
              (row.status === "active" ? (
                <Button variant="dangerGhost" onClick={() => setStatus("suspended")}>
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  Suspendre
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setStatus("active")}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Réactiver
                </Button>
              ))}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-content-center rounded-full text-[15px] font-bold text-white"
          style={{ background: avatarTint(row.full_name ?? row.email) }}
          aria-hidden
        >
          {initials(row.full_name ?? row.email)}
        </span>
        <StatusBadge status={row.status} size="medium" />
        <code className="rounded bg-admin-canvas px-2 py-1 text-[12px] text-admin-ink-3">{row.id}</code>
        {row.risk_flags?.map(f => <RiskBadge key={f} flag={f} />)}
      </div>

      {row.status === "suspended" && row.suspended_reason && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-[#f0cfcd] bg-[#fdf3f2] px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#b3261e]" aria-hidden />
          <p className="text-[13px] text-[#8a2b24]">
            <strong className="font-semibold">Compte suspendu.</strong> {row.suspended_reason}
          </p>
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Card>
              <CardHeader title="Coordonnées" />
              <FieldGrid>
                <Field label="Nom complet">{row.full_name ?? "—"}</Field>
                <Field label="Courriel">{row.email ?? "—"}</Field>
                <Field label="Téléphone">{row.phone ?? "—"}</Field>
                <Field label="Pays">{row.country ?? "Haïti"}</Field>
                <Field label="Langue">{row.locale === "ht" ? "Kreyòl" : row.locale === "en" ? "English" : "Français"}</Field>
                <Field label="Dernière activité">{ago(row.last_seen_at ?? row.last_booking_at ?? row.created_at)}</Field>
              </FieldGrid>
            </Card>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Réservations" value={count(row.bookings)} />
              <Stat label="Total dépensé" value={money(row.total_spend)} />
              <Stat label="Dernière réservation" value={row.last_booking_at ? day(row.last_booking_at) : "—"} />
              <Stat
                label="Signalements"
                value={count(row.risk_flags?.length ?? 0)}
                tone={row.risk_flags?.length ? "negative" : undefined}
              />
            </div>

            <Card>
              <CardHeader
                title="Réservations récentes"
                action={
                  <Button variant="ghost" size="sm" onClick={() => setTab("bookings")}>
                    Tout voir
                  </Button>
                }
              />
              {bookings.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : bookings.rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-admin-line-strong px-4 py-6 text-center text-[13px] text-admin-ink-3">
                  Ce client n'a pas encore réservé.
                </p>
              ) : (
                <ul className="divide-y divide-admin-line">
                  {bookings.rows.slice(0, 5).map(b => (
                    <li key={b.reference}>
                      <Link
                        to={`/admin/reservations/${b.reference}`}
                        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-admin-canvas"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-admin-ink">
                            {b.first_title ?? b.reference}
                          </span>
                          <span className="block text-[11.5px] text-admin-ink-3">
                            {b.reference} · {range(b.starts_on, b.ends_on)}
                          </span>
                        </span>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums">{money(b.total)}</span>
                        <StatusBadge status={b.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <InternalNotes entityType="customer" entityId={row.id} />
            <AuditTrail entityType="customer" entityId={row.id} />
          </div>
        </div>
      )}

      {tab === "bookings" && (
        <Card padded={false}>
          <SimpleList
            loading={bookings.loading}
            empty="Aucune réservation."
            rows={bookings.rows.map(b => ({
              key: b.reference,
              to: `/admin/reservations/${b.reference}`,
              title: b.first_title ?? b.reference,
              sub: `${b.reference} · ${range(b.starts_on, b.ends_on)}${b.partner_name ? ` · ${b.partner_name}` : ""}`,
              right: money(b.total),
              status: b.status,
            }))}
          />
        </Card>
      )}

      {tab === "payments" && (
        <Card padded={false}>
          <SimpleList
            loading={payments.loading}
            empty="Aucun paiement enregistré pour ce client."
            rows={payments.rows.map(p => ({
              key: p.id,
              title: p.reference,
              sub: `${stamp(p.created_at)} · ${p.method}`,
              right: money(p.amount),
              status: p.status,
            }))}
          />
        </Card>
      )}

      {tab === "refunds" && (
        <Card padded={false}>
          <SimpleList
            loading={refunds.loading}
            empty="Aucune demande de remboursement."
            rows={refunds.rows.map(r => ({
              key: r.id,
              title: r.reference,
              sub: stamp(r.created_at),
              right: money(r.final_amount ?? r.requested_amount),
              status: r.status,
            }))}
          />
        </Card>
      )}

      {tab === "reviews" && (
        <Card padded={false}>
          <SimpleList
            loading={reviews.loading}
            empty="Ce client n'a pas laissé d'avis."
            rows={reviews.rows.map(r => ({
              key: r.id,
              title: r.title ?? `${r.rating}/5`,
              sub: (r.body ?? "").slice(0, 120) || stamp(r.created_at),
              right: `${r.rating}/5`,
              status: r.status,
            }))}
          />
        </Card>
      )}

      {tab === "support" && (
        <Card padded={false}>
          <SimpleList
            loading={tickets.loading}
            empty="Aucun ticket de support."
            rows={tickets.rows.map(t => ({
              key: t.id,
              to: `/admin/support/${t.id}`,
              title: t.subject,
              sub: `${t.reference} · ${ago(t.updated_at)}`,
              right: t.priority,
              status: t.status,
            }))}
          />
        </Card>
      )}

      {tab === "activity" && <AuditTrail entityType="customer" entityId={row.id} title="Historique des actions" />}

      {tab === "security" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2" padded={false}>
            <div className="border-b border-admin-line px-5 py-4">
              <h2 className="font-display text-[15px] font-semibold text-admin-ink">Événements de sécurité</h2>
              <p className="text-[13px] text-admin-ink-3">Connexions, échecs et alertes liés à ce compte.</p>
            </div>
            <SimpleList
              loading={security.loading}
              empty="Aucun événement de sécurité enregistré."
              rows={security.rows.map(s => ({
                key: String(s.id),
                title: s.kind.replace(/_/g, " "),
                sub: `${stamp(s.at)}${s.ip ? ` · ${s.ip}` : ""}`,
                status: s.severity,
              }))}
            />
          </Card>

          <Card>
            <CardHeader title="Actions de sécurité" subtitle="Réservées au responsable risque." />
            <div className="flex flex-col gap-2">
              <Button variant="secondary" disabled className="justify-start">
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                Forcer une réinitialisation
              </Button>
              <Button variant="secondary" disabled className="justify-start">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                Exiger la MFA
              </Button>
              <p className="mt-1 text-[12px] leading-relaxed text-admin-ink-3">
                Ces actions demandent l'API d'administration Supabase côté serveur : elles seront activées avec
                la fonction Edge dédiée. La suspension du compte, elle, est active et applique immédiatement
                le blocage.
              </p>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Compact list used by the detail tabs. */
export function SimpleList({
  rows,
  loading,
  empty,
}: {
  rows: { key: string; to?: string; title: string; sub?: string; right?: string; status?: string }[];
  loading?: boolean;
  empty: string;
}) {
  if (loading) return <div className="p-5"><Skeleton className="h-24 w-full" /></div>;
  if (rows.length === 0)
    return <p className="px-5 py-10 text-center text-[13px] text-admin-ink-3">{empty}</p>;

  return (
    <ul className="divide-y divide-admin-line">
      {rows.map(r => {
        const body = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-admin-ink">{r.title}</span>
              {r.sub && <span className="block truncate text-[12px] text-admin-ink-3">{r.sub}</span>}
            </span>
            {r.right && (
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-admin-ink">{r.right}</span>
            )}
            {r.status && <StatusBadge status={r.status} />}
          </>
        );
        return (
          <li key={r.key}>
            {r.to ? (
              <Link to={r.to} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-admin-canvas">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-5 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

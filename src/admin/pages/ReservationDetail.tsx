import { Link, useParams } from "react-router-dom";
import { Ban, Inbox, Mail, MessageSquare, RefreshCcw, ShieldAlert } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  Skeleton,
} from "../../console/Ui";
import { StatusBadge } from "../../console/StatusBadge";
import { AuditTrail, InternalNotes } from "../components/Panels";
import { ConfirmDialog, useConfirm } from "../../console/Dialog";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,useRow, useTable } from "../lib/adminData";
import { money, percent, range, stamp } from "../../console/format";
import { KIND_LABEL } from "./Listings";
import type { ReservationRow } from "./Reservations";

type Item = {
  id: string;
  title: string;
  detail: string | null;
  kind: string;
  amount: number;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  party: number | null;
  listing_id: string | null;
};

/** Spec §26. */
export function ReservationDetail() {
  const { reference } = useParams();
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();

  const { row, loading, error, reload } = useRow<ReservationRow>("admin_reservation_rows", {
    reference: reference ?? "",
  });

  const items = useTable<Item>({
    from: "booking_items",
    select: "id, title, detail, kind, amount, status, starts_on, ends_on, start_time, party, listing_id",
    filters: [{ col: "booking_id", op: "eq", value: row?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 50,
    enabled: !!row?.id,
  });

  const payments = useTable<{
    id: string;
    reference: string;
    amount: number;
    commission: number;
    method: string;
    processor: string | null;
    status: string;
    created_at: string;
  }>({
    from: "payments",
    select: "id, reference, amount, commission, method, processor, status, created_at",
    filters: [{ col: "booking_id", op: "eq", value: row?.id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 10,
    enabled: !!row?.id,
  });

  const refunds = useTable<{ id: string; reference: string; final_amount: number | null; requested_amount: number; status: string }>({
    from: "refunds",
    select: "id, reference, final_amount, requested_amount, status",
    filters: [{ col: "booking_id", op: "eq", value: row?.id ?? "" }],
    pageSize: 10,
    enabled: !!row?.id,
  });

  const disputes = useTable<{ id: string; reference: string; category: string; status: string }>({
    from: "disputes",
    select: "id, reference, category, status",
    filters: [{ col: "booking_id", op: "eq", value: row?.id ?? "" }],
    pageSize: 10,
    enabled: !!row?.id,
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
        <PageHeader
          title="Réservation introuvable"
          breadcrumb={[{ label: "Réservations", to: "/admin/reservations" }]}
        />
        <EmptyState
          icon={Inbox}
          title="Cette réservation n'existe pas ou n'est plus accessible."
          action={
            <Button as="link" to="/admin/reservations" variant="secondary">
              Retour aux réservations
            </Button>
          }
        />
      </>
    );
  }

  const payment = payments.rows[0];
  const commission = payment ? Number(payment.commission) : null;
  const commissionRate = payment && Number(payment.amount) > 0 ? (Number(payment.commission) / Number(payment.amount)) * 100 : null;

  const cancel = () =>
    confirm({
      title: `Annuler la réservation ${row.reference} ?`,
      consequence:
        "La réservation et toutes ses lignes passent en annulé. Le remboursement éventuel doit être traité séparément dans Remboursements.",
      confirmLabel: "Annuler la réservation",
      danger: true,
      requireReason: true,
      reasonLabel: "Motif de l'annulation",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_cancel_booking", {
          p_reference: row.reference,
          p_reason: reason,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Réservations", to: "/admin/reservations" }, { label: row.reference }]}
        title={`Réservation ${row.reference}`}
        subtitle={`Créée le ${stamp(row.created_at)} · ${row.item_count} ligne${row.item_count > 1 ? "s" : ""}`}
        actions={
          <>
            {row.customer_email && (
              <Button as="link" to={`mailto:${row.customer_email}`} variant="secondary">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                Contacter le client
              </Button>
            )}
            {row.partner_id && (
              <Button as="link" to={`/admin/partenaires/${row.partner_id}`} variant="secondary">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                Voir le partenaire
              </Button>
            )}
            {can("issue_refunds") && (
              <Button as="link" to="/admin/remboursements" variant="secondary">
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
                Rembourser
              </Button>
            )}
            {can("cancel_bookings") && row.status !== "cancelled" && (
              <Button variant="dangerGhost" onClick={cancel}>
                <Ban className="h-3.5 w-3.5" aria-hidden />
                Annuler
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} size="medium" />
        {row.payment_status && <StatusBadge status={row.payment_status} size="medium" />}
      </div>

      {disputes.rows.length > 0 && (
        <div className="mb-5">
          <Callout tone="warning">
            <ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Cette réservation fait l'objet d'un litige.{" "}
            <Link to={`/admin/litiges/${disputes.rows[0].id}`} className="font-semibold underline">
              Ouvrir le litige {disputes.rows[0].reference}
            </Link>
          </Callout>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Client" />
              <FieldGrid cols={2}>
                <Field label="Nom">
                  {row.user_id ? (
                    <Link to={`/admin/clients/${row.user_id}`} className="text-[#002089] hover:underline">
                      {row.customer_label ?? "—"}
                    </Link>
                  ) : (
                    (row.customer_label ?? "—")
                  )}
                </Field>
                <Field label="Courriel">{row.customer_email ?? "—"}</Field>
                <Field label="Compte">{row.user_id ? "Client enregistré" : "Réservation invité"}</Field>
              </FieldGrid>
            </Card>

            <Card>
              <CardHeader title="Partenaire" />
              <FieldGrid cols={2}>
                <Field label="Entreprise">
                  {row.partner_id ? (
                    <Link to={`/admin/partenaires/${row.partner_id}`} className="text-[#002089] hover:underline">
                      {row.partner_name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field label="Dates">{range(row.starts_on, row.ends_on)}</Field>
              </FieldGrid>
            </Card>
          </div>

          <Card padded={false}>
            <div className="border-b border-admin-line px-5 py-4">
              <h2 className="font-display text-[15px] font-semibold text-admin-ink">Détail des services</h2>
            </div>
            {items.loading ? (
              <div className="p-5">
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <ul className="divide-y divide-admin-line">
                {items.rows.map(i => (
                  <li key={i.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-admin-ink">
                        {i.listing_id ? (
                          <Link to={`/admin/annonces/${i.listing_id}`} className="hover:text-[#002089]">
                            {i.title}
                          </Link>
                        ) : (
                          i.title
                        )}
                      </span>
                      <span className="block text-[12px] text-admin-ink-3">
                        {KIND_LABEL[i.kind] ?? i.kind}
                        {i.detail ? ` · ${i.detail}` : ""}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-admin-ink-3">
                        {range(i.starts_on, i.ends_on)}
                        {i.start_time ? ` · ${i.start_time.slice(0, 5)}` : ""}
                        {i.party ? ` · ${i.party} personne${i.party > 1 ? "s" : ""}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">{money(i.amount)}</span>
                    <StatusBadge status={i.status} />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t border-admin-line bg-admin-raised px-5 py-3.5">
              <span className="text-[13px] font-semibold text-admin-ink">Total</span>
              <span className="font-display text-[17px] font-semibold tabular-nums text-admin-ink">
                {money(row.total, row.currency)}
              </span>
            </div>
          </Card>

          <Card>
            <CardHeader title="Paiement et commission" />
            {payments.loading ? (
              <Skeleton className="h-16 w-full" />
            ) : !payment ? (
              <p className="rounded-lg border border-dashed border-admin-line-strong px-4 py-6 text-center text-[13px] text-admin-ink-3">
                Aucun paiement enregistré pour cette réservation.
              </p>
            ) : (
              <FieldGrid>
                <Field label="Référence">{payment.reference}</Field>
                <Field label="Montant">{money(payment.amount)}</Field>
                <Field label="Méthode">{payment.method}</Field>
                <Field label="Processeur">{payment.processor ?? "—"}</Field>
                <Field label="Commission PAPOT">
                  {commission !== null ? money(commission) : "—"}
                  {commissionRate !== null && (
                    <span className="ml-1.5 text-[12px] font-normal text-admin-ink-3">
                      ({percent(commissionRate)})
                    </span>
                  )}
                </Field>
                <Field label="Reversé au partenaire">
                  {commission !== null ? money(Number(payment.amount) - commission) : "—"}
                </Field>
                <Field label="Statut">
                  <StatusBadge status={payment.status} />
                </Field>
                <Field label="Date">{stamp(payment.created_at)}</Field>
              </FieldGrid>
            )}

            {refunds.rows.length > 0 && (
              <div className="mt-4 border-t border-admin-line pt-4">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-admin-ink-3">
                  Remboursements
                </p>
                <ul className="flex flex-col gap-1.5">
                  {refunds.rows.map(r => (
                    <li key={r.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span>{r.reference}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">
                          {money(r.final_amount ?? r.requested_amount)}
                        </span>
                        <StatusBadge status={r.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <InternalNotes entityType="booking" entityId={row.reference} />
          <AuditTrail entityType="booking" entityId={row.reference} title="Historique et modifications" />
        </div>
      </div>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, CheckCircle2, Inbox, Mail, Percent } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  Skeleton,
  Tabs,
  inputClass,
  labelClass,
} from "../components/Ui";
import { Stat } from "../components/Cards";
import { StatusBadge } from "../components/StatusBadge";
import { AuditTrail, InternalNotes } from "../components/Panels";
import { ConfirmDialog, Modal, useConfirm } from "../components/Dialog";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,useRow, useTable } from "../lib/adminData";
import { ago, count, day, money, percent, range } from "../lib/format";
import { PARTNER_TYPE_LABEL, type PartnerRow } from "./Partners";
import { SimpleList } from "./CustomerDetail";

type TabId =
  | "overview"
  | "listings"
  | "reservations"
  | "payments"
  | "payouts"
  | "documents"
  | "reviews"
  | "support"
  | "activity";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "listings", label: "Annonces" },
  { id: "reservations", label: "Réservations" },
  { id: "payments", label: "Paiements" },
  { id: "payouts", label: "Versements" },
  { id: "documents", label: "Documents" },
  { id: "reviews", label: "Avis" },
  { id: "support", label: "Support" },
  { id: "activity", label: "Activité" },
];

/** Spec §15. */
export function PartnerDetail() {
  const { id } = useParams();
  const { can } = useAdmin();
  const [tab, setTab] = useState<TabId>("overview");
  const [commissionOpen, setCommissionOpen] = useState(false);
  const { confirm, dialogProps } = useConfirm();

  const { row, loading, error, reload } = useRow<PartnerRow>("admin_partner_rows", { id: id ?? "" });

  const listings = useTable<{
    id: string;
    name: string;
    city: string | null;
    status: string;
    price: number;
    bookings: number;
    rating: number | null;
  }>({
    from: "admin_listing_rows",
    select: "id, name, city, status, price, bookings, rating",
    filters: [{ col: "partner_id", op: "eq", value: id ?? "" }],
    sort: { col: "name", dir: "asc" },
    pageSize: 100,
    enabled: !!id && (tab === "listings" || tab === "overview"),
  });

  const reservations = useTable<{
    reference: string;
    customer_label: string | null;
    status: string;
    total: number;
    starts_on: string | null;
    ends_on: string | null;
  }>({
    from: "admin_reservation_rows",
    select: "reference, customer_label, status, total, starts_on, ends_on",
    filters: [{ col: "partner_id", op: "eq", value: id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "reservations",
  });

  const payments = useTable<{ id: string; reference: string; amount: number; commission: number; status: string; created_at: string }>({
    from: "payments",
    select: "id, reference, amount, commission, status, created_at",
    filters: [{ col: "partner_id", op: "eq", value: id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "payments",
  });

  const payouts = useTable<{
    id: string;
    reference: string;
    period_start: string;
    period_end: string;
    net: number;
    status: string;
  }>({
    from: "payouts",
    select: "id, reference, period_start, period_end, net, status",
    filters: [{ col: "partner_id", op: "eq", value: id ?? "" }],
    sort: { col: "period_end", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "payouts",
  });

  const reviews = useTable<{ id: string; rating: number; title: string | null; status: string; created_at: string }>({
    from: "reviews",
    select: "id, rating, title, status, created_at",
    filters: [{ col: "partner_id", op: "eq", value: id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "reviews",
  });

  const tickets = useTable<{ id: string; reference: string; subject: string; status: string; updated_at: string }>({
    from: "support_tickets",
    select: "id, reference, subject, status, updated_at",
    filters: [{ col: "partner_id", op: "eq", value: id ?? "" }],
    sort: { col: "updated_at", dir: "desc" },
    pageSize: 50,
    enabled: !!id && tab === "support",
  });

  const documents = useTable<{ doc_type: string; status: string; review_note: string | null; uploaded_at: string }>({
    from: "partner_application_documents",
    select: "doc_type, status, review_note, uploaded_at",
    filters: [{ col: "application_id", op: "eq", value: (row as PartnerRow & { application_id?: string })?.application_id ?? "" }],
    sort: { col: "uploaded_at", dir: "desc" },
    pageSize: 50,
    enabled: tab === "documents" && !!row,
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
        <PageHeader title="Partenaire introuvable" breadcrumb={[{ label: "Partenaires", to: "/admin/partenaires" }]} />
        <EmptyState
          icon={Inbox}
          title="Ce partenaire n'existe pas ou n'est plus accessible."
          action={
            <Button as="link" to="/admin/partenaires" variant="secondary">
              Retour à la liste
            </Button>
          }
        />
      </>
    );
  }

  const setStatus = (next: "suspended" | "active") =>
    confirm({
      title: next === "suspended" ? `Suspendre ${row.business_name} ?` : `Réactiver ${row.business_name} ?`,
      consequence:
        next === "suspended"
          ? `Ses ${count(row.published_listings)} annonce(s) publiée(s) seront immédiatement retirées de la vente et le resteront jusqu'à la réactivation.`
          : "Le partenaire pourra de nouveau recevoir des réservations. Ses annonces doivent être republiées individuellement.",
      confirmLabel: next === "suspended" ? "Suspendre le partenaire" : "Réactiver",
      danger: next === "suspended",
      requireReason: next === "suspended",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_set_partner_status", {
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
        breadcrumb={[{ label: "Partenaires", to: "/admin/partenaires" }, { label: row.business_name }]}
        title={row.business_name}
        subtitle={`${PARTNER_TYPE_LABEL[row.type] ?? row.type}${row.city ? ` · ${row.city}` : ""}${
          row.joined_at ? ` · partenaire depuis le ${day(row.joined_at)}` : ""
        }`}
        actions={
          <>
            {row.email && (
              <Button as="link" to={`mailto:${row.email}`} variant="secondary">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                Contacter
              </Button>
            )}
            {can("manage_commissions") && (
              <Button variant="secondary" onClick={() => setCommissionOpen(true)}>
                <Percent className="h-3.5 w-3.5" aria-hidden />
                Commission
              </Button>
            )}
            {can("suspend_partners") && row.status === "active" && (
              <Button variant="dangerGhost" onClick={() => setStatus("suspended")}>
                <Ban className="h-3.5 w-3.5" aria-hidden />
                Suspendre
              </Button>
            )}
            {can("approve_partners") && row.status !== "active" && (
              <Button variant="primary" onClick={() => setStatus("active")}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Réactiver
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} size="medium" />
        <StatusBadge status={row.verification} size="medium" />
        {row.commission_override !== null && (
          <span className="rounded-md bg-[#fdf1e9] px-2 py-1 text-[12px] font-semibold text-[#c9561c]">
            Commission spécifique : {percent(Number(row.commission_override))}
          </span>
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Annonces" value={`${count(row.published_listings)} / ${count(row.listings)}`} hint="publiées / total" />
              <Stat label="Réservations" value={count(row.bookings)} />
              <Stat label="Revenus bruts" value={money(row.revenue)} />
              <Stat
                label="À verser"
                value={money(row.outstanding_payout)}
                tone={row.outstanding_payout > 0 ? "negative" : undefined}
              />
            </div>

            <Card>
              <CardHeader title="Informations" />
              <FieldGrid>
                <Field label="Raison sociale">{row.business_name}</Field>
                <Field label="Type">{PARTNER_TYPE_LABEL[row.type] ?? row.type}</Field>
                <Field label="Responsable">{row.owner_name ?? "—"}</Field>
                <Field label="Courriel">{row.email ?? "—"}</Field>
                <Field label="Téléphone">{row.phone ?? "—"}</Field>
                <Field label="Ville">{row.city ?? "—"}</Field>
                <Field label="Pays">{row.country}</Field>
                <Field label="Note moyenne">
                  {row.rating ? `${Number(row.rating).toFixed(1).replace(".", ",")} / 5` : "Pas encore noté"}
                </Field>
                <Field label="Inscrit le">{day(row.created_at)}</Field>
              </FieldGrid>
            </Card>

            <Card>
              <CardHeader
                title="Annonces"
                action={
                  <Button variant="ghost" size="sm" onClick={() => setTab("listings")}>
                    Tout voir
                  </Button>
                }
              />
              {listings.loading ? (
                <Skeleton className="h-20 w-full" />
              ) : listings.rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-admin-line-strong px-4 py-6 text-center text-[13px] text-admin-ink-3">
                  Ce partenaire n'a aucune annonce.
                </p>
              ) : (
                <ul className="divide-y divide-admin-line">
                  {listings.rows.slice(0, 5).map(l => (
                    <li key={l.id}>
                      <Link
                        to={`/admin/annonces/${l.id}`}
                        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-admin-canvas"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-admin-ink">{l.name}</span>
                          <span className="block text-[11.5px] text-admin-ink-3">
                            {l.city ?? "—"} · {count(l.bookings)} réservations
                          </span>
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums">{money(l.price)}</span>
                        <StatusBadge status={l.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <InternalNotes entityType="partner" entityId={row.id} />
            <AuditTrail entityType="partner" entityId={row.id} />
          </div>
        </div>
      )}

      {tab === "listings" && (
        <Card padded={false}>
          <SimpleList
            loading={listings.loading}
            empty="Aucune annonce."
            rows={listings.rows.map(l => ({
              key: l.id,
              to: `/admin/annonces/${l.id}`,
              title: l.name,
              sub: `${l.city ?? "—"} · ${count(l.bookings)} réservations`,
              right: money(l.price),
              status: l.status,
            }))}
          />
        </Card>
      )}

      {tab === "reservations" && (
        <Card padded={false}>
          <SimpleList
            loading={reservations.loading}
            empty="Aucune réservation pour ce partenaire."
            rows={reservations.rows.map(b => ({
              key: b.reference,
              to: `/admin/reservations/${b.reference}`,
              title: b.customer_label ?? b.reference,
              sub: `${b.reference} · ${range(b.starts_on, b.ends_on)}`,
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
            empty="Aucun paiement."
            rows={payments.rows.map(p => ({
              key: p.id,
              title: p.reference,
              sub: `${day(p.created_at)} · commission ${money(p.commission)}`,
              right: money(p.amount),
              status: p.status,
            }))}
          />
        </Card>
      )}

      {tab === "payouts" && (
        <Card padded={false}>
          <SimpleList
            loading={payouts.loading}
            empty="Aucun versement encore généré pour ce partenaire."
            rows={payouts.rows.map(p => ({
              key: p.id,
              title: p.reference,
              sub: range(p.period_start, p.period_end),
              right: money(p.net),
              status: p.status,
            }))}
          />
        </Card>
      )}

      {tab === "documents" && (
        <Card padded={false}>
          <SimpleList
            loading={documents.loading}
            empty="Aucun document de vérification lié à ce partenaire."
            rows={documents.rows.map(d => ({
              key: d.doc_type,
              title: d.doc_type,
              sub: `${ago(d.uploaded_at)}${d.review_note ? ` · ${d.review_note}` : ""}`,
              status: d.status,
            }))}
          />
        </Card>
      )}

      {tab === "reviews" && (
        <Card padded={false}>
          <SimpleList
            loading={reviews.loading}
            empty="Aucun avis publié pour ce partenaire."
            rows={reviews.rows.map(r => ({
              key: r.id,
              title: r.title ?? `Note ${r.rating}/5`,
              sub: day(r.created_at),
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
              status: t.status,
            }))}
          />
        </Card>
      )}

      {tab === "activity" && <AuditTrail entityType="partner" entityId={row.id} title="Historique des actions" />}

      <CommissionModal
        open={commissionOpen}
        onClose={() => setCommissionOpen(false)}
        partner={row}
        onSaved={reload}
      />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Partner-specific commission override (spec §30, §55). */
function CommissionModal({
  open,
  onClose,
  partner,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  partner: PartnerRow;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(partner.commission_override?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const parsed = value.trim() === "" ? null : Number(value.replace(",", "."));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)) {
      setError("Entrez un pourcentage entre 0 et 100, ou laissez vide pour utiliser la règle par type.");
      return;
    }
    setBusy(true);
    const { error } = await adminRpc("admin_set_partner_commission", {
      p_id: partner.id,
      p_percentage: parsed,
    });
    setBusy(false);
    if (error) {
      setError(adminError(error));
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Commission du partenaire"
      subtitle={partner.business_name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <label className={labelClass} htmlFor="commission">
        Pourcentage prélevé par PAPOT
      </label>
      <input
        id="commission"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Laisser vide pour appliquer la règle par type"
        className={inputClass}
        inputMode="decimal"
      />
      <p className="mt-2 text-[12.5px] leading-relaxed text-admin-ink-3">
        Une valeur ici remplace la règle du type « {PARTNER_TYPE_LABEL[partner.type] ?? partner.type} ».
        Champ vide : le partenaire suit de nouveau la règle générale. Le changement est enregistré au journal
        d'audit.
      </p>
      {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

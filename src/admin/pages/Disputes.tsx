import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Inbox, Scale, ShieldAlert } from "lucide-react";
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
  inputClass,
  labelClass,
} from "../components/Ui";
import { Stat } from "../components/Cards";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { Modal } from "../components/Dialog";
import { StatusBadge } from "../components/StatusBadge";
import { AuditTrail, InternalNotes } from "../components/Panels";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,searchAcross, useDebounced, useRow, useTable, type Filter } from "../lib/adminData";
import { money, stamp } from "../lib/format";

type DisputeRow = {
  id: string;
  reference: string;
  booking_ref: string | null;
  booking_id: string | null;
  customer_id: string | null;
  customer_label: string | null;
  partner_id: string | null;
  category: string;
  amount: number | null;
  customer_statement: string | null;
  partner_statement: string | null;
  status: string;
  resolution: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  opened_at: string;
};

export const DISPUTE_CATEGORY: Record<string, string> = {
  customer_vs_partner: "Client contre partenaire",
  payment: "Litige de paiement",
  service_not_delivered: "Service non rendu",
  property_issue: "Problème d'hébergement",
  vehicle_issue: "Problème de véhicule",
  restaurant_issue: "Problème de restaurant",
  refund: "Litige de remboursement",
};

const RESOLUTIONS: { value: string; label: string; hint: string }[] = [
  { value: "for_customer", label: "En faveur du client", hint: "Le client obtient gain de cause." },
  { value: "for_partner", label: "En faveur du partenaire", hint: "La réclamation est rejetée." },
  { value: "partial", label: "Résolution partielle", hint: "Chaque partie assume une part." },
  { value: "refund", label: "Remboursement", hint: "Un remboursement est accordé et devra être traité." },
  { value: "credit", label: "Avoir", hint: "Un crédit est accordé au client." },
  { value: "warning", label: "Avertissement au partenaire", hint: "Le dossier est classé avec un avertissement." },
  { value: "partner_suspended", label: "Suspension du partenaire", hint: "À appliquer ensuite depuis sa fiche." },
];

/** Spec §32. */
export function Disputes() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const [values, setValues] = useState<Record<string, string[]>>({});

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["reference", "booking_ref", "customer_label"], debounced)];
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    if (values.category?.length) f.push({ col: "category", op: "in", value: values.category });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<DisputeRow>({
    from: "disputes",
    filters,
    sort: { col: "opened_at", dir: "desc" },
    page,
    pageSize: 25,
  });

  const open = rows.filter(r => r.status !== "resolved" && r.status !== "closed").length;

  const columns: Column<DisputeRow>[] = [
    {
      id: "reference",
      header: "Litige",
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-admin-ink">{r.reference}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">
            {DISPUTE_CATEGORY[r.category] ?? r.category}
          </span>
        </span>
      ),
    },
    { id: "booking_ref", header: "Réservation", mobile: "secondary", cell: r => r.booking_ref ?? "—" },
    { id: "customer_label", header: "Client", mobile: "secondary", cell: r => r.customer_label ?? "—" },
    {
      id: "amount",
      header: "Montant",
      align: "right",
      mobile: "meta",
      cell: r => (r.amount ? money(r.amount) : "—"),
    },
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
    {
      id: "opened_at",
      header: "Ouvert le",
      sortable: true,
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{stamp(r.opened_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Litiges" subtitle="Réclamations entre clients et partenaires, et leur résolution." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ouverts" value={String(open)} tone={open > 0 ? "negative" : undefined} />
        <Stat label="Total" value={String(total)} />
        <Stat label="Résolus" value={String(rows.filter(r => r.status === "resolved").length)} />
        <Stat label="Montant en jeu" value={money(rows.reduce((s, r) => s + Number(r.amount ?? 0), 0))} />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Référence, réservation, client…"
        filters={[
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "open", label: "Ouvert" },
              { value: "investigating", label: "En enquête" },
              { value: "awaiting_evidence", label: "Preuves attendues" },
              { value: "resolved", label: "Résolu" },
              { value: "closed", label: "Fermé" },
            ],
          },
          {
            id: "category",
            label: "Catégorie",
            options: Object.entries(DISPUTE_CATEGORY).map(([value, label]) => ({ value, label })),
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="disputes"
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => r.id}
        rowHref={r => `/admin/litiges/${r.id}`}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="disputes"
        empty={{
          title: "Aucun litige en cours",
          body: "Aucun dossier ne demande d'arbitrage pour le moment.",
        }}
      />
    </>
  );
}

/** Spec §32 — the dispute file: both statements, the evidence, the decision. */
export function DisputeDetail() {
  const { id } = useParams();
  const { can } = useAdmin();
  const [resolving, setResolving] = useState(false);

  const { row, loading, error, reload } = useRow<DisputeRow>("disputes", { id: id ?? "" });

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (error || !row) {
    return (
      <>
        <PageHeader title="Litige introuvable" breadcrumb={[{ label: "Litiges", to: "/admin/litiges" }]} />
        <EmptyState
          icon={Inbox}
          title="Ce litige n'existe pas ou n'est plus accessible."
          action={
            <Button as="link" to="/admin/litiges" variant="secondary">
              Retour aux litiges
            </Button>
          }
        />
      </>
    );
  }

  const settled = row.status === "resolved" || row.status === "closed";

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Litiges", to: "/admin/litiges" }, { label: row.reference }]}
        title={`Litige ${row.reference}`}
        subtitle={`${DISPUTE_CATEGORY[row.category] ?? row.category} · ouvert le ${stamp(row.opened_at)}`}
        actions={
          can("resolve_disputes") && !settled ? (
            <Button variant="primary" onClick={() => setResolving(true)}>
              <Scale className="h-3.5 w-3.5" aria-hidden />
              Rendre une décision
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} size="medium" />
        {row.amount && (
          <span className="rounded-md bg-admin-canvas px-2 py-1 text-[12.5px] font-semibold text-admin-ink">
            {money(row.amount)} en jeu
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Déclaration du client" />
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-admin-ink">
                {row.customer_statement ?? "Aucune déclaration fournie."}
              </p>
              {row.customer_id && (
                <Link
                  to={`/admin/clients/${row.customer_id}`}
                  className="mt-3 inline-block text-[13px] font-semibold text-[#002089] hover:underline"
                >
                  Voir la fiche du client
                </Link>
              )}
            </Card>

            <Card>
              <CardHeader title="Déclaration du partenaire" />
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-admin-ink">
                {row.partner_statement ?? "Aucune déclaration fournie."}
              </p>
              {row.partner_id && (
                <Link
                  to={`/admin/partenaires/${row.partner_id}`}
                  className="mt-3 inline-block text-[13px] font-semibold text-[#002089] hover:underline"
                >
                  Voir la fiche du partenaire
                </Link>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Éléments du dossier" />
            <FieldGrid>
              <Field label="Référence">{row.reference}</Field>
              <Field label="Catégorie">{DISPUTE_CATEGORY[row.category] ?? row.category}</Field>
              <Field label="Réservation">
                {row.booking_ref ? (
                  <Link to={`/admin/reservations/${row.booking_ref}`} className="text-[#002089] hover:underline">
                    {row.booking_ref}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Montant contesté">{row.amount ? money(row.amount) : "—"}</Field>
              <Field label="Ouvert le">{stamp(row.opened_at)}</Field>
              <Field label="Résolu le">{row.resolved_at ? stamp(row.resolved_at) : "—"}</Field>
            </FieldGrid>
          </Card>

          {settled && (
            <Card>
              <CardHeader title="Décision" />
              <p className="text-[13.5px] font-semibold text-admin-ink">
                {RESOLUTIONS.find(r => r.value === row.resolution)?.label ?? row.resolution}
              </p>
              {row.resolution_note && (
                <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-admin-ink-2">
                  {row.resolution_note}
                </p>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <InternalNotes entityType="dispute" entityId={row.id} />
          <AuditTrail entityType="dispute" entityId={row.id} />
        </div>
      </div>

      <ResolveModal
        open={resolving}
        onClose={() => setResolving(false)}
        dispute={row}
        onDone={reload}
      />
    </>
  );
}

function ResolveModal({
  open,
  onClose,
  dispute,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  dispute: DisputeRow;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState("for_customer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (note.trim().length < 5) {
      setError("Expliquez la décision : elle est conservée au dossier et au journal d'audit.");
      return;
    }
    setBusy(true);
    const { error } = await adminRpc("admin_resolve_dispute", {
      p_id: dispute.id,
      p_resolution: resolution,
      p_note: note.trim(),
    });
    setBusy(false);
    if (error) {
      setError(adminError(error));
      return;
    }
    onDone();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Résoudre le litige ${dispute.reference}`}
      subtitle="La décision est définitive et visible dans l'historique du dossier."
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            Enregistrer la décision
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className={labelClass}>Décision</legend>
        <div className="flex flex-col gap-1.5">
          {RESOLUTIONS.map(r => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                resolution === r.value ? "border-[#002089] bg-[#f4f8fd]" : "border-admin-line hover:bg-admin-canvas"
              }`}
            >
              <input
                type="radio"
                name="resolution"
                value={r.value}
                checked={resolution === r.value}
                onChange={() => setResolution(r.value)}
                className="mt-0.5 h-4 w-4 accent-[#002089]"
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-admin-ink">{r.label}</span>
                <span className="block text-[12px] text-admin-ink-3">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={`${labelClass} mt-4`} htmlFor="resolution-note">
        Motivation de la décision <span className="text-[#b3261e]">*</span>
      </label>
      <textarea
        id="resolution-note"
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={4}
        placeholder="Expliquez ce qui a été constaté et pourquoi cette issue a été retenue."
        className={`${inputClass} h-auto py-2 leading-relaxed`}
      />

      {resolution === "refund" && (
        <p className="mt-3 rounded-lg bg-[#fdf8ee] px-3 py-2 text-[12.5px] leading-relaxed text-[#7a5b12]">
          Cette décision ne déclenche pas le versement : créez ensuite la demande dans Remboursements pour que
          l'argent soit réellement rendu.
        </p>
      )}
      {resolution === "partner_suspended" && (
        <p className="mt-3 rounded-lg bg-[#fdf3f2] px-3 py-2 text-[12.5px] leading-relaxed text-[#8a2b24]">
          La suspension s'applique depuis la fiche du partenaire : cette décision documente le dossier, elle ne
          bloque pas le compte à elle seule.
        </p>
      )}

      {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

export { ShieldAlert };

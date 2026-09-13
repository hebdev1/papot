import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Inbox,
  ShieldAlert,
  XCircle,
} from "lucide-react";
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
  Tabs,
} from "../components/Ui";
import { Stat } from "../components/Cards";
import { StatusBadge } from "../components/StatusBadge";
import { AuditTrail, InternalNotes } from "../components/Panels";
import { ConfirmDialog, useConfirm } from "../components/Dialog";
import { DataTable, type Column } from "../components/DataTable";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,useRow, useRpc, useTable } from "../lib/adminData";
import { ago, day, money, stamp } from "../lib/format";
import { PARTNER_TYPE_LABEL } from "./Partners";
import { PARTNER_DOCUMENTS_BUCKET } from "../../lib/supabase";

type ApplicationRow = {
  id: string;
  business_name: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  department: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  review_note: string | null;
};

const QUEUES = [
  { id: "new", label: "Nouveaux" },
  { id: "reviewing", label: "En examen" },
  { id: "accepted", label: "Acceptés" },
  { id: "rejected", label: "Refusés" },
] as const;

/** Spec §16 — the verification queue. */
export function Verification() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<(typeof QUEUES)[number]["id"]>("new");
  const [page, setPage] = useState(1);

  const { rows, total, loading, error, reload } = useTable<ApplicationRow>({
    from: "partner_applications",
    select:
      "id, business_name, type, first_name, last_name, email, phone, city, department, status, submitted_at, created_at, review_note",
    filters: [{ col: "status", op: "eq", value: queue }],
    sort: { col: "submitted_at", dir: "asc" },
    page,
    pageSize: 25,
  });

  const { data: stats } = useRpc<{ pending: number; total: number }>("admin_partner_stats");

  const columns: Column<ApplicationRow>[] = [
    {
      id: "business_name",
      header: "Entreprise",
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{r.business_name}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">
            {PARTNER_TYPE_LABEL[r.type] ?? r.type}
            {r.city ? ` · ${r.city}` : ""}
          </span>
        </span>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      mobile: "secondary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{r.email ?? "—"}</span>
        </span>
      ),
    },
    { id: "phone", header: "Téléphone", defaultHidden: true, mobile: "hidden", cell: r => r.phone ?? "—" },
    { id: "department", header: "Département", mobile: "hidden", cell: r => r.department ?? "—" },
    {
      id: "submitted_at",
      header: "Soumis",
      sortable: true,
      mobile: "secondary",
      cell: r => (
        <span className="text-admin-ink-3">{r.submitted_at ? ago(r.submitted_at) : "Brouillon"}</span>
      ),
    },
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Vérification des partenaires"
        subtitle="Chaque dossier est examiné pièce par pièce avant l'ouverture d'un compte partenaire."
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Dossiers à traiter" value={String(stats?.pending ?? 0)} />
        <Stat label="Partenaires actifs" value={String(stats?.total ?? 0)} />
        <Stat label="Dans cette file" value={String(total)} />
        <Stat label="Délai cible" value="48 h" hint="depuis la soumission" />
      </div>

      <Tabs tabs={QUEUES.map(q => ({ id: q.id, label: q.label }))} active={queue} onChange={q => {
        setQueue(q);
        setPage(1);
      }} />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => r.id}
        rowHref={r => `/admin/verification/${r.id}`}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="verification"
        actions={[{ label: "Ouvrir le dossier", onClick: r => navigate(`/admin/verification/${r.id}`) }]}
        empty={{
          title:
            queue === "new"
              ? "Aucun partenaire en attente d'approbation"
              : `Aucun dossier dans « ${QUEUES.find(q => q.id === queue)?.label} »`,
          body: queue === "new" ? "Vous êtes à jour." : undefined,
        }}
      />
    </>
  );
}

type DocRow = {
  doc_type: string;
  storage_path: string;
  status: string;
  review_note: string | null;
  uploaded_at: string;
};

type DocType = { code: string; label_fr: string; applies_to: string[]; required: boolean; position: number };

/** Spec §16 — the verification workspace for one application. */
export function VerificationDetail() {
  const { id } = useParams();
  const { can } = useAdmin();
  const navigate = useNavigate();
  const { confirm, dialogProps } = useConfirm();
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);

  const { row, loading, error, reload } = useRow<
    ApplicationRow & {
      legal_name: string | null;
      business_email: string | null;
      business_phone: string | null;
      website: string | null;
      short_desc: string | null;
      full_desc: string | null;
      year_established: number | null;
      rooms_count: number | null;
      fleet_size: number | null;
      seats_capacity: number | null;
      max_capacity: number | null;
      daily_rate: number | null;
      price_band: string | null;
      payout_method: string | null;
      payout_holder: string | null;
      payout_bank: string | null;
      payout_account_last4: string | null;
      payout_mobile_service: string | null;
      neighborhood: string | null;
      commune: string | null;
      landmark: string | null;
      photos: string[] | null;
      reviewed_at: string | null;
    }
  >("partner_applications", { id: id ?? "" });

  const docs = useTable<DocRow>({
    from: "partner_application_documents",
    select: "doc_type, storage_path, status, review_note, uploaded_at",
    filters: [{ col: "application_id", op: "eq", value: id ?? "" }],
    sort: { col: "doc_type", dir: "asc" },
    pageSize: 50,
    enabled: !!id,
  });

  const docTypes = useTable<DocType>({
    from: "partner_document_types",
    select: "code, label_fr, applies_to, required, position",
    sort: { col: "position", dir: "asc" },
    pageSize: 50,
  });

  /** Required documents for this partner type, joined to what was uploaded. */
  const checklist = useMemo(() => {
    if (!row) return [];
    return docTypes.rows
      .filter(t => t.applies_to?.includes(row.type))
      .map(t => ({
        ...t,
        doc: docs.rows.find(d => d.doc_type === t.code) ?? null,
      }));
  }, [docTypes.rows, docs.rows, row]);

  const missingRequired = checklist.filter(c => c.required && !c.doc);
  const rejectedDocs = checklist.filter(c => c.doc?.status === "rejected");
  const allApproved =
    checklist.length > 0 && checklist.filter(c => c.required).every(c => c.doc?.status === "approved");

  const openDoc = async (doc: DocRow, label: string) => {
    // Verification papers live in a private bucket; a short-lived signed URL is
    // the only way to view one, and it expires rather than leaking.
    const { data, error } = await supabase.storage
      .from(PARTNER_DOCUMENTS_BUCKET)
      .createSignedUrl(doc.storage_path, 300);
    if (error || !data) return;
    setPreview({ url: data.signedUrl, label });
  };

  const setDocStatus = (code: string, label: string, status: "approved" | "rejected" | "under_review") =>
    confirm({
      title:
        status === "approved" ? `Valider « ${label} » ?` : status === "rejected" ? `Refuser « ${label} » ?` : `Marquer « ${label} » en examen ?`,
      consequence:
        status === "rejected"
          ? "Le partenaire sera invité à téléverser un nouveau document. Le motif lui sera transmis."
          : status === "approved"
            ? "Ce document est considéré comme conforme pour ce dossier."
            : "Le document reste en attente d'une décision.",
      confirmLabel: status === "approved" ? "Valider" : status === "rejected" ? "Refuser le document" : "Marquer en examen",
      danger: status === "rejected",
      requireReason: status === "rejected",
      reasonLabel: "Motif du refus",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_set_document_status", {
          p_application: id,
          p_doc_type: code,
          p_status: status,
          p_note: reason || null,
        });
        if (error) return adminError(error);
        docs.reload();
        return null;
      },
    });

  const decide = (decision: "accept" | "reject" | "request_changes" | "escalate") =>
    confirm({
      title:
        decision === "accept"
          ? `Approuver ${row?.business_name} ?`
          : decision === "reject"
            ? `Refuser ${row?.business_name} ?`
            : decision === "escalate"
              ? "Escalader ce dossier ?"
              : "Demander des modifications ?",
      consequence:
        decision === "accept"
          ? "Un compte partenaire actif est créé immédiatement et l'entreprise peut publier des annonces."
          : decision === "reject"
            ? "Le dossier est clos. Le motif est conservé et transmis au demandeur."
            : decision === "escalate"
              ? "Le dossier repasse en examen et reste dans la file pour un second avis."
              : "Le dossier repasse en examen et le demandeur reçoit la liste des corrections attendues.",
      confirmLabel:
        decision === "accept"
          ? "Approuver le partenaire"
          : decision === "reject"
            ? "Refuser le dossier"
            : decision === "escalate"
              ? "Escalader"
              : "Demander des modifications",
      danger: decision === "reject",
      requireReason: decision === "reject" || decision === "request_changes",
      reasonLabel: decision === "reject" ? "Motif du refus" : "Modifications demandées",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_decide_application", {
          p_id: id,
          p_decision: decision,
          p_note: reason || null,
        });
        if (error) return adminError(error);
        reload();
        if (decision === "accept") navigate("/admin/partenaires");
        return null;
      },
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
        <PageHeader title="Dossier introuvable" breadcrumb={[{ label: "Vérification", to: "/admin/verification" }]} />
        <EmptyState
          icon={Inbox}
          title="Ce dossier n'existe pas ou n'est plus accessible."
          action={
            <Button as="link" to="/admin/verification" variant="secondary">
              Retour à la file
            </Button>
          }
        />
      </>
    );
  }

  const decided = row.status === "accepted" || row.status === "rejected";

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Vérification", to: "/admin/verification" }, { label: row.business_name }]}
        title={row.business_name}
        subtitle={`${PARTNER_TYPE_LABEL[row.type] ?? row.type} · soumis ${
          row.submitted_at ? ago(row.submitted_at) : "—"
        }`}
        actions={
          can("manage_verification") && !decided ? (
            <>
              <Button variant="secondary" onClick={() => decide("escalate")}>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                Escalader
              </Button>
              <Button variant="secondary" onClick={() => decide("request_changes")}>
                Demander des modifications
              </Button>
              <Button variant="dangerGhost" onClick={() => decide("reject")}>
                <XCircle className="h-3.5 w-3.5" aria-hidden />
                Refuser
              </Button>
              <Button variant="primary" onClick={() => decide("accept")} disabled={!can("approve_partners")}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Approuver
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} size="medium" />
        {row.reviewed_at && (
          <span className="text-[12.5px] text-admin-ink-3">Décision le {stamp(row.reviewed_at)}</span>
        )}
      </div>

      {decided && row.review_note && (
        <div className="mb-5">
          <Callout tone={row.status === "rejected" ? "warning" : "info"}>
            <strong className="font-semibold">Note de décision :</strong> {row.review_note}
          </Callout>
        </div>
      )}

      {!decided && missingRequired.length > 0 && (
        <div className="mb-5">
          <Callout tone="warning">
            <strong className="font-semibold">
              {missingRequired.length} document{missingRequired.length > 1 ? "s" : ""} obligatoire
              {missingRequired.length > 1 ? "s" : ""} manquant{missingRequired.length > 1 ? "s" : ""} :
            </strong>{" "}
            {missingRequired.map(m => m.label_fr).join(", ")}. Approuver reste possible, mais le dossier sera
            incomplet.
          </Callout>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader title="Identité de l'entreprise" />
            <FieldGrid>
              <Field label="Nom commercial">{row.business_name}</Field>
              <Field label="Raison sociale">{row.legal_name ?? "—"}</Field>
              <Field label="Responsable">
                {[row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}
              </Field>
              <Field label="Courriel">{row.business_email ?? row.email ?? "—"}</Field>
              <Field label="Téléphone">{row.business_phone ?? row.phone ?? "—"}</Field>
              <Field label="Site web">{row.website ?? "—"}</Field>
              <Field label="Année de création">{row.year_established ?? "—"}</Field>
              <Field label="Ville">{row.city ?? "—"}</Field>
              <Field label="Département">{row.department ?? "—"}</Field>
              <Field label="Commune">{row.commune ?? "—"}</Field>
              <Field label="Quartier">{row.neighborhood ?? "—"}</Field>
              <Field label="Point de repère">{row.landmark ?? "—"}</Field>
            </FieldGrid>

            {row.short_desc && (
              <div className="mt-4 border-t border-admin-line pt-4">
                <Field label="Description">
                  <span className="font-normal leading-relaxed">{row.short_desc}</span>
                </Field>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Capacité et tarifs" />
            <FieldGrid cols={4}>
              {row.rooms_count !== null && <Field label="Chambres">{row.rooms_count}</Field>}
              {row.max_capacity !== null && <Field label="Capacité">{row.max_capacity}</Field>}
              {row.fleet_size !== null && <Field label="Véhicules">{row.fleet_size}</Field>}
              {row.seats_capacity !== null && <Field label="Couverts">{row.seats_capacity}</Field>}
              {row.daily_rate !== null && <Field label="Tarif journalier">{money(row.daily_rate)}</Field>}
              {row.price_band && <Field label="Gamme de prix">{row.price_band}</Field>}
            </FieldGrid>
          </Card>

          {/* Documents (spec §16) */}
          <Card>
            <CardHeader
              title="Documents de vérification"
              subtitle="Pièces requises pour ce type de partenaire."
              action={
                allApproved ? (
                  <span className="flex items-center gap-1.5 rounded-md bg-[#eef7f0] px-2 py-1 text-[12px] font-semibold text-[#15803d]">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Tout est validé
                  </span>
                ) : undefined
              }
            />

            {docTypes.loading || docs.loading ? (
              <Skeleton className="h-32 w-full" />
            ) : checklist.length === 0 ? (
              <p className="text-[13px] text-admin-ink-3">Aucun document requis pour ce type.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {checklist.map(c => (
                  <li
                    key={c.code}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-admin-line px-3.5 py-3"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-admin-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-admin-ink">
                        {c.label_fr}
                        {c.required && <span className="ml-1.5 text-[11px] text-[#b3261e]">obligatoire</span>}
                      </span>
                      <span className="block text-[11.5px] text-admin-ink-3">
                        {c.doc ? `Téléversé ${ago(c.doc.uploaded_at)}` : "Non fourni"}
                        {c.doc?.review_note ? ` · ${c.doc.review_note}` : ""}
                      </span>
                    </span>

                    {c.doc ? <StatusBadge status={c.doc.status} /> : <StatusBadge status="pending" />}

                    {c.doc && (
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openDoc(c.doc!, c.label_fr)}>
                          Ouvrir
                        </Button>
                        {can("manage_verification") && !decided && c.doc.status !== "approved" && (
                          <Button size="sm" variant="primary" onClick={() => setDocStatus(c.code, c.label_fr, "approved")}>
                            Valider
                          </Button>
                        )}
                        {can("manage_verification") && !decided && c.doc.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="dangerGhost"
                            onClick={() => setDocStatus(c.code, c.label_fr, "rejected")}
                          >
                            Refuser
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {rejectedDocs.length > 0 && (
              <div className="mt-3">
                <Callout tone="warning">
                  {rejectedDocs.length} document{rejectedDocs.length > 1 ? "s ont" : " a"} été refusé
                  {rejectedDocs.length > 1 ? "s" : ""}. Le partenaire doit en téléverser de nouveaux avant
                  approbation.
                </Callout>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Informations de versement"
              subtitle="Seuls les quatre derniers chiffres sont conservés."
            />
            <FieldGrid>
              <Field label="Méthode">{row.payout_method ?? "—"}</Field>
              <Field label="Titulaire">{row.payout_holder ?? "—"}</Field>
              <Field label="Banque">{row.payout_bank ?? "—"}</Field>
              <Field label="Compte">
                {row.payout_account_last4 ? `•••• ${row.payout_account_last4}` : "—"}
              </Field>
              <Field label="Service mobile">{row.payout_mobile_service ?? "—"}</Field>
            </FieldGrid>
            <div className="mt-3">
              <Callout>
                Le numéro de compte complet n'est jamais enregistré par la plateforme : seuls les quatre
                derniers chiffres le sont, pour rapprochement.
              </Callout>
            </div>
          </Card>

          {row.photos && row.photos.length > 0 && (
            <Card>
              <CardHeader title="Photos" subtitle={`${row.photos.length} image(s) fournie(s).`} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {row.photos.map((p, i) => (
                  <img
                    key={i}
                    src={p}
                    alt={`Photo ${i + 1} de ${row.business_name}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-lg border border-admin-line object-cover"
                  />
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Résumé de la décision" />
            <ul className="flex flex-col gap-2 text-[13px]">
              <li className="flex items-center justify-between gap-3">
                <span className="text-admin-ink-2">Documents obligatoires</span>
                <span className="font-semibold">
                  {checklist.filter(c => c.required && c.doc?.status === "approved").length} /{" "}
                  {checklist.filter(c => c.required).length}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-admin-ink-2">Documents refusés</span>
                <span className={rejectedDocs.length ? "font-semibold text-[#b3261e]" : "font-semibold"}>
                  {rejectedDocs.length}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-admin-ink-2">Dossier soumis</span>
                <span className="font-semibold">{row.submitted_at ? day(row.submitted_at) : "—"}</span>
              </li>
            </ul>

            {!can("approve_partners") && can("manage_verification") && (
              <div className="mt-4">
                <Callout tone="warning">
                  Vous pouvez traiter les documents, mais l'approbation finale demande la permission
                  <code className="mx-1 rounded bg-white px-1 py-0.5 text-[12px]">approve_partners</code>.
                </Callout>
              </div>
            )}
          </Card>

          <InternalNotes entityType="application" entityId={row.id} />
          <AuditTrail entityType="application" entityId={row.id} />
        </div>
      </div>

      {/* Document preview. Signed URLs expire in five minutes. */}
      {preview && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#101828]/80 p-4" onClick={() => setPreview(null)}>
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-xl bg-white">
            <header className="flex items-center justify-between border-b border-admin-line px-4 py-3">
              <p className="font-display text-[14px] font-semibold text-admin-ink">{preview.label}</p>
              <div className="flex items-center gap-2">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[13px] font-semibold text-[#002089] hover:underline"
                >
                  Ouvrir dans un onglet
                </a>
                <Button size="sm" variant="secondary" onClick={() => setPreview(null)}>
                  Fermer
                </Button>
              </div>
            </header>
            <iframe
              src={preview.url}
              title={preview.label}
              className="min-h-0 flex-1 bg-admin-canvas"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export { ClipboardCheck, ShieldAlert };

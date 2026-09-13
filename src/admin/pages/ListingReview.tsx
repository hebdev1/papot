import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, ExternalLink, Inbox, MinusCircle, Star, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
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
import { adminRpc,useRow } from "../lib/adminData";
import { count, money, stamp } from "../../console/format";
import { KIND_LABEL, type ListingRow } from "./Listings";

/**
 * Spec §19 — the listing review workspace.
 *
 * The preview is on the left and the checklist on the right, so a reviewer
 * judges what a guest will actually see rather than a form. The checklist is
 * per-reviewer working state kept in localStorage: it guides the decision, it
 * is not a record, and the decision itself is what gets audited.
 */

const CHECKLIST = [
  { id: "business", label: "Informations de l'entreprise", hint: "Nom, type, rattachement au partenaire." },
  { id: "location", label: "Localisation", hint: "Ville et adresse cohérentes et exploitables." },
  { id: "photos", label: "Photos", hint: "Nettes, représentatives, sans filigrane ni coordonnées." },
  { id: "pricing", label: "Tarifs", hint: "Prix crédible et devise correcte." },
  { id: "availability", label: "Disponibilité", hint: "Calendrier ou horaires renseignés." },
  { id: "policies", label: "Politiques", hint: "Annulation et conditions affichées." },
  { id: "verification", label: "Vérification du partenaire", hint: "Dossier partenaire validé." },
  { id: "quality", label: "Qualité de la fiche", hint: "Description utile, sans faute grossière." },
  { id: "duplicate", label: "Contrôle de doublon", hint: "Aucune annonce identique déjà publiée." },
];

type Mark = "ok" | "changes" | "na" | null;

export function ListingReview() {
  const { id } = useParams();
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  const { row, loading, error, reload } = useRow<ListingRow & { amenities: string[] | null; attrs: Record<string, unknown> | null; location: string | null; free_cancellation: boolean; breakfast: boolean }>(
    "admin_listing_rows",
    { id: id ?? "" },
  );

  const storageKey = `papot.admin.review.${id}`;
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setMarks(JSON.parse(saved) as Record<string, Mark>);
      } catch {
        /* ignore malformed state */
      }
    }
  }, [storageKey]);

  const mark = (key: string, value: Mark) => {
    const next = { ...marks, [key]: marks[key] === value ? null : value };
    setMarks(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  if (loading) {
    return (
      <>
        <Skeleton className="mb-3 h-4 w-48" />
        <Skeleton className="mb-6 h-9 w-72" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </>
    );
  }

  if (error || !row) {
    return (
      <>
        <PageHeader title="Annonce introuvable" breadcrumb={[{ label: "Annonces", to: "/admin/annonces" }]} />
        <EmptyState
          icon={Inbox}
          title="Cette annonce n'existe pas ou n'est plus accessible."
          action={
            <Button as="link" to="/admin/annonces" variant="secondary">
              Retour aux annonces
            </Button>
          }
        />
      </>
    );
  }

  const reviewed = CHECKLIST.filter(c => marks[c.id] === "ok" || marks[c.id] === "na").length;
  const flagged = CHECKLIST.filter(c => marks[c.id] === "changes");
  const complete = reviewed === CHECKLIST.length;

  const decide = (next: string, label: string, danger = false, needsReason = false) =>
    confirm({
      title: `${label} « ${row.name} » ?`,
      consequence:
        next === "published"
          ? "L'annonce devient immédiatement visible et réservable sur le site public."
          : next === "rejected"
            ? "Le partenaire reçoit le motif et devra soumettre une version corrigée. L'annonce n'est pas visible."
            : "L'annonce est retirée de la vente.",
      confirmLabel: label,
      danger,
      requireReason: needsReason,
      reasonLabel: next === "rejected" ? "Modifications requises" : "Motif",
      reasonHint:
        flagged.length > 0
          ? `Points signalés : ${flagged.map(f => f.label).join(", ")}`
          : "Ce texte est transmis au partenaire et conservé au journal d'audit.",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_set_listing_status", {
          p_id: row.id,
          p_status: next,
          p_note: reason || null,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Annonces", to: "/admin/annonces" }, { label: row.name }]}
        title={row.name}
        subtitle={`${KIND_LABEL[row.kind] ?? row.kind}${row.partner_name ? ` · ${row.partner_name}` : ""}${
          row.city ? ` · ${row.city}` : ""
        }`}
        actions={
          <>
            {row.status === "published" && (
              <Button as="link" to={`/p/${row.id}`} variant="secondary">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Voir en ligne
              </Button>
            )}
            {can("moderate_listings") && (
              <>
                <Button variant="secondary" onClick={() => decide("rejected", "Demander des modifications", false, true)}>
                  Demander des modifications
                </Button>
                <Button variant="dangerGhost" onClick={() => decide("suspended", "Suspendre", true, true)}>
                  <XCircle className="h-3.5 w-3.5" aria-hidden />
                  Suspendre
                </Button>
                <Button variant="primary" onClick={() => decide("published", "Publier")}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Publier
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} size="medium" />
        {row.submitted_at && (
          <span className="text-[12.5px] text-admin-ink-3">Soumise le {stamp(row.submitted_at)}</span>
        )}
      </div>

      {row.review_note && (
        <div className="mb-5">
          <Callout tone="warning">
            <strong className="font-semibold">Dernière note de revue :</strong> {row.review_note}
          </Callout>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Preview */}
        <div className="flex flex-col gap-4 xl:col-span-3">
          <Card padded={false}>
            <div className="border-b border-admin-line px-5 py-3.5">
              <h2 className="font-display text-[15px] font-semibold text-admin-ink">Aperçu de l'annonce</h2>
              <p className="text-[12.5px] text-admin-ink-3">Ce que verra un voyageur.</p>
            </div>

            {row.img ? (
              <img src={row.img} alt={row.name} className="aspect-[16/9] w-full object-cover" />
            ) : (
              <div className="flex aspect-[16/9] w-full items-center justify-center bg-admin-canvas text-[13px] text-admin-ink-3">
                Aucune photo fournie
              </div>
            )}

            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                    {row.type ?? KIND_LABEL[row.kind]}
                  </p>
                  <h3 className="font-display text-xl font-semibold text-admin-ink">{row.name}</h3>
                  <p className="mt-0.5 text-[13px] text-admin-ink-2">{row.location ?? row.city ?? "—"}</p>
                </div>
                {row.rating && (
                  <span className="flex shrink-0 items-center gap-1 rounded-lg bg-[#eef3fb] px-2 py-1 text-[13px] font-semibold text-[#002089]">
                    <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                    {Number(row.rating).toFixed(1).replace(".", ",")}
                    <span className="font-normal text-admin-ink-3">({count(row.reviews)})</span>
                  </span>
                )}
              </div>

              {Number(row.price) > 0 && (
                <p className="mt-3 font-display text-lg font-semibold text-admin-ink">
                  {money(row.price, row.currency)}
                  <span className="ml-1 text-[13px] font-normal text-admin-ink-3">
                    {row.kind === "car" ? "/ jour" : row.kind === "stay" ? "/ nuit" : ""}
                  </span>
                </p>
              )}

              {row.amenities && row.amenities.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {row.amenities.slice(0, 12).map(a => (
                    <span
                      key={a}
                      className="rounded-md bg-admin-canvas px-2 py-1 text-[12px] font-medium text-admin-ink-2"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Données de l'annonce" />
            <FieldGrid>
              <Field label="Service">{KIND_LABEL[row.kind] ?? row.kind}</Field>
              <Field label="Catégorie">{row.type ?? "—"}</Field>
              <Field label="Partenaire">
                {row.partner_id ? (
                  <Link to={`/admin/partenaires/${row.partner_id}`} className="text-[#002089] hover:underline">
                    {row.partner_name}
                  </Link>
                ) : (
                  <span className="text-[#b3261e]">Non rattachée à un partenaire</span>
                )}
              </Field>
              <Field label="Ville">{row.city ?? "—"}</Field>
              <Field label="Pays">{row.country ?? "—"}</Field>
              <Field label="Prix">{Number(row.price) > 0 ? money(row.price, row.currency) : "—"}</Field>
              <Field label="Réservations">{count(row.bookings)}</Field>
              <Field label="Annulation gratuite">{row.free_cancellation ? "Oui" : "Non"}</Field>
              <Field label="Dernière mise à jour">{stamp(row.updated_at)}</Field>
            </FieldGrid>
          </Card>
        </div>

        {/* Checklist */}
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Grille de contrôle"
              subtitle={`${reviewed} / ${CHECKLIST.length} points examinés`}
              action={
                complete ? (
                  <span className="rounded-md bg-[#eef7f0] px-2 py-1 text-[11.5px] font-semibold text-[#15803d]">
                    Complet
                  </span>
                ) : undefined
              }
            />

            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-admin-line">
              <div
                className="h-full rounded-full bg-[#002089] transition-[width] duration-300"
                style={{ width: `${(reviewed / CHECKLIST.length) * 100}%` }}
              />
            </div>

            <ul className="flex flex-col gap-1.5">
              {CHECKLIST.map(c => {
                const m = marks[c.id] ?? null;
                return (
                  <li key={c.id} className="rounded-lg border border-admin-line px-3 py-2.5">
                    <p className="text-[13px] font-medium text-admin-ink">{c.label}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-admin-ink-3">{c.hint}</p>
                    <div className="mt-2 flex gap-1">
                      {(
                        [
                          ["ok", "Conforme", CheckCircle2, "text-[#15803d] border-[#d7e6d9] bg-[#eef7f0]"],
                          ["changes", "À corriger", XCircle, "text-[#b3261e] border-[#f0cfcd] bg-[#fdf3f2]"],
                          ["na", "Sans objet", MinusCircle, "text-admin-ink-3 border-admin-line bg-admin-canvas"],
                        ] as const
                      ).map(([value, label, Icon, active]) => (
                        <button
                          key={value}
                          onClick={() => mark(c.id, value as Mark)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold transition-colors",
                            m === value
                              ? active
                              : "border-admin-line text-admin-ink-3 hover:bg-admin-canvas",
                          )}
                        >
                          <Icon className="h-3 w-3" aria-hidden />
                          {label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-3 text-[11.5px] leading-relaxed text-admin-ink-3">
              Cette grille est votre brouillon de travail : elle reste sur cet appareil. Seule la décision
              finale et son motif sont enregistrés.
            </p>
          </Card>

          {flagged.length > 0 && (
            <Callout tone="warning">
              <strong className="font-semibold">{flagged.length} point(s) à corriger :</strong>{" "}
              {flagged.map(f => f.label).join(", ")}. Ils seront proposés comme motif au moment de demander
              des modifications.
            </Callout>
          )}

          <InternalNotes entityType="listing" entityId={row.id} />
          <AuditTrail entityType="listing" entityId={row.id} />
        </div>
      </div>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

import { useState } from "react";
import { Building2, Loader2, Plus, ScrollText, Shield, UserCog } from "lucide-react";
import { Button, Callout, Card, CardHeader, EmptyState, Field, FieldGrid, PageHeader, Skeleton, inputClass, labelClass, selectClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { StatusBadge } from "../../console/StatusBadge";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { friendlyError, table, useRow, useTable } from "../../console/data";
import { ago, avatarTint, count, day, initials, stamp } from "../../console/format";
import { ROLE_LABEL, TYPE_LABEL, usePartner, type PartnerRole } from "../lib/partnerAuth";

/** Spec §47–§48. */
export function BusinessProfile() {
  const { active, can, reload: reloadMe } = usePartner();
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { row, loading, reload } = useRow<Record<string, string | null>>(
    "partners",
    { id: active?.partner_id ?? "" },
    "*",
    !!active,
  );

  const value = (k: string) => form[k] ?? String(row?.[k] ?? "");
  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const save = async () => {
    if (!active) return;
    setBusy(true);
    const { error } = await table("partners")
      .update({
        business_name: value("business_name"),
        legal_name: value("legal_name") || null,
        owner_name: value("owner_name") || null,
        email: value("email") || null,
        phone: value("phone") || null,
        city: value("city") || null,
        department: value("department") || null,
      })
      .eq("id", active.partner_id);
    setBusy(false);

    if (error) return setError(friendlyError(error));
    setError(null);
    setSaved(true);
    reload();
    reloadMe();
  };

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <>
      <PageHeader
        title="Profil de l'entreprise"
        subtitle="Ce que les voyageurs et PAPOT savent de vous."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Informations" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["business_name", "Nom commercial"],
              ["legal_name", "Raison sociale"],
              ["owner_name", "Responsable"],
              ["email", "Courriel"],
              ["phone", "Téléphone"],
              ["city", "Ville"],
              ["department", "Département"],
            ].map(([k, label]) => (
              <div key={k}>
                <label className={labelClass} htmlFor={`b-${k}`}>{label}</label>
                <input
                  id={`b-${k}`}
                  value={value(k)}
                  onChange={e => set(k, e.target.value)}
                  disabled={!can("manage_settings")}
                  className={inputClass}
                />
              </div>
            ))}
          </div>

          {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}

          {can("manage_settings") && (
            <div className="mt-5 flex items-center gap-3 border-t border-admin-line pt-4">
              <Button variant="primary" onClick={save} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />}
                Enregistrer
              </Button>
              {saved && <span className="text-[13px] font-medium text-[#15803d]">Enregistré</span>}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Statut" />
            <FieldGrid cols={2}>
              <Field label="Type">{active ? TYPE_LABEL[active.type] : "—"}</Field>
              <Field label="Compte"><StatusBadge status={active?.status ?? "active"} /></Field>
              <Field label="Vérification"><StatusBadge status={active?.verification ?? "unverified"} /></Field>
              <Field label="Note">
                {active?.rating ? `${Number(active.rating).toFixed(1).replace(".", ",")} / 5` : "Pas encore noté"}
              </Field>
            </FieldGrid>
          </Card>

          <Card>
            <CardHeader title="Champs vérifiés" />
            <Callout>
              Le type d'activité et le statut de vérification sont fixés par PAPOT à partir de
              vos documents. Pour les changer, contactez le support : c'est ce qui garantit aux
              voyageurs que les établissements vérifiés le sont réellement.
            </Callout>
          </Card>
        </div>
      </div>
    </>
  );
}

type DocRow = {
  doc_type: string;
  status: string;
  review_note: string | null;
  uploaded_at: string;
};

/** Spec §49–§50. */
export function Verification() {
  const { active } = usePartner();

  const { row: partner } = useRow<{ application_id: string | null }>(
    "partners",
    { id: active?.partner_id ?? "" },
    "application_id",
    !!active,
  );

  const docs = useTable<DocRow>({
    from: "partner_application_documents",
    select: "doc_type, status, review_note, uploaded_at",
    filters: [{ col: "application_id", op: "eq", value: partner?.application_id ?? "" }],
    pageSize: 50,
    enabled: !!partner?.application_id,
  });

  const types = useTable<{ code: string; label_fr: string; applies_to: string[]; required: boolean }>({
    from: "partner_document_types",
    select: "code, label_fr, applies_to, required",
    sort: { col: "position", dir: "asc" },
    pageSize: 50,
  });

  const relevant = types.rows.filter(t => active && t.applies_to?.includes(active.type));

  return (
    <>
      <PageHeader
        title="Vérification"
        subtitle="Les pièces qui permettent à PAPOT de vous afficher comme établissement vérifié."
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
        <Stat label="Statut" value={active?.verification === "verified" ? "Vérifié" : "En cours"} />
        <Stat label="Documents fournis" value={count(docs.rows.length)} />
        <Stat label="Documents requis" value={count(relevant.filter(t => t.required).length)} />
      </div>

      <Card padded={false}>
        <div className="border-b border-admin-line px-5 py-4">
          <h2 className="font-display text-[15px] font-semibold text-admin-ink">Vos documents</h2>
        </div>

        {docs.loading || types.loading ? (
          <div className="p-5"><Skeleton className="h-32 w-full" /></div>
        ) : relevant.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-admin-ink-3">
            Aucun document requis pour ce type d'activité.
          </p>
        ) : (
          <ul className="divide-y divide-admin-line">
            {relevant.map(t => {
              const doc = docs.rows.find(d => d.doc_type === t.code);
              return (
                <li key={t.code} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-admin-ink">
                      {t.label_fr}
                      {t.required && <span className="ml-1.5 text-[11px] text-[#b3261e]">obligatoire</span>}
                    </span>
                    <span className="block text-[12px] text-admin-ink-3">
                      {doc ? `Envoyé ${ago(doc.uploaded_at)}` : "Non fourni"}
                      {doc?.review_note ? ` · ${doc.review_note}` : ""}
                    </span>
                  </span>
                  <StatusBadge status={doc?.status ?? "pending"} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="mt-5">
        <Callout tone="warning">
          Le remplacement d'un document depuis le tableau de bord n'est pas encore branché :
          les pièces arrivent par le formulaire de candidature. Pour mettre à jour une pièce
          expirée, passez par le support — un document périmé peut suspendre vos annonces.
        </Callout>
      </div>
    </>
  );
}

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: PartnerRole;
  status: string;
  last_active_at: string | null;
  created_at: string;
};

/** Spec §51–§53. */
export function Staff() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<PartnerRole>("front_desk");
  const [error, setError] = useState<string | null>(null);

  const { rows, loading, reload } = useTable<Member>({
    from: "partner_members",
    select: "id, email, full_name, role, status, last_active_at, created_at",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "created_at", dir: "asc" },
    pageSize: 50,
    enabled: !!active,
  });

  const perms = useTable<{ role: string; permission: string }>({
    from: "partner_role_permissions",
    select: "role, permission",
    pageSize: 200,
  });

  const invite = async () => {
    if (!active) return;
    if (!email.trim()) return setError("Indiquez un courriel.");
    const { error } = await table("partner_members").insert({
      partner_id: active.partner_id,
      email: email.trim().toLowerCase(),
      full_name: name.trim() || null,
      role,
      status: "invited",
    });
    if (error) return setError(friendlyError(error));
    setEmail("");
    setName("");
    setInviting(false);
    setError(null);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Équipe"
        subtitle="Qui travaille sur votre établissement, et ce que chacun peut faire."
        actions={
          can("manage_staff") ? (
            <Button variant="primary" onClick={() => setInviting(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Inviter
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5">
        <Callout>
          Une invitation est rattachée à un courriel. La personne peut accepter avant même
          d'avoir un compte PAPOT : son accès s'active à sa première connexion.
        </Callout>
      </div>

      <Card padded={false}>
        {loading ? (
          <div className="p-5"><Skeleton className="h-32 w-full" /></div>
        ) : (
          <ul className="divide-y divide-admin-line">
            {rows.map(m => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span
                  className="grid h-9 w-9 shrink-0 place-content-center rounded-full text-[12px] font-bold text-white"
                  style={{ background: avatarTint(m.full_name ?? m.email) }}
                  aria-hidden
                >
                  {initials(m.full_name ?? m.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-admin-ink">
                    {m.full_name ?? m.email}
                  </span>
                  <span className="block truncate text-[12px] text-admin-ink-3">
                    {m.email} · {ROLE_LABEL[m.role]} ·{" "}
                    {perms.rows.filter(p => p.role === m.role).length} permissions
                  </span>
                </span>
                <span className="text-[12px] text-admin-ink-3">
                  {m.last_active_at ? ago(m.last_active_at) : "Jamais connecté"}
                </span>
                <StatusBadge status={m.status} />
                {can("manage_staff") && m.role !== "owner" && (
                  <Button
                    size="sm"
                    variant="dangerGhost"
                    onClick={() =>
                      confirm({
                        title: `Retirer ${m.full_name ?? m.email} ?`,
                        consequence: "Cette personne perd immédiatement l'accès à votre tableau de bord.",
                        confirmLabel: "Retirer l'accès",
                        danger: true,
                        onConfirm: async () => {
                          const { error } = await table("partner_members").delete().eq("id", m.id);
                          if (error) return friendlyError(error);
                          reload();
                          return null;
                        },
                      })
                    }
                  >
                    Retirer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Ce que permet chaque rôle" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(ROLE_LABEL) as PartnerRole[]).map(r => (
            <div key={r} className="rounded-lg border border-admin-line px-3.5 py-3">
              <p className="text-[13px] font-semibold text-admin-ink">{ROLE_LABEL[r]}</p>
              <p className="mt-0.5 text-[11.5px] text-admin-ink-3">
                {perms.rows.filter(p => p.role === r).length} permissions
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Inviter un membre"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviting(false)}>Annuler</Button>
            <Button variant="primary" onClick={invite}>Envoyer l'invitation</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass} htmlFor="m-email">Courriel</label>
            <input id="m-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="m-name">Nom</label>
            <input id="m-name" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="m-role">Rôle</label>
            <select id="m-role" value={role} onChange={e => setRole(e.target.value as PartnerRole)} className={selectClass}>
              {(Object.keys(ROLE_LABEL) as PartnerRole[])
                .filter(r => r !== "owner")
                .map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <p className="mt-1 text-[11.5px] text-admin-ink-3">
              Donnez le rôle le plus étroit qui suffit : un agent de réception n'a pas besoin de
              voir vos versements.
            </p>
          </div>
          {error && <p className="text-[13px] font-medium text-[#b3261e]">{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Spec §69. */
export function Activity() {
  const { active } = usePartner();
  const [page, setPage] = useState(1);

  const { rows, total, loading } = useTable<{
    id: number;
    actor_label: string | null;
    action: string;
    entity_type: string;
    entity_label: string | null;
    at: string;
  }>({
    from: "partner_activity_log",
    select: "id, actor_label, action, entity_type, entity_label, at",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "at", dir: "desc" },
    page,
    pageSize: 50,
    enabled: !!active,
  });

  const label = (a: string) => {
    if (a.startsWith("insert_")) return "Création";
    if (a.startsWith("update_")) return "Modification";
    if (a.startsWith("delete_")) return "Suppression";
    if (a === "review_replied") return "Réponse à un avis";
    return a.replace(/_/g, " ");
  };

  return (
    <>
      <PageHeader title="Activité" subtitle="Ce qui a changé sur votre établissement, et par qui." />

      <Card padded={false}>
        {loading ? (
          <div className="p-5"><Skeleton className="h-32 w-full" /></div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ScrollText}
              title="Aucune activité enregistrée"
              body="Les modifications de vos annonces, tarifs et réponses apparaîtront ici."
            />
          </div>
        ) : (
          <ul className="divide-y divide-admin-line">
            {rows.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-admin-ink">
                    {label(r.action)}
                    {r.entity_label && <span className="font-normal text-admin-ink-2"> · {r.entity_label}</span>}
                  </span>
                  <span className="block text-[11.5px] text-admin-ink-3">
                    {r.actor_label ?? "Vous"} · {r.entity_type}
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] text-admin-ink-3">{stamp(r.at)}</span>
              </li>
            ))}
          </ul>
        )}

        {total > 50 && (
          <div className="flex items-center justify-between border-t border-admin-line px-5 py-2.5">
            <span className="text-[12.5px] text-admin-ink-3">{count(total)} entrées</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Précédent
              </Button>
              <Button size="sm" variant="ghost" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

export { Building2, Shield, UserCog, day };

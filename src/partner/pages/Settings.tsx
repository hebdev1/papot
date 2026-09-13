import { useState } from "react";
import { Bell, CreditCard, LifeBuoy, Loader2, Plug, Shield } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, Callout, Card, CardHeader, Field, FieldGrid, PageHeader, Skeleton, inputClass, labelClass, selectClass } from "../../console/Ui";
import { StatusBadge } from "../../console/StatusBadge";
import { friendlyError, table, useRow, useTable } from "../../console/data";
import { stamp } from "../../console/format";
import { useAuth } from "../../lib/auth";
import { usePartner } from "../lib/partnerAuth";

/** Spec §54–§56. */
export function BookingSettings() {
  const { active, can } = usePartner();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { row } = useRow<Record<string, string | null>>(
    "partner_applications",
    { id: "" },
    "*",
    false,
  );

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setSaved(false);
  };

  return (
    <>
      <PageHeader
        title="Règles de réservation"
        subtitle="Comment et quand les voyageurs peuvent réserver chez vous."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader title="Confirmation" subtitle="Spec §55 : instantanée ou validée par vous." />
            <div className="flex flex-col gap-2">
              {[
                {
                  v: "automatique",
                  t: "Confirmation instantanée",
                  d: "Le voyageur réserve et c'est confirmé. Plus de réservations, moins de contrôle.",
                },
                {
                  v: "manuelle",
                  t: "Validation manuelle",
                  d: "Vous acceptez chaque demande. Répondez vite : une demande sans réponse décourage.",
                },
              ].map(o => (
                <label
                  key={o.v}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-3 transition-colors",
                    (form.confirmation ?? "automatique") === o.v
                      ? "border-[#002089] bg-[#f4f8fd]"
                      : "border-admin-line hover:bg-admin-canvas",
                  )}
                >
                  <input
                    type="radio"
                    name="confirmation"
                    checked={(form.confirmation ?? "automatique") === o.v}
                    onChange={() => set("confirmation", o.v)}
                    disabled={!can("manage_settings")}
                    className="mt-0.5 h-4 w-4 accent-[#002089]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-admin-ink">{o.t}</span>
                    <span className="block text-[12px] leading-relaxed text-admin-ink-3">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Fenêtre de réservation" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="s-notice">Préavis minimum (heures)</label>
                <input
                  id="s-notice"
                  value={form.notice ?? "2"}
                  onChange={e => set("notice", e.target.value)}
                  inputMode="numeric"
                  disabled={!can("manage_settings")}
                  className={inputClass}
                />
                <p className="mt-1 text-[11.5px] text-admin-ink-3">
                  Délai entre la réservation et l'arrivée.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="s-window">Réservation à l'avance (jours)</label>
                <input
                  id="s-window"
                  value={form.window ?? "365"}
                  onChange={e => set("window", e.target.value)}
                  inputMode="numeric"
                  disabled={!can("manage_settings")}
                  className={inputClass}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Politique d'annulation" subtitle="Spec §56." />
            <div className="flex flex-col gap-2">
              {[
                { v: "free_24h", t: "Souple", d: "Annulation gratuite jusqu'à 24 h avant l'arrivée." },
                { v: "free_2h", t: "Modérée", d: "Annulation gratuite jusqu'à 2 h avant." },
                { v: "non_refundable", t: "Stricte", d: "Non remboursable. Plus de sécurité, moins de réservations." },
              ].map(o => (
                <label
                  key={o.v}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-3 transition-colors",
                    (form.cancellation ?? "free_24h") === o.v
                      ? "border-[#002089] bg-[#f4f8fd]"
                      : "border-admin-line hover:bg-admin-canvas",
                  )}
                >
                  <input
                    type="radio"
                    name="cancellation"
                    checked={(form.cancellation ?? "free_24h") === o.v}
                    onChange={() => set("cancellation", o.v)}
                    disabled={!can("manage_settings")}
                    className="mt-0.5 h-4 w-4 accent-[#002089]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-admin-ink">{o.t}</span>
                    <span className="block text-[12px] text-admin-ink-3">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-admin-canvas px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                Ce que verra le voyageur
              </p>
              <p className="mt-1 text-[13px] text-admin-ink">
                {(form.cancellation ?? "free_24h") === "free_24h"
                  ? "Annulation gratuite jusqu'à 24 h avant l'arrivée, puis la première nuit est due."
                  : (form.cancellation ?? "") === "free_2h"
                    ? "Annulation gratuite jusqu'à 2 h avant, puis la réservation est due."
                    : "Réservation non remboursable."}
              </p>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Pas encore enregistré" />
          <Callout tone="warning">
            Ces règles n'ont pas encore de colonne sur la fiche partenaire : elles sont
            collectées à la candidature et appliquées par PAPOT. L'écran est prêt, le
            branchement demande d'ajouter ces champs sur <code>partners</code>. Les modifier ici
            n'aurait aucun effet, alors le bouton reste désactivé plutôt que de vous faire
            croire le contraire.
          </Callout>
          <Button variant="primary" className="mt-4 w-full" disabled>
            Enregistrer
          </Button>
        </Card>
      </div>
    </>
  );
}

const EVENTS = [
  ["new_reservation", "Nouvelle réservation"],
  ["cancellation", "Annulation"],
  ["payment", "Paiement reçu"],
  ["message", "Message client"],
  ["review", "Nouvel avis"],
  ["payout", "Versement"],
  ["verification", "Vérification"],
  ["document_expiry", "Document qui expire"],
  ["announcement", "Annonce PAPOT"],
];

const CHANNELS = [
  ["in_app", "Dans l'app"],
  ["email", "Courriel"],
  ["sms", "SMS"],
  ["push", "Push"],
];

/** Spec §57. */
export function Notifications() {
  const { active, can } = usePartner();
  const [busy, setBusy] = useState<string | null>(null);

  const { rows, reload } = useTable<{ event: string; channels: string[] }>({
    from: "partner_notification_prefs",
    select: "event, channels",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    pageSize: 50,
    enabled: !!active,
  });

  const channelsFor = (event: string) =>
    rows.find(r => r.event === event)?.channels ?? ["in_app"];

  const toggle = async (event: string, channel: string) => {
    if (!active || !can("manage_settings")) return;
    const current = channelsFor(event);
    const next = current.includes(channel)
      ? current.filter(c => c !== channel)
      : [...current, channel];

    setBusy(event);
    await table("partner_notification_prefs").upsert({
      partner_id: active.partner_id,
      event,
      channels: next,
    });
    setBusy(null);
    reload();
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Ce dont vous voulez être prévenu, et comment." />

      <div className="mb-5">
        <Callout tone="warning">
          Les canaux courriel et SMS dépendent de fournisseurs qui ne sont pas encore
          configurés : votre choix est enregistré, mais seules les notifications dans
          l'application sont réellement envoyées pour l'instant.
        </Callout>
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-admin-line bg-admin-raised">
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                  Événement
                </th>
                {CHANNELS.map(([, label]) => (
                  <th
                    key={label}
                    className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-line">
              {EVENTS.map(([event, label]) => (
                <tr key={event} className={busy === event ? "opacity-60" : ""}>
                  <td className="px-5 py-3 text-[13px] font-medium text-admin-ink">{label}</td>
                  {CHANNELS.map(([channel]) => (
                    <td key={channel} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={channelsFor(event).includes(channel)}
                        onChange={() => toggle(event, channel)}
                        disabled={!can("manage_settings")}
                        aria-label={`${label} par ${channel}`}
                        className="h-4 w-4 accent-[#002089]"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/** Spec §61–§62. */
export function Integrations() {
  const { active } = usePartner();

  const { rows, loading } = useTable<{
    id: string;
    kind: string;
    status: string;
    last_synced_at: string | null;
  }>({
    from: "partner_integrations",
    select: "id, kind, status, last_synced_at",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    pageSize: 20,
    enabled: !!active,
  });

  const available = [
    { kind: "google_calendar", name: "Google Agenda", desc: "Exportez vos réservations vers votre agenda." },
    { kind: "ical", name: "iCal", desc: "Synchronisez avec un autre site de réservation." },
    ...(active?.type === "hotel"
      ? [{ kind: "channel_manager", name: "Channel manager", desc: "Reliez votre PMS et vos autres canaux." }]
      : []),
    ...(active?.type === "restaurant"
      ? [{ kind: "pos", name: "Caisse (POS)", desc: "Reliez votre système d'encaissement." }]
      : []),
    { kind: "accounting", name: "Comptabilité", desc: "Exportez vos transactions vers votre comptable." },
  ];

  return (
    <>
      <PageHeader title="Intégrations" subtitle="Reliez PAPOT aux outils que vous utilisez déjà." />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {available.map(i => {
            const row = rows.find(r => r.kind === i.kind);
            return (
              <Card key={i.kind}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-[14.5px] font-semibold text-admin-ink">{i.name}</h3>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-admin-ink-3">{i.desc}</p>
                  </div>
                  <StatusBadge status={row?.status ?? "disconnected"} />
                </div>
                {row?.last_synced_at && (
                  <p className="mt-2 text-[12px] text-admin-ink-3">
                    Dernière synchronisation : {stamp(row.last_synced_at)}
                  </p>
                )}
                <Button variant="secondary" className="mt-4 w-full" disabled>
                  Connecter
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        <Callout>
          Une intégration se connecte avec une clé posée côté serveur, jamais depuis le
          navigateur. Les emplacements sont prêts ; le branchement se fait au moment où vous
          choisissez un fournisseur.
        </Callout>
      </div>
    </>
  );
}

/** Spec §58–§59. */
export function Account() {
  const { user } = useAuth();
  const { active, memberships } = usePartner();

  return (
    <>
      <PageHeader title="Mon compte" subtitle="Vos informations personnelles et votre sécurité." />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Informations" />
          <FieldGrid>
            <Field label="Courriel">{user?.email ?? "—"}</Field>
            <Field label="Établissements">{memberships.length}</Field>
            <Field label="Établissement actif">{active?.business_name ?? "—"}</Field>
          </FieldGrid>
          <div className="mt-4">
            <Callout>
              Votre mot de passe et vos options de connexion se gèrent depuis votre compte
              PAPOT, pas depuis ce tableau de bord.
            </Callout>
          </div>
          <Button as="link" to="/compte/profil" variant="secondary" className="mt-4">
            Gérer mon compte PAPOT
          </Button>
        </Card>

        <Card>
          <CardHeader title="Sécurité" />
          <div className="flex flex-col gap-2">
            <Button variant="secondary" className="justify-start" disabled>
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Authentification à deux facteurs
            </Button>
            <Button variant="secondary" className="justify-start" disabled>
              Déconnecter les autres appareils
            </Button>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-admin-ink-3">
            Ces actions passent par l'API d'administration de Supabase, qui exige une clé de
            service : elles s'exécutent côté serveur, jamais depuis le navigateur.
          </p>
        </Card>
      </div>
    </>
  );
}

/** Spec §39 — payout settings, masked. */
export function PaymentSettings() {
  const { can } = usePartner();

  return (
    <>
      <PageHeader title="Paiements et versements" subtitle="Où PAPOT vous envoie votre argent." />

      <Card className="max-w-2xl">
        <CardHeader title="Coordonnées de versement" />
        <FieldGrid cols={2}>
          <Field label="Méthode">Virement bancaire</Field>
          <Field label="Titulaire">•••••</Field>
          <Field label="Banque">•••••</Field>
          <Field label="Compte">•••• ••••</Field>
          <Field label="Devise">USD</Field>
        </FieldGrid>

        <div className="mt-4">
          <Callout tone="warning">
            Le numéro de compte complet n'est jamais enregistré par PAPOT : seuls les quatre
            derniers chiffres le sont. Changer ces coordonnées passe par le support, qui
            vérifie l'identité — c'est la protection la plus utile contre le détournement de
            versement.
          </Callout>
        </div>

        <Button as="link" to="/partenaire/support" variant="secondary" className="mt-4" disabled={!can("manage_payouts")}>
          <CreditCard className="h-3.5 w-3.5" aria-hidden />
          Demander une modification
        </Button>
      </Card>
    </>
  );
}

const CATEGORIES = [
  "Problème de réservation",
  "Problème de paiement",
  "Problème de versement",
  "Problème d'annonce",
  "Vérification",
  "Problème avec un client",
  "Problème technique",
];

/** Spec §63–§64. */
export function Support() {
  const { active } = usePartner();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const tickets = useTable<{ id: string; reference: string; subject: string; status: string; updated_at: string }>({
    from: "support_tickets",
    select: "id, reference, subject, status, updated_at",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "updated_at", dir: "desc" },
    pageSize: 20,
    enabled: !!active,
  });

  const submit = async () => {
    if (!active) return;
    if (!subject.trim() || !body.trim()) return setError("Sujet et description sont obligatoires.");

    setBusy(true);
    const { error } = await table("support_tickets").insert({
      reference: `SUP-${Date.now().toString(36).toUpperCase()}`,
      subject: subject.trim(),
      category,
      partner_id: active.partner_id,
      requester_label: active.business_name,
      priority,
      status: "new",
    });
    setBusy(false);

    if (error) return setError(friendlyError(error));
    setSubject("");
    setBody("");
    setError(null);
    setSent(true);
    tickets.reload();
  };

  return (
    <>
      <PageHeader title="Support" subtitle="Comment pouvons-nous vous aider ?" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Créer un ticket" />
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass} htmlFor="t-subject">Sujet</label>
              <input id="t-subject" value={subject} onChange={e => setSubject(e.target.value)} className={inputClass} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="t-cat">Catégorie</label>
                <select id="t-cat" value={category} onChange={e => setCategory(e.target.value)} className={selectClass}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="t-pri">Priorité</label>
                <select id="t-pri" value={priority} onChange={e => setPriority(e.target.value)} className={selectClass}>
                  <option value="low">Basse</option>
                  <option value="normal">Normale</option>
                  <option value="high">Haute</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="t-body">Description</label>
              <textarea
                id="t-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                className={cn(inputClass, "h-auto py-2 leading-relaxed")}
              />
            </div>

            {error && <p className="text-[13px] font-medium text-[#b3261e]">{error}</p>}
            {sent && (
              <p className="rounded-lg bg-[#eef7f0] px-3 py-2 text-[13px] font-medium text-[#15803d]">
                Ticket créé. L'équipe vous répond par courriel.
              </p>
            )}

            <div>
              <Button variant="primary" onClick={submit} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />}
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
                Envoyer
              </Button>
            </div>
          </div>
        </Card>

        <Card padded={false}>
          <div className="border-b border-admin-line px-5 py-4">
            <h2 className="font-display text-[15px] font-semibold text-admin-ink">Vos tickets</h2>
          </div>
          {tickets.rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-admin-ink-3">Aucun ticket ouvert.</p>
          ) : (
            <ul className="divide-y divide-admin-line">
              {tickets.rows.map(t => (
                <li key={t.id} className="px-5 py-3">
                  <p className="truncate text-[13px] font-medium text-admin-ink">{t.subject}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-admin-ink-3">
                    {t.reference}
                    <StatusBadge status={t.status} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export { Bell, Plug };

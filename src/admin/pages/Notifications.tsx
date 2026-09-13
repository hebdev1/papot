import { useState } from "react";
import { Bell, Plus, Send } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  Button,
  Callout,
  PageHeader,
  inputClass,
  labelClass,
  selectClass,
} from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { StatusBadge } from "../../console/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminTable,useTable } from "../lib/adminData";
import { count, stamp } from "../../console/format";

type Campaign = {
  id: string;
  title: string;
  body: string;
  audience: string;
  channels: string[];
  cta_label: string | null;
  cta_url: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  recipients: number | null;
  status: string;
  created_at: string;
};

const AUDIENCE: Record<string, string> = {
  all_customers: "Tous les clients",
  all_partners: "Tous les partenaires",
  hotel_partners: "Partenaires hôteliers",
  guesthouse_partners: "Maisons d'hôtes",
  car_partners: "Loueurs de voitures",
  restaurant_partners: "Restaurants",
  selected_users: "Utilisateurs sélectionnés",
  selected_regions: "Régions sélectionnées",
};

const CHANNELS = [
  { value: "in_app", label: "Dans l'application" },
  { value: "email", label: "Courriel" },
  { value: "sms", label: "SMS" },
  { value: "push", label: "Push" },
];

/** Spec §37. */
export function Notifications() {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [page, setPage] = useState(1);
  const [composing, setComposing] = useState(false);

  const { rows, total, loading, error, reload } = useTable<Campaign>({
    from: "notification_campaigns",
    sort: { col: "created_at", dir: "desc" },
    page,
    pageSize: 25,
  });

  const send = (c: Campaign) =>
    confirm({
      title: `Envoyer « ${c.title} » ?`,
      consequence: `Le message part vers ${AUDIENCE[c.audience] ?? c.audience} par ${c.channels
        .map(ch => CHANNELS.find(x => x.value === ch)?.label ?? ch)
        .join(", ")}. Un envoi ne peut pas être rappelé.`,
      confirmLabel: "Envoyer maintenant",
      danger: true,
      requireReason: false,
      onConfirm: async () => {
        // Marked as queued here; delivery itself runs server-side.
        const { error } = await supabase
          .from("notification_campaigns")
          .update({ status: "scheduled", scheduled_at: new Date().toISOString() })
          .eq("id", c.id);
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<Campaign>[] = [
    {
      id: "title",
      header: "Annonce",
      mobile: "primary",
      cell: c => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{c.title}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{c.body}</span>
        </span>
      ),
    },
    { id: "audience", header: "Audience", mobile: "secondary", cell: c => AUDIENCE[c.audience] ?? c.audience },
    {
      id: "channels",
      header: "Canaux",
      mobile: "secondary",
      cell: c => (
        <span className="flex flex-wrap gap-1">
          {c.channels.map(ch => (
            <span key={ch} className="rounded bg-admin-canvas px-1.5 py-0.5 text-[11.5px] text-admin-ink-2">
              {CHANNELS.find(x => x.value === ch)?.label ?? ch}
            </span>
          ))}
        </span>
      ),
    },
    {
      id: "recipients",
      header: "Destinataires",
      align: "right",
      mobile: "hidden",
      cell: c => (c.recipients === null ? "—" : count(c.recipients)),
    },
    { id: "status", header: "Statut", mobile: "meta", cell: c => <StatusBadge status={c.status} /> },
    {
      id: "sent_at",
      header: "Envoyée",
      sortable: true,
      mobile: "hidden",
      cell: c => (c.sent_at ? stamp(c.sent_at) : c.scheduled_at ? `Prévue ${stamp(c.scheduled_at)}` : "—"),
    },
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Annonces envoyées aux clients et aux partenaires."
        actions={
          can("manage_content") ? (
            <Button variant="primary" onClick={() => setComposing(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Nouvelle annonce
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5">
        <Callout tone="warning">
          Les canaux courriel et SMS dépendent de fournisseurs qui ne sont pas encore configurés sur ce
          projet : une campagne créée ici est enregistrée et planifiée, mais l'envoi réel attend la
          configuration SMTP et SMS (voir <strong className="font-semibold">État du système</strong>).
        </Callout>
      </div>

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Campagnes" value={count(total)} />
        <Stat label="Envoyées" value={count(rows.filter(r => r.status === "sent").length)} />
        <Stat label="Planifiées" value={count(rows.filter(r => r.status === "scheduled").length)} />
        <Stat label="Brouillons" value={count(rows.filter(r => r.status === "draft").length)} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={c => c.id}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="campaigns"
        actions={[
          {
            label: "Envoyer",
            hidden: c => !can("manage_content") || c.status === "sent",
            onClick: send,
          },
          {
            label: "Supprimer",
            danger: true,
            hidden: c => !can("manage_content") || c.status === "sent",
            onClick: async c => {
              await adminTable("notification_campaigns").delete().eq("id", c.id);
              reload();
            },
          },
        ]}
        empty={{
          title: "Aucune annonce",
          body: "Créez une annonce pour informer les clients ou les partenaires.",
          action: can("manage_content") ? (
            <Button variant="primary" onClick={() => setComposing(true)}>
              Créer une annonce
            </Button>
          ) : undefined,
        }}
      />

      <ComposeModal open={composing} onClose={() => setComposing(false)} onSaved={reload} />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

function ComposeModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all_customers");
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim() || !body.trim()) {
      setError("Le titre et le message sont obligatoires.");
      return;
    }
    if (channels.length === 0) {
      setError("Choisissez au moins un canal.");
      return;
    }

    setBusy(true);
    const { error } = await adminTable("notification_campaigns").insert({
      title: title.trim(),
      body: body.trim(),
      audience,
      channels,
      cta_label: ctaLabel.trim() || null,
      cta_url: ctaUrl.trim() || null,
      scheduled_at: scheduledAt || null,
      status: scheduledAt ? "scheduled" : "draft",
    });
    setBusy(false);

    if (error) {
      setError(adminError(error));
      return;
    }
    setTitle("");
    setBody("");
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle annonce"
      subtitle="Enregistrée en brouillon, ou planifiée si vous donnez une date."
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            <Send className="h-3.5 w-3.5" aria-hidden />
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelClass} htmlFor="n-title">
            Titre
          </label>
          <input id="n-title" value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="n-body">
            Message
          </label>
          <textarea
            id="n-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            className={`${inputClass} h-auto py-2 leading-relaxed`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="n-audience">
              Audience
            </label>
            <select id="n-audience" value={audience} onChange={e => setAudience(e.target.value)} className={selectClass}>
              {Object.entries(AUDIENCE).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="n-schedule">
              Planifier
            </label>
            <input
              id="n-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <fieldset>
          <legend className={labelClass}>Canaux</legend>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map(c => (
              <label
                key={c.value}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors ${
                  channels.includes(c.value)
                    ? "border-[#002089] bg-[#f4f8fd] text-[#002089]"
                    : "border-admin-line"
                }`}
              >
                <input
                  type="checkbox"
                  checked={channels.includes(c.value)}
                  onChange={() =>
                    setChannels(ch => (ch.includes(c.value) ? ch.filter(x => x !== c.value) : [...ch, c.value]))
                  }
                  className="h-3.5 w-3.5 accent-[#002089]"
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="n-cta">
              Texte du bouton
            </label>
            <input id="n-cta" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="n-url">
              Lien de destination
            </label>
            <input
              id="n-url"
              value={ctaUrl}
              onChange={e => setCtaUrl(e.target.value)}
              placeholder="/search?kind=stay"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

export { Bell };

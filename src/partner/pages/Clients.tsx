import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MessageSquare, Send, Star, Users } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, Callout, Card, CardHeader, EmptyState, PageHeader, Skeleton, inputClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { StatusBadge } from "../../console/StatusBadge";
import { BarList } from "../../console/Charts";
import { DataTable, type Column } from "../../console/DataTable";
import { friendlyError, rpc, useRpc, useTable } from "../../console/data";
import { ago, avatarTint, count, day, initials, money, stamp } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type CustomerRow = {
  customer_id: string | null;
  full_name: string | null;
  email: string | null;
  bookings: number;
  total_spend: number;
  last_booking: string | null;
  status: string;
};

/** Spec §30 — deliberately narrow: enough to recognise a guest, no more. */
export function Customers() {
  const { active } = usePartner();
  const [page, setPage] = useState(1);

  const { data, loading, error } = useRpc<CustomerRow[]>(
    "partner_customers",
    { p_partner: active?.partner_id },
    !!active,
  );

  const rows = data ?? [];

  const columns: Column<CustomerRow>[] = [
    {
      id: "full_name",
      header: "Client",
      mobile: "primary",
      cell: r => (
        <span className="flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-content-center rounded-full text-[11px] font-bold text-white"
            style={{ background: avatarTint(r.full_name ?? r.email) }}
            aria-hidden
          >
            {initials(r.full_name ?? r.email)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-admin-ink">{r.full_name ?? "Client"}</span>
            <span className="block truncate text-[12px] text-admin-ink-3">{r.email ?? "—"}</span>
          </span>
        </span>
      ),
    },
    { id: "bookings", header: "Réservations", align: "right", mobile: "secondary", cell: r => count(r.bookings) },
    {
      id: "total_spend",
      header: "Total dépensé",
      align: "right",
      mobile: "meta",
      cell: r => <span className="font-semibold">{money(r.total_spend)}</span>,
    },
    { id: "last_booking", header: "Dernière visite", mobile: "secondary", cell: r => day(r.last_booking) },
    {
      id: "status",
      header: "Compte",
      mobile: "hidden",
      cell: r => (r.status === "guest" ? <span className="text-admin-ink-3">Invité</span> : <StatusBadge status={r.status} />),
    },
  ];

  const repeat = rows.filter(r => r.bookings > 1).length;

  return (
    <>
      <PageHeader title="Clients" subtitle="Les voyageurs qui ont réservé chez vous." />

      <div className="mb-5">
        <Callout>
          PAPOT ne vous transmet que ce qui est nécessaire pour accueillir le client : un nom,
          un historique et un montant. Les coordonnées complètes restent chez la plateforme.
        </Callout>
      </div>

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clients" value={count(rows.length)} />
        <Stat label="Clients fidèles" value={count(repeat)} hint="plus d'une réservation" />
        <Stat label="Chiffre cumulé" value={money(rows.reduce((s, r) => s + Number(r.total_spend ?? 0), 0))} />
        <Stat
          label="Panier moyen"
          value={money(
            rows.length
              ? rows.reduce((s, r) => s + Number(r.total_spend ?? 0), 0) /
                  rows.reduce((s, r) => s + Number(r.bookings ?? 0), 0)
              : 0,
          )}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows.slice((page - 1) * 25, page * 25)}
        total={rows.length}
        loading={loading}
        error={error}
        rowKey={r => r.customer_id ?? r.email ?? Math.random().toString()}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="partner-customers"
        empty={{
          title: "Aucun client pour l'instant",
          body: "Vos clients apparaîtront ici après leur première réservation.",
        }}
      />
    </>
  );
}

type Conversation = {
  id: string;
  subject: string | null;
  kind: string;
  last_message_at: string | null;
  message_count: number;
};

type Message = {
  id: string;
  sender_label: string | null;
  body: string;
  created_at: string;
};

/** Spec §31–§32. */
export function Messages() {
  const { active, can } = usePartner();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const conversations = useTable<Conversation>({
    from: "conversations",
    select: "id, subject, kind, last_message_at, message_count",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "last_message_at", dir: "desc" },
    pageSize: 50,
    enabled: !!active,
  });

  const messages = useTable<Message>({
    from: "conversation_messages",
    select: "id, sender_label, body, created_at",
    filters: [{ col: "conversation_id", op: "eq", value: openId ?? "" }],
    sort: { col: "created_at", dir: "asc" },
    pageSize: 200,
    enabled: !!openId,
  });

  const replies = useTable<{ id: string; title: string; body: string }>({
    from: "partner_quick_replies",
    select: "id, title, body",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 20,
    enabled: !!active && can("manage_messages"),
  });

  return (
    <>
      <PageHeader title="Messages" subtitle="Vos échanges avec les voyageurs." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" padded={false}>
          <div className="border-b border-admin-line px-4 py-3">
            <h2 className="font-display text-[14px] font-semibold text-admin-ink">Conversations</h2>
          </div>
          {conversations.loading ? (
            <div className="p-4"><Skeleton className="h-32 w-full" /></div>
          ) : conversations.rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-admin-ink-3">
              Aucune conversation pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-admin-line">
              {conversations.rows.map(c => (
                <li key={c.id}>
                  <button
                    onClick={() => setOpenId(c.id)}
                    className={cn(
                      "flex w-full flex-col items-start px-4 py-3 text-left transition-colors",
                      openId === c.id ? "bg-[#eef3fb]" : "hover:bg-admin-canvas",
                    )}
                  >
                    <span className="truncate text-[13px] font-medium text-admin-ink">
                      {c.subject ?? "Conversation"}
                    </span>
                    <span className="text-[11.5px] text-admin-ink-3">
                      {count(c.message_count)} message(s) · {c.last_message_at ? ago(c.last_message_at) : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2" padded={false}>
          {!openId ? (
            <div className="p-4">
              <EmptyState
                icon={MessageSquare}
                title="Choisissez une conversation"
                body="Les messages de vos clients s'affichent ici, avec le contexte de leur réservation."
              />
            </div>
          ) : (
            <>
              <div className="flex max-h-[440px] flex-col gap-3 overflow-y-auto p-5">
                {messages.loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : messages.rows.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-admin-ink-3">Aucun message.</p>
                ) : (
                  messages.rows.map(m => (
                    <div key={m.id} className="flex gap-2.5">
                      <span
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-content-center rounded-full text-[10.5px] font-bold text-white"
                        style={{ background: avatarTint(m.sender_label) }}
                        aria-hidden
                      >
                        {initials(m.sender_label)}
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl bg-admin-canvas px-3 py-2">
                        <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                          <span className="font-semibold text-admin-ink">{m.sender_label ?? "Client"}</span>
                          <span className="text-admin-ink-3">{stamp(m.created_at)}</span>
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-admin-ink">
                          {m.body}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {can("manage_messages") && (
                <div className="border-t border-admin-line p-4">
                  {replies.rows.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {replies.rows.map(r => (
                        <button
                          key={r.id}
                          onClick={() => setDraft(r.body)}
                          className="rounded-md border border-admin-line bg-admin-canvas px-2 py-1 text-[12px] text-admin-ink-2 transition-colors hover:text-admin-ink"
                        >
                          {r.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={3}
                    placeholder="Répondre au client…"
                    className={cn(inputClass, "h-auto py-2 leading-relaxed")}
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[11.5px] text-admin-ink-3">
                      L'envoi de messages demande la messagerie côté client, pas encore branchée.
                    </p>
                    <Button variant="primary" disabled>
                      <Send className="h-3.5 w-3.5" aria-hidden />
                      Envoyer
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  customer_label: string | null;
  status: string;
  partner_reply: string | null;
  created_at: string;
};

/** Spec §33–§34: a partner replies, never deletes. */
export function Reviews() {
  const { active, can } = usePartner();
  const [replyTo, setReplyTo] = useState<Review | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { rows, loading, reload } = useTable<Review>({
    from: "reviews",
    select: "id, rating, title, body, customer_label, status, partner_reply, created_at",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!active,
  });

  const published = rows.filter(r => r.status === "published");
  const avg = published.length
    ? published.reduce((s, r) => s + r.rating, 0) / published.length
    : null;
  const answered = published.filter(r => r.partner_reply).length;

  const send = async () => {
    if (!replyTo) return;
    setBusy(true);
    const { error } = await rpc("partner_reply_review", { p_review: replyTo.id, p_reply: text.trim() });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setReplyTo(null);
    setText("");
    setError(null);
    reload();
  };

  return (
    <>
      <PageHeader title="Avis" subtitle="Ce que vos clients disent, et vos réponses." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Note moyenne" value={avg ? `${avg.toFixed(1).replace(".", ",")} / 5` : "—"} />
        <Stat label="Avis publiés" value={count(published.length)} />
        <Stat
          label="Taux de réponse"
          value={published.length ? `${Math.round((answered / published.length) * 100)} %` : "—"}
        />
        <Stat
          label="Sans réponse"
          value={count(published.length - answered)}
          tone={published.length - answered > 0 ? "negative" : undefined}
        />
      </div>

      {published.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Répartition des notes" />
          <BarList
            items={[5, 4, 3, 2, 1].map(n => ({
              label: `${n} étoile${n > 1 ? "s" : ""}`,
              value: published.filter(r => r.rating === n).length,
            }))}
          />
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Aucun avis pour l'instant"
          body="Les avis arrivent après les séjours. Répondre à chacun améliore votre classement."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(r => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "h-3.5 w-3.5",
                            i < r.rating ? "fill-[#e76f2e] text-[#e76f2e]" : "text-admin-line-strong",
                          )}
                          aria-hidden
                        />
                      ))}
                    </span>
                    <span className="text-[13px] font-semibold text-admin-ink">
                      {r.title ?? `${r.rating}/5`}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-admin-ink-3">
                    {r.customer_label ?? "Client"} · {day(r.created_at)}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>

              {r.body && (
                <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-admin-ink">
                  {r.body}
                </p>
              )}

              {r.partner_reply ? (
                /* Indented and tinted rather than tagged with an accent stripe:
                   the nesting already says "reply", and the label says whose. */
                <div className="ml-5 mt-3 rounded-lg bg-admin-canvas px-3 py-2.5">
                  <p className="text-[11.5px] font-semibold text-admin-ink-2">Votre réponse</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-admin-ink">
                    {r.partner_reply}
                  </p>
                </div>
              ) : (
                can("manage_reviews") &&
                r.status === "published" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      setReplyTo(r);
                      setText("");
                    }}
                  >
                    Répondre
                  </Button>
                )
              )}
            </Card>
          ))}
        </div>
      )}

      {replyTo && (
        <Card className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-xl shadow-xl lg:bottom-6">
          <CardHeader
            title="Répondre à cet avis"
            subtitle="Votre réponse est publique, sous l'avis du client."
          />
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            autoFocus
            className={cn(inputClass, "h-auto py-2 leading-relaxed")}
          />
          {error && <p className="mt-2 text-[13px] font-medium text-[#b3261e]">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReplyTo(null)}>Annuler</Button>
            <Button variant="primary" onClick={send} disabled={busy || text.trim().length < 2}>
              {busy && <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />}
              Publier la réponse
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

export { Users, Link };

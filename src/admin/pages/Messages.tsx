import { useMemo, useState } from "react";
import { MessageSquare, ShieldAlert } from "lucide-react";
import { Callout, Card, CardHeader, PageHeader } from "../../console/Ui";
import { DataTable, type Column } from "../../console/DataTable";
import { FilterBar } from "../components/FilterBar";
import { Drawer } from "../../console/Dialog";
import { Stat } from "../../console/Cards";
import { useAdmin } from "../lib/adminAuth";
import { useTable, type Filter } from "../lib/adminData";
import { ago, avatarTint, count, initials, stamp } from "../../console/format";

type Conversation = {
  id: string;
  kind: string;
  customer_id: string | null;
  partner_id: string | null;
  booking_id: string | null;
  subject: string | null;
  last_message_at: string | null;
  message_count: number;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  customer_partner: "Client ↔ Partenaire",
  customer_support: "Client ↔ Support",
  partner_support: "Partenaire ↔ Support",
  system: "Messages système",
};

/**
 * Spec §36.
 *
 * Message content is deliberately behind an explicit action rather than shown
 * in the list: reading a private conversation between a guest and a host is a
 * privileged act, gated by the sensitive `view_messages` permission, and the
 * interface should make that feel deliberate rather than incidental.
 */
export function Messages() {
  const { can } = useAdmin();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [reading, setReading] = useState<Conversation | null>(null);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [];
    if (values.kind?.length) f.push({ col: "kind", op: "in", value: values.kind });
    return f;
  }, [values]);

  const { rows, total, loading, error, reload } = useTable<Conversation>({
    from: "conversations",
    filters,
    sort: { col: "last_message_at", dir: "desc" },
    page,
    pageSize: 25,
  });

  const columns: Column<Conversation>[] = [
    {
      id: "subject",
      header: "Conversation",
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{r.subject ?? "Sans objet"}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{KIND_LABEL[r.kind] ?? r.kind}</span>
        </span>
      ),
    },
    {
      id: "message_count",
      header: "Messages",
      sortable: true,
      align: "right",
      mobile: "meta",
      cell: r => count(r.message_count),
    },
    {
      id: "last_message_at",
      header: "Dernier message",
      sortable: true,
      mobile: "secondary",
      cell: r => <span className="text-admin-ink-3">{r.last_message_at ? ago(r.last_message_at) : "—"}</span>,
    },
    {
      id: "created_at",
      header: "Ouverte le",
      sortable: true,
      defaultHidden: true,
      mobile: "hidden",
      cell: r => stamp(r.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Métadonnées des conversations de la plateforme, et accès au contenu lorsque le support l'exige."
      />

      <div className="mb-5">
        <Callout tone="warning">
          <ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          Ouvrir une conversation privée est une action sensible : elle demande la permission
          <code className="mx-1 rounded bg-white px-1 py-0.5 text-[12px]">view_messages</code>
          et n'est justifiée que pour traiter un litige ou une demande de support.
        </Callout>
      </div>

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Conversations" value={count(total)} />
        <Stat label="Client ↔ Partenaire" value={count(rows.filter(r => r.kind === "customer_partner").length)} />
        <Stat label="Avec le support" value={count(rows.filter(r => r.kind.includes("support")).length)} />
        <Stat label="Messages échangés" value={count(rows.reduce((s, r) => s + r.message_count, 0))} />
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Objet de la conversation…"
        filters={[
          {
            id: "kind",
            label: "Type",
            options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="messages"
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => r.id}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="messages"
        actions={[
          {
            label: "Lire la conversation",
            hidden: () => !can("view_messages"),
            onClick: setReading,
          },
        ]}
        empty={{
          title: "Aucune conversation",
          body: "La messagerie client-partenaire n'a pas encore été utilisée.",
        }}
      />

      <ConversationDrawer conversation={reading} onClose={() => setReading(null)} />
    </>
  );
}

function ConversationDrawer({
  conversation,
  onClose,
}: {
  conversation: Conversation | null;
  onClose: () => void;
}) {
  const messages = useTable<{
    id: string;
    sender_label: string | null;
    body: string;
    created_at: string;
  }>({
    from: "conversation_messages",
    select: "id, sender_label, body, created_at",
    filters: [{ col: "conversation_id", op: "eq", value: conversation?.id ?? "" }],
    sort: { col: "created_at", dir: "asc" },
    pageSize: 200,
    enabled: !!conversation,
  });

  return (
    <Drawer
      open={!!conversation}
      onClose={onClose}
      title={conversation?.subject ?? "Conversation"}
      subtitle={conversation ? (KIND_LABEL[conversation.kind] ?? conversation.kind) : undefined}
    >
      <p className="mb-4 rounded-lg bg-[#fdf8ee] px-3 py-2 text-[12px] leading-relaxed text-[#7a5b12]">
        Consultation enregistrée. Ce contenu appartient aux personnes concernées : ne le partagez pas
        au-delà du traitement en cours.
      </p>

      {messages.loading ? (
        <p className="text-[13px] text-admin-ink-3">Chargement…</p>
      ) : messages.rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-admin-ink-3">Aucun message dans cette conversation.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.rows.map(m => (
            <li key={m.id} className="flex gap-2.5">
              <span
                className="mt-0.5 grid h-7 w-7 shrink-0 place-content-center rounded-full text-[10.5px] font-bold text-white"
                style={{ background: avatarTint(m.sender_label) }}
                aria-hidden
              >
                {initials(m.sender_label)}
              </span>
              <div className="min-w-0 flex-1 rounded-lg bg-admin-canvas px-3 py-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                  <span className="font-semibold text-admin-ink">{m.sender_label ?? "—"}</span>
                  <span className="text-admin-ink-3">{stamp(m.created_at)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-admin-ink">{m.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

export { MessageSquare, Card, CardHeader };

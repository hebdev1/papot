import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Inbox, Lock, Send } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
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
  selectClass,
} from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { FilterBar } from "../components/FilterBar";
import { PriorityBadge, StatusBadge } from "../../console/StatusBadge";
import { AuditTrail } from "../components/Panels";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,searchAcross, useDebounced, useRow, useRpc, useTable, type Filter } from "../lib/adminData";
import { ago, avatarTint, count, initials, money, stamp } from "../../console/format";

type TicketRow = {
  id: string;
  reference: string;
  subject: string;
  category: string | null;
  customer_id: string | null;
  partner_id: string | null;
  requester_label: string | null;
  booking_id: string | null;
  booking_ref: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  assigned_label: string | null;
  created_at: string;
  updated_at: string;
};

const QUEUES = [
  { id: "all", label: "Tous" },
  { id: "new", label: "Nouveaux" },
  { id: "open", label: "Ouverts" },
  { id: "waiting_customer", label: "Attente client" },
  { id: "waiting_partner", label: "Attente partenaire" },
  { id: "escalated", label: "Escaladés" },
  { id: "resolved", label: "Résolus" },
  { id: "closed", label: "Fermés" },
];

/** Spec §34. */
export function Support() {
  const [queue, setQueue] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["subject", "reference", "requester_label"], debounced)];
    if (queue !== "all") f.push({ col: "status", op: "eq", value: queue });
    if (values.priority?.length) f.push({ col: "priority", op: "in", value: values.priority });
    return f;
  }, [debounced, queue, values]);

  const { rows, total, loading, error, reload } = useTable<TicketRow>({
    from: "support_tickets",
    filters,
    sort: { col: "updated_at", dir: "desc" },
    page,
    pageSize: 25,
  });

  const { data: stats } = useRpc<{ by_status: Record<string, number>; by_priority: Record<string, number> }>(
    "admin_support_stats",
  );

  const columns: Column<TicketRow>[] = [
    {
      id: "subject",
      header: "Sujet",
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{r.subject}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{r.reference}</span>
        </span>
      ),
    },
    { id: "requester_label", header: "Demandeur", mobile: "secondary", cell: r => r.requester_label ?? "—" },
    { id: "booking_ref", header: "Réservation", mobile: "hidden", cell: r => r.booking_ref ?? "—" },
    { id: "priority", header: "Priorité", mobile: "meta", cell: r => <PriorityBadge priority={r.priority} /> },
    { id: "assigned_label", header: "Agent", mobile: "secondary", cell: r => r.assigned_label ?? "Non assigné" },
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
    {
      id: "updated_at",
      header: "Dernière activité",
      sortable: true,
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{ago(r.updated_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Support" subtitle="Demandes des clients et des partenaires, par file de traitement." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Nouveaux" value={count(stats?.by_status?.new)} />
        <Stat label="Ouverts" value={count(stats?.by_status?.open)} />
        <Stat
          label="Escaladés"
          value={count(stats?.by_status?.escalated)}
          tone={Number(stats?.by_status?.escalated ?? 0) > 0 ? "negative" : undefined}
        />
        <Stat
          label="Urgents"
          value={count(stats?.by_priority?.urgent)}
          tone={Number(stats?.by_priority?.urgent ?? 0) > 0 ? "negative" : undefined}
        />
      </div>

      <Tabs
        tabs={QUEUES}
        active={queue}
        onChange={q => {
          setQueue(q);
          setPage(1);
        }}
        counts={Object.fromEntries(QUEUES.map(q => [q.id, stats?.by_status?.[q.id]])) as Record<string, number>}
      />

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Sujet, référence, demandeur…"
        filters={[
          {
            id: "priority",
            label: "Priorité",
            options: [
              { value: "urgent", label: "Urgente" },
              { value: "high", label: "Haute" },
              { value: "normal", label: "Normale" },
              { value: "low", label: "Basse" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="support"
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => r.id}
        rowHref={r => `/admin/support/${r.id}`}
        page={page}
        pageSize={25}
        onPage={setPage}
        storageKey="support"
        empty={{
          title: queue === "all" ? "Aucun ticket de support" : "Cette file est vide",
          body: "Vous êtes à jour.",
        }}
      />
    </>
  );
}

type Message = {
  id: string;
  author_label: string | null;
  author_kind: string;
  body: string;
  internal: boolean;
  created_at: string;
};

/** Spec §35 — conversation, context and internal notes side by side. */
export function SupportTicket() {
  const { id } = useParams();
  const { can } = useAdmin();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { row, loading, reload } = useRow<TicketRow>("support_tickets", { id: id ?? "" });

  const messages = useTable<Message>({
    from: "ticket_messages",
    select: "id, author_label, author_kind, body, internal, created_at",
    filters: [{ col: "ticket_id", op: "eq", value: id ?? "" }],
    sort: { col: "created_at", dir: "asc" },
    pageSize: 200,
    enabled: !!id,
  });

  const agents = useTable<{ user_id: string; full_name: string }>({
    from: "staff",
    select: "user_id, full_name",
    filters: [{ col: "status", op: "eq", value: "active" }],
    pageSize: 50,
    enabled: can("manage_support"),
  });

  const booking = useRow<{ reference: string; total: number; status: string; customer_label: string | null }>(
    "admin_reservation_rows",
    { id: row?.booking_id ?? "" },
    "reference, total, status, customer_label",
    !!row?.booking_id,
  );

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!row) {
    return (
      <>
        <PageHeader title="Ticket introuvable" breadcrumb={[{ label: "Support", to: "/admin/support" }]} />
        <EmptyState
          icon={Inbox}
          title="Ce ticket n'existe pas ou n'est plus accessible."
          action={
            <Button as="link" to="/admin/support" variant="secondary">
              Retour au support
            </Button>
          }
        />
      </>
    );
  }

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    const { error } = await adminRpc("admin_reply_ticket", {
      p_id: row.id,
      p_body: reply.trim(),
      p_internal: internal,
    });
    setBusy(false);
    if (error) {
      setError(adminError(error));
      return;
    }
    setReply("");
    setError(null);
    messages.reload();
    reload();
  };

  const update = async (patch: { p_status?: string; p_priority?: string; p_assignee?: string }) => {
    const { error } = await adminRpc("admin_update_ticket", { p_id: row.id, ...patch });
    if (error) setError(adminError(error));
    else reload();
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Support", to: "/admin/support" }, { label: row.reference }]}
        title={row.subject}
        subtitle={`${row.reference} · ouvert ${ago(row.created_at)}`}
        actions={
          can("manage_support") ? (
            <>
              <Button variant="secondary" onClick={() => update({ p_status: "escalated" })}>
                Escalader
              </Button>
              <Button variant="primary" onClick={() => update({ p_status: "resolved" })}>
                Marquer résolu
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} size="medium" />
        <PriorityBadge priority={row.priority} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Conversation */}
        <Card className="xl:col-span-2" padded={false}>
          <div className="border-b border-admin-line px-5 py-4">
            <h2 className="font-display text-[15px] font-semibold text-admin-ink">Conversation</h2>
            <p className="text-[12.5px] text-admin-ink-3">
              Les notes internes sont marquées et ne sont jamais visibles par le demandeur.
            </p>
          </div>

          <div className="flex max-h-[560px] flex-col gap-3 overflow-y-auto p-5">
            {messages.loading ? (
              <Skeleton className="h-32 w-full" />
            ) : messages.rows.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-admin-ink-3">Aucun message dans ce ticket.</p>
            ) : (
              messages.rows.map(m => (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-2.5",
                    m.author_kind === "agent" && !m.internal && "flex-row-reverse",
                  )}
                >
                  <span
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-content-center rounded-full text-[10.5px] font-bold text-white"
                    style={{ background: avatarTint(m.author_label) }}
                    aria-hidden
                  >
                    {initials(m.author_label)}
                  </span>
                  <div
                    className={cn(
                      "min-w-0 max-w-[80%] rounded-xl px-3.5 py-2.5",
                      m.internal
                        ? "border border-dashed border-[#f3e2c4] bg-[#fdf8ee]"
                        : m.author_kind === "agent"
                          ? "bg-[#eef3fb]"
                          : "bg-admin-canvas",
                    )}
                  >
                    <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                      <span className="font-semibold text-admin-ink">{m.author_label ?? "Système"}</span>
                      <span className="text-admin-ink-3">{stamp(m.created_at)}</span>
                      {m.internal && (
                        <span className="flex items-center gap-0.5 font-semibold text-[#7a5b12]">
                          <Lock className="h-2.5 w-2.5" aria-hidden />
                          note interne
                        </span>
                      )}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-admin-ink">
                      {m.body}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {can("manage_support") && (
            <div className="border-t border-admin-line p-4">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={3}
                placeholder={internal ? "Note visible uniquement par l'équipe…" : "Répondre au demandeur…"}
                className={cn(
                  inputClass,
                  "h-auto py-2 leading-relaxed",
                  internal && "border-[#f3e2c4] bg-[#fdf8ee]",
                )}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-admin-ink-2">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={e => setInternal(e.target.checked)}
                    className="h-4 w-4 accent-[#002089]"
                  />
                  Note interne
                </label>
                <Button variant="primary" onClick={send} disabled={busy || !reply.trim()}>
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  Envoyer
                </Button>
              </div>
              {error && <p className="mt-2 text-[13px] font-medium text-[#b3261e]">{error}</p>}
            </div>
          )}
        </Card>

        {/* Context */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Traitement" />
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-admin-ink-2" htmlFor="t-status">
                  Statut
                </label>
                <select
                  id="t-status"
                  value={row.status}
                  disabled={!can("manage_support")}
                  onChange={e => update({ p_status: e.target.value })}
                  className={selectClass}
                >
                  {QUEUES.filter(q => q.id !== "all").map(q => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-admin-ink-2" htmlFor="t-priority">
                  Priorité
                </label>
                <select
                  id="t-priority"
                  value={row.priority}
                  disabled={!can("manage_support")}
                  onChange={e => update({ p_priority: e.target.value })}
                  className={selectClass}
                >
                  <option value="low">Basse</option>
                  <option value="normal">Normale</option>
                  <option value="high">Haute</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-admin-ink-2" htmlFor="t-agent">
                  Agent assigné
                </label>
                <select
                  id="t-agent"
                  value={row.assigned_to ?? ""}
                  disabled={!can("manage_support")}
                  onChange={e => update({ p_assignee: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Non assigné</option>
                  {agents.rows.map(a => (
                    <option key={a.user_id} value={a.user_id}>
                      {a.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Contexte" />
            <FieldGrid cols={2}>
              <Field label="Demandeur">
                {row.customer_id ? (
                  <Link to={`/admin/clients/${row.customer_id}`} className="text-[#002089] hover:underline">
                    {row.requester_label ?? "Client"}
                  </Link>
                ) : row.partner_id ? (
                  <Link to={`/admin/partenaires/${row.partner_id}`} className="text-[#002089] hover:underline">
                    {row.requester_label ?? "Partenaire"}
                  </Link>
                ) : (
                  (row.requester_label ?? "—")
                )}
              </Field>
              <Field label="Catégorie">{row.category ?? "—"}</Field>
              <Field label="Réservation">
                {row.booking_ref ? (
                  <Link to={`/admin/reservations/${row.booking_ref}`} className="text-[#002089] hover:underline">
                    {row.booking_ref}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
              {booking.row && <Field label="Montant">{money(booking.row.total)}</Field>}
            </FieldGrid>
          </Card>

          <AuditTrail entityType="ticket" entityId={row.id} />
        </div>
      </div>
    </>
  );
}

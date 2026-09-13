import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, PageHeader, inputClass, labelClass, selectClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { FilterBar } from "../components/FilterBar";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { StatusBadge } from "../../console/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminRpc,searchAcross, useDebounced, useRpc, useTable, type Filter } from "../lib/adminData";
import { count, stamp } from "../../console/format";

type ReviewRow = {
  id: string;
  listing_id: string | null;
  partner_id: string | null;
  customer_label: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  flag: string | null;
  flag_note: string | null;
  partner_reply: string | null;
  created_at: string;
};

const FLAGS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harcèlement" },
  { value: "fake", label: "Faux avis" },
  { value: "prohibited_content", label: "Contenu interdit" },
  { value: "conflict_of_interest", label: "Conflit d'intérêt" },
  { value: "other", label: "Autre" },
];

/** Spec §33. */
export function Reviews() {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [flagging, setFlagging] = useState<ReviewRow | null>(null);
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["title", "body", "customer_label"], debounced)];
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    if (values.rating?.length) f.push({ col: "rating", op: "in", value: values.rating.map(Number) });
    if (values.flag?.length) f.push({ col: "flag", op: "in", value: values.flag });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<ReviewRow>({
    from: "reviews",
    filters,
    sort: { col: "created_at", dir: "desc" },
    page,
    pageSize: 25,
  });

  const { data: stats } = useRpc<{ by_status: Record<string, number>; average: number | null; total: number }>(
    "admin_review_stats",
  );

  const moderate = (row: ReviewRow, status: string, label: string, danger = false, needsReason = false) =>
    confirm({
      title: `${label} cet avis ?`,
      consequence:
        status === "published"
          ? "L'avis devient visible sur la fiche publique et compte dans la note moyenne."
          : status === "hidden"
            ? "L'avis disparaît du site public mais reste consultable ici."
            : status === "removed"
              ? "L'avis est retiré définitivement de la plateforme."
              : "Le statut de l'avis est mis à jour.",
      confirmLabel: label,
      danger,
      requireReason: needsReason,
      reasonLabel: "Motif de modération",
      onConfirm: async reason => {
        const { error } = await adminRpc("admin_moderate_review", {
          p_id: row.id,
          p_status: status,
          p_flag: row.flag,
          p_note: reason || null,
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<ReviewRow>[] = [
    {
      id: "rating",
      header: "Note",
      sortable: true,
      width: "84px",
      mobile: "meta",
      cell: r => (
        <span className="flex items-center gap-1 font-semibold text-admin-ink">
          <Star className="h-3.5 w-3.5 fill-[#e76f2e] text-[#e76f2e]" aria-hidden />
          {r.rating}/5
        </span>
      ),
    },
    {
      id: "title",
      header: "Avis",
      mobile: "primary",
      cell: r => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{r.title ?? "Sans titre"}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{r.body ?? "—"}</span>
        </span>
      ),
    },
    { id: "customer_label", header: "Client", mobile: "secondary", cell: r => r.customer_label ?? "—" },
    {
      id: "flag",
      header: "Signalement",
      mobile: "hidden",
      cell: r =>
        r.flag ? (
          <span className="rounded bg-[#fdf3f2] px-1.5 py-0.5 text-[11.5px] font-semibold text-[#b3261e]">
            {FLAGS.find(f => f.value === r.flag)?.label ?? r.flag}
          </span>
        ) : (
          <span className="text-admin-ink-3">—</span>
        ),
    },
    { id: "status", header: "Statut", mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
    {
      id: "created_at",
      header: "Publié le",
      sortable: true,
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{stamp(r.created_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Avis" subtitle="Modération des avis laissés par les voyageurs." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total" value={count(stats?.total ?? total)} />
        <Stat label="Note moyenne" value={stats?.average ? `${Number(stats.average).toFixed(2).replace(".", ",")}/5` : "—"} />
        <Stat label="Publiés" value={count(stats?.by_status?.published)} />
        <Stat label="En attente" value={count(stats?.by_status?.pending)} />
        <Stat
          label="Signalés"
          value={count(stats?.by_status?.flagged)}
          tone={Number(stats?.by_status?.flagged ?? 0) > 0 ? "negative" : undefined}
        />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Titre, contenu, client…"
        filters={[
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "published", label: "Publié" },
              { value: "pending", label: "En attente" },
              { value: "flagged", label: "Signalé" },
              { value: "hidden", label: "Masqué" },
              { value: "removed", label: "Retiré" },
            ],
          },
          {
            id: "rating",
            label: "Note",
            options: [5, 4, 3, 2, 1].map(n => ({ value: String(n), label: `${n} étoile${n > 1 ? "s" : ""}` })),
          },
          { id: "flag", label: "Signalement", options: FLAGS },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="reviews"
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
        storageKey="reviews"
        actions={[
          {
            label: "Publier",
            hidden: r => !can("moderate_reviews") || r.status === "published",
            onClick: r => moderate(r, "published", "Publier"),
          },
          {
            label: "Masquer",
            hidden: r => !can("moderate_reviews") || r.status === "hidden",
            onClick: r => moderate(r, "hidden", "Masquer", true, true),
          },
          {
            label: "Signaler",
            hidden: () => !can("moderate_reviews"),
            onClick: setFlagging,
          },
          {
            label: "Retirer définitivement",
            danger: true,
            hidden: r => !can("moderate_reviews") || r.status === "removed",
            onClick: r => moderate(r, "removed", "Retirer", true, true),
          },
        ]}
        empty={{
          title: "Aucun avis",
          body:
            total === 0
              ? "Les avis laissés après un séjour apparaîtront ici pour modération."
              : "Aucun avis ne correspond à ces filtres.",
        }}
      />

      <FlagModal review={flagging} onClose={() => setFlagging(null)} onDone={reload} />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

function FlagModal({
  review,
  onClose,
  onDone,
}: {
  review: ReviewRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [flag, setFlag] = useState("spam");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!review) return null;

  const submit = async () => {
    if (note.trim().length < 5) {
      setError("Décrivez brièvement le problème constaté.");
      return;
    }
    setBusy(true);
    const { error } = await adminRpc("admin_moderate_review", {
      p_id: review.id,
      p_status: "flagged",
      p_flag: flag,
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
      open
      onClose={onClose}
      title="Signaler cet avis"
      subtitle="L'avis reste visible tant qu'il n'est pas masqué ou retiré."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            Signaler
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-lg bg-admin-canvas px-3.5 py-2.5 text-[13px] leading-relaxed text-admin-ink-2">
        <strong className="font-semibold text-admin-ink">{review.title ?? `Note ${review.rating}/5`}</strong>
        <br />
        {review.body ?? "Aucun contenu."}
      </p>

      <label className={labelClass} htmlFor="flag-kind">
        Motif du signalement
      </label>
      <select id="flag-kind" value={flag} onChange={e => setFlag(e.target.value)} className={selectClass}>
        {FLAGS.map(f => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <label className={`${labelClass} mt-4`} htmlFor="flag-note">
        Détail
      </label>
      <textarea
        id="flag-note"
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={3}
        className={`${inputClass} h-auto py-2`}
      />

      {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

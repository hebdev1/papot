import { useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { Callout, PageHeader } from "../components/Ui";
import { Stat } from "../components/Cards";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { Drawer } from "../components/Dialog";
import { SeverityBadge } from "../components/StatusBadge";
import { actionLabel, diffFields } from "../components/Panels";
import { exportCsv, searchAcross, useDebounced, useTable, type AuditEntry, type Filter } from "../lib/adminData";
import { avatarTint, count, initials, stamp } from "../lib/format";

/** Spec §48. */
export function AuditLogs() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [inspect, setInspect] = useState<AuditEntry | null>(null);
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["action", "entity_label", "admin_label", "reason"], debounced)];
    if (values.severity?.length) f.push({ col: "severity", op: "in", value: values.severity });
    if (values.entity?.length) f.push({ col: "entity_type", op: "in", value: values.entity });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<AuditEntry>({
    from: "admin_audit_log",
    filters,
    sort: { col: "at", dir: "desc" },
    page,
    pageSize,
  });

  const columns: Column<AuditEntry>[] = [
    {
      id: "at",
      header: "Horodatage",
      sortable: true,
      width: "150px",
      mobile: "secondary",
      cell: e => <span className="tabular-nums text-admin-ink-3">{stamp(e.at)}</span>,
    },
    {
      id: "admin_label",
      header: "Administrateur",
      mobile: "secondary",
      cell: e => (
        <span className="flex items-center gap-2">
          <span
            className="grid h-6 w-6 shrink-0 place-content-center rounded-full text-[9.5px] font-bold text-white"
            style={{ background: avatarTint(e.admin_label) }}
            aria-hidden
          >
            {initials(e.admin_label ?? "S")}
          </span>
          <span className="truncate">{e.admin_label ?? "Système"}</span>
        </span>
      ),
    },
    {
      id: "action",
      header: "Action",
      mobile: "primary",
      cell: e => <span className="font-medium text-admin-ink">{actionLabel(e.action)}</span>,
    },
    {
      id: "entity_label",
      header: "Élément",
      mobile: "secondary",
      cell: e => (
        <span className="min-w-0">
          <span className="block truncate">{e.entity_label ?? e.entity_id ?? "—"}</span>
          <span className="block truncate text-[11.5px] text-admin-ink-3">{e.entity_type}</span>
        </span>
      ),
    },
    {
      id: "changes",
      header: "Modifications",
      mobile: "hidden",
      cell: e => {
        const d = diffFields(e);
        return d.length === 0 ? (
          <span className="text-admin-ink-3">—</span>
        ) : (
          <button
            onClick={() => setInspect(e)}
            className="text-[12.5px] font-semibold text-[#002089] hover:underline"
          >
            {d.length} champ{d.length > 1 ? "s" : ""}
          </button>
        );
      },
    },
    { id: "reason", header: "Motif", defaultHidden: true, mobile: "hidden", cell: e => e.reason ?? "—" },
    {
      id: "severity",
      header: "Gravité",
      sortable: true,
      mobile: "meta",
      cell: e => <SeverityBadge severity={e.severity} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        subtitle="Chaque action d'administration, son auteur, son motif et ce qui a changé."
      />

      <div className="mb-5">
        <Callout>
          Ce journal est en ajout seul : il n'existe aucune politique de modification ni de suppression, et les
          écritures passent par une fonction serveur. Un administrateur ne peut donc pas effacer la trace de ce
          qu'il a fait.
        </Callout>
      </div>

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Entrées" value={count(total)} />
        <Stat label="Critiques" value={count(rows.filter(r => r.severity === "critical").length)} />
        <Stat label="Avertissements" value={count(rows.filter(r => r.severity === "warning").length)} />
        <Stat label="Administrateurs actifs" value={count(new Set(rows.map(r => r.admin_label)).size)} />
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Action, élément, administrateur, motif…"
        filters={[
          {
            id: "severity",
            label: "Gravité",
            options: [
              { value: "critical", label: "Critique" },
              { value: "warning", label: "Avertissement" },
              { value: "notice", label: "À surveiller" },
              { value: "info", label: "Info" },
            ],
          },
          {
            id: "entity",
            label: "Type d'élément",
            options: [
              { value: "customer", label: "Client" },
              { value: "partner", label: "Partenaire" },
              { value: "application", label: "Candidature" },
              { value: "listing", label: "Annonce" },
              { value: "booking", label: "Réservation" },
              { value: "refund", label: "Remboursement" },
              { value: "payout", label: "Versement" },
              { value: "review", label: "Avis" },
              { value: "dispute", label: "Litige" },
              { value: "ticket", label: "Ticket" },
              { value: "staff", label: "Personnel" },
              { value: "role", label: "Rôle" },
              { value: "setting", label: "Réglage" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="audit"
        onExport={() =>
          exportCsv("papot-audit", rows as unknown as Record<string, unknown>[], [
            "at",
            "admin_label",
            "action",
            "entity_type",
            "entity_label",
            "reason",
            "severity",
          ])
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={e => String(e.id)}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={s => {
          setPageSize(s);
          setPage(1);
        }}
        storageKey="audit"
        actions={[{ label: "Voir le détail", onClick: setInspect }]}
        empty={{
          title: "Aucune entrée",
          body: "Les actions d'administration apparaîtront ici dès la première décision enregistrée.",
        }}
      />

      <Drawer
        open={!!inspect}
        onClose={() => setInspect(null)}
        title={inspect ? actionLabel(inspect.action) : ""}
        subtitle={inspect ? `${inspect.admin_label ?? "Système"} · ${stamp(inspect.at)}` : undefined}
      >
        {inspect && (
          <div className="flex flex-col gap-4">
            <dl className="divide-y divide-admin-line rounded-lg border border-admin-line">
              {[
                ["Élément", inspect.entity_label ?? inspect.entity_id ?? "—"],
                ["Type", inspect.entity_type],
                ["Identifiant", inspect.entity_id ?? "—"],
                ["Gravité", inspect.severity],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                  <dt className="text-[12.5px] text-admin-ink-3">{k}</dt>
                  <dd className="min-w-0 break-words text-right text-[13px] font-medium text-admin-ink">{v}</dd>
                </div>
              ))}
            </dl>

            {inspect.reason && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Motif</p>
                <p className="rounded-lg bg-admin-canvas px-3 py-2 text-[13px] leading-relaxed text-admin-ink">
                  {inspect.reason}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                Modifications
              </p>
              {diffFields(inspect).length === 0 ? (
                <p className="text-[13px] text-admin-ink-3">Aucun champ modifié.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {diffFields(inspect).map(c => (
                    <li key={c.key} className="rounded-lg border border-admin-line px-3 py-2">
                      <p className="text-[12px] font-semibold text-admin-ink-2">{c.key}</p>
                      <p className="mt-0.5 break-words text-[13px]">
                        <span className="text-admin-ink-3 line-through">
                          {c.from === null || c.from === undefined ? "—" : String(c.from)}
                        </span>
                        <span className="mx-1.5 text-admin-ink-3">→</span>
                        <span className="font-medium text-admin-ink">
                          {c.to === null || c.to === undefined ? "—" : String(c.to)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

export { ScrollText };

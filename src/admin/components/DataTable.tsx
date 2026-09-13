import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Inbox,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, EmptyState, ErrorState, SkeletonRows } from "./Ui";
import type { SortDir } from "../lib/adminData";

/**
 * One table for the whole console (spec §59).
 *
 * Desktop renders a dense table; below `lg` the same rows render as cards,
 * because a fourteen-column table squeezed into 390px is unusable and spec §64
 * asks for cards rather than a horizontally scrolling desktop layout.
 *
 * Row actions live behind a single ••• menu: fifteen buttons per row is the
 * pattern §59 explicitly rules out.
 */

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Column to order by; defaults to `id`. Omit `sortable` to disable. */
  sortable?: boolean;
  sortKey?: string;
  align?: "left" | "right" | "center";
  width?: string;
  /** Hidden by default, available from the column picker. */
  defaultHidden?: boolean;
  /** Always visible in the picker; set false to pin the column. */
  hideable?: boolean;
  /** On mobile cards: the headline, the supporting line, or hidden. */
  mobile?: "primary" | "secondary" | "meta" | "hidden";
};

export type RowAction<T> = {
  label: string;
  onClick: (row: T) => void;
  danger?: boolean;
  disabled?: (row: T) => boolean;
  hidden?: (row: T) => boolean;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  total: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  actions?: RowAction<T>[];
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  sort?: { col: string; dir: SortDir };
  onSort?: (sort: { col: string; dir: SortDir }) => void;
  selectable?: boolean;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  bulkBar?: (ids: string[], clear: () => void) => React.ReactNode;
  empty?: { title: string; body?: string; action?: React.ReactNode };
  /** Persist the visible-column choice per table. */
  storageKey?: string;
};

export function DataTable<T>({
  columns,
  rows,
  total,
  loading,
  error,
  onRetry,
  rowKey,
  rowHref,
  actions,
  page,
  pageSize,
  onPage,
  onPageSize,
  sort,
  onSort,
  selectable,
  selected = [],
  onSelect,
  bulkBar,
  empty,
  storageKey,
}: Props<T>) {
  const [hidden, setHidden] = useState<string[]>(() => {
    const fromStorage = storageKey ? localStorage.getItem(`papot.admin.cols.${storageKey}`) : null;
    if (fromStorage) {
      try {
        return JSON.parse(fromStorage) as string[];
      } catch {
        /* fall through to defaults */
      }
    }
    return columns.filter(c => c.defaultHidden).map(c => c.id);
  });

  useEffect(() => {
    if (storageKey) localStorage.setItem(`papot.admin.cols.${storageKey}`, JSON.stringify(hidden));
  }, [hidden, storageKey]);

  const visible = columns.filter(c => !hidden.includes(c.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allOnPage = rows.map(rowKey);
  const allSelected = allOnPage.length > 0 && allOnPage.every(id => selected.includes(id));

  const toggleAll = () => {
    if (!onSelect) return;
    onSelect(allSelected ? selected.filter(id => !allOnPage.includes(id)) : [...new Set([...selected, ...allOnPage])]);
  };

  const toggleOne = (id: string) => {
    if (!onSelect) return;
    onSelect(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  const clickSort = (c: Column<T>) => {
    if (!c.sortable || !onSort) return;
    const key = c.sortKey ?? c.id;
    onSort({ col: key, dir: sort?.col === key && sort.dir === "asc" ? "desc" : "asc" });
  };

  if (error) return <ErrorState detail={error} onRetry={onRetry} />;

  return (
    <div className="flex flex-col gap-3">
      {selectable && selected.length > 0 && bulkBar && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#002089]/25 bg-[#f4f8fd] px-4 py-2.5">
          <span className="text-[13px] font-semibold text-[#002089]">
            {selected.length} sélectionné{selected.length > 1 ? "s" : ""}
          </span>
          {bulkBar(selected, () => onSelect?.([]))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-admin-line bg-admin-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {/* Desktop table */}
        <div className="hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-admin-line bg-admin-raised">
                  {selectable && (
                    <th scope="col" className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Tout sélectionner"
                        className="h-4 w-4 cursor-pointer accent-[#002089]"
                      />
                    </th>
                  )}
                  {visible.map(c => {
                    const key = c.sortKey ?? c.id;
                    const active = sort?.col === key;
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        style={{ width: c.width }}
                        aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                        className={cn(
                          "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3",
                          c.align === "right" && "text-right",
                          c.align === "center" && "text-center",
                        )}
                      >
                        {c.sortable ? (
                          <button
                            onClick={() => clickSort(c)}
                            className={cn(
                              "inline-flex items-center gap-1 transition-colors hover:text-admin-ink",
                              active && "text-[#002089]",
                            )}
                          >
                            {c.header}
                            {active ? (
                              sort!.dir === "asc" ? (
                                <ArrowUp className="h-3 w-3" aria-hidden />
                              ) : (
                                <ArrowDown className="h-3 w-3" aria-hidden />
                              )
                            ) : (
                              <ArrowDown className="h-3 w-3 opacity-25" aria-hidden />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                  {actions && actions.length > 0 && <th scope="col" className="w-12 px-4 py-2.5" />}
                </tr>
              </thead>

              {loading ? (
                <tbody>
                  <tr>
                    <td colSpan={visible.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="p-0">
                      <SkeletonRows rows={6} cols={Math.min(visible.length, 6)} />
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody className="divide-y divide-admin-line">
                  {rows.map(row => {
                    const id = rowKey(row);
                    const href = rowHref?.(row);
                    return (
                      <tr
                        key={id}
                        className={cn(
                          "group transition-colors hover:bg-admin-canvas",
                          selected.includes(id) && "bg-[#f4f8fd]",
                        )}
                      >
                        {selectable && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.includes(id)}
                              onChange={() => toggleOne(id)}
                              aria-label="Sélectionner la ligne"
                              className="h-4 w-4 cursor-pointer accent-[#002089]"
                            />
                          </td>
                        )}
                        {visible.map((c, i) => (
                          <td
                            key={c.id}
                            className={cn(
                              "px-4 py-3 align-middle text-[13px] text-admin-ink",
                              c.align === "right" && "text-right tabular-nums",
                              c.align === "center" && "text-center",
                            )}
                          >
                            {i === 0 && href ? (
                              <Link to={href} className="block font-medium hover:text-[#002089]">
                                {c.cell(row)}
                              </Link>
                            ) : (
                              c.cell(row)
                            )}
                          </td>
                        ))}
                        {actions && actions.length > 0 && (
                          <td className="px-4 py-3 text-right">
                            <RowMenu row={row} actions={actions} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        </div>

        {/* Mobile cards (spec §64) */}
        <div className="divide-y divide-admin-line lg:hidden">
          {loading ? (
            <SkeletonRows rows={4} cols={2} />
          ) : (
            rows.map(row => {
              const id = rowKey(row);
              const href = rowHref?.(row);
              const primary = columns.find(c => c.mobile === "primary") ?? columns[0];
              const secondary = columns.filter(c => c.mobile === "secondary");
              const meta = columns.filter(c => c.mobile === "meta");
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 text-[14px] font-semibold text-admin-ink">
                      {primary.cell(row)}
                    </div>
                    {meta.length > 0 && <div className="shrink-0 text-right">{meta[0].cell(row)}</div>}
                  </div>
                  {secondary.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {secondary.map(c => (
                        <div key={c.id} className="min-w-0">
                          <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-admin-ink-3">
                            {c.header}
                          </dt>
                          <dd className="truncate text-[13px] text-admin-ink">{c.cell(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              );

              return (
                <div key={id} className="flex items-start gap-2 px-4 py-3.5">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={() => toggleOne(id)}
                      aria-label="Sélectionner"
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#002089]"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {href ? (
                      <Link to={href} className="block">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </div>
                  {actions && actions.length > 0 && <RowMenu row={row} actions={actions} />}
                </div>
              );
            })
          )}
        </div>

        {!loading && rows.length === 0 && (
          <div className="p-4">
            <EmptyState
              icon={Inbox}
              title={empty?.title ?? "Aucun résultat"}
              body={empty?.body ?? "Aucune ligne ne correspond à ces filtres."}
              action={empty?.action}
            />
          </div>
        )}

        {/* Footer: count, column picker, paging */}
        {(rows.length > 0 || total > 0) && (
          <div className="flex flex-col gap-3 border-t border-admin-line bg-admin-raised px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[12.5px] text-admin-ink-3">
                {total.toLocaleString("fr-FR")} résultat{total > 1 ? "s" : ""}
              </span>
              <ColumnPicker columns={columns} hidden={hidden} setHidden={setHidden} />
              {onPageSize && (
                <select
                  value={pageSize}
                  onChange={e => onPageSize(Number(e.target.value))}
                  aria-label="Lignes par page"
                  className="h-7 cursor-pointer rounded-md border border-admin-line-strong bg-white px-1.5 text-[12px] text-admin-ink-2"
                >
                  {[25, 50, 100].map(n => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
                aria-label="Page précédente"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <span className="px-2 text-[12.5px] tabular-nums text-admin-ink-2">
                {page} / {pages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= pages}
                onClick={() => onPage(page + 1)}
                aria-label="Page suivante"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RowMenu<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shown = actions.filter(a => !a.hidden?.(row));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (shown.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-admin-ink-3 transition-colors hover:bg-admin-line/60 hover:text-admin-ink"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-lg border border-admin-line bg-white py-1 shadow-lg"
        >
          {shown.map(a => {
            const disabled = a.disabled?.(row) ?? false;
            return (
              <button
                key={a.label}
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  a.onClick(row);
                }}
                className={cn(
                  "block w-full px-3.5 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  a.danger
                    ? "text-[#b3261e] hover:bg-[#fdf3f2]"
                    : "text-admin-ink hover:bg-admin-canvas",
                )}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColumnPicker<T>({
  columns,
  hidden,
  setHidden,
}: {
  columns: Column<T>[];
  hidden: string[];
  setHidden: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hideable = columns.filter(c => c.hideable !== false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (hideable.length === 0) return null;

  return (
    <div className="relative hidden lg:block" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-admin-ink-3 transition-colors hover:text-admin-ink"
      >
        <Columns3 className="h-3.5 w-3.5" aria-hidden />
        Colonnes
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div className="absolute bottom-7 left-0 z-30 w-56 rounded-lg border border-admin-line bg-white py-1.5 shadow-lg">
          {hideable.map(c => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] text-admin-ink hover:bg-admin-canvas"
            >
              <input
                type="checkbox"
                checked={!hidden.includes(c.id)}
                onChange={() =>
                  setHidden(hidden.includes(c.id) ? hidden.filter(h => h !== c.id) : [...hidden, c.id])
                }
                className="h-3.5 w-3.5 accent-[#002089]"
              />
              {c.header}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

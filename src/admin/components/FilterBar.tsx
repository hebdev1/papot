import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Check, ChevronDown, Download, Search, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, inputClass } from "./Ui";
import { useSavedViews } from "../lib/adminData";

/**
 * Search, filters, saved views and export (spec §59, §60).
 *
 * Filter state lives in the URL, so a filtered table can be linked to a
 * colleague, reloaded, or bookmarked — which is what makes saved views worth
 * having in the first place.
 */

export type FilterOption = { value: string; label: string };

export type FilterDef = {
  id: string;
  label: string;
  options: FilterOption[];
  multiple?: boolean;
};

export function FilterBar({
  search,
  onSearch,
  placeholder = "Rechercher…",
  filters = [],
  values,
  onChange,
  onExport,
  savedViewsPage,
  extra,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  filters?: FilterDef[];
  values: Record<string, string[]>;
  onChange: (values: Record<string, string[]>) => void;
  onExport?: () => void;
  savedViewsPage?: string;
  extra?: React.ReactNode;
}) {
  const active = Object.entries(values).filter(([, v]) => v.length > 0);
  const activeCount = active.reduce((n, [, v]) => n + v.length, 0);

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-ink-3"
            aria-hidden
          />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className={cn(inputClass, "pl-9")}
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              aria-label="Effacer la recherche"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-admin-ink-3 hover:text-admin-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>

        {filters.map(f => (
          <FilterDropdown
            key={f.id}
            def={f}
            value={values[f.id] ?? []}
            onChange={v => onChange({ ...values, [f.id]: v })}
          />
        ))}

        {extra}

        {savedViewsPage && (
          <SavedViewsMenu page={savedViewsPage} values={values} search={search} onApply={(v, s) => {
            onChange(v);
            onSearch(s);
          }} />
        )}

        {onExport && (
          <Button variant="secondary" size="md" onClick={onExport}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter
          </Button>
        )}
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.flatMap(([id, vals]) => {
            const def = filters.find(f => f.id === id);
            return vals.map(v => (
              <button
                key={`${id}:${v}`}
                onClick={() => onChange({ ...values, [id]: vals.filter(x => x !== v) })}
                className="inline-flex items-center gap-1 rounded-md border border-[#002089]/25 bg-[#f4f8fd] px-2 py-1 text-[12px] font-medium text-[#002089] transition-colors hover:bg-[#e6effa]"
              >
                <span className="text-[#5b7bb5]">{def?.label}:</span>
                {def?.options.find(o => o.value === v)?.label ?? v}
                <X className="h-3 w-3" aria-hidden />
              </button>
            ));
          })}
          <button
            onClick={() => onChange({})}
            className="px-1.5 text-[12px] font-medium text-admin-ink-3 underline-offset-2 hover:text-admin-ink hover:underline"
          >
            Tout effacer
          </button>
        </div>
      )}
    </div>
  );
}

function FilterDropdown({
  def,
  value,
  onChange,
}: {
  def: FilterDef;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const toggle = (v: string) => {
    if (def.multiple === false) {
      onChange(value.includes(v) ? [] : [v]);
      setOpen(false);
      return;
    }
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors",
          value.length
            ? "border-[#002089]/35 bg-[#f4f8fd] text-[#002089]"
            : "border-admin-line-strong bg-white text-admin-ink-2 hover:bg-admin-canvas",
        )}
      >
        {def.label}
        {value.length > 0 && (
          <span className="rounded bg-[#002089] px-1.5 text-[11px] font-bold text-white">{value.length}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-10 z-30 max-h-72 w-56 overflow-y-auto rounded-lg border border-admin-line bg-white py-1 shadow-lg"
        >
          {def.options.map(o => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-[13px] text-admin-ink transition-colors hover:bg-admin-canvas"
              >
                {o.label}
                {on && <Check className="h-3.5 w-3.5 text-[#002089]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SavedViewsMenu({
  page,
  values,
  search,
  onApply,
}: {
  page: string;
  values: Record<string, string[]>;
  search: string;
  onApply: (values: Record<string, string[]>, search: string) => void;
}) {
  const { views, save, remove } = useSavedViews(page);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNaming(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const commit = async () => {
    if (!name.trim()) return;
    await save(name.trim(), { values, search });
    setName("");
    setNaming(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-admin-line-strong bg-white px-3 text-[13px] font-medium text-admin-ink-2 transition-colors hover:bg-admin-canvas"
      >
        <Bookmark className="h-3.5 w-3.5" aria-hidden />
        Vues
        {views.length > 0 && <span className="text-admin-ink-3">({views.length})</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-30 w-64 rounded-lg border border-admin-line bg-white py-1.5 shadow-lg">
          {views.length === 0 && !naming && (
            <p className="px-3.5 py-2 text-[12.5px] leading-relaxed text-admin-ink-3">
              Enregistrez les filtres que vous utilisez souvent pour les retrouver en un clic.
            </p>
          )}

          {views.map(v => (
            <div key={v.id} className="group flex items-center gap-1 px-1.5">
              <button
                onClick={() => {
                  const f = v.filters as { values?: Record<string, string[]>; search?: string };
                  onApply(f.values ?? {}, f.search ?? "");
                  setOpen(false);
                }}
                className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-[13px] text-admin-ink hover:bg-admin-canvas"
              >
                {v.name}
              </button>
              <button
                onClick={() => remove(v.id)}
                aria-label={`Supprimer la vue ${v.name}`}
                className="rounded p-1 text-admin-ink-3 opacity-0 transition-opacity hover:text-[#b3261e] group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}

          <div className="mt-1 border-t border-admin-line pt-1">
            {naming ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && commit()}
                  placeholder="Nom de la vue"
                  className="h-8 min-w-0 flex-1 rounded-md border border-admin-line-strong px-2 text-[13px] focus:border-[#002089] focus:outline-none"
                />
                <Button variant="primary" size="sm" onClick={commit}>
                  OK
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setNaming(true)}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-medium text-[#002089] hover:bg-admin-canvas"
              >
                <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
                Enregistrer les filtres actuels
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

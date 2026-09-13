import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, Search, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, inputClass } from "../../console/Ui";

/**
 * Search, filters and export for the partner dashboard.
 *
 * Deliberately lighter than the admin's: no saved views. Those are backed by a
 * staff-only table, and a partner filtering their own thirty listings does not
 * need presets — offering an empty feature is worse than not offering it.
 */

export type FilterDef = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
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
  extra,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  filters?: FilterDef[];
  values: Record<string, string[]>;
  onChange: (values: Record<string, string[]>) => void;
  onExport?: () => void;
  extra?: React.ReactNode;
}) {
  const active = Object.entries(values).filter(([, v]) => v.length > 0);
  const activeCount = active.reduce((n, [, v]) => n + v.length, 0);

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
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
          <Dropdown
            key={f.id}
            def={f}
            value={values[f.id] ?? []}
            onChange={v => onChange({ ...values, [f.id]: v })}
          />
        ))}

        {extra}

        {onExport && (
          <Button variant="secondary" onClick={onExport}>
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

function Dropdown({
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
          <span className="rounded bg-[#002089] px-1.5 text-[11px] font-bold text-white">
            {value.length}
          </span>
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

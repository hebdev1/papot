import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAdmin } from "../lib/adminAuth";
import { allNavItems } from "../lib/nav";
import { supabase } from "../../lib/supabase";
import { adminRpc,useDebounced } from "../lib/adminData";

/**
 * ⌘K palette (spec §57).
 *
 * Two kinds of result: navigation (always available, matched locally) and
 * records (the same admin_global_search the header uses). Expert operators
 * jump straight to a booking reference without touching the mouse.
 */

type Entry = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  to: string;
  icon?: React.ElementType;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAdmin();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const [records, setRecords] = useState<Entry[]>([]);
  const debounced = useDebounced(term, 200);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTerm("");
      setActive(0);
      setRecords([]);
      // Focus after paint, or the input is not yet in the document.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open || debounced.trim().length < 2) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    void adminRpc("admin_global_search", { q: debounced }).then(({ data }) => {
      if (cancelled) return;
      setRecords(
        ((data ?? []) as { group_name: string; id: string; title: string; subtitle: string | null; href: string }[]).map(
          h => ({ id: `${h.group_name}-${h.id}`, label: h.title, hint: h.subtitle ?? undefined, group: h.group_name, to: h.href }),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const navEntries = useMemo<Entry[]>(
    () =>
      allNavItems()
        .filter(i => !i.permission || can(i.permission))
        .map(i => ({ id: i.to, label: i.label, group: "Aller à", to: i.to, icon: i.icon })),
    [can],
  );

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    const nav = q
      ? navEntries.filter(e => e.label.toLowerCase().includes(q))
      : navEntries.slice(0, 8);
    return [...nav, ...records];
  }, [term, navEntries, records]);

  useEffect(() => setActive(0), [results.length]);

  if (!open) return null;

  const grouped = results.reduce<Record<string, Entry[]>>((acc, e) => {
    (acc[e.group] ??= []).push(e);
    return acc;
  }, {});

  const go = (e: Entry) => {
    navigate(e.to);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-[#101828]/45 backdrop-blur-[1px]" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-admin-line bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-admin-line px-4">
          <Search className="h-4 w-4 shrink-0 text-admin-ink-3" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={e => setTerm(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(a => (a + 1) % Math.max(results.length, 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(a => (a - 1 + results.length) % Math.max(results.length, 1));
              }
              if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                go(results[active]);
              }
            }}
            placeholder="Aller à une section, ouvrir une réservation, chercher un client…"
            className="h-12 w-full bg-transparent text-[14px] text-admin-ink placeholder:text-admin-ink-3 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-admin-line-strong px-1.5 py-0.5 text-[10.5px] font-semibold text-admin-ink-3 sm:block">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-admin-ink-3">
              {term.trim().length < 2 ? "Tapez pour chercher." : `Aucun résultat pour « ${term} ».`}
            </p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-4 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-admin-ink-3">
                  {group}
                </p>
                {items.map(e => {
                  const idx = results.indexOf(e);
                  const Icon = e.icon;
                  return (
                    <button
                      key={e.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(e)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors",
                        idx === active ? "bg-[#eef3fb]" : "hover:bg-admin-canvas",
                      )}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0 text-admin-ink-3" aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-admin-ink">{e.label}</span>
                        {e.hint && <span className="block truncate text-[12px] text-admin-ink-3">{e.hint}</span>}
                      </span>
                      {idx === active && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-admin-ink-3" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-admin-line bg-admin-raised px-4 py-2 text-[11.5px] text-admin-ink-3">
          <span>↑↓ naviguer</span>
          <span>⏎ ouvrir</span>
          <span>esc fermer</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

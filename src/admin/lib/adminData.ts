import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { adminError } from "./adminAuth";

/**
 * The data layer every admin table shares.
 *
 * Filtering, sorting and paging happen in Postgres, not in the browser: an
 * operations console is expected to survive tables that outgrow a single page,
 * and shipping ten thousand rows to filter them client-side would not.
 */

/**
 * The typed-client boundary.
 *
 * Supabase generates exact literal types for every enum and table name, which
 * is exactly what you want at a fixed call site. The admin console instead
 * builds table names, RPC names and enum values at runtime — a status comes
 * from a dropdown, a table name from a page's configuration. Casting once here
 * keeps that unavoidable widening in one reviewed place rather than sprinkling
 * `as never` across forty call sites, and every one of these calls is still
 * checked by the database, which is the check that actually matters.
 */
export const adminRpc = (fn: string, args?: Record<string, unknown>) =>
  supabase.rpc(fn as never, args as never);

type Payload = Record<string, unknown>;

/** The builder methods the console uses, with payloads as plain records. */
type LooseTable = {
  select: (columns?: string, options?: { count?: "exact" | "planned" | "estimated" }) => any;
  insert: (values: Payload | Payload[]) => any;
  update: (values: Payload) => any;
  upsert: (values: Payload | Payload[]) => any;
  delete: () => any;
};

export const adminTable = (name: string) =>
  supabase.from(name as never) as unknown as LooseTable;

export type SortDir = "asc" | "desc";

export type Filter =
  /** column = value */
  | { col: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; value: string | number | boolean }
  /** column in (...) — used by every multi-select status filter */
  | { col: string; op: "in"; value: (string | number)[] }
  /** case-insensitive contains */
  | { col: string; op: "ilike"; value: string }
  /** OR across several columns, for a table's search box */
  | { op: "or"; expr: string };

export type TableQuery = {
  from: string;
  select?: string;
  filters?: Filter[];
  sort?: { col: string; dir: SortDir };
  page?: number;
  pageSize?: number;
  /** Skip the query entirely, e.g. while a parent id is still unknown. */
  enabled?: boolean;
};

export type TableResult<T> = {
  rows: T[];
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

function applyFilters(builder: any, filters: Filter[]) {
  let q = builder;
  for (const f of filters) {
    if (f.op === "or") q = q.or(f.expr);
    else if (f.op === "in") q = q.in(f.col, f.value);
    else if (f.op === "ilike") q = q.ilike(f.col, `%${f.value}%`);
    else q = q[f.op](f.col, f.value);
  }
  return q;
}

export function useTable<T = Record<string, unknown>>(query: TableQuery): TableResult<T> {
  const {
    from,
    select = "*",
    filters = [],
    sort,
    page = 1,
    pageSize = 25,
    enabled = true,
  } = query;

  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Filters arrive as a fresh array on every render; compare by value so the
  // effect does not loop.
  const key = JSON.stringify({ from, select, filters, sort, page, pageSize, enabled });
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const ticket = ++latest.current;
    setLoading(true);

    const run = async () => {
      let q: any = adminTable(from).select(select, { count: "exact" });
      q = applyFilters(q, filters);
      if (sort) q = q.order(sort.col, { ascending: sort.dir === "asc", nullsFirst: false });
      q = q.range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await q;
      // A slower earlier request must not overwrite a newer result.
      if (ticket !== latest.current) return;

      if (error) {
        setError(adminError(error));
        setRows([]);
        setTotal(0);
      } else {
        setError(null);
        setRows((data ?? []) as T[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { rows, total, loading, error, reload: () => setNonce(n => n + 1) };
}

/** One row, or null. */
export function useRow<T = Record<string, unknown>>(
  from: string,
  match: Record<string, string | number>,
  select = "*",
  enabled = true,
) {
  const [row, setRow] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify({ from, match, select, enabled });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);

    void (async () => {
      let q: any = adminTable(from).select(select);
      for (const [col, value] of Object.entries(match)) q = q.eq(col, value);
      const { data, error } = await q.maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(adminError(error));
        setRow(null);
      } else {
        setError(null);
        setRow((data ?? null) as T | null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { row, loading, error, reload: () => setNonce(n => n + 1) };
}

/** Call a SECURITY DEFINER function and keep its result. */
export function useRpc<T>(fn: string, args?: Record<string, unknown>, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify({ fn, args, enabled });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);

    void adminRpc(fn, args).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setError(adminError(error));
        setData(null);
      } else {
        setError(null);
        setData(data as T);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { data, loading, error, reload: () => setNonce(n => n + 1) };
}

/** Internal notes for any entity (spec §63). */
export type InternalNote = {
  id: string;
  body: string;
  author_label: string | null;
  created_at: string;
};

export function useInternalNotes(entityType: string, entityId: string | undefined) {
  const { rows, loading, error, reload } = useTable<InternalNote>({
    from: "internal_notes",
    select: "id, body, author_label, created_at",
    filters: [
      { col: "entity_type", op: "eq", value: entityType },
      { col: "entity_id", op: "eq", value: entityId ?? "" },
    ],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 50,
    enabled: !!entityId,
  });

  const add = useCallback(
    async (body: string) => {
      const { error } = await adminRpc("admin_add_note", {
        p_entity_type: entityType,
        p_entity_id: entityId ?? "",
        p_body: body,
      });
      if (!error) reload();
      return error ? adminError(error) : null;
    },
    [entityType, entityId, reload],
  );

  return { notes: rows, loading, error, add, reload };
}

/** Audit entries for one entity (spec §48). */
export type AuditEntry = {
  id: number;
  admin_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  previous: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
  reason: string | null;
  severity: string;
  at: string;
};

export function useAuditTrail(entityType: string, entityId: string | undefined, limit = 20) {
  return useTable<AuditEntry>({
    from: "admin_audit_log",
    select: "id, admin_label, action, entity_type, entity_id, entity_label, previous, next, reason, severity, at",
    filters: [
      { col: "entity_type", op: "eq", value: entityType },
      { col: "entity_id", op: "eq", value: entityId ?? "" },
    ],
    sort: { col: "at", dir: "desc" },
    pageSize: limit,
    enabled: !!entityId,
  });
}

/** Saved filter presets (spec §60). */
export type SavedView = { id: string; name: string; filters: Record<string, unknown>; shared: boolean };

export function useSavedViews(page: string) {
  const { rows, loading, reload } = useTable<SavedView>({
    from: "admin_saved_views",
    select: "id, name, filters, shared",
    filters: [{ col: "page", op: "eq", value: page }],
    sort: { col: "created_at", dir: "asc" },
    pageSize: 20,
  });

  const save = useCallback(
    async (name: string, filters: Record<string, unknown>) => {
      const { data: session } = await supabase.auth.getUser();
      const owner = session.user?.id;
      if (!owner) return "Session expirée.";
      const { error } = await adminTable("admin_saved_views")
        .insert({ owner_id: owner, page, name, filters });
      if (!error) reload();
      return error ? adminError(error) : null;
    },
    [page, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await adminTable("admin_saved_views").delete().eq("id", id);
      reload();
    },
    [reload],
  );

  return { views: rows, loading, save, remove };
}

/** Turn the current rows into a CSV download (spec §59). */
export function exportCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  if (!rows.length) return;
  const cols = columns ?? Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(";"), ...rows.map(r => cols.map(c => escape(r[c])).join(";"))].join("\n");
  // The BOM keeps accented French readable when the file is opened in Excel.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Debounce a search box so typing does not fire a query per keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Build an `or` filter across several columns for one search term. */
export function searchAcross(columns: string[], term: string): Filter[] {
  const clean = term.trim().replace(/[,()]/g, " ");
  if (clean.length < 2) return [];
  return [{ op: "or", expr: columns.map(c => `${c}.ilike.%${clean}%`).join(",") }];
}

export const useMemoFilters = (build: () => Filter[], deps: unknown[]) =>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(build, deps);

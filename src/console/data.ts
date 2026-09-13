import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { SortDir } from "./DataTable";

/**
 * The data layer both consoles share.
 *
 * Filtering, sorting and paging happen in Postgres, not in the browser: an
 * operations console is expected to survive tables that outgrow a single page,
 * and shipping ten thousand rows to filter them client-side would not.
 *
 * Nothing here grants access. Every query is still answered through RLS, so a
 * partner's `useTable("listings")` returns their listings and an admin's
 * returns all of them, without either page asking for that distinction.
 */

/**
 * The typed-client boundary.
 *
 * Supabase generates exact literal types for every enum and table name, which
 * is what you want at a fixed call site. A console instead builds table names,
 * RPC names and enum values at runtime — a status comes from a dropdown, a
 * table name from a page's configuration. Casting once here keeps that
 * unavoidable widening in one reviewed place rather than sprinkling `as never`
 * across a hundred call sites, and every call is still checked by the database.
 */
export const rpc = (fn: string, args?: Record<string, unknown>) =>
  supabase.rpc(fn as never, args as never);

type Payload = Record<string, unknown>;

/** The builder methods the consoles use, with payloads as plain records. */
type LooseTable = {
  select: (columns?: string, options?: { count?: "exact" | "planned" | "estimated" }) => any;
  insert: (values: Payload | Payload[]) => any;
  update: (values: Payload) => any;
  upsert: (values: Payload | Payload[]) => any;
  delete: () => any;
};

export const table = (name: string) => supabase.from(name as never) as unknown as LooseTable;

export type Filter =
  /** column = value */
  | { col: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; value: string | number | boolean }
  /** column in (...) — used by every multi-select status filter */
  | { col: string; op: "in"; value: (string | number)[] }
  /** case-insensitive contains */
  | { col: string; op: "ilike"; value: string }
  /** IS NULL / IS NOT NULL */
  | { col: string; op: "is"; value: null | boolean }
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

/** Turn a Postgres error into something an operator can act on. */
export function friendlyError(error: { message?: string; code?: string } | null): string {
  if (!error) return "";
  const msg = error.message ?? "";
  if (error.code === "42501" || msg.includes("Permission requise")) {
    return msg.startsWith("Permission requise")
      ? `Vous n'avez pas la permission requise (${msg.split(":").pop()?.trim()}).`
      : "Vous n'avez pas la permission d'effectuer cette action.";
  }
  if (error.code === "P0002") return msg || "Élément introuvable.";
  if (error.code === "23514") return msg || "Cette action ne respecte pas une règle de la plateforme.";
  if (error.code === "23505") return "Cette valeur existe déjà.";
  if (msg.includes("Failed to fetch")) return "Connexion impossible. Vérifiez votre réseau.";
  return msg || "L'action a échoué.";
}

function applyFilters(builder: any, filters: Filter[]) {
  let q = builder;
  for (const f of filters) {
    if (f.op === "or") q = q.or(f.expr);
    else if (f.op === "in") q = q.in(f.col, f.value);
    else if (f.op === "ilike") q = q.ilike(f.col, `%${f.value}%`);
    else if (f.op === "is") q = q.is(f.col, f.value);
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
      let q: any = table(from).select(select, { count: "exact" });
      q = applyFilters(q, filters);
      if (sort) q = q.order(sort.col, { ascending: sort.dir === "asc", nullsFirst: false });
      q = q.range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await q;
      // A slower earlier request must not overwrite a newer result.
      if (ticket !== latest.current) return;

      if (error) {
        setError(friendlyError(error));
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
      let q: any = table(from).select(select);
      for (const [col, value] of Object.entries(match)) q = q.eq(col, value);
      const { data, error } = await q.maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(friendlyError(error));
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
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void rpc(fn, args).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setError(friendlyError(error));
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

/** Run a write and surface a usable message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ error: { message?: string; code?: string } | null }>) => {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
      return false;
    }
    return true;
  };

  return { busy, error, setError, run };
}

/** Turn the current rows into a CSV download. */
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

export type { SortDir };

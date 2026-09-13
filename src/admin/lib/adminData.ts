import { useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { rpc, table, useTable, friendlyError } from "../../console/data";

/**
 * Admin-only data hooks.
 *
 * The generic layer — useTable / useRow / useRpc, CSV export, the typed-client
 * boundary — moved to console/data.ts so the partner dashboard shares it rather
 * than duplicating it. What stays here is what only an administrator has: the
 * audit trail, internal notes, and saved views.
 */

export {
  useTable,
  useRow,
  useRpc,
  useAction,
  useDebounced,
  useMemoFilters,
  searchAcross,
  exportCsv,
  friendlyError,
  type Filter,
  type TableQuery,
  type TableResult,
  type SortDir,
} from "../../console/data";

/** Kept under their old names so existing admin screens read unchanged. */
export const adminRpc = rpc;
export const adminTable = table;

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
      const { error } = await rpc("admin_add_note", {
        p_entity_type: entityType,
        p_entity_id: entityId ?? "",
        p_body: body,
      });
      if (!error) reload();
      return error ? friendlyError(error) : null;
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
    select:
      "id, admin_label, action, entity_type, entity_id, entity_label, previous, next, reason, severity, at",
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
export type SavedView = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  shared: boolean;
};

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
      const { error } = await table("admin_saved_views").insert({
        owner_id: owner,
        page,
        name,
        filters,
      });
      if (!error) reload();
      return error ? friendlyError(error) : null;
    },
    [page, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await table("admin_saved_views").delete().eq("id", id);
      reload();
    },
    [reload],
  );

  return { views: rows, loading, save, remove };
}

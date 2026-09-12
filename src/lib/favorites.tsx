import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

/**
 * Favourites live server-side so they follow the customer across devices.
 * Held in a context because the heart appears on every card — one fetch for
 * the whole app rather than one query per card.
 */

export type FavoriteRow = { listing_id: string; collection_id: string | null; created_at: string };
export type Collection = { id: string; name: string };

type FavoritesValue = {
  ids: Set<string>;
  rows: FavoriteRow[];
  collections: Collection[];
  loading: boolean;
  isFavorite: (listingId: string) => boolean;
  toggle: (listingId: string) => Promise<void>;
  setCollection: (listingId: string, collectionId: string | null) => Promise<void>;
  createCollection: (name: string) => Promise<Collection | null>;
  removeCollection: (id: string) => Promise<void>;
  reload: () => Promise<void>;
};

const noop = async () => {};

const FavoritesContext = createContext<FavoritesValue>({
  ids: new Set(),
  rows: [],
  collections: [],
  loading: false,
  isFavorite: () => false,
  toggle: noop,
  setCollection: noop,
  createCollection: async () => null,
  removeCollection: noop,
  reload: noop,
});

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<FavoriteRow[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setRows([]);
      setCollections([]);
      return;
    }
    setLoading(true);
    const [f, c] = await Promise.all([
      supabase.from("favorites").select("listing_id,collection_id,created_at").order("created_at", { ascending: false }),
      supabase.from("favorite_collections").select("id,name").order("name"),
    ]);
    if (f.error) console.error("Failed to load favourites:", f.error);
    else setRows(f.data ?? []);
    if (c.error) console.error("Failed to load collections:", c.error);
    else setCollections(c.data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ids = useMemo(() => new Set(rows.map(r => r.listing_id)), [rows]);

  const toggle = useCallback(
    async (listingId: string) => {
      if (!user) return;
      const had = ids.has(listingId);
      // Optimistic: the heart must respond instantly.
      setRows(prev =>
        had
          ? prev.filter(r => r.listing_id !== listingId)
          : [{ listing_id: listingId, collection_id: null, created_at: new Date().toISOString() }, ...prev],
      );

      const { error } = had
        ? await supabase.from("favorites").delete().eq("listing_id", listingId)
        : await supabase.from("favorites").insert({ user_id: user.id, listing_id: listingId });

      if (error) {
        console.error("Failed to update favourite:", error);
        await reload(); // put the truth back
      }
    },
    [user, ids, reload],
  );

  const setCollection = useCallback(
    async (listingId: string, collectionId: string | null) => {
      if (!user) return;
      setRows(prev =>
        prev.map(r => (r.listing_id === listingId ? { ...r, collection_id: collectionId } : r)),
      );
      const { error } = await supabase
        .from("favorites")
        .update({ collection_id: collectionId })
        .eq("listing_id", listingId);
      if (error) {
        console.error("Failed to move favourite:", error);
        await reload();
      }
    },
    [user, reload],
  );

  const createCollection = useCallback(
    async (name: string) => {
      if (!user || !name.trim()) return null;
      const { data, error } = await supabase
        .from("favorite_collections")
        .insert({ user_id: user.id, name: name.trim() })
        .select("id,name")
        .single();
      if (error) {
        console.error("Failed to create collection:", error);
        return null;
      }
      setCollections(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    },
    [user],
  );

  const removeCollection = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("favorite_collections").delete().eq("id", id);
      if (error) console.error("Failed to delete collection:", error);
      await reload();
    },
    [reload],
  );

  const value = useMemo<FavoritesValue>(
    () => ({
      ids,
      rows,
      collections,
      loading,
      isFavorite: (id: string) => ids.has(id),
      toggle,
      setCollection,
      createCollection,
      removeCollection,
      reload,
    }),
    [ids, rows, collections, loading, toggle, setCollection, createCollection, removeCollection, reload],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export const useFavorites = () => useContext(FavoritesContext);

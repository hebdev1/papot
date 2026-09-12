import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderPlus, Heart, MapPin, Trash2, X } from "lucide-react";
import { PageHeader } from "../../components/panel/PanelLayout";
import { SERVICE } from "../../components/panel/Badges";
import { EmptyState, Skeleton } from "../../components/panel/States";
import { supabase } from "../../lib/supabase";
import { useFavorites } from "../../lib/favorites";
import { formatUsd } from "../../lib/currency";
import { formatRating, type ListingRow } from "../../lib/listings";

const KINDS = [
  { id: "all", label: "Tout" },
  { id: "stay", label: "Hébergements" },
  { id: "car", label: "Voitures" },
  { id: "restaurant", label: "Restaurants" },
];

const chip = (on: boolean) =>
  `rounded-full border-2 px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
    on ? "border-[#002089] bg-[#002089] text-white" : "border-[#e2d5c3] bg-white text-[#3E2C23] hover:border-[#002089]"
  }`;

/** Spec §20 — Saved, with tabs by service and named collections. */
export function PanelFavoritesPage() {
  const { rows, collections, loading, toggle, setCollection, createCollection, removeCollection } =
    useFavorites();

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [kind, setKind] = useState("all");
  const [collection, setCollectionFilter] = useState<string | "all">("all");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Favourite rows carry only ids; the listings themselves are public data.
  useEffect(() => {
    const ids = rows.map(r => r.listing_id);
    if (ids.length === 0) {
      setListings([]);
      return;
    }
    let cancelled = false;
    setFetching(true);
    supabase
      .from("listings")
      .select("*")
      .in("id", ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load saved listings:", error);
        setListings(data ?? []);
        setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const byId = useMemo(() => new Map(listings.map(l => [l.id, l])), [listings]);

  const shown = useMemo(
    () =>
      rows
        .map(r => ({ row: r, listing: byId.get(r.listing_id) }))
        .filter((x): x is { row: typeof rows[number]; listing: ListingRow } => !!x.listing)
        .filter(({ listing }) => kind === "all" || listing.kind === kind)
        .filter(({ row }) => collection === "all" || row.collection_id === collection),
    [rows, byId, kind, collection],
  );

  const busy = loading || fetching;

  return (
    <>
      <PageHeader title="Favoris" subtitle="Les lieux que vous avez sauvegardés." />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map(k => (
          <button key={k.id} onClick={() => setKind(k.id)} className={chip(kind === k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setCollectionFilter("all")} className={chip(collection === "all")}>
          Toutes les collections
        </button>
        {collections.map(c => (
          <span key={c.id} className="inline-flex items-center">
            <button onClick={() => setCollectionFilter(c.id)} className={chip(collection === c.id)}>
              {c.name}
            </button>
            <button
              onClick={() => {
                if (collection === c.id) setCollectionFilter("all");
                void removeCollection(c.id);
              }}
              aria-label={`Supprimer la collection ${c.name}`}
              className="ml-1 grid h-7 w-7 place-content-center rounded-full text-[#b0a090] transition-colors hover:bg-red-50 hover:text-[#b3261e]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ))}

        {creating ? (
          <form
            onSubmit={async e => {
              e.preventDefault();
              await createCollection(newName);
              setNewName("");
              setCreating(false);
            }}
            className="inline-flex items-center gap-1.5"
          >
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nom de la collection"
              className="w-44 rounded-full border-2 border-[#6ad7fb] px-3.5 py-1.5 text-[13px] outline-none"
            />
            <button type="submit" className="rounded-full bg-[#e76f2e] px-3 py-1.5 text-[13px] font-bold text-white">
              Créer
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Annuler"
              className="grid h-7 w-7 place-content-center rounded-full text-[#7a6355]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-[#c8b9a5] px-3.5 py-1.5 text-[13px] font-medium text-[#7a6355] transition-colors hover:border-[#002089] hover:text-[#002089]"
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden />
            Créer une collection
          </button>
        )}
      </div>

      {busy && rows.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Sauvegardez les lieux que vous aimez"
          body="Touchez le cœur pendant votre navigation pour les retrouver ici."
          action={{ label: "Commencer à explorer", to: "/search?kind=stay" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map(({ row, listing }) => {
            const { Icon, label } = SERVICE[listing.kind];
            return (
              <article
                key={listing.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-[#e2d5c3] bg-white"
              >
                <div className="relative h-36 bg-[#EAF8FF]">
                  {listing.img ? (
                    <img src={listing.img} alt={listing.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-content-center text-[#00508a]">
                      <Icon className="h-7 w-7" aria-hidden />
                    </span>
                  )}
                  <button
                    onClick={() => void toggle(listing.id)}
                    aria-label="Retirer des favoris"
                    className="absolute right-3 top-3 grid h-9 w-9 place-content-center rounded-full bg-white/90 text-[#e76f2e] shadow-sm backdrop-blur transition-colors hover:bg-white"
                  >
                    <Heart className="h-[18px] w-[18px] fill-current" aria-hidden />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-2 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7a6355]">
                    {label}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-bold leading-tight text-[#3E2C23]">
                      {listing.name}
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#7a6355]">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {listing.location}
                    </p>
                  </div>

                  <p className="text-sm text-[#3E2C23]">
                    <span className="font-semibold">{formatRating(listing)}</span>
                    <span className="text-[#7a6355]"> · {listing.reviews} avis</span>
                    {listing.price > 0 && (
                      <span className="text-[#7a6355]"> · dès {formatUsd(Number(listing.price))}</span>
                    )}
                  </p>

                  {collections.length > 0 && (
                    <label className="mt-1 block">
                      <span className="sr-only">Collection</span>
                      <select
                        value={row.collection_id ?? ""}
                        onChange={e => void setCollection(listing.id, e.target.value || null)}
                        className="w-full rounded-xl border-2 border-[#e2d5c3] bg-white px-2.5 py-1.5 text-[13px] text-[#3E2C23] outline-none focus:border-[#6ad7fb]"
                      >
                        <option value="">Sans collection</option>
                        {collections.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="mt-auto flex gap-2 pt-2">
                    <Link
                      to={`/p/${listing.id}`}
                      className="flex-1 rounded-xl border-2 border-[#e2d5c3] px-3 py-2 text-center text-[13px] font-semibold text-[#002089] transition-colors hover:border-[#002089]"
                    >
                      Voir
                    </Link>
                    <Link
                      to={`/p/${listing.id}`}
                      className="flex-1 rounded-xl bg-[#e76f2e] px-3 py-2 text-center text-[13px] font-bold text-white transition-colors hover:bg-[#d05e20]"
                    >
                      Réserver
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

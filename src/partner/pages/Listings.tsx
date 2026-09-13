import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Copy, LayoutGrid, Plus } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, Tabs, inputClass, labelClass, selectClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { StatusBadge } from "../../console/StatusBadge";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { friendlyError, searchAcross, table, useDebounced, useRow, useRpc, useTable, type Filter } from "../../console/data";
import { ago, count, money } from "../../console/format";
import { FilterBar } from "../components/FilterBar";
import { usePartner } from "../lib/partnerAuth";

export type ListingRow = {
  id: string;
  name: string;
  kind: string;
  type: string | null;
  city: string | null;
  location: string | null;
  country: string | null;
  price: number;
  currency: string;
  rating: number | null;
  reviews: number;
  status: string;
  img: string | null;
  updated_at: string;
  bookings: number;
};

const STATUS_TABS = [
  { id: "all", label: "Toutes" },
  { id: "published", label: "Publiées" },
  { id: "draft", label: "Brouillons" },
  { id: "pending_review", label: "En revue" },
  { id: "rejected", label: "À corriger" },
  { id: "paused", label: "En pause" },
  { id: "archived", label: "Archivées" },
];

/** Spec §10–§12. */
export function Listings() {
  const { active, can } = usePartner();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { confirm, dialogProps } = useConfirm();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ col: "updated_at", dir: "desc" as const });
  const [selected, setSelected] = useState<string[]>([]);
  const debounced = useDebounced(search);

  const tab = params.get("status") ?? "all";
  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("status");
    else next.set("status", id);
    setParams(next, { replace: true });
    setPage(1);
  };

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      ...searchAcross(["name", "city"], debounced),
    ];
    if (tab !== "all") f.push({ col: "status", op: "eq", value: tab });
    return f;
  }, [active, debounced, tab]);

  const { rows, total, loading, error, reload } = useTable<ListingRow>({
    from: "listings",
    select: "id, name, kind, type, city, location, country, price, currency, rating, reviews, status, img, updated_at",
    filters,
    sort,
    page,
    pageSize: 25,
    enabled: !!active,
  });

  // Booking counts come from the shared view, which is partner-scoped by RLS.
  const { rows: perf } = useTable<{ listing_id: string; reservations: number }>({
    from: "admin_listing_rows",
    select: "id, bookings",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    pageSize: 200,
    enabled: false,
  });

  const setStatus = (row: ListingRow, next: string, label: string, danger = false) =>
    confirm({
      title: `${label} « ${row.name} » ?`,
      consequence:
        next === "published"
          ? "L'annonce devient visible et réservable sur PAPOT."
          : next === "paused"
            ? "L'annonce disparaît des résultats. Les réservations déjà confirmées sont conservées."
            : next === "archived"
              ? "L'annonce est archivée et sort de vos listes de travail."
              : "Le statut de l'annonce change.",
      confirmLabel: label,
      danger,
      onConfirm: async () => {
        const { error } = await table("listings").update({ status: next }).eq("id", row.id);
        if (error) return friendlyError(error);
        reload();
        return null;
      },
    });

  const remove = (row: ListingRow) =>
    confirm({
      title: "Supprimer cette annonce ?",
      consequence:
        Number(row.bookings ?? 0) > 0
          ? "Cette annonce a des réservations. La supprimer efface la fiche, pas les réservations passées. Cette action est irréversible."
          : "Cette action est irréversible. Si vous voulez seulement la retirer de la vente, mettez-la en pause.",
      confirmLabel: "Supprimer l'annonce",
      danger: true,
      requireReason: false,
      onConfirm: async () => {
        const { error } = await table("listings").delete().eq("id", row.id);
        if (error) return friendlyError(error);
        reload();
        return null;
      },
    });

  const duplicate = async (row: ListingRow) => {
    const { data: full } = await table("listings").select("*").eq("id", row.id).maybeSingle();
    if (!full) return;
    const copy = { ...(full as Record<string, unknown>) };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    copy.name = `${row.name} (copie)`;
    copy.status = "draft";
    copy.published = false;
    const { error } = await table("listings").insert(copy);
    if (!error) reload();
  };

  const columns: Column<ListingRow>[] = [
    {
      id: "name",
      header: "Annonce",
      sortable: true,
      mobile: "primary",
      cell: r => (
        <span className="flex items-center gap-2.5">
          {r.img ? (
            <img src={r.img} alt="" loading="lazy" className="h-9 w-12 shrink-0 rounded-md border border-admin-line object-cover" />
          ) : (
            <span className="grid h-9 w-12 shrink-0 place-content-center rounded-md bg-admin-canvas text-[10px] text-admin-ink-3">
              photo
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-admin-ink">{r.name}</span>
            <span className="block truncate text-[12px] text-admin-ink-3">{r.type ?? r.kind}</span>
          </span>
        </span>
      ),
    },
    { id: "city", header: "Ville", sortable: true, mobile: "secondary", cell: r => r.city ?? "—" },
    {
      id: "price",
      header: "Prix",
      sortable: true,
      align: "right",
      mobile: "meta",
      cell: r => (Number(r.price) > 0 ? money(r.price, r.currency) : "—"),
    },
    {
      id: "bookings",
      header: "Réservations",
      align: "right",
      mobile: "secondary",
      cell: r => count(r.bookings ?? 0),
    },
    {
      id: "rating",
      header: "Note",
      sortable: true,
      align: "right",
      mobile: "hidden",
      cell: r => (r.rating ? Number(r.rating).toFixed(1).replace(".", ",") : "—"),
    },
    {
      id: "updated_at",
      header: "Mise à jour",
      sortable: true,
      mobile: "hidden",
      cell: r => <span className="text-admin-ink-3">{ago(r.updated_at)}</span>,
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Annonces"
        subtitle="Ce que vous proposez sur PAPOT."
        actions={
          can("manage_listings") ? (
            <Button as="link" to="/partenaire/annonces/nouveau" variant="primary">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter une annonce
            </Button>
          ) : undefined
        }
      />

      <Tabs tabs={STATUS_TABS} active={tab} onChange={setTab} />

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Nom ou ville…"
        values={{}}
        onChange={() => {}}
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={r => r.id}
        rowHref={r => `/partenaire/annonces/${r.id}`}
        page={page}
        pageSize={25}
        onPage={setPage}
        sort={sort}
        onSort={s => setSort(s as typeof sort)}
        selectable={can("manage_listings")}
        selected={selected}
        onSelect={setSelected}
        storageKey="partner-listings"
        bulkBar={(ids, clear) => (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                for (const id of ids) await table("listings").update({ status: "paused" }).eq("id", id);
                clear();
                reload();
              }}
            >
              Mettre en pause
            </Button>
            <button onClick={clear} className="text-[12.5px] font-medium text-admin-ink-3 hover:text-admin-ink">
              Annuler
            </button>
          </>
        )}
        actions={[
          { label: "Ouvrir", onClick: r => navigate(`/partenaire/annonces/${r.id}`) },
          { label: "Modifier", hidden: () => !can("manage_listings"), onClick: r => navigate(`/partenaire/annonces/${r.id}/modifier`) },
          { label: "Dupliquer", hidden: () => !can("manage_listings"), onClick: duplicate },
          { label: "Voir en ligne", hidden: r => r.status !== "published", onClick: r => window.open(`/p/${r.id}`, "_blank") },
          { label: "Disponibilité", hidden: () => !can("manage_availability"), onClick: () => navigate("/partenaire/disponibilite") },
          {
            label: "Publier",
            hidden: r => !can("manage_listings") || r.status === "published",
            onClick: r => setStatus(r, "published", "Publier"),
          },
          {
            label: "Mettre en pause",
            hidden: r => !can("manage_listings") || r.status !== "published",
            onClick: r => setStatus(r, "paused", "Mettre en pause"),
          },
          {
            label: "Archiver",
            danger: true,
            hidden: r => !can("manage_listings") || r.status === "archived",
            onClick: r => setStatus(r, "archived", "Archiver", true),
          },
          { label: "Supprimer", danger: true, hidden: () => !can("manage_listings"), onClick: remove },
        ]}
        empty={{
          title: "Vous n'avez pas encore d'annonce",
          body: "Créez votre première annonce et commencez à recevoir des réservations.",
          action: can("manage_listings") ? (
            <Button as="link" to="/partenaire/annonces/nouveau" variant="primary">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter une annonce
            </Button>
          ) : undefined,
        }}
      />

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Spec §13 — create, and §14 — edit. One form, two entry points. */
export function ListingForm() {
  const { id } = useParams();
  const { active } = usePartner();
  const navigate = useNavigate();
  const isNew = !id;

  const { row, loading } = useRow<ListingRow>("listings", { id: id ?? "" }, "*", !isNew);

  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = (k: string, fallback: unknown = "") =>
    form[k] ?? (row ? String((row as Record<string, unknown>)[k] ?? "") : String(fallback ?? ""));
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const kindDefault =
    active?.type === "car" ? "car" : active?.type === "restaurant" ? "restaurant" : "stay";

  const save = async (publish: boolean) => {
    if (!active) return;
    if (!value("name").trim()) {
      setError("Donnez un nom à l'annonce.");
      return;
    }

    const payload: Record<string, unknown> = {
      name: value("name").trim(),
      type: value("type").trim() || "Standard",
      kind: value("kind") || kindDefault,
      city: value("city").trim() || active.city || "Haïti",
      location: value("location").trim() || value("city").trim() || "Haïti",
      country: "Haïti",
      price: Number(value("price", 0)) || 0,
      currency: "USD",
      img: value("img").trim() || null,
      partner_id: active.partner_id,
      // A new listing is reviewed before it goes live; a partner cannot publish
      // straight to the site, which is what the admin review workspace is for.
      status: publish ? "pending_review" : "draft",
    };

    setBusy(true);
    const { error } = isNew
      ? await table("listings").insert(payload)
      : await table("listings").update(payload).eq("id", id!);
    setBusy(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }
    navigate("/partenaire/annonces");
  };

  if (!isNew && loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Annonces", to: "/partenaire/annonces" }, { label: isNew ? "Nouvelle" : (row?.name ?? "") }]}
        title={isNew ? "Nouvelle annonce" : `Modifier « ${row?.name} »`}
        subtitle="Une annonce soumise est vérifiée par PAPOT avant publication."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Informations" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="l-name">Nom</label>
              <input id="l-name" value={value("name")} onChange={e => set("name", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="l-kind">Service</label>
              <select id="l-kind" value={value("kind", kindDefault)} onChange={e => set("kind", e.target.value)} className={selectClass}>
                <option value="stay">Hébergement</option>
                <option value="car">Voiture</option>
                <option value="restaurant">Restaurant</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="l-type">Catégorie</label>
              <input id="l-type" value={value("type")} onChange={e => set("type", e.target.value)} placeholder="Chambre double, SUV, Bistrot…" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="l-city">Ville</label>
              <input id="l-city" value={value("city")} onChange={e => set("city", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="l-price">Prix</label>
              <input id="l-price" value={value("price")} onChange={e => set("price", e.target.value)} inputMode="decimal" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="l-location">Adresse affichée</label>
              <input id="l-location" value={value("location")} onChange={e => set("location", e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="l-img">Photo principale (URL)</label>
              <input id="l-img" value={value("img")} onChange={e => set("img", e.target.value)} className={inputClass} />
              {value("img") && (
                <img src={value("img")} alt="Aperçu" className="mt-2 aspect-[16/9] w-full rounded-lg border border-admin-line object-cover" />
              )}
            </div>
          </div>

          {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-admin-line pt-4">
            <Button variant="primary" onClick={() => save(true)} disabled={busy}>
              Soumettre pour vérification
            </Button>
            <Button variant="secondary" onClick={() => save(false)} disabled={busy}>
              Enregistrer le brouillon
            </Button>
            <Button variant="ghost" onClick={() => navigate("/partenaire/annonces")}>
              Annuler
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Comment se passe la publication" />
          <ol className="flex flex-col gap-3 text-[13px] leading-relaxed text-admin-ink-2">
            <li><strong className="font-semibold text-admin-ink">1. Brouillon.</strong> Visible de vous seul, modifiable à tout moment.</li>
            <li><strong className="font-semibold text-admin-ink">2. En revue.</strong> PAPOT vérifie les photos, le prix et les informations.</li>
            <li><strong className="font-semibold text-admin-ink">3. Publiée.</strong> Réservable par les voyageurs.</li>
            <li><strong className="font-semibold text-admin-ink">À corriger.</strong> Si quelque chose manque, vous recevez la liste précise.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}

export { Copy, LayoutGrid, Stat, Modal, EmptyState, useRpc };

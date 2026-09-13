import { useState } from "react";
import { BedDouble, Car, MapPin, Plus, Trash2, UtensilsCrossed, Wrench } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, Callout, Card, CardHeader, EmptyState, PageHeader, Skeleton, inputClass, labelClass, selectClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { StatusBadge } from "../../console/StatusBadge";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { friendlyError, table, useTable } from "../../console/data";
import { count, day, money, range } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type ListingLite = { id: string; name: string; price: number; status: string };

function useMyListings(kind?: string) {
  const { active } = usePartner();
  return useTable<ListingLite>({
    from: "listings",
    select: "id, name, price, status",
    filters: [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      ...(kind ? [{ col: "kind", op: "eq" as const, value: kind }] : []),
    ],
    sort: { col: "name", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });
}

type Unit = {
  id: string;
  listing_id: string;
  name: string;
  detail: string;
  price: number | null;
  /** How many identical rooms of this type exist. */
  units: number;
  /** Whether the type is bookable at all — not a count. */
  available: boolean;
  position: number;
};

/** Spec §71–§73 — rooms for hotels and guesthouses. */
export function Rooms() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const listings = useMyListings("stay");
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [price, setPrice] = useState("");
  const [units, setUnits] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const rooms = useTable<Unit>({
    from: "listing_units",
    select: "id, listing_id, name, detail, price, units, available, position",
    sort: { col: "position", dir: "asc" },
    pageSize: 200,
    enabled: !!active,
  });

  const mine = new Set(listings.rows.map(l => l.id));
  const byListing = (id: string) => rooms.rows.filter(r => r.listing_id === id);

  const add = async () => {
    if (!adding) return;
    if (!name.trim() || !price.trim()) return setError("Nom et prix sont obligatoires.");
    const { error } = await table("listing_units").insert({
      listing_id: adding,
      name: name.trim(),
      // Both columns are NOT NULL: an empty detail is "", never null, and the
      // number of rooms belongs in `units` — it used to be written to the
      // boolean `available`, which Postgres accepted for 1 and rejected for
      // every other count.
      detail: detail.trim(),
      price: Number(price.replace(",", ".")),
      units: Math.max(1, Number(units) || 1),
    });
    if (error) return setError(friendlyError(error));
    setName("");
    setDetail("");
    setPrice("");
    setAdding(null);
    setError(null);
    rooms.reload();
  };

  const total = rooms.rows.filter(r => mine.has(r.listing_id));

  return (
    <>
      <PageHeader
        title="Chambres"
        subtitle="Les types de chambre proposés dans chacun de vos hébergements."
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
        <Stat label="Hébergements" value={count(listings.rows.length)} />
        <Stat label="Types de chambre" value={count(total.length)} />
        <Stat label="Unités totales" value={count(total.reduce((s, r) => s + Number(r.units ?? 1), 0))} />
      </div>

      {listings.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : listings.rows.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="Aucun hébergement"
          body="Créez d'abord une annonce d'hébergement, puis ajoutez-y des chambres."
          action={<Button as="link" to="/partenaire/annonces/nouveau" variant="primary">Ajouter une annonce</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {listings.rows.map(l => (
            <Card key={l.id} padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-line px-5 py-3.5">
                <div>
                  <h2 className="font-display text-[15px] font-semibold text-admin-ink">{l.name}</h2>
                  <p className="text-[12.5px] text-admin-ink-3">
                    {count(byListing(l.id).length)} type(s) de chambre
                  </p>
                </div>
                {can("manage_listings") && (
                  <Button size="sm" variant="secondary" onClick={() => setAdding(l.id)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Ajouter une chambre
                  </Button>
                )}
              </div>

              {byListing(l.id).length === 0 ? (
                <p className="px-5 py-6 text-center text-[13px] text-admin-ink-3">
                  Aucune chambre déclarée pour cet hébergement.
                </p>
              ) : (
                <ul className="divide-y divide-admin-line">
                  {byListing(l.id).map(r => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-admin-ink">{r.name}</span>
                        {r.detail && <span className="block truncate text-[12px] text-admin-ink-3">{r.detail}</span>}
                      </span>
                      <span className="text-[12.5px] text-admin-ink-3">{count(r.units ?? 1)} unité(s)</span>
                      <span className="font-display text-[15px] font-semibold tabular-nums text-admin-ink">
                        {money(r.price)}
                      </span>
                      {can("manage_listings") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Supprimer"
                          onClick={() =>
                            confirm({
                              title: `Supprimer « ${r.name} » ?`,
                              consequence: "Ce type de chambre ne sera plus réservable.",
                              confirmLabel: "Supprimer",
                              danger: true,
                              onConfirm: async () => {
                                const { error } = await table("listing_units").delete().eq("id", r.id);
                                if (error) return friendlyError(error);
                                rooms.reload();
                                return null;
                              },
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!adding}
        onClose={() => setAdding(null)}
        title="Ajouter une chambre"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(null)}>Annuler</Button>
            <Button variant="primary" onClick={add}>Ajouter</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="r-name">Nom</label>
            <input id="r-name" value={name} onChange={e => setName(e.target.value)} placeholder="Chambre double vue mer" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="r-detail">Détail</label>
            <input id="r-detail" value={detail} onChange={e => setDetail(e.target.value)} placeholder="1 lit king, 2 personnes" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="r-price">Prix par nuit</label>
            <input id="r-price" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="r-units">Nombre d'unités</label>
            <input id="r-units" value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Spec §74–§75 — the fleet, with maintenance that blocks the calendar. */
export function Fleet() {
  const { active, can } = usePartner();
  const listings = useMyListings("car");
  const [blocking, setBlocking] = useState<ListingLite | null>(null);
  const [kind, setKind] = useState("maintenance");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const maintenance = useTable<{
    id: string;
    listing_id: string;
    kind: string;
    starts_on: string;
    ends_on: string;
    note: string | null;
  }>({
    from: "vehicle_maintenance",
    select: "id, listing_id, kind, starts_on, ends_on, note",
    sort: { col: "starts_on", dir: "desc" },
    pageSize: 100,
    enabled: !!active,
  });

  const today = new Date().toISOString().slice(0, 10);
  const inMaintenance = (id: string) =>
    maintenance.rows.some(m => m.listing_id === id && m.starts_on <= today && m.ends_on >= today);

  const save = async () => {
    if (!blocking) return;
    if (!start || !end) return setError("Indiquez les dates.");
    const { error } = await table("vehicle_maintenance").insert({
      listing_id: blocking.id,
      kind,
      starts_on: start,
      ends_on: end,
      note: note.trim() || null,
    });
    if (error) return setError(friendlyError(error));
    setBlocking(null);
    setStart("");
    setEnd("");
    setNote("");
    setError(null);
    maintenance.reload();
  };

  return (
    <>
      <PageHeader title="Flotte" subtitle="Vos véhicules, leur état et leurs immobilisations." />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
        <Stat label="Véhicules" value={count(listings.rows.length)} />
        <Stat label="Disponibles" value={count(listings.rows.filter(l => !inMaintenance(l.id)).length)} />
        <Stat
          label="En maintenance"
          value={count(listings.rows.filter(l => inMaintenance(l.id)).length)}
          tone={listings.rows.some(l => inMaintenance(l.id)) ? "negative" : undefined}
        />
      </div>

      <div className="mb-5">
        <Callout>
          Une immobilisation bloque automatiquement le calendrier sur la période choisie. Un
          véhicule en réparation ne peut donc pas être réservé par erreur.
        </Callout>
      </div>

      {listings.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : listings.rows.length === 0 ? (
        <EmptyState
          icon={Car}
          title="Aucun véhicule"
          body="Ajoutez un véhicule pour commencer à recevoir des locations."
          action={<Button as="link" to="/partenaire/annonces/nouveau" variant="primary">Ajouter un véhicule</Button>}
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-admin-line">
            {listings.rows.map(l => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-admin-ink">{l.name}</span>
                  <span className="block text-[12px] text-admin-ink-3">
                    {money(l.price)} / jour
                  </span>
                </span>
                <StatusBadge status={inMaintenance(l.id) ? "maintenance" : l.status} />
                {can("manage_availability") && (
                  <Button size="sm" variant="secondary" onClick={() => setBlocking(l)}>
                    <Wrench className="h-3.5 w-3.5" aria-hidden />
                    Immobiliser
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {maintenance.rows.length > 0 && (
        <Card className="mt-5" padded={false}>
          <div className="border-b border-admin-line px-5 py-4">
            <h2 className="font-display text-[15px] font-semibold text-admin-ink">Immobilisations</h2>
          </div>
          <ul className="divide-y divide-admin-line">
            {maintenance.rows.map(m => {
              const car = listings.rows.find(l => l.id === m.listing_id);
              if (!car) return null;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-admin-ink">{car.name}</span>
                    <span className="block text-[12px] text-admin-ink-3">
                      {range(m.starts_on, m.ends_on)}
                      {m.note ? ` · ${m.note}` : ""}
                    </span>
                  </span>
                  <StatusBadge status="maintenance" />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        open={!!blocking}
        onClose={() => setBlocking(null)}
        title={`Immobiliser « ${blocking?.name ?? ""} »`}
        subtitle="Les dates choisies seront bloquées dans le calendrier."
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlocking(null)}>Annuler</Button>
            <Button variant="primary" onClick={save}>Bloquer</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="m-kind">Motif</label>
            <select id="m-kind" value={kind} onChange={e => setKind(e.target.value)} className={selectClass}>
              <option value="maintenance">Maintenance</option>
              <option value="inspection">Inspection</option>
              <option value="cleaning">Nettoyage</option>
              <option value="repair">Réparation</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="m-start">Du</label>
            <input id="m-start" type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="m-end">Au</label>
            <input id="m-end" type="date" value={end} onChange={e => setEnd(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="m-note">Note</label>
            <input id="m-note" value={note} onChange={e => setNote(e.target.value)} className={inputClass} />
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>
    </>
  );
}

/** Spec §76. */
export function PickupLocations() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("office");
  const [address, setAddress] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { rows, loading, reload } = useTable<{
    id: string;
    name: string;
    kind: string;
    address: string | null;
    delivery_fee: number | null;
    active: boolean;
  }>({
    from: "pickup_locations",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    pageSize: 50,
    enabled: !!active,
  });

  const KIND: Record<string, string> = {
    office: "Agence",
    airport: "Aéroport",
    hotel_delivery: "Livraison à l'hôtel",
    custom: "Lieu personnalisé",
  };

  const add = async () => {
    if (!active) return;
    if (!name.trim()) return setError("Donnez un nom au lieu.");
    const { error } = await table("pickup_locations").insert({
      partner_id: active.partner_id,
      name: name.trim(),
      kind,
      address: address.trim() || null,
      delivery_fee: fee.trim() ? Number(fee.replace(",", ".")) : null,
    });
    if (error) return setError(friendlyError(error));
    setName("");
    setAddress("");
    setFee("");
    setAdding(false);
    setError(null);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Lieux de prise en charge"
        subtitle="Où vos clients récupèrent et rendent les véhicules."
        actions={
          can("manage_listings") ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter un lieu
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aucun lieu de prise en charge"
          body="Ajoutez au moins un lieu pour que les clients sachent où récupérer le véhicule."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(l => (
            <Card key={l.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[14.5px] font-semibold text-admin-ink">{l.name}</h3>
                  <p className="text-[12.5px] text-admin-ink-3">{KIND[l.kind] ?? l.kind}</p>
                  {l.address && <p className="mt-1 text-[12.5px] text-admin-ink-2">{l.address}</p>}
                </div>
                <StatusBadge status={l.active ? "active" : "inactive"} />
              </div>
              {l.delivery_fee !== null && (
                <p className="mt-2 text-[13px] text-admin-ink">
                  Frais de livraison : <strong className="font-semibold">{money(l.delivery_fee)}</strong>
                </p>
              )}
              {can("manage_listings") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-3"
                  onClick={() =>
                    confirm({
                      title: `Supprimer « ${l.name} » ?`,
                      consequence: "Ce lieu ne sera plus proposé aux clients.",
                      confirmLabel: "Supprimer",
                      danger: true,
                      onConfirm: async () => {
                        const { error } = await table("pickup_locations").delete().eq("id", l.id);
                        if (error) return friendlyError(error);
                        reload();
                        return null;
                      },
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                  Supprimer
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Ajouter un lieu"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Annuler</Button>
            <Button variant="primary" onClick={add}>Ajouter</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="p-name">Nom</label>
            <input id="p-name" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="p-kind">Type</label>
            <select id="p-kind" value={kind} onChange={e => setKind(e.target.value)} className={selectClass}>
              {Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="p-fee">Frais de livraison</label>
            <input id="p-fee" value={fee} onChange={e => setFee(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="p-addr">Adresse</label>
            <input id="p-addr" value={address} onChange={e => setAddress(e.target.value)} className={inputClass} />
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Spec §80–§81. */
export function Menu() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const listings = useMyListings("restaurant");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Plats");
  const [price, setPrice] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const restaurant = listings.rows[0];

  const items = useTable<{
    id: string;
    category: string;
    name: string;
    detail: string | null;
    price: number;
    position: number;
  }>({
    from: "menu_items",
    select: "id, category, name, detail, price, position",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 200,
    enabled: !!restaurant,
  });

  const categories = [...new Set(items.rows.map(i => i.category))];

  const add = async () => {
    if (!restaurant) return;
    if (!name.trim() || !price.trim()) return setError("Nom et prix sont obligatoires.");
    const { error } = await table("menu_items").insert({
      listing_id: restaurant.id,
      category: category.trim(),
      name: name.trim(),
      detail: detail.trim() || null,
      price: Number(price.replace(",", ".")),
    });
    if (error) return setError(friendlyError(error));
    setName("");
    setDetail("");
    setPrice("");
    setAdding(false);
    setError(null);
    items.reload();
  };

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle="Ce que vous servez, par catégorie."
        actions={
          can("manage_listings") && restaurant ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter un article
            </Button>
          ) : undefined
        }
      />

      {!restaurant ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Aucun restaurant"
          body="Créez d'abord votre fiche restaurant, puis composez le menu."
        />
      ) : items.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : items.rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Votre menu est vide"
          body="Ajoutez vos plats pour que les voyageurs sachent ce qu'ils viennent manger."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map(c => (
            <Card key={c} padded={false}>
              <div className="border-b border-admin-line px-5 py-3.5">
                <h2 className="font-display text-[15px] font-semibold text-admin-ink">{c}</h2>
                <p className="text-[12.5px] text-admin-ink-3">
                  {count(items.rows.filter(i => i.category === c).length)} article(s)
                </p>
              </div>
              <ul className="divide-y divide-admin-line">
                {items.rows
                  .filter(i => i.category === c)
                  .map(i => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-admin-ink">{i.name}</span>
                        {i.detail && <span className="block truncate text-[12px] text-admin-ink-3">{i.detail}</span>}
                      </span>
                      <span className="font-display text-[15px] font-semibold tabular-nums text-admin-ink">
                        {money(i.price)}
                      </span>
                      {can("manage_listings") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Supprimer"
                          onClick={() =>
                            confirm({
                              title: `Retirer « ${i.name} » du menu ?`,
                              consequence: "L'article ne sera plus affiché aux clients.",
                              confirmLabel: "Retirer",
                              danger: true,
                              onConfirm: async () => {
                                const { error } = await table("menu_items").delete().eq("id", i.id);
                                if (error) return friendlyError(error);
                                items.reload();
                                return null;
                              },
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                        </Button>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Ajouter un article"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Annuler</Button>
            <Button variant="primary" onClick={add}>Ajouter</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="mi-name">Nom</label>
            <input id="mi-name" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="mi-cat">Catégorie</label>
            <input id="mi-cat" value={category} onChange={e => setCategory(e.target.value)} list="cats" className={inputClass} />
            <datalist id="cats">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className={labelClass} htmlFor="mi-price">Prix</label>
            <input id="mi-price" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="mi-detail">Description</label>
            <input id="mi-detail" value={detail} onChange={e => setDetail(e.target.value)} className={inputClass} />
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Spec §78–§79. */
export function Tables() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const listings = useMyListings("restaurant");
  const restaurant = listings.rows[0];

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState("4");
  const [areaId, setAreaId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const areas = useTable<{ id: string; name: string }>({
    from: "seating_areas",
    select: "id, name",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 20,
    enabled: !!restaurant,
  });

  const tables = useTable<{
    id: string;
    label: string;
    seats: number;
    status: string;
    area_id: string | null;
  }>({
    from: "restaurant_tables",
    select: "id, label, seats, status, area_id",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 200,
    enabled: !!restaurant,
  });

  const add = async () => {
    if (!restaurant) return;
    if (!label.trim()) return setError("Donnez un nom à la table.");
    const { error } = await table("restaurant_tables").insert({
      listing_id: restaurant.id,
      label: label.trim(),
      seats: Number(seats) || 2,
      area_id: areaId || null,
    });
    if (error) return setError(friendlyError(error));
    setLabel("");
    setAdding(false);
    setError(null);
    tables.reload();
  };

  const addArea = async () => {
    if (!restaurant) return;
    const name = window.prompt("Nom de la salle (ex. Terrasse)");
    if (!name?.trim()) return;
    await table("seating_areas").insert({ listing_id: restaurant.id, name: name.trim() });
    areas.reload();
  };

  const STATUS_STYLE: Record<string, string> = {
    available: "border-[#d7e6d9] bg-[#eef7f0] text-[#15803d]",
    reserved: "border-[#dbe4f3] bg-[#eef3fb] text-[#002089]",
    occupied: "border-[#f3e2c4] bg-[#fdf8ee] text-[#7a5b12]",
    blocked: "border-admin-line bg-admin-canvas text-admin-ink-3",
  };

  return (
    <>
      <PageHeader
        title="Salles et tables"
        subtitle="Votre plan de salle et la capacité de chaque table."
        actions={
          can("manage_listings") && restaurant ? (
            <>
              <Button variant="secondary" onClick={addArea}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Salle
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Table
              </Button>
            </>
          ) : undefined
        }
      />

      {!restaurant ? (
        <EmptyState icon={UtensilsCrossed} title="Aucun restaurant" body="Créez d'abord votre fiche restaurant." />
      ) : (
        <>
          <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
            <Stat label="Salles" value={count(areas.rows.length)} />
            <Stat label="Tables" value={count(tables.rows.length)} />
            <Stat label="Couverts" value={count(tables.rows.reduce((s, t) => s + t.seats, 0))} />
          </div>

          {tables.rows.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="Aucune table"
              body="Ajoutez vos tables pour gérer les réservations par capacité."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {[{ id: "", name: "Sans salle" }, ...areas.rows].map(area => {
                const inArea = tables.rows.filter(t => (t.area_id ?? "") === area.id);
                if (inArea.length === 0) return null;
                return (
                  <Card key={area.id || "none"}>
                    <CardHeader title={area.name} subtitle={`${count(inArea.length)} table(s)`} />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {inArea.map(t => (
                        <button
                          key={t.id}
                          onClick={() =>
                            can("manage_listings") &&
                            confirm({
                              title: `Supprimer la table ${t.label} ?`,
                              consequence: "Elle ne sera plus proposée à la réservation.",
                              confirmLabel: "Supprimer",
                              danger: true,
                              onConfirm: async () => {
                                const { error } = await table("restaurant_tables").delete().eq("id", t.id);
                                if (error) return friendlyError(error);
                                tables.reload();
                                return null;
                              },
                            })
                          }
                          className={cn(
                            "flex flex-col items-center justify-center rounded-xl border-2 px-3 py-4 transition-colors",
                            STATUS_STYLE[t.status] ?? STATUS_STYLE.available,
                          )}
                        >
                          <span className="font-display text-[16px] font-bold">{t.label}</span>
                          <span className="mt-0.5 text-[11.5px]">{t.seats} places</span>
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Ajouter une table"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Annuler</Button>
            <Button variant="primary" onClick={add}>Ajouter</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="t-label">Nom</label>
            <input id="t-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="T1" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="t-seats">Places</label>
            <input id="t-seats" value={seats} onChange={e => setSeats(e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="t-area">Salle</label>
            <select id="t-area" value={areaId} onChange={e => setAreaId(e.target.value)} className={selectClass}>
              <option value="">Sans salle</option>
              {areas.rows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export { day };

import { useState } from "react";
import { Accessibility, BedDouble, Link2, Car, MapPin, Plus, Trash2, UtensilsCrossed, Wrench } from "lucide-react";
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
type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  active: boolean;
};

type DishRow = {
  id: string;
  category_id: string;
  name: string;
  detail: string | null;
  description: string | null;
  price: number | null;
  discount_price: number | null;
  prep_minutes: number | null;
  available: boolean;
  sold_out: boolean;
  dietary: string[];
  allergens: string[];
  popular: boolean;
  chef_special: boolean;
  image_url: string | null;
  available_weekdays: number[];
  available_from: string | null;
  available_until: string | null;
  position: number;
};

const DIETARY = [
  "Végétarien", "Végétalien", "Sans gluten", "Sans lactose", "Halal",
  "Casher", "Pauvre en sel", "Keto", "Épicé", "Bio",
];

/** The nine labelled allergens, plus the catch-all the specification asks for. */
const ALLERGENS = [
  "Lait", "Œufs", "Poisson", "Crustacés", "Fruits à coque",
  "Arachides", "Blé", "Soja", "Sésame", "Autre",
];

const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type DishDraft = {
  name: string;
  category_id: string;
  detail: string;
  description: string;
  price: string;
  discount_price: string;
  prep_minutes: string;
  image_url: string;
  dietary: string[];
  allergens: string[];
  available_weekdays: number[];
  available_from: string;
  available_until: string;
  available: boolean;
  sold_out: boolean;
  popular: boolean;
  chef_special: boolean;
  prep_notes: string;
};

const emptyDish = (categoryId: string): DishDraft => ({
  name: "",
  category_id: categoryId,
  detail: "",
  description: "",
  price: "",
  discount_price: "",
  prep_minutes: "",
  image_url: "",
  dietary: [],
  allergens: [],
  available_weekdays: [],
  available_from: "",
  available_until: "",
  available: true,
  sold_out: false,
  popular: false,
  chef_special: false,
  prep_notes: "",
});

const dishDraftOf = (d: DishRow, notes: string): DishDraft => ({
  name: d.name,
  category_id: d.category_id,
  detail: d.detail ?? "",
  description: d.description ?? "",
  price: d.price == null ? "" : String(d.price),
  discount_price: d.discount_price == null ? "" : String(d.discount_price),
  prep_minutes: d.prep_minutes == null ? "" : String(d.prep_minutes),
  image_url: d.image_url ?? "",
  dietary: d.dietary,
  allergens: d.allergens,
  available_weekdays: d.available_weekdays,
  available_from: d.available_from?.slice(0, 5) ?? "",
  available_until: d.available_until?.slice(0, 5) ?? "",
  available: d.available,
  sold_out: d.sold_out,
  popular: d.popular,
  chef_special: d.chef_special,
  prep_notes: notes,
});

/** Multi-select chips, the same control the signup wizard uses for cuisines. */
function Chips({
  options, selected, onToggle, idPrefix,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = selected.includes(o);
        return (
          <button
            key={idPrefix + o}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12.5px] transition-colors",
              on
                ? "border-[#002089] bg-[#002089] text-white"
                : "border-admin-line text-admin-ink hover:border-[#002089]",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Menu() {
  const { can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const listings = useMyListings("restaurant");
  const restaurant = listings.rows[0];
  const editable = can("manage_listings");

  const [dishOpen, setDishOpen] = useState<DishRow | "new" | null>(null);
  const [dish, setDish] = useState<DishDraft>(() => emptyDish(""));
  const [catOpen, setCatOpen] = useState<CategoryRow | "new" | null>(null);
  const [cat, setCat] = useState({ name: "", description: "", position: "0", active: true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useTable<CategoryRow>({
    from: "menu_categories",
    select: "id, name, description, position, active",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 50,
    enabled: !!restaurant,
  });

  const dishes = useTable<DishRow>({
    from: "menu_items",
    select:
      "id, category_id, name, detail, description, price, discount_price, prep_minutes, available, sold_out, dietary, allergens, popular, chef_special, image_url, available_weekdays, available_from, available_until, position",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 300,
    enabled: !!restaurant,
  });

  const num = (v: string) => {
    const t = v.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const openDish = async (d: DishRow | "new") => {
    setError(null);
    if (d === "new") {
      setDish(emptyDish(categories.rows[0]?.id ?? ""));
    } else {
      // The recipe lives in its own table, out of reach of the public menu.
      const { data } = await table("menu_item_notes")
        .select("prep_notes")
        .eq("item_id", d.id)
        .maybeSingle();
      setDish(dishDraftOf(d, (data as { prep_notes: string | null } | null)?.prep_notes ?? ""));
    }
    setDishOpen(d);
  };

  const setD = <K extends keyof DishDraft>(k: K, v: DishDraft[K]) =>
    setDish(d => ({ ...d, [k]: v }));

  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v];

  const saveDish = async () => {
    if (!restaurant) return;
    if (!dish.name.trim()) return setError("Donnez un nom au plat.");
    if (!dish.category_id) return setError("Créez d'abord une catégorie.");
    if (!!dish.available_from !== !!dish.available_until)
      return setError("Renseignez l'heure de début et l'heure de fin, ou aucune des deux.");

    setBusy(true);
    const payload = {
      listing_id: restaurant.id,
      category_id: dish.category_id,
      name: dish.name.trim(),
      detail: dish.detail.trim() || null,
      description: dish.description.trim() || null,
      price: num(dish.price),
      discount_price: num(dish.discount_price),
      prep_minutes: num(dish.prep_minutes),
      image_url: dish.image_url.trim() || null,
      dietary: dish.dietary,
      allergens: dish.allergens,
      available_weekdays: dish.available_weekdays,
      available_from: dish.available_from || null,
      available_until: dish.available_until || null,
      available: dish.available,
      sold_out: dish.sold_out,
      popular: dish.popular,
      chef_special: dish.chef_special,
    };

    let id = dishOpen === "new" ? null : (dishOpen as DishRow).id;
    if (dishOpen === "new") {
      const { data, error: err } = await table("menu_items").insert(payload).select("id").single();
      if (err) { setBusy(false); return setError(friendlyError(err)); }
      id = (data as { id: string }).id;
    } else {
      const { error: err } = await table("menu_items").update(payload).eq("id", id);
      if (err) { setBusy(false); return setError(friendlyError(err)); }
    }

    const notes = dish.prep_notes.trim();
    if (notes) {
      await table("menu_item_notes").upsert({ item_id: id, prep_notes: notes });
    } else {
      await table("menu_item_notes").delete().eq("item_id", id);
    }

    setBusy(false);
    setDishOpen(null);
    setError(null);
    dishes.reload();
  };

  const toggleSoldOut = async (d: DishRow) => {
    const { error: err } = await table("menu_items")
      .update({ sold_out: !d.sold_out })
      .eq("id", d.id);
    if (err) return setError(friendlyError(err));
    dishes.reload();
  };

  const removeDish = (d: DishRow) =>
    confirm({
      title: `Retirer « ${d.name} » du menu ?`,
      consequence: "Le plat ne sera plus affiché. Pour le masquer temporairement, décochez plutôt « Au menu ».",
      confirmLabel: "Retirer",
      danger: true,
      onConfirm: async () => {
        const { error: err } = await table("menu_items").delete().eq("id", d.id);
        if (err) return friendlyError(err);
        setDishOpen(null);
        dishes.reload();
        return null;
      },
    });

  const openCat = (c: CategoryRow | "new") => {
    setError(null);
    setCat(
      c === "new"
        ? { name: "", description: "", position: String(categories.rows.length), active: true }
        : { name: c.name, description: c.description ?? "", position: String(c.position), active: c.active },
    );
    setCatOpen(c);
  };

  const saveCat = async () => {
    if (!restaurant) return;
    if (!cat.name.trim()) return setError("Donnez un nom à la catégorie.");
    const payload = {
      listing_id: restaurant.id,
      name: cat.name.trim(),
      description: cat.description.trim() || null,
      position: Number(cat.position) || 0,
      active: cat.active,
    };
    const { error: err } =
      catOpen === "new"
        ? await table("menu_categories").insert(payload)
        : await table("menu_categories").update(payload).eq("id", (catOpen as CategoryRow).id);
    if (err) return setError(friendlyError(err));
    setCatOpen(null);
    setError(null);
    categories.reload();
  };

  const removeCat = (c: CategoryRow) => {
    const inside = dishes.rows.filter(d => d.category_id === c.id).length;
    if (inside > 0) {
      setError(
        `« ${c.name} » contient ${inside} plat(s). Déplacez-les dans une autre catégorie avant de la supprimer.`,
      );
      return;
    }
    confirm({
      title: `Supprimer la catégorie « ${c.name} » ?`,
      consequence: "Elle disparaîtra du menu public.",
      confirmLabel: "Supprimer",
      danger: true,
      onConfirm: async () => {
        const { error: err } = await table("menu_categories").delete().eq("id", c.id);
        if (err) return friendlyError(err);
        setCatOpen(null);
        categories.reload();
        return null;
      },
    });
  };

  const shown = dishes.rows.filter(d => d.available);

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle="Vos sections et vos plats. Ce qui n'est pas « au menu » n'apparaît nulle part."
        actions={
          editable && restaurant ? (
            <>
              <Button variant="secondary" onClick={() => openCat("new")}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Catégorie
              </Button>
              <Button
                variant="primary"
                onClick={() => openDish("new")}
                disabled={categories.rows.length === 0}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Plat
              </Button>
            </>
          ) : undefined
        }
      />

      {!restaurant ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Aucun restaurant"
          body="Créez d'abord votre fiche restaurant, puis composez le menu."
        />
      ) : categories.loading || dishes.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : categories.rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Commencez par une catégorie"
          body="Entrées, Plats, Desserts… Les plats se rangent dedans."
        />
      ) : (
        <>
          <div className="mb-5 grid gap-2.5 sm:grid-cols-4">
            <Stat label="Catégories" value={count(categories.rows.length)} />
            <Stat label="Plats" value={count(dishes.rows.length)} />
            <Stat label="Au menu" value={count(shown.length)} />
            <Stat label="Épuisés" value={count(shown.filter(d => d.sold_out).length)} />
          </div>

          {error && (
            <p className="mb-4 text-[13px] font-medium text-[#b3261e]">{error}</p>
          )}

          <div className="flex flex-col gap-4">
            {categories.rows.map(c => {
              const inside = dishes.rows.filter(d => d.category_id === c.id);
              return (
                <Card key={c.id} padded={false}>
                  <div className="flex flex-wrap items-center gap-3 border-b border-admin-line px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-[15px] font-semibold text-admin-ink">
                        {c.name}
                        {!c.active && (
                          <span className="ml-2 text-[11.5px] font-normal text-admin-ink-3">masquée</span>
                        )}
                      </h2>
                      <p className="text-[12.5px] text-admin-ink-3">
                        {c.description || `${count(inside.length)} plat(s)`}
                      </p>
                    </div>
                    {editable && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => openCat(c)}>Modifier</Button>
                        <Button size="sm" variant="ghost" aria-label={`Supprimer ${c.name}`} onClick={() => removeCat(c)}>
                          <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>

                  {inside.length === 0 ? (
                    <p className="px-5 py-4 text-[13px] text-admin-ink-3">Aucun plat dans cette catégorie.</p>
                  ) : (
                    <ul className="divide-y divide-admin-line">
                      {inside.map(d => (
                        <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-admin-ink">
                              {d.name}
                              {!d.available && (
                                <span className="ml-2 text-[11.5px] font-normal text-admin-ink-3">hors menu</span>
                              )}
                              {d.chef_special && (
                                <span className="ml-2 text-[11.5px] font-normal text-[#002089]">suggestion</span>
                              )}
                            </span>
                            {d.detail && (
                              <span className="block truncate text-[12px] text-admin-ink-3">{d.detail}</span>
                            )}
                            {d.dietary.length > 0 && (
                              <span className="block truncate text-[11.5px] text-admin-ink-3">
                                {d.dietary.join(" · ")}
                              </span>
                            )}
                          </span>

                          <span className="font-display text-[15px] font-semibold tabular-nums text-admin-ink">
                            {d.discount_price != null
                              ? money(d.discount_price)
                              : d.price != null
                                ? money(d.price)
                                : "—"}
                          </span>

                          {editable && (
                            <>
                              <Button
                                size="sm"
                                variant={d.sold_out ? "primary" : "secondary"}
                                onClick={() => toggleSoldOut(d)}
                              >
                                {d.sold_out ? "Épuisé" : "Disponible"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openDish(d)}>
                                Modifier
                              </Button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Modal
        open={dishOpen !== null}
        onClose={() => setDishOpen(null)}
        title={dishOpen === "new" ? "Ajouter un plat" : "Modifier le plat"}
        footer={
          <>
            {dishOpen !== null && dishOpen !== "new" && (
              <Button variant="secondary" onClick={() => removeDish(dishOpen)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Retirer
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDishOpen(null)}>Annuler</Button>
            <Button variant="primary" onClick={saveDish} disabled={busy}>
              {busy ? "Enregistrement…" : dishOpen === "new" ? "Ajouter" : "Enregistrer"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="d-name">Nom</label>
            <input id="d-name" value={dish.name} onChange={e => setD("name", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="d-cat">Catégorie</label>
            <select id="d-cat" value={dish.category_id} onChange={e => setD("category_id", e.target.value)} className={selectClass}>
              {categories.rows.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="d-detail">Description courte</label>
            <input id="d-detail" value={dish.detail} onChange={e => setD("detail", e.target.value)} placeholder="Beignets de taro, sauce ti-malice" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="d-desc">Description complète</label>
            <textarea id="d-desc" rows={2} value={dish.description} onChange={e => setD("description", e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass} htmlFor="d-price">Prix (USD)</label>
            <input id="d-price" value={dish.price} onChange={e => setD("price", e.target.value)} inputMode="decimal" placeholder="Vide = prix du marché" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="d-discount">Prix remisé (USD)</label>
            <input id="d-discount" value={dish.discount_price} onChange={e => setD("discount_price", e.target.value)} inputMode="decimal" className={inputClass} />
            <p className="mt-1 text-[11.5px] text-admin-ink-3">Doit être inférieur au prix.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="d-prep">Préparation (minutes)</label>
            <input id="d-prep" value={dish.prep_minutes} onChange={e => setD("prep_minutes", e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div>
            <span className={labelClass}>Quantité du jour</span>
            <p className="text-[12.5px] leading-relaxed text-admin-ink-3">
              Elle se règle par service, dans <strong className="font-semibold">Disponibilité</strong> :
              une commande confirmée la décompte toute seule.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="d-img">Photo (URL)</label>
            <input id="d-img" value={dish.image_url} onChange={e => setD("image_url", e.target.value)} placeholder="https://…" className={inputClass} />
            <p className="mt-1 text-[11.5px] text-admin-ink-3">
              Le téléversement direct arrivera avec un espace de stockage public : les deux
              existants sont privés, une photo y serait invisible aux clients.
            </p>
          </div>

          <div className="sm:col-span-2">
            <span className={labelClass}>Régimes</span>
            <Chips options={DIETARY} selected={dish.dietary} idPrefix="di" onToggle={v => setD("dietary", toggleIn(dish.dietary, v))} />
          </div>
          <div className="sm:col-span-2">
            <span className={labelClass}>Allergènes</span>
            <Chips options={ALLERGENS} selected={dish.allergens} idPrefix="al" onToggle={v => setD("allergens", toggleIn(dish.allergens, v))} />
            <p className="mt-1 text-[11.5px] text-admin-ink-3">
              PAPOT ne garantit aucune absence d'allergène : ces mentions sont les vôtres.
            </p>
          </div>

          <div className="sm:col-span-2">
            <span className={labelClass}>Jours où le plat est servi</span>
            <div className="flex flex-wrap gap-1.5">
              {DAY_SHORT.map((d, i) => {
                const on = dish.available_weekdays.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setD(
                        "available_weekdays",
                        on
                          ? dish.available_weekdays.filter(x => x !== i)
                          : [...dish.available_weekdays, i].sort((a, b) => a - b),
                      )
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[12.5px] transition-colors",
                      on ? "border-[#002089] bg-[#002089] text-white" : "border-admin-line text-admin-ink hover:border-[#002089]",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11.5px] text-admin-ink-3">Aucun jour coché = tous les jours.</p>
          </div>

          <div>
            <label className={labelClass} htmlFor="d-from">Servi à partir de</label>
            <input id="d-from" type="time" value={dish.available_from} onChange={e => setD("available_from", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="d-until">Jusqu'à</label>
            <input id="d-until" type="time" value={dish.available_until} onChange={e => setD("available_until", e.target.value)} className={inputClass} />
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 border-t border-admin-line pt-3">
            <Check checked={dish.available} onChange={v => setD("available", v)} label="Au menu" />
            <Check checked={dish.sold_out} onChange={v => setD("sold_out", v)} label="Épuisé aujourd'hui" />
            <Check checked={dish.popular} onChange={v => setD("popular", v)} label="Populaire" />
            <Check checked={dish.chef_special} onChange={v => setD("chef_special", v)} label="Suggestion du chef" />
          </div>

          <div className="sm:col-span-2 border-t border-admin-line pt-3">
            <label className={labelClass} htmlFor="d-notes">Notes de préparation (privées)</label>
            <textarea id="d-notes" rows={3} value={dish.prep_notes} onChange={e => setD("prep_notes", e.target.value)} className={inputClass} />
            <p className="mt-1 text-[11.5px] text-admin-ink-3">
              Visibles par votre équipe uniquement. Elles ne sont jamais servies au public.
            </p>
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <Modal
        open={catOpen !== null}
        onClose={() => setCatOpen(null)}
        title={catOpen === "new" ? "Ajouter une catégorie" : "Modifier la catégorie"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCatOpen(null)}>Annuler</Button>
            <Button variant="primary" onClick={saveCat}>
              {catOpen === "new" ? "Ajouter" : "Enregistrer"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="c-name">Nom</label>
            <input id="c-name" value={cat.name} onChange={e => setCat(c => ({ ...c, name: e.target.value }))} placeholder="Entrées" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-pos">Ordre</label>
            <input id="c-pos" value={cat.position} onChange={e => setCat(c => ({ ...c, position: e.target.value }))} inputMode="numeric" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="c-desc">Description</label>
            <input id="c-desc" value={cat.description} onChange={e => setCat(c => ({ ...c, description: e.target.value }))} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <Check checked={cat.active} onChange={v => setCat(c => ({ ...c, active: v }))} label="Visible sur le menu public" />
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/** Spec §78–§79. */
type AreaRow = {
  id: string;
  name: string;
  area_type: string | null;
  capacity: number | null;
  active: boolean;
};

type TableRow = {
  id: string;
  label: string;
  table_number: string | null;
  seats: number;
  min_guests: number;
  max_guests: number;
  accessible: boolean;
  can_combine: boolean;
  active: boolean;
  status: string;
  area_id: string | null;
};

const AREA_TYPES = [
  "Salle principale",
  "Terrasse",
  "Rooftop",
  "Jardin",
  "Bord de piscine",
  "Bord de mer",
  "Bar",
  "Salon VIP",
  "Salle privée",
  "Autre",
];

type TableDraft = {
  label: string;
  table_number: string;
  seats: string;
  min_guests: string;
  max_guests: string;
  area_id: string;
  accessible: boolean;
  can_combine: boolean;
  active: boolean;
};

const emptyTable = (): TableDraft => ({
  label: "",
  table_number: "",
  seats: "4",
  min_guests: "1",
  max_guests: "4",
  area_id: "",
  accessible: false,
  can_combine: false,
  active: true,
});

const draftOf = (t: TableRow): TableDraft => ({
  label: t.label,
  table_number: t.table_number ?? "",
  seats: String(t.seats),
  min_guests: String(t.min_guests),
  max_guests: String(t.max_guests),
  area_id: t.area_id ?? "",
  accessible: t.accessible,
  can_combine: t.can_combine,
  active: t.active,
});

/** A compact checkbox row for the table and area dialogs. */
function Check({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-admin-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#002089]"
      />
      {label}
    </label>
  );
}

export function Tables() {
  const { can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const listings = useMyListings("restaurant");
  const restaurant = listings.rows[0];
  const editable = can("manage_listings");

  /** null = closed, "new" = creating, otherwise the table being edited. */
  const [editing, setEditing] = useState<TableRow | "new" | null>(null);
  const [draft, setDraft] = useState<TableDraft>(emptyTable);
  const [error, setError] = useState<string | null>(null);

  const [areaOpen, setAreaOpen] = useState(false);
  const [areaDraft, setAreaDraft] = useState({ name: "", area_type: "Salle principale", capacity: "" });

  const areas = useTable<AreaRow>({
    from: "seating_areas",
    select: "id, name, area_type, capacity, active",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 30,
    enabled: !!restaurant,
  });

  const tables = useTable<TableRow>({
    from: "restaurant_tables",
    select:
      "id, label, table_number, seats, min_guests, max_guests, accessible, can_combine, active, status, area_id",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 200,
    enabled: !!restaurant,
  });

  const open = (t: TableRow | "new") => {
    setDraft(t === "new" ? emptyTable() : draftOf(t));
    setError(null);
    setEditing(t);
  };

  const set = <K extends keyof TableDraft>(k: K, v: TableDraft[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
  };

  const saveTable = async () => {
    if (!restaurant) return;
    if (!draft.label.trim()) return setError("Donnez un nom à la table.");
    const min = num(draft.min_guests, 1);
    const max = num(draft.max_guests, min);
    if (max < min) return setError("Le maximum de convives doit être supérieur au minimum.");

    const payload = {
      listing_id: restaurant.id,
      label: draft.label.trim(),
      table_number: draft.table_number.trim() || null,
      seats: num(draft.seats, max),
      min_guests: min,
      max_guests: max,
      area_id: draft.area_id || null,
      accessible: draft.accessible,
      can_combine: draft.can_combine,
      active: draft.active,
    };

    const { error: err } =
      editing === "new"
        ? await table("restaurant_tables").insert(payload)
        : await table("restaurant_tables").update(payload).eq("id", (editing as TableRow).id);

    if (err) return setError(friendlyError(err));
    setEditing(null);
    setError(null);
    tables.reload();
  };

  const addArea = async () => {
    if (!restaurant) return;
    if (!areaDraft.name.trim()) return setError("Donnez un nom à la salle.");
    const { error: err } = await table("seating_areas").insert({
      listing_id: restaurant.id,
      name: areaDraft.name.trim(),
      area_type: areaDraft.area_type,
      capacity: areaDraft.capacity ? num(areaDraft.capacity, 0) : null,
    });
    if (err) return setError(friendlyError(err));
    setAreaOpen(false);
    setAreaDraft({ name: "", area_type: "Salle principale", capacity: "" });
    areas.reload();
  };

  const removeTable = (t: TableRow) =>
    confirm({
      title: `Supprimer la table ${t.label} ?`,
      consequence:
        "Elle ne sera plus proposée à la réservation. Les réservations déjà prises sur cette table perdent leur place attribuée.",
      confirmLabel: "Supprimer",
      danger: true,
      onConfirm: async () => {
        const { error: err } = await table("restaurant_tables").delete().eq("id", t.id);
        if (err) return friendlyError(err);
        setEditing(null);
        tables.reload();
        return null;
      },
    });

  const STATUS_STYLE: Record<string, string> = {
    available: "border-[#d7e6d9] bg-[#eef7f0] text-[#15803d]",
    reserved: "border-[#dbe4f3] bg-[#eef3fb] text-[#002089]",
    occupied: "border-[#f3e2c4] bg-[#fdf8ee] text-[#7a5b12]",
    blocked: "border-admin-line bg-admin-canvas text-admin-ink-3",
  };

  const bookable = tables.rows.filter(t => t.active);

  return (
    <>
      <PageHeader
        title="Salles et tables"
        subtitle="Votre plan de salle. Une table inactive n'est jamais proposée à la réservation."
        actions={
          editable && restaurant ? (
            <>
              <Button variant="secondary" onClick={() => { setError(null); setAreaOpen(true); }}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Salle
              </Button>
              <Button variant="primary" onClick={() => open("new")}>
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
          <div className="mb-5 grid gap-2.5 sm:grid-cols-4">
            <Stat label="Salles" value={count(areas.rows.length)} />
            <Stat label="Tables" value={count(tables.rows.length)} />
            <Stat label="Réservables" value={count(bookable.length)} />
            <Stat label="Couverts" value={count(bookable.reduce((s, t) => s + t.seats, 0))} />
          </div>

          {tables.rows.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="Aucune table"
              body="Sans table, aucun créneau n'est proposé sur votre fiche. Ajoutez-en une pour ouvrir les réservations."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {[{ id: "", name: "Sans salle", area_type: null, capacity: null, active: true } as AreaRow, ...areas.rows].map(area => {
                const inArea = tables.rows.filter(t => (t.area_id ?? "") === area.id);
                if (inArea.length === 0) return null;
                return (
                  <Card key={area.id || "none"}>
                    <CardHeader
                      title={area.name}
                      subtitle={[
                        area.area_type,
                        `${count(inArea.length)} table(s)`,
                        area.capacity ? `${count(area.capacity)} couverts` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {inArea.map(t => (
                        <button
                          key={t.id}
                          onClick={() => editable && open(t)}
                          aria-label={`Modifier la table ${t.label}`}
                          className={cn(
                            "flex flex-col items-center justify-center rounded-xl border-2 px-3 py-4 transition-colors",
                            STATUS_STYLE[t.status] ?? STATUS_STYLE.available,
                            !t.active && "opacity-50",
                          )}
                        >
                          <span className="font-display text-[16px] font-bold">{t.label}</span>
                          <span className="mt-0.5 text-[11.5px]">
                            {t.min_guests}–{t.max_guests} conv.
                          </span>
                          <span className="mt-1 flex items-center gap-1.5">
                            {t.accessible && <Accessibility className="h-3.5 w-3.5" aria-label="Accessible" />}
                            {t.can_combine && <Link2 className="h-3.5 w-3.5" aria-label="Combinable" />}
                          </span>
                          {!t.active && <span className="mt-1 text-[10.5px] font-semibold">Inactive</span>}
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
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Ajouter une table" : "Modifier la table"}
        footer={
          <>
            {editing !== null && editing !== "new" && (
              <Button variant="secondary" onClick={() => removeTable(editing)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Supprimer
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" onClick={saveTable}>
              {editing === "new" ? "Ajouter" : "Enregistrer"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="t-label">Nom</label>
            <input id="t-label" value={draft.label} onChange={e => set("label", e.target.value)} placeholder="T1" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="t-number">Numéro (optionnel)</label>
            <input id="t-number" value={draft.table_number} onChange={e => set("table_number", e.target.value)} placeholder="12" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="t-seats">Places</label>
            <input id="t-seats" value={draft.seats} onChange={e => set("seats", e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="t-area">Salle</label>
            <select id="t-area" value={draft.area_id} onChange={e => set("area_id", e.target.value)} className={selectClass}>
              <option value="">Sans salle</option>
              {areas.rows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="t-min">Convives minimum</label>
            <input id="t-min" value={draft.min_guests} onChange={e => set("min_guests", e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="t-max">Convives maximum</label>
            <input id="t-max" value={draft.max_guests} onChange={e => set("max_guests", e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 border-t border-admin-line pt-3">
            <Check checked={draft.accessible} onChange={v => set("accessible", v)} label="Accessible" />
            <Check checked={draft.can_combine} onChange={v => set("can_combine", v)} label="Combinable avec une autre table" />
            <Check checked={draft.active} onChange={v => set("active", v)} label="Proposée à la réservation" />
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-admin-ink-3">
          Les créneaux proposés à un groupe dépendent de ces bornes : un groupe de six ne voit
          que les tables qui l'acceptent.
        </p>
        {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <Modal
        open={areaOpen}
        onClose={() => setAreaOpen(false)}
        title="Ajouter une salle"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAreaOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={addArea}>Ajouter</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="a-name">Nom</label>
            <input id="a-name" value={areaDraft.name} onChange={e => setAreaDraft(d => ({ ...d, name: e.target.value }))} placeholder="Terrasse" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="a-type">Type</label>
            <select id="a-type" value={areaDraft.area_type} onChange={e => setAreaDraft(d => ({ ...d, area_type: e.target.value }))} className={selectClass}>
              {AREA_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="a-cap">Couverts (optionnel)</label>
            <input id="a-cap" value={areaDraft.capacity} onChange={e => setAreaDraft(d => ({ ...d, capacity: e.target.value }))} inputMode="numeric" className={inputClass} />
          </div>
        </div>
        {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export { day };

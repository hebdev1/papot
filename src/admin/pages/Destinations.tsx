import { useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, PageHeader, inputClass, labelClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminTable,useRpc, useTable } from "../lib/adminData";
import { count, money } from "../../console/format";

/**
 * Read from `destinations_public`, which counts the catalogue instead of
 * repeating figures somebody typed. The counts are therefore read-only here:
 * the way to change "1 hébergement" is to add an hébergement.
 */
type Destination = {
  id: string;
  city: string;
  country: string;
  region: string | null;
  tagline: string | null;
  blurb: string | null;
  img: string | null;
  hotels: number | null;
  restaurants: number | null;
  cars: number | null;
  from_usd: number | null;
  tier: number | null;
  position: number;
};

type GeoRow = { city: string; listings: number; partners: number; bookings: number; revenue: number };

/**
 * What each tier means on the home page. Tier is what actually decides whether
 * a destination is seen, and until now it had no control anywhere in the
 * console: the only way to feature a place was to edit the row by hand.
 */
const TIER_LABEL: Record<number, string> = {
  1: "En vedette",
  2: "Carte",
  3: "Pastille",
};

/** Spec §41. */
export function Destinations() {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [editing, setEditing] = useState<Destination | "new" | null>(null);
  const [adding, setAdding] = useState<Destination | null>(null);
  const [page, setPage] = useState(1);

  const { rows, total, loading, error, reload } = useTable<Destination>({
    from: "destinations_public",
    sort: { col: "position", dir: "asc" },
    page,
    pageSize: 50,
  });

  // Real performance per city, so the statistics on this page are measured and
  // not the hand-maintained counters stored on the row.
  const { data: geo } = useRpc<GeoRow[]>("admin_geo_performance");
  const perf = (city: string) => geo?.find(g => g.city === city);

  const remove = (d: Destination) =>
    confirm({
      title: `Supprimer ${d.city} ?`,
      consequence: "La destination disparaît du site public. Les annonces de cette ville ne sont pas supprimées.",
      confirmLabel: "Supprimer",
      danger: true,
      onConfirm: async () => {
        const { error } = await adminTable("destinations").delete().eq("id", d.id);
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<Destination>[] = [
    {
      id: "city",
      header: "Destination",
      sortable: true,
      mobile: "primary",
      cell: d => (
        <span className="flex items-center gap-2.5">
          {d.img ? (
            <img src={d.img} alt="" loading="lazy" className="h-9 w-12 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="h-9 w-12 shrink-0 rounded-md bg-admin-canvas" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-admin-ink">{d.city}</span>
            <span className="block truncate text-[12px] text-admin-ink-3">
              {d.region ? `${d.region} · ` : ""}
              {d.country}
            </span>
          </span>
        </span>
      ),
    },
    { id: "tagline", header: "Accroche", mobile: "secondary", cell: d => d.tagline ?? "—" },
    {
      id: "listings",
      header: "Annonces",
      align: "right",
      mobile: "secondary",
      cell: d => count(perf(d.city)?.listings ?? 0),
    },
    {
      id: "bookings",
      header: "Réservations",
      align: "right",
      mobile: "hidden",
      cell: d => count(perf(d.city)?.bookings ?? 0),
    },
    {
      id: "revenue",
      header: "Revenus",
      align: "right",
      mobile: "meta",
      cell: d => money(perf(d.city)?.revenue ?? 0),
    },
    {
      id: "inventory",
      header: "Catalogue",
      align: "right",
      mobile: "meta",
      cell: d => {
        const bits = [
          (d.hotels ?? 0) > 0 ? `${d.hotels} héb.` : null,
          (d.restaurants ?? 0) > 0 ? `${d.restaurants} rest.` : null,
          (d.cars ?? 0) > 0 ? `${d.cars} voit.` : null,
        ].filter(Boolean);
        return bits.length ? (
          <span className="text-admin-ink">{bits.join(" · ")}</span>
        ) : (
          <span className="text-admin-ink-3">vide</span>
        );
      },
    },
    {
      id: "from_usd",
      header: "À partir de",
      align: "right",
      defaultHidden: true,
      mobile: "hidden",
      cell: d => (d.from_usd ? money(d.from_usd) : "—"),
    },
    {
      id: "tier",
      header: "Affichage",
      sortable: true,
      align: "right",
      mobile: "hidden",
      cell: d => TIER_LABEL[d.tier ?? 3] ?? "—",
    },
    { id: "position", header: "Ordre", sortable: true, align: "right", mobile: "hidden", cell: d => d.position },
  ];

  return (
    <>
      <PageHeader
        title="Destinations"
        subtitle="Villes mises en avant sur le site, et leur performance réelle."
        actions={
          can("manage_content") ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Nouvelle destination
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Destinations" value={count(total)} />
        <Stat label="Villes avec annonces" value={count(geo?.filter(g => g.listings > 0).length ?? 0)} />
        <Stat label="Annonces couvertes" value={count(geo?.reduce((s, g) => s + Number(g.listings), 0) ?? 0)} />
        <Stat label="Revenus cumulés" value={money(geo?.reduce((s, g) => s + Number(g.revenue), 0) ?? 0)} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={d => d.id}
        page={page}
        pageSize={50}
        onPage={setPage}
        storageKey="destinations"
        actions={[
          {
            label: "Ajouter un établissement",
            hidden: () => !can("moderate_listings"),
            onClick: setAdding,
          },
          { label: "Modifier", hidden: () => !can("manage_content"), onClick: setEditing },
          { label: "Supprimer", danger: true, hidden: () => !can("manage_content"), onClick: remove },
        ]}
        empty={{ title: "Aucune destination", body: "Ajoutez les villes que la plateforme met en avant." }}
      />

      <DestinationModal destination={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <AddListing destination={adding} onClose={() => setAdding(null)} onSaved={reload} />

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

function DestinationModal({
  destination,
  onClose,
  onSaved,
}: {
  destination: Destination | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = destination === "new";
  const current = isNew ? null : destination;

  const [city, setCity] = useState(current?.city ?? "");
  const [country, setCountry] = useState(current?.country ?? "Haïti");
  const [region, setRegion] = useState(current?.region ?? "");
  const [tagline, setTagline] = useState(current?.tagline ?? "");
  const [blurb, setBlurb] = useState(current?.blurb ?? "");
  const [img, setImg] = useState(current?.img ?? "");
  const [tier, setTier] = useState((current?.tier ?? 2).toString());
  const [position, setPosition] = useState(current?.position?.toString() ?? "0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!destination) return null;

  const save = async () => {
    if (!city.trim()) {
      setError("Le nom de la ville est obligatoire.");
      return;
    }

    const payload = {
      city: city.trim(),
      country: country.trim(),
      region: region.trim() || null,
      tagline: tagline.trim() || null,
      blurb: blurb.trim() || null,
      img: img.trim() || null,
      tier: Number(tier) || 2,
      position: Number(position) || 0,
    };

    setBusy(true);
    const { error } = isNew
      ? await adminTable("destinations").insert(payload)
      : await adminTable("destinations").update(payload).eq("id", current!.id);
    setBusy(false);

    if (error) {
      setError(adminError(error));
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Nouvelle destination" : `Modifier ${current?.city}`}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="d-city">
            Ville
          </label>
          <input id="d-city" value={city} onChange={e => setCity(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="d-country">
            Pays
          </label>
          <input id="d-country" value={country} onChange={e => setCountry(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="d-region">
            Département
          </label>
          <input id="d-region" value={region} onChange={e => setRegion(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="d-tier">
            Affichage sur l'accueil
          </label>
          <select id="d-tier" value={tier} onChange={e => setTier(e.target.value)} className={inputClass}>
            <option value="1">En vedette — grande carte</option>
            <option value="2">Carte — tuile standard</option>
            <option value="3">Pastille — texte seul</option>
          </select>
          <p className="mt-1.5 text-[12px] text-admin-ink-3">
            Le nombre d'hébergements et le prix d'appel ne se saisissent plus : ils sont comptés
            sur les annonces publiées de cette ville.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="d-tagline">
            Accroche
          </label>
          <input id="d-tagline" value={tagline} onChange={e => setTagline(e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="d-blurb">
            Description
          </label>
          <textarea
            id="d-blurb"
            value={blurb}
            onChange={e => setBlurb(e.target.value)}
            rows={3}
            className={`${inputClass} h-auto py-2 leading-relaxed`}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="d-img">
            Image d'en-tête (URL)
          </label>
          <input id="d-img" value={img} onChange={e => setImg(e.target.value)} className={inputClass} />
          {img && (
            <img
              src={img}
              alt="Aperçu"
              className="mt-2 aspect-[16/6] w-full rounded-lg border border-admin-line object-cover"
            />
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="d-position">
            Ordre d'affichage
          </label>
          <input
            id="d-position"
            value={position}
            onChange={e => setPosition(e.target.value)}
            inputMode="numeric"
            className={inputClass}
          />
        </div>
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

/* ── Créer un établissement dans une destination ─────────────────────────── */

/** The labels each métier offers, so "type" is a choice and not a free string
    that becomes six spellings of the same thing. */
const TYPES: Record<string, string[]> = {
  stay: ["Hôtel", "Maison d'hôtes", "Résidence", "Villa", "Auberge", "Écolodge"],
  restaurant: ["Restaurant", "Bistrot", "Table d'hôtes", "Bar & grill"],
  car: ["Citadine", "Berline", "SUV", "Pick-up", "Van"],
};

/**
 * The city is never typed here: it comes from the destination the admin opened
 * this from. That is the point of the screen — a listing entered by hand was
 * how "cap haitien" came to sit beside "Cap-Haïtien", counted by neither.
 */
function AddListing({
  destination,
  onClose,
  onSaved,
}: {
  destination: Destination | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"stay" | "restaurant" | "car">("stay");
  const [type, setType] = useState(TYPES.stay[0]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitUnits, setUnitUnits] = useState("1");
  const [cuisine, setCuisine] = useState("");
  const [band, setBand] = useState("$$");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!destination) return null;

  const pickKind = (k: "stay" | "restaurant" | "car") => {
    setKind(k);
    setType(TYPES[k][0]);
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc("admin_create_listing", {
      p_payload: {
        destination_id: destination.id,
        kind,
        type,
        name,
        price,
        subtitle,
        ...(kind === "stay" ? { unit_name: unitName, unit_units: unitUnits } : {}),
        ...(kind === "restaurant" ? { cuisine, price_band: band } : {}),
      },
    });
    setBusy(false);
    // The RPC carries its own refusals - a missing cuisine, a price that is not
    // a price - and they are worth more to the admin than a generic message.
    if (error) return setError(adminError(error));
    onSaved();
    onClose();
  };

  const priceLabel = kind === "stay" ? "Prix par nuit ($)" : kind === "car" ? "Prix par jour ($)" : "Panier moyen ($)";

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ajouter un établissement à ${destination.city}`}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !name.trim() || !price.trim()}>
            Créer
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-admin-ink-2">
        La ville, le pays et le département viennent de la destination : {destination.city}
        {destination.region ? `, ${destination.region}` : ""}. Ils ne se saisissent pas ici.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="l-kind">
            Métier
          </label>
          <select
            id="l-kind"
            value={kind}
            onChange={e => pickKind(e.target.value as "stay" | "restaurant" | "car")}
            className={inputClass}
          >
            <option value="stay">Hébergement</option>
            <option value="restaurant">Restaurant</option>
            <option value="car">Voiture</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="l-type">
            Type
          </label>
          <select id="l-type" value={type} onChange={e => setType(e.target.value)} className={inputClass}>
            {TYPES[kind].map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="l-name">
            Nom de l'établissement
          </label>
          <input id="l-name" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="l-price">
            {priceLabel}
          </label>
          <input
            id="l-price"
            value={price}
            onChange={e => setPrice(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="l-sub">
            Sous-titre
          </label>
          <input id="l-sub" value={subtitle} onChange={e => setSubtitle(e.target.value)} className={inputClass} />
        </div>

        {kind === "stay" && (
          <>
            <div>
              <label className={labelClass} htmlFor="l-unit">
                Premier type de chambre
              </label>
              <input
                id="l-unit"
                value={unitName}
                onChange={e => setUnitName(e.target.value)}
                placeholder="Chambre standard"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="l-units">
                Nombre de chambres
              </label>
              <input
                id="l-units"
                value={unitUnits}
                onChange={e => setUnitUnits(e.target.value)}
                inputMode="numeric"
                className={inputClass}
              />
              <p className="mt-1.5 text-[12px] text-admin-ink-3">
                C'est ce nombre qui empêche la chambre d'être vendue deux fois.
              </p>
            </div>
          </>
        )}

        {kind === "restaurant" && (
          <>
            <div>
              <label className={labelClass} htmlFor="l-cuisine">
                Cuisine
              </label>
              <input
                id="l-cuisine"
                value={cuisine}
                onChange={e => setCuisine(e.target.value)}
                placeholder="Créole, fruits de mer…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="l-band">
                Gamme de prix
              </label>
              <select id="l-band" value={band} onChange={e => setBand(e.target.value)} className={inputClass}>
                {["$", "$$", "$$$", "$$$$"].map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

export { MapPin };

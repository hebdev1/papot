import { useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, PageHeader, inputClass, labelClass } from "../components/Ui";
import { Stat } from "../components/Cards";
import { DataTable, type Column } from "../components/DataTable";
import { ConfirmDialog, Modal, useConfirm } from "../components/Dialog";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminTable,useRpc, useTable } from "../lib/adminData";
import { count, money } from "../lib/format";

type Destination = {
  id: string;
  city: string;
  country: string;
  region: string | null;
  tagline: string | null;
  blurb: string | null;
  img: string | null;
  hotels: number;
  restaurants: number;
  from_usd: number | null;
  tier: number | null;
  position: number;
};

type GeoRow = { city: string; listings: number; partners: number; bookings: number; revenue: number };

/** Spec §41. */
export function Destinations() {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [editing, setEditing] = useState<Destination | "new" | null>(null);
  const [page, setPage] = useState(1);

  const { rows, total, loading, error, reload } = useTable<Destination>({
    from: "destinations",
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
      id: "from_usd",
      header: "À partir de",
      align: "right",
      defaultHidden: true,
      mobile: "hidden",
      cell: d => (d.from_usd ? money(d.from_usd) : "—"),
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
          { label: "Modifier", hidden: () => !can("manage_content"), onClick: setEditing },
          { label: "Supprimer", danger: true, hidden: () => !can("manage_content"), onClick: remove },
        ]}
        empty={{ title: "Aucune destination", body: "Ajoutez les villes que la plateforme met en avant." }}
      />

      <DestinationModal destination={editing} onClose={() => setEditing(null)} onSaved={reload} />
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
  const [fromUsd, setFromUsd] = useState(current?.from_usd?.toString() ?? "");
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
      from_usd: fromUsd.trim() ? Number(fromUsd.replace(",", ".")) : null,
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
          <label className={labelClass} htmlFor="d-from">
            Prix d'appel ($)
          </label>
          <input id="d-from" value={fromUsd} onChange={e => setFromUsd(e.target.value)} inputMode="decimal" className={inputClass} />
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

export { MapPin };

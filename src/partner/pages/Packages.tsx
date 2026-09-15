import { useState } from "react";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  Button, Card, CardHeader, EmptyState, PageHeader, Skeleton,
  inputClass, labelClass, selectClass,
} from "../../console/Ui";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { friendlyError, table, useRpc, useTable } from "../../console/data";
import { money } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

/**
 * Spec: paquets promotionnels.
 *
 * A package bundles several things the partner already sells under one name and
 * one price. Every business type gets this screen — that is the whole point of
 * the feature — so nothing here is keyed to a métier except the list of things
 * a line may point at, which follows the annonce the package sits on.
 *
 * The saving is never computed here. `package_quote` does it in the database,
 * reading each bound line's price live, and this screen displays the answer.
 * Two copies of that arithmetic would drift apart within a month.
 */

type Listing = { id: string; name: string; kind: string; price: number | null };

type Pkg = {
  id: string;
  listing_id: string;
  name: string;
  description: string;
  price: number;
  basis: string;
  min_units: number | null;
  starts_on: string | null;
  ends_on: string | null;
  usage_limit: number | null;
  used_count: number;
  active: boolean;
};

type Line = {
  id: string;
  package_id: string;
  position: number;
  label: string;
  unit_id: string | null;
  listing_id: string | null;
  menu_item_id: string | null;
  quantity: number;
  recurring: boolean;
  reference_value: number | null;
};

type Quote = {
  price: number;
  reference: number | null;
  savings: number | null;
  savings_known: boolean;
  lines: { id: string; label: string; value_known: boolean; total: number | null }[];
};

const BASIS_LABEL: Record<string, string> = {
  per_night: "par nuit",
  per_day: "par jour",
  total: "pour le tout",
};

/** What one unit of a stay is called, so the copy never says "nuits" to a loueur. */
const unitWord = (basis: string, n: number) =>
  basis === "per_day" ? (n > 1 ? "jours" : "jour") : n > 1 ? "nuits" : "nuit";

const EMPTY = {
  listing_id: "",
  name: "",
  description: "",
  price: "",
  basis: "per_night",
  min_units: "",
  starts_on: "",
  ends_on: "",
  usage_limit: "",
};

export function Packages() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const editable = can("manage_promotions");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Pkg | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);

  const listings = useTable<Listing>({
    from: "listings",
    select: "id, name, kind, price",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "name", dir: "asc" },
    pageSize: 200,
    enabled: !!active,
  });

  const packages = useTable<Pkg>({
    from: "partner_packages",
    select:
      "id, listing_id, name, description, price, basis, min_units, starts_on, ends_on, usage_limit, used_count, active",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  const lines = useTable<Line>({
    from: "package_lines",
    select:
      "id, package_id, position, label, unit_id, listing_id, menu_item_id, quantity, recurring, reference_value",
    filters: [{ col: "package_id", op: "in", value: packages.rows.map(p => p.id) }],
    sort: { col: "position", dir: "asc" },
    pageSize: 500,
    enabled: packages.rows.length > 0,
  });

  const units = useTable<{ id: string; listing_id: string; name: string; price: number }>({
    from: "listing_units",
    select: "id, listing_id, name, price",
    filters: [{ col: "listing_id", op: "in", value: listings.rows.map(l => l.id) }],
    sort: { col: "position", dir: "asc" },
    pageSize: 300,
    enabled: listings.rows.length > 0,
  });

  const dishes = useTable<{ id: string; listing_id: string; name: string; price: number | null }>({
    from: "menu_items",
    select: "id, listing_id, name, price",
    filters: [{ col: "listing_id", op: "in", value: listings.rows.map(l => l.id) }],
    sort: { col: "position", dir: "asc" },
    pageSize: 500,
    enabled: listings.rows.length > 0,
  });

  const edit = (p: Pkg | "new") => {
    setError(null);
    setOpen(p);
    setForm(
      p === "new"
        ? { ...EMPTY, listing_id: listings.rows[0]?.id ?? "" }
        : {
            listing_id: p.listing_id,
            name: p.name,
            description: p.description ?? "",
            price: String(p.price),
            basis: p.basis,
            min_units: p.min_units == null ? "" : String(p.min_units),
            starts_on: p.starts_on ?? "",
            ends_on: p.ends_on ?? "",
            usage_limit: p.usage_limit == null ? "" : String(p.usage_limit),
          },
    );
  };

  const save = async () => {
    if (!form.name.trim()) return setError("Donnez un nom à l'offre.");
    if (!form.listing_id) return setError("Choisissez l'annonce qui porte l'offre.");
    setError(null);

    // `partner_id` is deliberately absent from the update: it is not among the
    // columns a partner may write, and sending it would be refused.
    const fields = {
      listing_id: form.listing_id,
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price.replace(",", ".")) || 0,
      basis: form.basis,
      min_units: form.min_units ? Number(form.min_units) : null,
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
    };

    const { error: err } =
      open === "new"
        ? await table("partner_packages").insert({
            ...fields,
            partner_id: active!.partner_id,
            position: packages.rows.length,
          })
        : await table("partner_packages").update(fields).eq("id", (open as Pkg).id);

    if (err) return setError(friendlyError(err));
    setOpen(null);
    packages.reload();
  };

  const toggle = async (p: Pkg) => {
    const { error: err } = await table("partner_packages").update({ active: !p.active }).eq("id", p.id);
    if (err) return setError(friendlyError(err));
    packages.reload();
  };

  if (listings.loading || packages.loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <>
      <PageHeader
        title="Offres"
        subtitle="Plusieurs choses que vous vendez déjà, sous un nom et un prix uniques."
        breadcrumb={[{ label: "Marketing", to: "/partenaire/promotions" }]}
        actions={
          editable && listings.rows.length > 0 ? (
            <Button variant="primary" onClick={() => edit("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Offre
            </Button>
          ) : undefined
        }
      />

      {error && <p className="mb-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}

      {listings.rows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Aucune annonce"
          body="Une offre se pose sur une annonce. Créez la vôtre, puis revenez composer une offre."
        />
      ) : packages.rows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Aucune offre"
          body="Une chambre et un petit-déjeuner, une voiture et son chauffeur, une table et un dessert : réunissez ce que vous vendez déjà sous un prix unique."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {packages.rows.map(p => (
            <PackageCard
              key={p.id}
              pkg={p}
              listing={listings.rows.find(l => l.id === p.listing_id)}
              listings={listings.rows}
              units={units.rows}
              dishes={dishes.rows}
              lines={lines.rows.filter(l => l.package_id === p.id)}
              editable={editable}
              onEdit={() => edit(p)}
              onToggle={() => toggle(p)}
              onLinesChanged={() => lines.reload()}
              onDelete={() =>
                confirm({
                  title: `Supprimer l'offre « ${p.name} » ?`,
                  consequence: "Elle disparaît de la fiche publique. Les réservations déjà vendues ne bougent pas.",
                  confirmLabel: "Supprimer",
                  danger: true,
                  onConfirm: async () => {
                    const { error: err } = await table("partner_packages").delete().eq("id", p.id);
                    if (err) return friendlyError(err);
                    packages.reload();
                    return null;
                  },
                })
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === "new" ? "Nouvelle offre" : "Modifier l'offre"}
        width="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>Annuler</Button>
            <Button variant="primary" onClick={save}>Enregistrer</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="p-name">Nom de l'offre</label>
            <input
              id="p-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Escapade en amoureux"
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="p-listing">Annonce qui porte l'offre</label>
            <select
              id="p-listing"
              value={form.listing_id}
              onChange={e => setForm(f => ({ ...f, listing_id: e.target.value }))}
              className={selectClass}
            >
              {listings.rows.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-admin-ink-3">
              C'est sur sa fiche que l'offre apparaît, et c'est elle qui décide des dates libres.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="p-desc">Description</label>
            <input
              id="p-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Deux nuits, le petit-déjeuner et le transfert depuis l'aéroport"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="p-price">Prix (USD)</label>
            <input
              id="p-price"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              inputMode="decimal"
              placeholder="120"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="p-basis">Ce prix s'entend</label>
            <select
              id="p-basis"
              value={form.basis}
              onChange={e => setForm(f => ({ ...f, basis: e.target.value }))}
              className={selectClass}
            >
              <option value="per_night">Par nuit</option>
              <option value="per_day">Par jour</option>
              <option value="total">Pour le tout</option>
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="p-min">Minimum de {unitWord(form.basis, 2)}</label>
            <input
              id="p-min"
              value={form.min_units}
              onChange={e => setForm(f => ({ ...f, min_units: e.target.value }))}
              inputMode="numeric"
              placeholder="Aucun"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="p-limit">Nombre de ventes maximum</label>
            <input
              id="p-limit"
              value={form.usage_limit}
              onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))}
              inputMode="numeric"
              placeholder="Illimité"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="p-from">Proposée à partir du</label>
            <input
              id="p-from"
              type="date"
              value={form.starts_on}
              onChange={e => setForm(f => ({ ...f, starts_on: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="p-to">Jusqu'au</label>
            <input
              id="p-to"
              type="date"
              value={form.ends_on}
              onChange={e => setForm(f => ({ ...f, ends_on: e.target.value }))}
              className={inputClass}
            />
          </div>

          <p className="sm:col-span-2 text-[11.5px] text-admin-ink-3">
            Ces dates sont celles pendant lesquelles l'offre est vendue, pas celles du séjour.
          </p>
        </div>
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

const EMPTY_LINE = { bind: "", label: "", quantity: "1", recurring: false, value: "" };

function PackageCard({
  pkg, listing, listings, units, dishes, lines, editable, onEdit, onToggle, onDelete, onLinesChanged,
}: {
  pkg: Pkg;
  listing?: Listing;
  listings: Listing[];
  units: { id: string; listing_id: string; name: string; price: number }[];
  dishes: { id: string; listing_id: string; name: string; price: number | null }[];
  lines: Line[];
  editable: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onLinesChanged: () => void;
}) {
  const [draft, setDraft] = useState(EMPTY_LINE);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(String(pkg.min_units ?? (pkg.basis === "total" ? 1 : 2)));

  const nUnits = Math.max(1, Number(preview) || 1);
  const quote = useRpc<Quote>("package_quote", { p_package: pkg.id, p_units: nUnits });

  /**
   * What a line may point at follows the annonce the package sits on: room
   * types for a stay, the company's other vehicles for a rental, dishes for a
   * restaurant. Anything else would belong to somebody else, and the database
   * refuses it anyway.
   */
  const choices: { value: string; label: string }[] = [
    ...units
      .filter(u => u.listing_id === pkg.listing_id)
      .map(u => ({ value: `unit:${u.id}`, label: `${u.name} — ${money(u.price)}` })),
    ...dishes
      .filter(d => d.listing_id === pkg.listing_id)
      .map(d => ({ value: `item:${d.id}`, label: `${d.name}${d.price == null ? "" : ` — ${money(d.price)}`}` })),
    ...listings
      .filter(l => l.id !== pkg.listing_id)
      .map(l => ({ value: `listing:${l.id}`, label: `${l.name}${l.price ? ` — ${money(l.price)}` : ""}` })),
  ];

  const addLine = async () => {
    const label = draft.label.trim() || choices.find(c => c.value === draft.bind)?.label.split(" — ")[0] || "";
    if (!label) return setError("Donnez un nom à la ligne.");
    setError(null);

    const [kind, id] = draft.bind ? draft.bind.split(":") : ["", ""];
    const { error: err } = await table("package_lines").insert({
      package_id: pkg.id,
      position: lines.length,
      label,
      unit_id: kind === "unit" ? id : null,
      listing_id: kind === "listing" ? id : null,
      menu_item_id: kind === "item" ? id : null,
      quantity: Number(draft.quantity) || 1,
      recurring: draft.recurring,
      // A bound line never carries a value: it reads the price of the thing.
      reference_value: kind || !draft.value ? null : Number(draft.value.replace(",", ".")),
    });
    if (err) return setError(friendlyError(err));
    setDraft(EMPTY_LINE);
    onLinesChanged();
    quote.reload();
  };

  const removeLine = async (id: string) => {
    const { error: err } = await table("package_lines").delete().eq("id", id);
    if (err) return setError(friendlyError(err));
    onLinesChanged();
    quote.reload();
  };

  const q = quote.data;
  const unknown = (q?.lines ?? []).filter(l => !l.value_known);

  return (
    <Card padded={false}>
      <CardHeader
        title={pkg.name}
        subtitle={`${listing?.name ?? "Annonce inconnue"} · ${money(pkg.price)} ${BASIS_LABEL[pkg.basis] ?? pkg.basis}`}
        action={
          editable ? (
            <>
              <Button size="sm" variant="secondary" onClick={onToggle}>
                {pkg.active ? "Mettre en pause" : "Activer"}
              </Button>
              <Button size="sm" variant="secondary" onClick={onEdit}>Modifier</Button>
              <Button size="sm" variant="dangerGhost" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="px-5 pb-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-admin-ink-3">
          <span className={cn("font-semibold", pkg.active ? "text-[#15803d]" : "text-admin-ink-3")}>
            {pkg.active ? "Proposée" : "En pause"}
          </span>
          {pkg.min_units && <span>Au moins {pkg.min_units} {unitWord(pkg.basis, pkg.min_units)}</span>}
          {(pkg.starts_on || pkg.ends_on) && (
            <span>
              {pkg.starts_on ? `du ${pkg.starts_on}` : "jusqu'au"} {pkg.ends_on ? `au ${pkg.ends_on}` : ""}
            </span>
          )}
          <span className="tabular-nums">
            {pkg.used_count}{pkg.usage_limit ? ` / ${pkg.usage_limit}` : ""} vendue{pkg.used_count > 1 ? "s" : ""}
          </span>
        </div>

        {pkg.description && <p className="mb-3 text-[13px] text-admin-ink-2">{pkg.description}</p>}

        <div className="flex flex-col gap-1.5">
          {lines.length === 0 && (
            <p className="text-[12.5px] text-admin-ink-3">
              Cette offre ne contient encore rien. Ajoutez ce qu'elle réunit.
            </p>
          )}
          {lines.map(l => {
            const shown = q?.lines.find(x => x.id === l.id);
            const bound = !!(l.unit_id || l.listing_id || l.menu_item_id);
            return (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-admin-line px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-[13px] font-medium text-admin-ink">
                  {l.label}
                  {l.quantity > 1 && <span className="text-admin-ink-3"> ×{l.quantity}</span>}
                </span>
                <span className="text-[12px] text-admin-ink-3">
                  {bound ? "prix suivi" : "décrite"}
                  {l.recurring ? ` · par ${unitWord(pkg.basis, 1)}` : ""}
                </span>
                <span className="w-20 text-right text-[12.5px] tabular-nums text-admin-ink-2">
                  {shown?.total == null ? "—" : money(shown.total)}
                </span>
                {editable && (
                  <button
                    onClick={() => removeLine(l.id)}
                    aria-label={`Retirer ${l.label}`}
                    className="text-admin-ink-3 transition-colors hover:text-[#b3261e]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {editable && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <select
              value={draft.bind}
              onChange={e => setDraft(d => ({ ...d, bind: e.target.value }))}
              aria-label="Ce que la ligne désigne"
              className={cn(selectClass, "w-52 py-1")}
            >
              <option value="">Ligne décrite</option>
              {choices.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              placeholder={draft.bind ? "Nom affiché (facultatif)" : "Petit-déjeuner pour 2"}
              aria-label="Nom de la ligne"
              className={cn(inputClass, "w-48 py-1")}
            />
            {!draft.bind && (
              <input
                value={draft.value}
                onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
                placeholder="Vaut (USD)"
                inputMode="decimal"
                aria-label="Ce que cette ligne vaut séparément"
                className={cn(inputClass, "w-28 py-1")}
              />
            )}
            <input
              value={draft.quantity}
              onChange={e => setDraft(d => ({ ...d, quantity: e.target.value }))}
              inputMode="numeric"
              aria-label="Quantité"
              className={cn(inputClass, "w-16 py-1")}
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-admin-ink">
              <input
                type="checkbox"
                checked={draft.recurring}
                onChange={e => setDraft(d => ({ ...d, recurring: e.target.checked }))}
                className="h-3.5 w-3.5 accent-[#002089]"
              />
              par {unitWord(pkg.basis, 1)}
            </label>
            <Button variant="secondary" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ligne
            </Button>
          </div>
        )}

        {error && <p className="mt-2 text-[13px] font-medium text-[#b3261e]">{error}</p>}

        <div className="mt-4 rounded-lg border border-admin-line bg-admin-canvas px-3.5 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-admin-ink-2">
            <span>Aperçu pour</span>
            <input
              value={preview}
              onChange={e => setPreview(e.target.value)}
              inputMode="numeric"
              aria-label={`Nombre de ${unitWord(pkg.basis, 2)} pour l'aperçu`}
              className={cn(inputClass, "w-14 py-0.5")}
            />
            <span>{unitWord(pkg.basis, nUnits)}</span>
          </div>

          {quote.loading ? (
            <Skeleton className="h-5 w-56 rounded" />
          ) : !q ? (
            <p className="text-[12.5px] text-admin-ink-3">Le calcul n'est pas disponible.</p>
          ) : (
            <>
              <p className="text-[13.5px] text-admin-ink">
                <span className="text-admin-ink-3">Séparément :</span>{" "}
                <span className="tabular-nums">{q.reference == null ? "—" : money(q.reference)}</span>
                <span className="text-admin-ink-3"> · Offre :</span>{" "}
                <span className="font-semibold tabular-nums">{money(q.price)}</span>
                {q.savings_known && q.savings !== null && (
                  <>
                    <span className="text-admin-ink-3"> · </span>
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        Number(q.savings) > 0 ? "text-[#15803d]" : "text-[#b3261e]",
                      )}
                    >
                      {Number(q.savings) > 0
                        ? `Économie ${money(q.savings)}`
                        : `Plus cher de ${money(Math.abs(Number(q.savings)))}`}
                    </span>
                  </>
                )}
              </p>

              {!q.savings_known && (
                <p className="mt-1.5 text-[12.5px] text-admin-ink-2">
                  {unknown.length > 0 ? (
                    <>
                      L'économie ne sera pas affichée :{" "}
                      {unknown.map(l => `la ligne « ${l.label} »`).join(", ")}{" "}
                      {unknown.length > 1 ? "n'ont" : "n'a"} pas de valeur.
                    </>
                  ) : (
                    "L'économie ne sera pas affichée tant que l'offre ne contient rien."
                  )}
                </p>
              )}

              {q.savings_known && Number(q.savings) <= 0 && (
                <p className="mt-1.5 text-[12.5px] text-[#b3261e]">
                  Le client paierait plus que les morceaux pris séparément.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

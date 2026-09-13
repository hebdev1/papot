import { useState } from "react";
import { Loader2, Percent, Plus, Trash2 } from "lucide-react";
import { Button, Callout, Card, CardHeader, PageHeader, Skeleton, inputClass, labelClass, selectClass } from "../../console/Ui";
import { StatusBadge } from "../../console/StatusBadge";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { friendlyError, rpc, table, useTable } from "../../console/data";
import { day, money, percent as pct } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type ListingLite = { id: string; name: string; price: number };

/** Spec §25–§27 — base rates and the bulk editor. */
export function Rates() {
  const { active, can } = usePartner();
  const [bulkOpen, setBulkOpen] = useState(false);

  const listings = useTable<ListingLite>({
    from: "listings",
    select: "id, name, price",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "name", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  const [editing, setEditing] = useState<ListingLite | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const saveBase = async () => {
    if (!editing) return;
    const price = Number(value.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) return;
    setBusy(true);
    await table("listings").update({ price }).eq("id", editing.id);
    setBusy(false);
    setEditing(null);
    listings.reload();
  };

  return (
    <>
      <PageHeader
        title="Tarifs"
        subtitle="Le prix de référence de chaque annonce, et les variations par date."
        actions={
          can("manage_pricing") ? (
            <Button variant="primary" onClick={() => setBulkOpen(true)}>
              <Percent className="h-3.5 w-3.5" aria-hidden />
              Modifier en lot
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5">
        <Callout>
          Le tarif de base s'applique à toutes les dates. Une modification en lot écrit un prix
          par jour sur la période choisie, qui l'emporte sur le tarif de base.
        </Callout>
      </div>

      <Card padded={false}>
        <div className="border-b border-admin-line px-5 py-4">
          <h2 className="font-display text-[15px] font-semibold text-admin-ink">Tarifs de base</h2>
        </div>

        {listings.loading ? (
          <div className="p-5"><Skeleton className="h-24 w-full" /></div>
        ) : listings.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-admin-ink-3">
            Aucune annonce à tarifer.
          </p>
        ) : (
          <ul className="divide-y divide-admin-line">
            {listings.rows.map(l => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-admin-ink">
                  {l.name}
                </span>
                <span className="font-display text-[15px] font-semibold tabular-nums text-admin-ink">
                  {money(l.price)}
                </span>
                {can("manage_pricing") && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(l);
                      setValue(String(l.price));
                    }}
                  >
                    Modifier
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Tarif de base — ${editing?.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" onClick={saveBase} disabled={busy}>Enregistrer</Button>
          </>
        }
      >
        <label className={labelClass} htmlFor="base-price">Prix</label>
        <input id="base-price" value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" className={inputClass} />
        <p className="mt-2 text-[12.5px] text-admin-ink-3">
          S'applique à toutes les dates sans prix spécifique.
        </p>
      </Modal>

      <BulkRates open={bulkOpen} onClose={() => setBulkOpen(false)} listings={listings.rows} />
    </>
  );
}

type PreviewRow = {
  listing_id: string;
  listing_name: string;
  day: string;
  old_price: number;
  new_price: number;
};

/** Spec §27: always show the result before confirming. */
function BulkRates({
  open,
  onClose,
  listings,
}: {
  open: boolean;
  onClose: () => void;
  listings: ListingLite[];
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState("10");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (apply: boolean) => {
    setError(null);
    if (picked.length === 0) return setError("Choisissez au moins une annonce.");
    if (!start || !end) return setError("Indiquez la période.");

    setBusy(true);
    const { data, error } = await rpc("partner_rate_change", {
      p_listings: picked,
      p_percent: Number(amount.replace(",", ".")),
      p_start: start,
      p_end: end,
      p_apply: apply,
    });
    setBusy(false);

    if (error) return setError(friendlyError(error));
    const rows = (data ?? []) as PreviewRow[];
    setPreview(rows);
    if (apply) setDone(`${rows.length} jour(s) de tarif mis à jour.`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifier les tarifs en lot"
      subtitle="Prévisualisez avant d'appliquer."
      width="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Fermer</Button>
          <Button variant="secondary" onClick={() => run(false)} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />}
            Prévisualiser
          </Button>
          <Button variant="primary" onClick={() => run(true)} disabled={busy || !preview}>
            Appliquer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className={labelClass}>Annonces</legend>
          <div className="max-h-32 overflow-y-auto rounded-lg border border-admin-line">
            {listings.map(l => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 border-b border-admin-line px-3 py-2 text-[13px] last:border-0">
                <input
                  type="checkbox"
                  checked={picked.includes(l.id)}
                  onChange={() => setPicked(p => (p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id]))}
                  className="h-4 w-4 accent-[#002089]"
                />
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="r-pct">Variation (%)</label>
            <input id="r-pct" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={inputClass} />
            <p className="mt-1 text-[11.5px] text-admin-ink-3">Négatif pour baisser.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="r-start">Du</label>
            <input id="r-start" type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="r-end">Au</label>
            <input id="r-end" type="date" value={end} onChange={e => setEnd(e.target.value)} className={inputClass} />
          </div>
        </div>

        {error && <p className="text-[13px] font-medium text-[#b3261e]">{error}</p>}
        {done && <p className="rounded-lg bg-[#eef7f0] px-3 py-2 text-[13px] font-medium text-[#15803d]">{done}</p>}

        {preview && (
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-admin-ink-3">
              Aperçu — {preview.length} jour(s)
            </p>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-admin-line">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-admin-raised">
                  <tr>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Annonce</th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Jour</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Avant</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">Après</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-line">
                  {preview.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{r.listing_name}</td>
                      <td className="px-3 py-1.5 text-admin-ink-3">{day(r.day)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-admin-ink-3 line-through">
                        {money(r.old_price)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{money(r.new_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

type Discount = {
  id: string;
  name: string;
  kind: string;
  percent: number | null;
  amount: number | null;
  code: string | null;
  starts_on: string | null;
  ends_on: string | null;
  usage_limit: number | null;
  used_count: number;
  active: boolean;
};

const DISCOUNT_KIND: Record<string, string> = {
  early_booking: "Réservation anticipée",
  last_minute: "Dernière minute",
  weekly: "Séjour d'une semaine",
  monthly: "Séjour d'un mois",
  seasonal: "Saisonnière",
  promo_code: "Code promo",
  returning: "Client fidèle",
};

/** Spec §28. */
export function Discounts() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const [editing, setEditing] = useState<Discount | "new" | null>(null);

  const { rows, loading, reload } = useTable<Discount>({
    from: "partner_discounts",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "created_at", dir: "desc" },
    pageSize: 100,
    enabled: !!active,
  });

  return (
    <>
      <PageHeader
        title="Remises"
        subtitle="Récompensez les réservations anticipées, les longs séjours ou les clients fidèles."
        actions={
          can("manage_pricing") ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Nouvelle remise
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-[13px] text-admin-ink-3">
            Aucune remise. Une remise bien placée remplit les périodes creuses.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(d => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[14.5px] font-semibold text-admin-ink">{d.name}</h3>
                  <p className="text-[12.5px] text-admin-ink-3">{DISCOUNT_KIND[d.kind] ?? d.kind}</p>
                </div>
                <StatusBadge status={d.active ? "active" : "inactive"} />
              </div>

              <p className="mt-3 font-display text-[20px] font-semibold text-admin-ink">
                {d.percent !== null ? pct(Number(d.percent), 0) : money(d.amount)}
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                {d.code && (
                  <div>
                    <dt className="text-admin-ink-3">Code</dt>
                    <dd className="font-mono font-semibold text-admin-ink">{d.code}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-admin-ink-3">Utilisations</dt>
                  <dd className="font-semibold text-admin-ink">
                    {d.used_count}
                    {d.usage_limit ? ` / ${d.usage_limit}` : ""}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-admin-ink-3">Période</dt>
                  <dd className="text-admin-ink">
                    {d.starts_on ? day(d.starts_on) : "…"} → {d.ends_on ? day(d.ends_on) : "…"}
                  </dd>
                </div>
              </dl>

              {can("manage_pricing") && (
                <div className="mt-4 flex gap-2 border-t border-admin-line pt-3">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>Modifier</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await table("partner_discounts").update({ active: !d.active }).eq("id", d.id);
                      reload();
                    }}
                  >
                    {d.active ? "Désactiver" : "Activer"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      confirm({
                        title: `Supprimer « ${d.name} » ?`,
                        consequence: "Les réservations qui en ont bénéficié ne changent pas.",
                        confirmLabel: "Supprimer",
                        danger: true,
                        onConfirm: async () => {
                          const { error } = await table("partner_discounts").delete().eq("id", d.id);
                          if (error) return friendlyError(error);
                          reload();
                          return null;
                        },
                      })
                    }
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <DiscountModal discount={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

function DiscountModal({
  discount,
  onClose,
  onSaved,
}: {
  discount: Discount | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { active } = usePartner();
  const isNew = discount === "new";
  const current = isNew ? null : discount;

  const [name, setName] = useState(current?.name ?? "");
  const [kind, setKind] = useState(current?.kind ?? "early_booking");
  const [percent, setPercent] = useState(current?.percent?.toString() ?? "10");
  const [code, setCode] = useState(current?.code ?? "");
  const [startsOn, setStartsOn] = useState(current?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(current?.ends_on ?? "");
  const [limit, setLimit] = useState(current?.usage_limit?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!discount || !active) return null;

  const save = async () => {
    if (!name.trim()) return setError("Donnez un nom à la remise.");
    if (kind === "promo_code" && !code.trim()) return setError("Un code promo a besoin d'un code.");

    const payload = {
      partner_id: active.partner_id,
      name: name.trim(),
      kind,
      percent: percent.trim() ? Number(percent.replace(",", ".")) : null,
      code: code.trim() ? code.trim().toUpperCase() : null,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      usage_limit: limit.trim() ? Number(limit) : null,
    };

    setBusy(true);
    const { error } = isNew
      ? await table("partner_discounts").insert(payload)
      : await table("partner_discounts").update(payload).eq("id", current!.id);
    setBusy(false);

    if (error) return setError(friendlyError(error));
    onSaved();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Nouvelle remise" : `Modifier « ${current?.name} »`}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button variant="primary" onClick={save} disabled={busy}>Enregistrer</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="d-name">Nom</label>
          <input id="d-name" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="d-kind">Type</label>
          <select id="d-kind" value={kind} onChange={e => setKind(e.target.value)} className={selectClass}>
            {Object.entries(DISCOUNT_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="d-pct">Remise (%)</label>
          <input id="d-pct" value={percent} onChange={e => setPercent(e.target.value)} inputMode="decimal" className={inputClass} />
        </div>
        {kind === "promo_code" && (
          <div>
            <label className={labelClass} htmlFor="d-code">Code</label>
            <input id="d-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} className={inputClass} />
          </div>
        )}
        <div>
          <label className={labelClass} htmlFor="d-limit">Limite d'utilisation</label>
          <input id="d-limit" value={limit} onChange={e => setLimit(e.target.value)} placeholder="Illimité" inputMode="numeric" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="d-start">Début</label>
          <input id="d-start" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="d-end">Fin</label>
          <input id="d-end" type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} className={inputClass} />
        </div>
      </div>
      {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

type Fee = {
  id: string;
  name: string;
  kind: string;
  amount_type: string;
  amount: number;
  per_night: boolean;
  active: boolean;
};

const FEE_KIND: Record<string, string> = {
  cleaning: "Frais de ménage",
  service: "Frais de service",
  resort: "Frais de séjour",
  delivery: "Frais de livraison",
  extra_guest: "Personne supplémentaire",
  deposit: "Caution",
  tax: "Taxe",
  other: "Autre",
};

/** Spec §29. */
export function Fees() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("cleaning");
  const [amountType, setAmountType] = useState("fixed");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { rows, loading, reload } = useTable<Fee>({
    from: "partner_fees",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "created_at", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  const add = async () => {
    if (!active) return;
    if (!name.trim() || !amount.trim()) return setError("Nom et montant sont obligatoires.");
    const { error } = await table("partner_fees").insert({
      partner_id: active.partner_id,
      name: name.trim(),
      kind,
      amount_type: amountType,
      amount: Number(amount.replace(",", ".")),
    });
    if (error) return setError(friendlyError(error));
    setName("");
    setAmount("");
    setAdding(false);
    setError(null);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Frais et taxes"
        subtitle="Ce qui s'ajoute au prix affiché, et que le client voit avant de payer."
        actions={
          can("manage_pricing") ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter
            </Button>
          ) : undefined
        }
      />

      <Card padded={false}>
        {loading ? (
          <div className="p-5"><Skeleton className="h-24 w-full" /></div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-admin-ink-3">
            Aucun frais. Le client paie exactement le prix affiché.
          </p>
        ) : (
          <ul className="divide-y divide-admin-line">
            {rows.map(f => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-admin-ink">{f.name}</span>
                  <span className="block text-[12px] text-admin-ink-3">{FEE_KIND[f.kind] ?? f.kind}</span>
                </span>
                <span className="font-display text-[15px] font-semibold tabular-nums text-admin-ink">
                  {f.amount_type === "percent" ? pct(Number(f.amount), 0) : money(f.amount)}
                </span>
                <StatusBadge status={f.active ? "active" : "inactive"} />
                {can("manage_pricing") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Supprimer"
                    onClick={() =>
                      confirm({
                        title: `Supprimer « ${f.name} » ?`,
                        consequence: "Ce frais ne sera plus ajouté aux nouvelles réservations.",
                        confirmLabel: "Supprimer",
                        danger: true,
                        onConfirm: async () => {
                          const { error } = await table("partner_fees").delete().eq("id", f.id);
                          if (error) return friendlyError(error);
                          reload();
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

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Ajouter un frais"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Annuler</Button>
            <Button variant="primary" onClick={add}>Ajouter</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="f-name">Nom</label>
            <input id="f-name" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="f-kind">Type</label>
            <select id="f-kind" value={kind} onChange={e => setKind(e.target.value)} className={selectClass}>
              {Object.entries(FEE_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="f-mode">Mode</label>
            <select id="f-mode" value={amountType} onChange={e => setAmountType(e.target.value)} className={selectClass}>
              <option value="fixed">Montant fixe</option>
              <option value="percent">Pourcentage</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="f-amount">
              {amountType === "percent" ? "Pourcentage" : "Montant"}
            </label>
            <input id="f-amount" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export { CardHeader };

import { useState } from "react";
import { Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, Tabs,
  inputClass, labelClass, selectClass,
} from "../../console/Ui";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { friendlyError, table, useTable } from "../../console/data";
import { money } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type Dish = { id: string; name: string; price: number | null; category_id: string };
type Variation = { id: string; item_id: string; name: string; price: number; position: number; active: boolean };
type Group = {
  id: string;
  name: string;
  selection: string;
  required: boolean;
  min_select: number;
  max_select: number;
  position: number;
  active: boolean;
};
type Modifier = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  kind: string;
  position: number;
  active: boolean;
};
type Link = { item_id: string; group_id: string };

const SELECTION_LABEL: Record<string, string> = {
  single: "Un seul choix",
  multiple: "Plusieurs choix",
  quantity: "Choix avec quantité",
};

const KIND_LABEL: Record<string, string> = {
  option: "Choix",
  extra: "Supplément",
  remove: "Retrait",
};

/** A dish price with variations is a "from" price, so it is shown as one. */
const priceLabel = (dish: Dish, variations: Variation[]) => {
  const mine = variations.filter(v => v.item_id === dish.id && v.active);
  if (mine.length === 0) return dish.price == null ? "Prix du marché" : money(dish.price);
  return `dès ${money(Math.min(...mine.map(v => Number(v.price))))}`;
};

export function MenuOptions() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const editable = can("manage_menu");
  const [tab, setTab] = useState<"portions" | "groupes">("portions");
  const [error, setError] = useState<string | null>(null);

  const listings = useTable<{ id: string; name: string }>({
    from: "listings",
    select: "id, name",
    filters: [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      { col: "kind", op: "eq", value: "restaurant" },
    ],
    pageSize: 10,
    enabled: !!active,
  });
  const restaurant = listings.rows[0];

  const dishes = useTable<Dish>({
    from: "menu_items",
    select: "id, name, price, category_id",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 300,
    enabled: !!restaurant,
  });

  const variations = useTable<Variation>({
    from: "dish_variations",
    select: "id, item_id, name, price, position, active",
    filters: [{ col: "item_id", op: "in", value: dishes.rows.map(d => d.id) }],
    sort: { col: "position", dir: "asc" },
    pageSize: 500,
    enabled: dishes.rows.length > 0,
  });

  const groups = useTable<Group>({
    from: "modifier_groups",
    select: "id, name, selection, required, min_select, max_select, position, active",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 100,
    enabled: !!restaurant,
  });

  const modifiers = useTable<Modifier>({
    from: "modifiers",
    select: "id, group_id, name, price_delta, kind, position, active",
    filters: [{ col: "group_id", op: "in", value: groups.rows.map(g => g.id) }],
    sort: { col: "position", dir: "asc" },
    pageSize: 500,
    enabled: groups.rows.length > 0,
  });

  const links = useTable<Link>({
    from: "menu_item_modifier_groups",
    select: "item_id, group_id",
    filters: [{ col: "group_id", op: "in", value: groups.rows.map(g => g.id) }],
    pageSize: 1000,
    enabled: groups.rows.length > 0,
  });

  /* ── portions ── */
  const [varDraft, setVarDraft] = useState<Record<string, { name: string; price: string }>>({});
  const vAt = (id: string) => varDraft[id] ?? { name: "", price: "" };

  const addVariation = async (dish: Dish) => {
    const { name, price } = vAt(dish.id);
    if (!name.trim() || !price.trim()) return setError("Donnez un nom et un prix à la portion.");
    setError(null);
    const { error: err } = await table("dish_variations").insert({
      item_id: dish.id,
      name: name.trim(),
      price: Number(price.replace(",", ".")) || 0,
      position: variations.rows.filter(v => v.item_id === dish.id).length,
    });
    if (err) return setError(friendlyError(err));
    setVarDraft(p => ({ ...p, [dish.id]: { name: "", price: "" } }));
    variations.reload();
  };

  const removeVariation = async (id: string) => {
    const { error: err } = await table("dish_variations").delete().eq("id", id);
    if (err) return setError(friendlyError(err));
    variations.reload();
  };

  /* ── groups ── */
  const [groupOpen, setGroupOpen] = useState<Group | "new" | null>(null);
  const [group, setGroup] = useState({
    name: "",
    selection: "single",
    required: false,
    min_select: "0",
    max_select: "1",
    active: true,
  });

  const openGroup = (g: Group | "new") => {
    setError(null);
    setGroup(
      g === "new"
        ? { name: "", selection: "single", required: false, min_select: "0", max_select: "1", active: true }
        : {
            name: g.name,
            selection: g.selection,
            required: g.required,
            min_select: String(g.min_select),
            max_select: String(g.max_select),
            active: g.active,
          },
    );
    setGroupOpen(g);
  };

  const saveGroup = async () => {
    if (!restaurant) return;
    if (!group.name.trim()) return setError("Donnez un nom à la question.");
    const payload = {
      listing_id: restaurant.id,
      name: group.name.trim(),
      selection: group.selection,
      required: group.required,
      min_select: Number(group.min_select) || 0,
      max_select: Number(group.max_select) || 1,
      active: group.active,
      position: groups.rows.length,
    };
    const { error: err } =
      groupOpen === "new"
        ? await table("modifier_groups").insert(payload)
        : await table("modifier_groups").update(payload).eq("id", (groupOpen as Group).id);
    if (err) return setError(friendlyError(err));
    setGroupOpen(null);
    groups.reload();
  };

  const [modDraft, setModDraft] = useState<Record<string, { name: string; delta: string; kind: string }>>({});
  const mAt = (id: string) => modDraft[id] ?? { name: "", delta: "0", kind: "option" };

  const addModifier = async (g: Group) => {
    const { name, delta, kind } = mAt(g.id);
    if (!name.trim()) return setError("Donnez un nom à l'option.");
    setError(null);
    const { error: err } = await table("modifiers").insert({
      group_id: g.id,
      name: name.trim(),
      price_delta: Number(delta.replace(",", ".")) || 0,
      kind,
      position: modifiers.rows.filter(m => m.group_id === g.id).length,
    });
    if (err) return setError(friendlyError(err));
    setModDraft(p => ({ ...p, [g.id]: { name: "", delta: "0", kind: "option" } }));
    modifiers.reload();
  };

  const toggleLink = async (dishId: string, groupId: string, on: boolean) => {
    const { error: err } = on
      ? await table("menu_item_modifier_groups").insert({ item_id: dishId, group_id: groupId })
      : await table("menu_item_modifier_groups").delete().eq("item_id", dishId).eq("group_id", groupId);
    if (err) return setError(friendlyError(err));
    links.reload();
  };

  if (listings.loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!restaurant) {
    return (
      <>
        <PageHeader title="Portions et options" />
        <EmptyState icon={UtensilsCrossed} title="Aucun restaurant" body="Créez d'abord votre fiche restaurant." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Portions et options"
        subtitle="Les tailles d'un plat, et les questions posées avant de l'ajouter au panier."
        breadcrumb={[{ label: "Menu", to: "/partenaire/menu" }]}
        actions={
          editable && tab === "groupes" ? (
            <Button variant="primary" onClick={() => openGroup("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Question
            </Button>
          ) : undefined
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        counts={{ portions: variations.rows.length, groupes: groups.rows.length }}
        tabs={[
          { id: "portions", label: "Portions" },
          { id: "groupes", label: "Questions et options" },
        ]}
      />

      {error && <p className="mb-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}

      {tab === "portions" ? (
        dishes.rows.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Aucun plat" body="Ajoutez des plats au menu avant de leur donner des portions." />
        ) : (
          <div className="flex flex-col gap-3">
            {dishes.rows.map(d => {
              const mine = variations.rows.filter(v => v.item_id === d.id);
              return (
                <Card key={d.id}>
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-[15px] font-semibold text-admin-ink">{d.name}</h2>
                    <span className="text-[12.5px] text-admin-ink-3">
                      {priceLabel(d, variations.rows)}
                      {mine.length > 0 && " · le prix du plat est remplacé par celui de la portion"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {mine.length === 0 && (
                      <span className="text-[12.5px] text-admin-ink-3">Une seule taille.</span>
                    )}
                    {mine.map(v => (
                      <span
                        key={v.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-admin-line bg-admin-canvas px-2.5 py-1 text-[12.5px] text-admin-ink"
                      >
                        {v.name} · {money(v.price)}
                        {editable && (
                          <button
                            onClick={() => removeVariation(v.id)}
                            aria-label={`Supprimer la portion ${v.name}`}
                            className="text-admin-ink-3 transition-colors hover:text-[#b3261e]"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}

                    {editable && (
                      <span className="ml-auto flex items-center gap-1.5">
                        <input
                          value={vAt(d.id).name}
                          onChange={e => setVarDraft(p => ({ ...p, [d.id]: { ...vAt(d.id), name: e.target.value } }))}
                          placeholder="Grande"
                          aria-label={`Nom de la portion — ${d.name}`}
                          className={cn(inputClass, "w-32 py-1")}
                        />
                        <input
                          value={vAt(d.id).price}
                          onChange={e => setVarDraft(p => ({ ...p, [d.id]: { ...vAt(d.id), price: e.target.value } }))}
                          placeholder="18.00"
                          inputMode="decimal"
                          aria-label={`Prix de la portion — ${d.name}`}
                          className={cn(inputClass, "w-24 py-1")}
                        />
                        <Button variant="secondary" onClick={() => addVariation(d)}>
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                          Portion
                        </Button>
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : groups.rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Aucune question"
          body="« Choix du riz », « Niveau de piment », « Suppléments » : une question se pose sur autant de plats que vous voulez."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.rows.map(g => {
            const mods = modifiers.rows.filter(m => m.group_id === g.id);
            const onDishes = links.rows.filter(l => l.group_id === g.id).map(l => l.item_id);
            return (
              <Card key={g.id} padded={false}>
                <div className="flex flex-wrap items-center gap-3 border-b border-admin-line px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[15px] font-semibold text-admin-ink">
                      {g.name}
                      {!g.active && <span className="ml-2 text-[11.5px] font-normal text-admin-ink-3">inactive</span>}
                    </h2>
                    <p className="text-[12.5px] text-admin-ink-3">
                      {SELECTION_LABEL[g.selection]} · {g.required ? "obligatoire" : "facultative"} ·{" "}
                      de {g.min_select} à {g.max_select}
                    </p>
                  </div>
                  {editable && (
                    <Button size="sm" variant="ghost" onClick={() => openGroup(g)}>Modifier</Button>
                  )}
                </div>

                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {mods.length === 0 && (
                      <span className="text-[12.5px] text-admin-ink-3">Aucune option — la question ne sera pas posée.</span>
                    )}
                    {mods.map(m => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-admin-line bg-admin-canvas px-2.5 py-1 text-[12.5px] text-admin-ink"
                      >
                        <span className="text-admin-ink-3">{KIND_LABEL[m.kind]}</span>
                        {m.name}
                        {Number(m.price_delta) !== 0 && (
                          <span className="font-semibold tabular-nums">
                            {Number(m.price_delta) > 0 ? "+" : ""}
                            {money(m.price_delta)}
                          </span>
                        )}
                        {editable && (
                          <button
                            onClick={() =>
                              confirm({
                                title: `Supprimer l'option « ${m.name} » ?`,
                                consequence: "Elle disparaît de tous les plats qui posent cette question.",
                                confirmLabel: "Supprimer",
                                danger: true,
                                onConfirm: async () => {
                                  const { error: err } = await table("modifiers").delete().eq("id", m.id);
                                  if (err) return friendlyError(err);
                                  modifiers.reload();
                                  return null;
                                },
                              })
                            }
                            aria-label={`Supprimer l'option ${m.name}`}
                            className="text-admin-ink-3 transition-colors hover:text-[#b3261e]"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {editable && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <input
                        value={mAt(g.id).name}
                        onChange={e => setModDraft(p => ({ ...p, [g.id]: { ...mAt(g.id), name: e.target.value } }))}
                        placeholder="Diri djondjon"
                        aria-label={`Nom de l'option — ${g.name}`}
                        className={cn(inputClass, "w-40 py-1")}
                      />
                      <input
                        value={mAt(g.id).delta}
                        onChange={e => setModDraft(p => ({ ...p, [g.id]: { ...mAt(g.id), delta: e.target.value } }))}
                        placeholder="0.00"
                        inputMode="decimal"
                        aria-label={`Supplément de prix — ${g.name}`}
                        className={cn(inputClass, "w-24 py-1")}
                      />
                      <select
                        value={mAt(g.id).kind}
                        onChange={e => setModDraft(p => ({ ...p, [g.id]: { ...mAt(g.id), kind: e.target.value } }))}
                        aria-label={`Nature de l'option — ${g.name}`}
                        className={cn(selectClass, "w-36 py-1")}
                      >
                        <option value="option">Choix</option>
                        <option value="extra">Supplément</option>
                        <option value="remove">Retrait</option>
                      </select>
                      <Button variant="secondary" onClick={() => addModifier(g)}>
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Option
                      </Button>
                    </div>
                  )}

                  <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                    Posée sur
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    {dishes.rows.map(d => (
                      <label key={d.id} className="flex cursor-pointer items-center gap-2 text-[13px] text-admin-ink">
                        <input
                          type="checkbox"
                          checked={onDishes.includes(d.id)}
                          disabled={!editable}
                          onChange={e => toggleLink(d.id, g.id, e.target.checked)}
                          className="h-4 w-4 accent-[#002089]"
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={groupOpen !== null}
        onClose={() => setGroupOpen(null)}
        title={groupOpen === "new" ? "Nouvelle question" : "Modifier la question"}
        footer={
          <>
            {groupOpen !== null && groupOpen !== "new" && (
              <Button
                variant="secondary"
                onClick={() =>
                  confirm({
                    title: `Supprimer « ${(groupOpen as Group).name} » ?`,
                    consequence: "La question et toutes ses options disparaissent des plats concernés.",
                    confirmLabel: "Supprimer",
                    danger: true,
                    onConfirm: async () => {
                      const { error: err } = await table("modifier_groups").delete().eq("id", (groupOpen as Group).id);
                      if (err) return friendlyError(err);
                      setGroupOpen(null);
                      groups.reload();
                      return null;
                    },
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Supprimer
              </Button>
            )}
            <Button variant="secondary" onClick={() => setGroupOpen(null)}>Annuler</Button>
            <Button variant="primary" onClick={saveGroup}>Enregistrer</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="g-name">Question</label>
            <input id="g-name" value={group.name} onChange={e => setGroup(g => ({ ...g, name: e.target.value }))} placeholder="Choix de l'accompagnement" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="g-sel">Type de choix</label>
            <select id="g-sel" value={group.selection} onChange={e => setGroup(g => ({ ...g, selection: e.target.value }))} className={selectClass}>
              <option value="single">Un seul choix</option>
              <option value="multiple">Plusieurs choix</option>
              <option value="quantity">Choix avec quantité</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="g-max">Maximum</label>
            <input id="g-max" value={group.max_select} onChange={e => setGroup(g => ({ ...g, max_select: e.target.value }))} inputMode="numeric" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="g-min">Minimum</label>
            <input id="g-min" value={group.min_select} onChange={e => setGroup(g => ({ ...g, min_select: e.target.value }))} inputMode="numeric" className={inputClass} />
          </div>
          <div className="flex items-end gap-5 pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-admin-ink">
              <input type="checkbox" checked={group.required} onChange={e => setGroup(g => ({ ...g, required: e.target.checked, min_select: e.target.checked && Number(g.min_select) < 1 ? "1" : g.min_select }))} className="h-4 w-4 accent-[#002089]" />
              Obligatoire
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-admin-ink">
              <input type="checkbox" checked={group.active} onChange={e => setGroup(g => ({ ...g, active: e.target.checked }))} className="h-4 w-4 accent-[#002089]" />
              Active
            </label>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-admin-ink-3">
          « Un seul choix » impose un maximum de 1. Une question obligatoire demande au moins une
          réponse : le client ne peut pas ajouter le plat sans y répondre.
        </p>
        {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

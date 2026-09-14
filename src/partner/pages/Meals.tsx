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

type Component = {
  id: string;
  name: string;
  category: string | null;
  position: number;
  active: boolean;
};
type Template = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  base_price: number;
  position: number;
  active: boolean;
};
type Group = {
  id: string;
  template_id: string;
  name: string;
  selection: string;
  required: boolean;
  min_select: number;
  max_select: number;
  position: number;
};
type Option = {
  id: string;
  group_id: string;
  component_id: string | null;
  item_id: string | null;
  price_delta: number;
  max_quantity: number | null;
  position: number;
};
type Fixed = { id: string; template_id: string; item_id: string; quantity: number; position: number };
type Dish = { id: string; name: string };

const CATEGORIES = [
  "Protéine", "Riz / Base", "Pâtes", "Légumes", "Salade", "Banane", "Pomme de terre",
  "Pain", "Sauce", "Garniture", "Extra", "Dessert", "Boisson", "Autre",
];

const KIND_LABEL: Record<string, string> = { combo: "Formule", custom: "Assiette à composer" };

export function Meals() {
  const { active, can } = usePartner();
  const { confirm, dialogProps } = useConfirm();
  const editable = can("manage_menu");
  const [tab, setTab] = useState<"composants" | "formules">("formules");
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
    select: "id, name",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 300,
    enabled: !!restaurant,
  });

  const components = useTable<Component>({
    from: "food_components",
    select: "id, name, category, position, active",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 300,
    enabled: !!restaurant,
  });

  const templates = useTable<Template>({
    from: "meal_templates",
    select: "id, kind, name, description, base_price, position, active",
    filters: [{ col: "listing_id", op: "eq", value: restaurant?.id ?? "" }],
    sort: { col: "position", dir: "asc" },
    pageSize: 100,
    enabled: !!restaurant,
  });

  const groups = useTable<Group>({
    from: "meal_groups",
    select: "id, template_id, name, selection, required, min_select, max_select, position",
    filters: [{ col: "template_id", op: "in", value: templates.rows.map(t => t.id) }],
    sort: { col: "position", dir: "asc" },
    pageSize: 300,
    enabled: templates.rows.length > 0,
  });

  const options = useTable<Option>({
    from: "meal_group_options",
    select: "id, group_id, component_id, item_id, price_delta, max_quantity, position",
    filters: [{ col: "group_id", op: "in", value: groups.rows.map(g => g.id) }],
    sort: { col: "position", dir: "asc" },
    pageSize: 1000,
    enabled: groups.rows.length > 0,
  });

  const fixed = useTable<Fixed>({
    from: "meal_fixed_items",
    select: "id, template_id, item_id, quantity, position",
    filters: [{ col: "template_id", op: "in", value: templates.rows.map(t => t.id) }],
    sort: { col: "position", dir: "asc" },
    pageSize: 300,
    enabled: templates.rows.length > 0,
  });

  const nameOf = (o: Option) =>
    o.component_id
      ? components.rows.find(c => c.id === o.component_id)?.name ?? "—"
      : dishes.rows.find(d => d.id === o.item_id)?.name ?? "—";

  const run = async (fn: () => Promise<{ error: unknown }>, after: () => void) => {
    setError(null);
    const { error: err } = await fn();
    if (err) return setError(friendlyError(err as { message?: string; code?: string }));
    after();
  };

  /* ── components ── */
  const [comp, setComp] = useState({ name: "", category: CATEGORIES[0] });
  const addComponent = () => {
    if (!restaurant || !comp.name.trim()) return setError("Donnez un nom au composant.");
    run(
      () =>
        table("food_components").insert({
          listing_id: restaurant.id,
          name: comp.name.trim(),
          category: comp.category,
          position: components.rows.length,
        }) as Promise<{ error: unknown }>,
      () => {
        setComp({ name: "", category: comp.category });
        components.reload();
      },
    );
  };

  /* ── templates ── */
  const [tplOpen, setTplOpen] = useState<Template | "new" | null>(null);
  const [tpl, setTpl] = useState({ kind: "custom", name: "", description: "", base_price: "0", active: true });

  const openTpl = (t: Template | "new") => {
    setError(null);
    setTpl(
      t === "new"
        ? { kind: "custom", name: "", description: "", base_price: "0", active: true }
        : {
            kind: t.kind,
            name: t.name,
            description: t.description ?? "",
            base_price: String(t.base_price),
            active: t.active,
          },
    );
    setTplOpen(t);
  };

  const saveTpl = () => {
    if (!restaurant || !tpl.name.trim()) return setError("Donnez un nom à la formule.");
    const payload = {
      listing_id: restaurant.id,
      kind: tpl.kind,
      name: tpl.name.trim(),
      description: tpl.description.trim() || null,
      base_price: Number(tpl.base_price.replace(",", ".")) || 0,
      active: tpl.active,
      position: templates.rows.length,
    };
    run(
      () =>
        (tplOpen === "new"
          ? table("meal_templates").insert(payload)
          : table("meal_templates").update(payload).eq("id", (tplOpen as Template).id)) as Promise<{
          error: unknown;
        }>,
      () => {
        setTplOpen(null);
        templates.reload();
      },
    );
  };

  /* ── groups, options, fixed items ── */
  const [grpDraft, setGrpDraft] = useState<Record<string, string>>({});
  const addGroup = (t: Template) => {
    const name = (grpDraft[t.id] ?? "").trim();
    if (!name) return setError("Donnez un nom à l'étape.");
    run(
      () =>
        table("meal_groups").insert({
          template_id: t.id,
          name,
          selection: "single",
          required: true,
          min_select: 1,
          max_select: 1,
          position: groups.rows.filter(g => g.template_id === t.id).length,
        }) as Promise<{ error: unknown }>,
      () => {
        setGrpDraft(p => ({ ...p, [t.id]: "" }));
        groups.reload();
      },
    );
  };

  const patchGroup = (g: Group, patch: Partial<Group>) =>
    run(() => table("meal_groups").update(patch).eq("id", g.id) as Promise<{ error: unknown }>, groups.reload);

  const [optDraft, setOptDraft] = useState<Record<string, { ref: string; price: string }>>({});
  const oAt = (id: string) => optDraft[id] ?? { ref: "", price: "0" };

  const addOption = (g: Group) => {
    const { ref, price } = oAt(g.id);
    if (!ref) return setError("Choisissez un composant ou un plat.");
    const [kind, id] = ref.split(":");
    run(
      () =>
        table("meal_group_options").insert({
          group_id: g.id,
          component_id: kind === "c" ? id : null,
          item_id: kind === "d" ? id : null,
          price_delta: Number(price.replace(",", ".")) || 0,
          position: options.rows.filter(o => o.group_id === g.id).length,
        }) as Promise<{ error: unknown }>,
      () => {
        setOptDraft(p => ({ ...p, [g.id]: { ref: "", price: "0" } }));
        options.reload();
      },
    );
  };

  const [fixDraft, setFixDraft] = useState<Record<string, string>>({});
  const addFixed = (t: Template) => {
    const id = fixDraft[t.id];
    if (!id) return setError("Choisissez un plat.");
    run(
      () =>
        table("meal_fixed_items").insert({
          template_id: t.id,
          item_id: id,
          quantity: 1,
          position: fixed.rows.filter(f => f.template_id === t.id).length,
        }) as Promise<{ error: unknown }>,
      () => {
        setFixDraft(p => ({ ...p, [t.id]: "" }));
        fixed.reload();
      },
    );
  };

  if (listings.loading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!restaurant) {
    return (
      <>
        <PageHeader title="Formules et assiettes" />
        <EmptyState icon={UtensilsCrossed} title="Aucun restaurant" body="Créez d'abord votre fiche restaurant." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Formules et assiettes"
        subtitle="Une formule à prix fixe, ou une assiette que le client compose lui-même."
        breadcrumb={[{ label: "Menu", to: "/partenaire/menu" }]}
        actions={
          editable && tab === "formules" ? (
            <Button variant="primary" onClick={() => openTpl("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Formule
            </Button>
          ) : undefined
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        counts={{ composants: components.rows.length, formules: templates.rows.length }}
        tabs={[
          { id: "formules", label: "Formules et assiettes" },
          { id: "composants", label: "Composants" },
        ]}
      />

      {error && <p className="mb-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}

      {tab === "composants" ? (
        <Card>
          <CardHeader
            title="Composants"
            subtitle="Griot, diri djondjon, bannann — les briques d'une assiette. Ils ne se commandent pas seuls : leur prix se fixe dans chaque formule."
          />
          <div className="flex flex-wrap gap-2">
            {components.rows.length === 0 && (
              <span className="text-[12.5px] text-admin-ink-3">Aucun composant.</span>
            )}
            {components.rows.map(c => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-admin-line bg-admin-canvas px-2.5 py-1 text-[12.5px] text-admin-ink"
              >
                <span className="text-admin-ink-3">{c.category}</span>
                {c.name}
                {editable && (
                  <button
                    onClick={() =>
                      confirm({
                        title: `Supprimer « ${c.name} » ?`,
                        consequence: "Il disparaît de toutes les formules qui le proposent.",
                        confirmLabel: "Supprimer",
                        danger: true,
                        onConfirm: async () => {
                          const { error: err } = await table("food_components").delete().eq("id", c.id);
                          if (err) return friendlyError(err);
                          components.reload();
                          options.reload();
                          return null;
                        },
                      })
                    }
                    aria-label={`Supprimer ${c.name}`}
                    className="text-admin-ink-3 transition-colors hover:text-[#b3261e]"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>

          {editable && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <input
                value={comp.name}
                onChange={e => setComp(c => ({ ...c, name: e.target.value }))}
                placeholder="Griot"
                aria-label="Nom du composant"
                className={cn(inputClass, "w-44 py-1")}
              />
              <select
                value={comp.category}
                onChange={e => setComp(c => ({ ...c, category: e.target.value }))}
                aria-label="Catégorie du composant"
                className={cn(selectClass, "w-44 py-1")}
              >
                {CATEGORIES.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <Button variant="secondary" onClick={addComponent}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Composant
              </Button>
            </div>
          )}
        </Card>
      ) : templates.rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Aucune formule"
          body="Une formule réunit des plats à un prix fixe ; une assiette à composer laisse le client choisir sa protéine, sa base et ses extras."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {templates.rows.map(t => {
            const mine = groups.rows.filter(g => g.template_id === t.id);
            const included = fixed.rows.filter(f => f.template_id === t.id);
            return (
              <Card key={t.id} padded={false}>
                <div className="flex flex-wrap items-center gap-3 border-b border-admin-line px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[15px] font-semibold text-admin-ink">
                      {t.name}
                      {!t.active && <span className="ml-2 text-[11.5px] font-normal text-admin-ink-3">inactive</span>}
                    </h2>
                    <p className="text-[12.5px] text-admin-ink-3">
                      {KIND_LABEL[t.kind]} · à partir de {money(t.base_price)}
                      {t.description ? ` · ${t.description}` : ""}
                    </p>
                  </div>
                  {editable && <Button size="sm" variant="ghost" onClick={() => openTpl(t)}>Modifier</Button>}
                </div>

                <div className="flex flex-col gap-4 px-5 py-4">
                  {t.kind === "combo" && (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                        Toujours inclus
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {included.length === 0 && (
                          <span className="text-[12.5px] text-admin-ink-3">Rien d'inclus d'office.</span>
                        )}
                        {included.map(f => (
                          <span
                            key={f.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-admin-line bg-admin-canvas px-2.5 py-1 text-[12.5px] text-admin-ink"
                          >
                            {f.quantity} × {dishes.rows.find(d => d.id === f.item_id)?.name ?? "—"}
                            {editable && (
                              <button
                                onClick={() =>
                                  run(
                                    () => table("meal_fixed_items").delete().eq("id", f.id) as Promise<{ error: unknown }>,
                                    fixed.reload,
                                  )
                                }
                                aria-label="Retirer ce plat de la formule"
                                className="text-admin-ink-3 transition-colors hover:text-[#b3261e]"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                        {editable && (
                          <span className="ml-auto flex items-center gap-1.5">
                            <select
                              value={fixDraft[t.id] ?? ""}
                              onChange={e => setFixDraft(p => ({ ...p, [t.id]: e.target.value }))}
                              aria-label={`Plat à inclure — ${t.name}`}
                              className={cn(selectClass, "w-48 py-1")}
                            >
                              <option value="">Choisir un plat…</option>
                              {dishes.rows.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                            <Button variant="secondary" onClick={() => addFixed(t)}>
                              <Plus className="h-3.5 w-3.5" aria-hidden />
                              Inclure
                            </Button>
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                      Étapes
                    </p>
                    <div className="flex flex-col gap-3">
                      {mine.length === 0 && (
                        <span className="text-[12.5px] text-admin-ink-3">
                          Aucune étape : le client n'aura rien à choisir.
                        </span>
                      )}
                      {mine.map(g => (
                        <div key={g.id} className="rounded-lg border border-admin-line px-3.5 py-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-medium text-admin-ink">{g.name}</span>
                            {editable ? (
                              <span className="flex items-center gap-1.5 text-[12px] text-admin-ink-3">
                                <label className="flex cursor-pointer items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={g.required}
                                    onChange={e =>
                                      patchGroup(g, {
                                        required: e.target.checked,
                                        min_select: e.target.checked ? Math.max(1, g.min_select) : g.min_select,
                                      })
                                    }
                                    className="h-3.5 w-3.5 accent-[#002089]"
                                  />
                                  obligatoire
                                </label>
                                <span>·</span>
                                <label className="flex items-center gap-1">
                                  min
                                  <input
                                    value={g.min_select}
                                    onChange={e => patchGroup(g, { min_select: Number(e.target.value) || 0 })}
                                    inputMode="numeric"
                                    aria-label={`Minimum — ${g.name}`}
                                    className={cn(inputClass, "w-14 py-0.5")}
                                  />
                                </label>
                                <label className="flex items-center gap-1">
                                  max
                                  <input
                                    value={g.max_select}
                                    onChange={e => patchGroup(g, { max_select: Number(e.target.value) || 1 })}
                                    inputMode="numeric"
                                    aria-label={`Maximum — ${g.name}`}
                                    className={cn(inputClass, "w-14 py-0.5")}
                                  />
                                </label>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Supprimer l'étape ${g.name}`}
                                  onClick={() =>
                                    run(
                                      () => table("meal_groups").delete().eq("id", g.id) as Promise<{ error: unknown }>,
                                      groups.reload,
                                    )
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-[#b3261e]" aria-hidden />
                                </Button>
                              </span>
                            ) : (
                              <span className="text-[12px] text-admin-ink-3">
                                {g.required ? "obligatoire" : "facultative"} · de {g.min_select} à {g.max_select}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {options.rows.filter(o => o.group_id === g.id).length === 0 && (
                              <span className="text-[12.5px] text-admin-ink-3">Aucun choix proposé.</span>
                            )}
                            {options.rows
                              .filter(o => o.group_id === g.id)
                              .map(o => (
                                <span
                                  key={o.id}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-admin-line bg-admin-canvas px-2.5 py-1 text-[12.5px] text-admin-ink"
                                >
                                  {nameOf(o)}
                                  {Number(o.price_delta) !== 0 && (
                                    <span className="font-semibold tabular-nums">
                                      {Number(o.price_delta) > 0 ? "+" : ""}
                                      {money(o.price_delta)}
                                    </span>
                                  )}
                                  {editable && (
                                    <button
                                      onClick={() =>
                                        run(
                                          () =>
                                            table("meal_group_options").delete().eq("id", o.id) as Promise<{
                                              error: unknown;
                                            }>,
                                          options.reload,
                                        )
                                      }
                                      aria-label={`Retirer ${nameOf(o)}`}
                                      className="text-admin-ink-3 transition-colors hover:text-[#b3261e]"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}

                            {editable && (
                              <span className="ml-auto flex items-center gap-1.5">
                                <select
                                  value={oAt(g.id).ref}
                                  onChange={e => setOptDraft(p => ({ ...p, [g.id]: { ...oAt(g.id), ref: e.target.value } }))}
                                  aria-label={`Choix à ajouter — ${g.name}`}
                                  className={cn(selectClass, "w-48 py-1")}
                                >
                                  <option value="">Ajouter un choix…</option>
                                  {components.rows.length > 0 && (
                                    <optgroup label="Composants">
                                      {components.rows.map(c => (
                                        <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label="Plats">
                                    {dishes.rows.map(d => (
                                      <option key={d.id} value={`d:${d.id}`}>{d.name}</option>
                                    ))}
                                  </optgroup>
                                </select>
                                <input
                                  value={oAt(g.id).price}
                                  onChange={e => setOptDraft(p => ({ ...p, [g.id]: { ...oAt(g.id), price: e.target.value } }))}
                                  inputMode="decimal"
                                  aria-label={`Prix du choix — ${g.name}`}
                                  className={cn(inputClass, "w-24 py-1")}
                                />
                                <Button variant="secondary" onClick={() => addOption(g)}>
                                  <Plus className="h-3.5 w-3.5" aria-hidden />
                                  Choix
                                </Button>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {editable && (
                      <div className="mt-3 flex items-center gap-1.5">
                        <input
                          value={grpDraft[t.id] ?? ""}
                          onChange={e => setGrpDraft(p => ({ ...p, [t.id]: e.target.value }))}
                          placeholder="Choisissez votre protéine"
                          aria-label={`Nouvelle étape — ${t.name}`}
                          className={cn(inputClass, "w-64 py-1")}
                        />
                        <Button variant="secondary" onClick={() => addGroup(t)}>
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                          Étape
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={tplOpen !== null}
        onClose={() => setTplOpen(null)}
        title={tplOpen === "new" ? "Nouvelle formule" : "Modifier la formule"}
        footer={
          <>
            {tplOpen !== null && tplOpen !== "new" && (
              <Button
                variant="secondary"
                onClick={() =>
                  confirm({
                    title: `Supprimer « ${(tplOpen as Template).name} » ?`,
                    consequence: "Ses étapes et ses choix disparaissent avec elle.",
                    confirmLabel: "Supprimer",
                    danger: true,
                    onConfirm: async () => {
                      const { error: err } = await table("meal_templates").delete().eq("id", (tplOpen as Template).id);
                      if (err) return friendlyError(err);
                      setTplOpen(null);
                      templates.reload();
                      return null;
                    },
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Supprimer
              </Button>
            )}
            <Button variant="secondary" onClick={() => setTplOpen(null)}>Annuler</Button>
            <Button variant="primary" onClick={saveTpl}>Enregistrer</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="t-kind">Type</label>
            <select id="t-kind" value={tpl.kind} onChange={e => setTpl(t => ({ ...t, kind: e.target.value }))} className={selectClass}>
              <option value="custom">Assiette à composer</option>
              <option value="combo">Formule à prix fixe</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="t-price">Prix de base (USD)</label>
            <input id="t-price" value={tpl.base_price} onChange={e => setTpl(t => ({ ...t, base_price: e.target.value }))} inputMode="decimal" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="t-name">Nom</label>
            <input id="t-name" value={tpl.name} onChange={e => setTpl(t => ({ ...t, name: e.target.value }))} placeholder="Bâtissez votre assiette" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="t-desc">Description</label>
            <input id="t-desc" value={tpl.description} onChange={e => setTpl(t => ({ ...t, description: e.target.value }))} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-admin-ink">
              <input type="checkbox" checked={tpl.active} onChange={e => setTpl(t => ({ ...t, active: e.target.checked }))} className="h-4 w-4 accent-[#002089]" />
              Proposée sur la carte
            </label>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-admin-ink-3">
          Le prix de base s'ajoute aux choix du client. Une formule à prix fixe part du prix de la
          formule ; une assiette à composer part souvent de zéro et se paie par ses composants.
        </p>
        {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

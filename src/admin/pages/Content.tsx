import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, Callout, PageHeader, inputClass, labelClass, selectClass } from "../components/Ui";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { ConfirmDialog, Modal, useConfirm } from "../components/Dialog";
import { StatusBadge } from "../components/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminTable,searchAcross, useDebounced, useTable, type Filter } from "../lib/adminData";
import { count, stamp } from "../lib/format";
import { PARTNER_TYPE_LABEL } from "./Partners";

type Block = {
  id: string;
  kind: string;
  slug: string;
  title: string;
  body: string | null;
  locale: string;
  category: string | null;
  status: string;
  position: number;
  updated_at: string;
};

const KIND_COPY: Record<string, { title: string; subtitle: string; empty: string }> = {
  page: {
    title: "Pages",
    subtitle: "Pages statiques du site : conditions, à propos, contact.",
    empty: "Aucune page publiée.",
  },
  faq: {
    title: "Catégories et FAQ",
    subtitle: "Questions fréquentes et catégories éditoriales du site.",
    empty: "Aucune entrée pour le moment.",
  },
  policy: {
    title: "Politiques",
    subtitle: "Politiques d'annulation, de remboursement et conditions affichées aux voyageurs.",
    empty: "Aucune politique enregistrée.",
  },
};

/** Spec §40 — one editor for every editorial block, filtered by kind. */
function ContentTable({ kind }: { kind: "page" | "faq" | "policy" }) {
  const { can } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<Block | "new" | null>(null);
  const debounced = useDebounced(search);
  const copy = KIND_COPY[kind];

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [
      { col: "kind", op: "eq", value: kind },
      ...searchAcross(["title", "slug"], debounced),
    ];
    if (values.status?.length) f.push({ col: "status", op: "in", value: values.status });
    return f;
  }, [debounced, values, kind]);

  const { rows, total, loading, error, reload } = useTable<Block>({
    from: "content_blocks",
    filters,
    sort: { col: "position", dir: "asc" },
    page,
    pageSize: 50,
  });

  const remove = (b: Block) =>
    confirm({
      title: `Supprimer « ${b.title} » ?`,
      consequence: "Le contenu disparaît du site public et n'est pas récupérable depuis la console.",
      confirmLabel: "Supprimer",
      danger: true,
      onConfirm: async () => {
        const { error } = await adminTable("content_blocks").delete().eq("id", b.id);
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<Block>[] = [
    {
      id: "title",
      header: "Titre",
      sortable: true,
      mobile: "primary",
      cell: b => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{b.title}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">/{b.slug}</span>
        </span>
      ),
    },
    { id: "category", header: "Catégorie", mobile: "secondary", cell: b => b.category ?? "—" },
    { id: "locale", header: "Langue", mobile: "hidden", cell: b => b.locale.toUpperCase() },
    { id: "status", header: "Statut", mobile: "meta", cell: b => <StatusBadge status={b.status} /> },
    {
      id: "updated_at",
      header: "Mise à jour",
      sortable: true,
      mobile: "hidden",
      cell: b => <span className="text-admin-ink-3">{stamp(b.updated_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          can("manage_content") ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Titre ou identifiant…"
        filters={[
          {
            id: "status",
            label: "Statut",
            options: [
              { value: "published", label: "Publié" },
              { value: "draft", label: "Brouillon" },
              { value: "archived", label: "Archivé" },
            ],
          },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage={`content-${kind}`}
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={b => b.id}
        page={page}
        pageSize={50}
        onPage={setPage}
        storageKey={`content-${kind}`}
        actions={[
          { label: "Modifier", hidden: () => !can("manage_content"), onClick: setEditing },
          {
            label: "Publier",
            hidden: b => !can("manage_content") || b.status === "published",
            onClick: async b => {
              await adminTable("content_blocks").update({ status: "published" }).eq("id", b.id);
              reload();
            },
          },
          { label: "Supprimer", danger: true, hidden: () => !can("manage_content"), onClick: remove },
        ]}
        empty={{ title: copy.empty, body: "Le contenu ajouté ici alimente directement le site public." }}
      />

      <BlockModal block={editing} kind={kind} onClose={() => setEditing(null)} onSaved={reload} />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

function BlockModal({
  block,
  kind,
  onClose,
  onSaved,
}: {
  block: Block | "new" | null;
  kind: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = block === "new";
  const current = isNew ? null : block;

  const [title, setTitle] = useState(current?.title ?? "");
  const [slug, setSlug] = useState(current?.slug ?? "");
  const [category, setCategory] = useState(current?.category ?? "");
  const [body, setBody] = useState(current?.body ?? "");
  const [locale, setLocale] = useState(current?.locale ?? "fr");
  const [status, setStatus] = useState(current?.status ?? "draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!block) return null;

  const slugify = (v: string) =>
    v
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const save = async () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    const finalSlug = slug.trim() || slugify(title);

    const payload = {
      kind,
      slug: finalSlug,
      title: title.trim(),
      body: body.trim() || null,
      locale,
      category: category.trim() || null,
      status,
      updated_at: new Date().toISOString(),
    };

    setBusy(true);
    const { error } = isNew
      ? await adminTable("content_blocks").insert(payload)
      : await adminTable("content_blocks").update(payload).eq("id", current!.id);
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
      title={isNew ? "Nouveau contenu" : `Modifier « ${current?.title} »`}
      width="xl"
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
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="c-title">
            Titre
          </label>
          <input id="c-title" value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="c-slug">
            Identifiant d'URL
          </label>
          <input
            id="c-slug"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            placeholder={slugify(title) || "conditions-generales"}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="c-category">
            Catégorie
          </label>
          <input id="c-category" value={category} onChange={e => setCategory(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="c-locale">
            Langue
          </label>
          <select id="c-locale" value={locale} onChange={e => setLocale(e.target.value)} className={selectClass}>
            <option value="fr">Français</option>
            <option value="ht">Kreyòl</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="c-status">
            Statut
          </label>
          <select id="c-status" value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
            <option value="draft">Brouillon</option>
            <option value="published">Publié</option>
            <option value="archived">Archivé</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="c-body">
            Contenu
          </label>
          <textarea
            id="c-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            className={`${inputClass} h-auto py-2 font-mono text-[12.5px] leading-relaxed`}
          />
        </div>
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

export function ContentPages() {
  return <ContentTable kind="page" />;
}

export function Categories() {
  return <ContentTable kind="faq" />;
}

export function Policies() {
  return <ContentTable kind="policy" />;
}

/**
 * Spec §40 — amenities.
 *
 * The catalogue is read-only here on purpose: these 63 codes are the shared
 * vocabulary between the partner wizard, the listing filters and the database
 * check constraint. Renaming one from a CMS screen would silently invalidate
 * existing applications, so changes belong in a migration.
 */
export function Amenities() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const debounced = useDebounced(search);

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [...searchAcross(["label_fr", "code"], debounced)];
    if (values.applies?.length) f.push({ col: "applies_to", op: "in", value: values.applies });
    return f;
  }, [debounced, values]);

  const { rows, total, loading, error, reload } = useTable<{
    code: string;
    label_fr: string;
    applies_to: string[];
    category: string | null;
    position: number;
  }>({
    from: "partner_amenities",
    filters: searchAcross(["label_fr", "code"], debounced),
    sort: { col: "position", dir: "asc" },
    page,
    pageSize: 100,
  });

  const columns: Column<(typeof rows)[number]>[] = [
    { id: "label_fr", header: "Équipement", sortable: true, mobile: "primary", cell: a => a.label_fr },
    {
      id: "code",
      header: "Code",
      mobile: "secondary",
      cell: a => <code className="text-[12px] text-admin-ink-3">{a.code}</code>,
    },
    {
      id: "applies_to",
      header: "S'applique à",
      mobile: "secondary",
      cell: a => (
        <span className="flex flex-wrap gap-1">
          {(a.applies_to ?? []).map(t => (
            <span key={t} className="rounded bg-admin-canvas px-1.5 py-0.5 text-[11.5px] text-admin-ink-2">
              {PARTNER_TYPE_LABEL[t] ?? t}
            </span>
          ))}
        </span>
      ),
    },
    { id: "category", header: "Catégorie", mobile: "hidden", cell: a => a.category ?? "—" },
  ];

  return (
    <>
      <PageHeader
        title="Équipements"
        subtitle={`${count(total)} équipements partagés entre le formulaire partenaire, les filtres de recherche et la base de données.`}
      />

      <div className="mb-5">
        <Callout>
          Ce catalogue est en lecture seule dans la console. Les codes sont référencés par une contrainte de
          la base et par le formulaire partenaire : les renommer ici invaliderait silencieusement des
          candidatures existantes, donc toute modification passe par une migration.
        </Callout>
      </div>

      <FilterBar
        search={search}
        onSearch={v => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Nom ou code d'équipement…"
        values={values}
        onChange={setValues}
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={a => a.code}
        page={page}
        pageSize={100}
        onPage={setPage}
        storageKey="amenities"
        empty={{ title: "Aucun équipement", body: "Le catalogue est vide." }}
      />
    </>
  );
}

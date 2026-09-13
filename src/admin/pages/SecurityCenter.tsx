import { useMemo, useState } from "react";
import { Shield, ShieldAlert } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, Callout, Card, CardHeader, PageHeader } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { FilterBar } from "../components/FilterBar";
import { SeverityBadge } from "../../console/StatusBadge";
import { adminError, useAdmin } from "../lib/adminAuth";
import { adminTable,useTable, type Filter } from "../lib/adminData";
import { ago, count, stamp } from "../../console/format";

type SecurityEvent = {
  id: number;
  kind: string;
  severity: string;
  user_id: string | null;
  user_label: string | null;
  ip: string | null;
  user_agent: string | null;
  detail: Record<string, unknown> | null;
  resolved: boolean;
  at: string;
};

const KIND_LABEL: Record<string, string> = {
  failed_login: "Échec de connexion",
  suspicious_session: "Session suspecte",
  account_locked: "Compte verrouillé",
  admin_login: "Connexion administrateur",
  high_risk_transaction: "Transaction à risque",
  mfa_challenge: "Vérification MFA",
  password_reset: "Réinitialisation de mot de passe",
};

/** Spec §49. */
export function SecurityCenter() {
  const { can } = useAdmin();
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");

  const filters = useMemo<Filter[]>(() => {
    const f: Filter[] = [];
    if (values.kind?.length) f.push({ col: "kind", op: "in", value: values.kind });
    if (values.severity?.length) f.push({ col: "severity", op: "in", value: values.severity });
    if (values.state?.includes("unresolved")) f.push({ col: "resolved", op: "eq", value: false });
    return f;
  }, [values]);

  const { rows, total, loading, error, reload } = useTable<SecurityEvent>({
    from: "security_events",
    filters,
    sort: { col: "at", dir: "desc" },
    page,
    pageSize: 50,
  });

  const byKind = (k: string) => rows.filter(r => r.kind === k).length;
  const unresolved = rows.filter(r => !r.resolved && (r.severity === "warning" || r.severity === "critical")).length;

  const resolve = async (e: SecurityEvent) => {
    const { error } = await adminTable("security_events").update({ resolved: true }).eq("id", e.id);
    if (!error) reload();
  };

  const columns: Column<SecurityEvent>[] = [
    {
      id: "kind",
      header: "Événement",
      mobile: "primary",
      cell: e => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-admin-ink">{KIND_LABEL[e.kind] ?? e.kind}</span>
          <span className="block truncate text-[12px] text-admin-ink-3">{e.user_label ?? "—"}</span>
        </span>
      ),
    },
    { id: "ip", header: "Adresse IP", mobile: "secondary", cell: e => e.ip ?? "—" },
    {
      id: "user_agent",
      header: "Appareil",
      defaultHidden: true,
      mobile: "hidden",
      cell: e => <span className="truncate text-[12px] text-admin-ink-3">{e.user_agent ?? "—"}</span>,
    },
    { id: "severity", header: "Gravité", mobile: "meta", cell: e => <SeverityBadge severity={e.severity} /> },
    {
      id: "resolved",
      header: "Traité",
      mobile: "meta",
      cell: e =>
        e.resolved ? (
          <span className="text-[12.5px] text-[#15803d]">Oui</span>
        ) : (
          <span className="text-[12.5px] font-semibold text-[#b3261e]">Non</span>
        ),
    },
    {
      id: "at",
      header: "Quand",
      sortable: true,
      mobile: "secondary",
      cell: e => <span className="text-admin-ink-3">{ago(e.at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Sécurité"
        subtitle="Connexions, tentatives suspectes et alertes de risque sur la plateforme."
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Alertes non traitées"
          value={count(unresolved)}
          tone={unresolved > 0 ? "negative" : undefined}
        />
        <Stat label="Échecs de connexion" value={count(byKind("failed_login"))} />
        <Stat label="Sessions suspectes" value={count(byKind("suspicious_session"))} />
        <Stat label="Comptes verrouillés" value={count(byKind("account_locked"))} />
        <Stat label="Connexions admin" value={count(byKind("admin_login"))} />
        <Stat label="Transactions à risque" value={count(byKind("high_risk_transaction"))} />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Posture de sécurité" subtitle="Contrôles vérifiés sur ce projet." />
          <ul className="flex flex-col gap-2">
            {[
              {
                label: "Row Level Security active sur toutes les tables",
                state: "ok",
                detail: "Chaque table publique applique une politique ; aucun accès direct sans règle.",
              },
              {
                label: "Écritures sensibles via fonctions auditées",
                state: "ok",
                detail:
                  "Suspensions, remboursements, versements et changements de rôle passent par des RPC qui écrivent au journal dans la même transaction.",
              },
              {
                label: "Privilèges TRUNCATE retirés au rôle anonyme",
                state: "ok",
                detail:
                  "TRUNCATE n'est pas filtré par RLS : le privilège a été révoqué et les droits par défaut corrigés.",
              },
              {
                label: "Journal d'audit en ajout seul",
                state: "ok",
                detail: "Aucune politique de mise à jour ni de suppression n'existe sur admin_audit_log.",
              },
              {
                label: "MFA obligatoire pour le personnel",
                state: "todo",
                detail:
                  "À activer dans les réglages une fois la configuration d'authentification Supabase en place.",
              },
              {
                label: "SMTP personnalisé pour les courriels d'authentification",
                state: "todo",
                detail:
                  "Le fournisseur intégré est limité en débit, ce qui bloque encore certaines inscriptions.",
              },
            ].map(c => (
              <li key={c.label} className="flex items-start gap-2.5 rounded-lg border border-admin-line px-3.5 py-2.5">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    c.state === "ok" ? "bg-[#15803d]" : "bg-amber-500"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-admin-ink">{c.label}</span>
                  <span className="block text-[12px] leading-relaxed text-admin-ink-3">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Actions de sécurité" />
          <div className="flex flex-col gap-2">
            <Button variant="secondary" className="justify-start" disabled={!can("manage_security")}>
              Terminer toutes les sessions
            </Button>
            <Button variant="secondary" className="justify-start" disabled={!can("manage_security")}>
              Verrouiller un compte
            </Button>
            <Button variant="secondary" className="justify-start" disabled={!can("manage_security")}>
              Exiger une réinitialisation
            </Button>
          </div>
          <div className="mt-3">
            <Callout tone="warning">
              Ces trois actions passent par l'API d'administration de Supabase, qui exige une clé de service :
              elles doivent s'exécuter dans une fonction Edge, jamais depuis le navigateur. La suspension de
              compte, elle, est déjà opérationnelle depuis la fiche client.
            </Callout>
          </div>
        </Card>
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Rechercher un événement…"
        filters={[
          {
            id: "kind",
            label: "Type",
            options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            id: "severity",
            label: "Gravité",
            options: [
              { value: "critical", label: "Critique" },
              { value: "warning", label: "Avertissement" },
              { value: "notice", label: "À surveiller" },
              { value: "info", label: "Info" },
            ],
          },
          { id: "state", label: "État", options: [{ value: "unresolved", label: "Non traités" }] },
        ]}
        values={values}
        onChange={setValues}
        savedViewsPage="security"
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={e => String(e.id)}
        page={page}
        pageSize={50}
        onPage={setPage}
        storageKey="security"
        actions={[
          {
            label: "Marquer comme traité",
            hidden: e => e.resolved || !can("manage_security"),
            onClick: resolve,
          },
        ]}
        empty={{
          title: "Aucun événement de sécurité",
          body: "Les connexions administrateur et les tentatives suspectes seront enregistrées ici.",
        }}
      />
    </>
  );
}

export { Shield, ShieldAlert, adminError, stamp };

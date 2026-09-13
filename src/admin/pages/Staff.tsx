import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, Callout, PageHeader, inputClass, labelClass, selectClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { DataTable, type Column } from "../../console/DataTable";
import { ConfirmDialog, Modal, useConfirm } from "../../console/Dialog";
import { StatusBadge } from "../../console/StatusBadge";
import { ROLE_LABEL, adminError, useAdmin, type AdminRole } from "../lib/adminAuth";
import { adminRpc,useTable } from "../lib/adminData";
import { ago, avatarTint, count, initials, stamp } from "../../console/format";

type StaffRow = {
  user_id: string;
  full_name: string;
  email: string;
  role: AdminRole;
  status: string;
  job_title: string | null;
  last_login_at: string | null;
  created_at: string;
};

/** Spec §47. */
export function Staff() {
  const { me } = useAdmin();
  const { confirm, dialogProps } = useConfirm();
  const [inviting, setInviting] = useState<StaffRow | "new" | null>(null);
  const [page, setPage] = useState(1);

  const { rows, total, loading, error, reload } = useTable<StaffRow>({
    from: "staff",
    sort: { col: "created_at", dir: "asc" },
    page,
    pageSize: 50,
  });

  const { rows: permCounts } = useTable<{ role: string; permission: string }>({
    from: "role_permissions",
    select: "role, permission",
    pageSize: 500,
  });

  const permsFor = (role: string) => permCounts.filter(p => p.role === role).length;

  const deactivate = (s: StaffRow) =>
    confirm({
      title: `Désactiver ${s.full_name} ?`,
      consequence:
        "Cette personne perd immédiatement l'accès à la console. Son historique d'actions reste au journal d'audit.",
      confirmLabel: "Désactiver l'accès",
      danger: true,
      onConfirm: async () => {
        const { error } = await adminRpc("admin_upsert_staff", {
          p_email: s.email,
          p_full_name: s.full_name,
          p_role: s.role,
          p_status: "inactive",
        });
        if (error) return adminError(error);
        reload();
        return null;
      },
    });

  const columns: Column<StaffRow>[] = [
    {
      id: "full_name",
      header: "Membre",
      sortable: true,
      mobile: "primary",
      cell: s => (
        <span className="flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-content-center rounded-full text-[11px] font-bold text-white"
            style={{ background: avatarTint(s.full_name) }}
            aria-hidden
          >
            {initials(s.full_name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-admin-ink">
              {s.full_name}
              {s.user_id === me?.user_id && <span className="ml-1.5 text-[11.5px] text-admin-ink-3">(vous)</span>}
            </span>
            <span className="block truncate text-[12px] text-admin-ink-3">{s.email}</span>
          </span>
        </span>
      ),
    },
    { id: "role", header: "Rôle", sortable: true, mobile: "secondary", cell: s => ROLE_LABEL[s.role] ?? s.role },
    { id: "job_title", header: "Fonction", defaultHidden: true, mobile: "hidden", cell: s => s.job_title ?? "—" },
    {
      id: "permissions",
      header: "Permissions",
      align: "right",
      mobile: "hidden",
      cell: s => (
        <Link to="/admin/roles" className="text-[#002089] hover:underline">
          {permsFor(s.role)}
        </Link>
      ),
    },
    {
      id: "last_login_at",
      header: "Dernière connexion",
      sortable: true,
      mobile: "secondary",
      cell: s => <span className="text-admin-ink-3">{s.last_login_at ? ago(s.last_login_at) : "Jamais"}</span>,
    },
    { id: "status", header: "Statut", sortable: true, mobile: "meta", cell: s => <StatusBadge status={s.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Personnel"
        subtitle="Qui a accès à la console d'administration, et avec quel rôle."
        actions={
          <Button variant="primary" onClick={() => setInviting("new")}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Ajouter un membre
          </Button>
        }
      />

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Membres" value={count(total)} />
        <Stat label="Actifs" value={count(rows.filter(r => r.status === "active").length)} tone="positive" />
        <Stat label="Invités" value={count(rows.filter(r => r.status === "invited").length)} />
        <Stat label="Rôles utilisés" value={count(new Set(rows.map(r => r.role)).size)} />
      </div>

      <div className="mb-5">
        <Callout>
          Un membre du personnel doit d'abord posséder un compte PAPOT : la console rattache un rôle à un
          compte existant, elle ne crée pas de comptes. Chaque changement de rôle est enregistré au journal
          d'audit avec la mention critique.
        </Callout>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={s => s.user_id}
        page={page}
        pageSize={50}
        onPage={setPage}
        storageKey="staff"
        actions={[
          { label: "Modifier le rôle", onClick: setInviting },
          {
            label: "Voir les permissions",
            onClick: () => {
              window.location.href = "/admin/roles";
            },
          },
          {
            label: "Désactiver l'accès",
            danger: true,
            hidden: s => s.status !== "active" || s.user_id === me?.user_id,
            onClick: deactivate,
          },
        ]}
        empty={{ title: "Aucun membre", body: "Ajoutez les personnes qui doivent accéder à la console." }}
      />

      <StaffModal member={inviting} onClose={() => setInviting(null)} onSaved={reload} />
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

function StaffModal({
  member,
  onClose,
  onSaved,
}: {
  member: StaffRow | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = member === "new";
  const current = isNew ? null : member;

  const [email, setEmail] = useState(current?.email ?? "");
  const [fullName, setFullName] = useState(current?.full_name ?? "");
  const [role, setRole] = useState<AdminRole>(current?.role ?? "support_agent");
  const [status, setStatus] = useState(current?.status ?? "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!member) return null;

  const save = async () => {
    if (!email.trim() || !fullName.trim()) {
      setError("Le nom et le courriel sont obligatoires.");
      return;
    }

    setBusy(true);
    const { error } = await adminRpc("admin_upsert_staff", {
      p_email: email.trim(),
      p_full_name: fullName.trim(),
      p_role: role,
      p_status: status,
    });
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
      title={isNew ? "Ajouter un membre" : `Modifier ${current?.full_name}`}
      subtitle={isNew ? "La personne doit déjà avoir un compte PAPOT." : undefined}
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
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelClass} htmlFor="s-email">
            Courriel du compte PAPOT
          </label>
          <input
            id="s-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={!isNew}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="s-name">
            Nom complet
          </label>
          <input id="s-name" value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="s-role">
            Rôle
          </label>
          <select
            id="s-role"
            value={role}
            onChange={e => setRole(e.target.value as AdminRole)}
            className={selectClass}
          >
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11.5px] text-admin-ink-3">
            Les permissions attachées à chaque rôle se règlent dans Rôles et permissions.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="s-status">
            Statut
          </label>
          <select id="s-status" value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
            <option value="active">Actif</option>
            <option value="invited">Invité</option>
            <option value="inactive">Inactif</option>
          </select>
        </div>
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-[#b3261e]">{error}</p>}
    </Modal>
  );
}

export { KeyRound, stamp };

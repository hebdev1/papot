import { Link } from "react-router-dom";
import { BookOpen, LifeBuoy, LogOut, Mail, ShieldCheck } from "lucide-react";
import { Button, Card, CardHeader, Field, FieldGrid, PageHeader } from "../components/Ui";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL, useAdmin } from "../lib/adminAuth";
import { useTable } from "../lib/adminData";
import { avatarTint, initials, stamp } from "../lib/format";

export function AdminProfile() {
  const { me } = useAdmin();
  const { signOut } = useAuth();

  const permissions = useTable<{ code: string; label_fr: string; group_name: string }>({
    from: "admin_permissions",
    select: "code, label_fr, group_name",
    sort: { col: "position", dir: "asc" },
    pageSize: 200,
  });

  const recent = useTable<{ id: number; action: string; entity_label: string | null; at: string }>({
    from: "admin_audit_log",
    select: "id, action, entity_label, at",
    filters: [{ col: "admin_id", op: "eq", value: me?.user_id ?? "" }],
    sort: { col: "at", dir: "desc" },
    pageSize: 10,
    enabled: !!me?.user_id,
  });

  const held = new Set(me?.permissions ?? []);
  const grouped = permissions.rows.reduce<Record<string, typeof permissions.rows>>((acc, p) => {
    (acc[p.group_name] ??= []).push(p);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Votre accès à la console et ce qu'il vous permet de faire." />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <span
                className="grid h-14 w-14 shrink-0 place-content-center rounded-full text-[17px] font-bold text-white"
                style={{ background: avatarTint(me?.full_name) }}
                aria-hidden
              >
                {initials(me?.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-semibold text-admin-ink">{me?.full_name}</h2>
                <p className="text-[13px] text-admin-ink-2">{me?.email}</p>
              </div>
              <StatusBadge status={me?.status ?? "active"} size="medium" />
            </div>

            <div className="mt-5 border-t border-admin-line pt-4">
              <FieldGrid>
                <Field label="Rôle">{me?.role ? ROLE_LABEL[me.role] : "—"}</Field>
                <Field label="Fonction">{me?.job_title ?? "—"}</Field>
                <Field label="Permissions">{me?.permissions.length ?? 0}</Field>
              </FieldGrid>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Ce que vous pouvez faire"
              subtitle="Découle de votre rôle ; seul un super administrateur peut le modifier."
            />
            <div className="flex flex-col gap-3">
              {Object.entries(grouped).map(([group, list]) => (
                <div key={group}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
                    {group}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map(p => (
                      <span
                        key={p.code}
                        className={`rounded-md border px-2 py-1 text-[12px] ${
                          held.has(p.code)
                            ? "border-[#002089]/25 bg-[#f4f8fd] font-medium text-[#002089]"
                            : "border-admin-line text-admin-ink-3 line-through decoration-admin-ink-3/40"
                        }`}
                      >
                        {p.label_fr}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Vos dernières actions" subtitle="Telles qu'enregistrées au journal d'audit." />
            {recent.rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-admin-line-strong px-4 py-6 text-center text-[13px] text-admin-ink-3">
                Aucune action enregistrée pour l'instant.
              </p>
            ) : (
              <ul className="divide-y divide-admin-line">
                {recent.rows.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 text-[13px] text-admin-ink">
                      {r.action.replace(/_/g, " ")}
                      {r.entity_label && <span className="text-admin-ink-3"> · {r.entity_label}</span>}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-admin-ink-3">{stamp(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Sécurité du compte" />
            <p className="text-[13px] leading-relaxed text-admin-ink-2">
              Votre mot de passe et vos options de connexion se gèrent depuis votre compte PAPOT, pas depuis
              la console.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button as="link" to="/compte/profil" variant="secondary" className="justify-start">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Gérer mon compte
              </Button>
              <Button variant="dangerGhost" className="justify-start" onClick={() => void signOut()}>
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Se déconnecter
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export function AdminHelp() {
  return (
    <>
      <PageHeader title="Aide" subtitle="Comment fonctionne la console, et où trouver quoi." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Principes de la console" />
          <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-admin-ink-2">
            <li>
              <strong className="font-semibold text-admin-ink">Les permissions sont vérifiées en base.</strong>{" "}
              Masquer un écran est une commodité ; c'est la base de données qui refuse réellement une action
              hors de votre rôle.
            </li>
            <li>
              <strong className="font-semibold text-admin-ink">Toute action sensible laisse une trace.</strong>{" "}
              Suspensions, remboursements, versements et changements de rôle écrivent au journal d'audit dans
              la même transaction que le changement lui-même.
            </li>
            <li>
              <strong className="font-semibold text-admin-ink">Les motifs sont obligatoires.</strong> Refuser,
              suspendre ou retenir demande une explication d'au moins cinq caractères, imposée par la fonction
              serveur et pas seulement par le formulaire.
            </li>
            <li>
              <strong className="font-semibold text-admin-ink">Les notes internes restent internes.</strong>{" "}
              Elles ne sont lisibles que par le personnel, garanti par la politique de lecture de la table.
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Raccourcis" />
          <ul className="flex flex-col gap-2 text-[13px] text-admin-ink-2">
            <li className="flex items-center justify-between gap-3">
              <span>Palette de commandes</span>
              <kbd className="rounded border border-admin-line-strong px-1.5 py-0.5 text-[11.5px] font-semibold">
                ⌘ K / Ctrl K
              </kbd>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Naviguer dans les résultats</span>
              <kbd className="rounded border border-admin-line-strong px-1.5 py-0.5 text-[11.5px] font-semibold">
                ↑ ↓
              </kbd>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Ouvrir un résultat</span>
              <kbd className="rounded border border-admin-line-strong px-1.5 py-0.5 text-[11.5px] font-semibold">
                ⏎
              </kbd>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Fermer une boîte de dialogue</span>
              <kbd className="rounded border border-admin-line-strong px-1.5 py-0.5 text-[11.5px] font-semibold">
                Échap
              </kbd>
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Où trouver quoi" />
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {[
              ["Approuver un nouveau partenaire", "/admin/verification"],
              ["Publier ou refuser une annonce", "/admin/annonces"],
              ["Traiter un remboursement", "/admin/remboursements"],
              ["Verser un partenaire", "/admin/versements"],
              ["Modifier une commission", "/admin/commissions"],
              ["Ajouter un membre du personnel", "/admin/personnel"],
              ["Consulter le journal d'audit", "/admin/audit"],
            ].map(([label, to]) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-admin-ink transition-colors hover:bg-admin-canvas"
                >
                  {label}
                  <span className="text-[12px] text-admin-ink-3">{to}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Besoin d'aide ?" />
          <p className="text-[13px] leading-relaxed text-admin-ink-2">
            Pour un problème technique sur la console elle-même, contactez l'équipe qui maintient la
            plateforme. Pour une question sur un dossier, laissez une note interne : elle reste attachée à
            l'élément concerné et visible par toute l'équipe.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button as="link" to="mailto:support@papot.ht" variant="secondary">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              support@papot.ht
            </Button>
            <Button as="link" to="/admin/statut" variant="secondary">
              <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
              État du système
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

export { BookOpen };

import { CheckCircle2, ExternalLink, Plug, XCircle } from "lucide-react";
import { Callout, Card, CardHeader, PageHeader } from "../../console/Ui";
import { StatusBadge } from "../../console/StatusBadge";
import { useTable } from "../lib/adminData";
import { ago } from "../../console/format";

type Service = { key: string; label_fr: string; status: string; detail_fr: string | null; checked_at: string };

/**
 * Integrations.
 *
 * This screen reports what is genuinely wired to this project rather than
 * offering toggles that do nothing: connecting a provider means setting a
 * secret on the server, which cannot and should not happen from a browser.
 */
const INTEGRATIONS = [
  {
    key: "supabase",
    name: "Supabase",
    role: "Base de données, authentification et stockage",
    connected: true,
    detail: "Projet sqkbtygodsomekizhhyj. Toutes les données de la console proviennent d'ici.",
    action: null,
  },
  {
    key: "resend",
    name: "Resend",
    role: "Envoi des courriels transactionnels",
    connected: false,
    detail:
      "La clé RESEND_API_KEY n'est pas encore définie dans les secrets des fonctions Edge. Sans elle, les courriels de confirmation partenaire ne partent pas et l'inscription reste limitée par le fournisseur intégré.",
    action: "Ajouter RESEND_API_KEY dans Supabase → Edge Functions → Secrets",
  },
  {
    key: "smtp",
    name: "SMTP personnalisé",
    role: "Courriels d'authentification",
    connected: false,
    detail:
      "Le fournisseur intégré de Supabase est limité à quelques envois par heure, ce qui bloque les inscriptions en rafale.",
    action: "Configurer dans Supabase → Authentication → Emails → SMTP Settings",
  },
  {
    key: "payments",
    name: "Passerelle de paiement",
    role: "Encaissement des réservations",
    connected: false,
    detail:
      "Aucun processeur n'est branché : la table des paiements existe et l'interface est prête, mais aucune transaction réelle ne peut être encaissée.",
    action: "Choisir un processeur acceptant les cartes et le mobile money en Haïti",
  },
  {
    key: "sms",
    name: "Fournisseur SMS",
    role: "Notifications par SMS",
    connected: false,
    detail: "Aucun fournisseur configuré. Les campagnes SMS sont enregistrées mais ne partent pas.",
    action: null,
  },
  {
    key: "maps",
    name: "Cartographie",
    role: "Positions et destinations",
    connected: true,
    detail:
      "La carte de la vue d'ensemble est rendue localement à partir des coordonnées des villes : aucun service externe n'est appelé, donc rien à configurer.",
    action: null,
  },
];

export function Integrations() {
  const { rows } = useTable<Service>({ from: "system_services", pageSize: 50 });
  const statusOf = (key: string) => rows.find(s => s.key === key)?.status;

  const connected = INTEGRATIONS.filter(i => i.connected).length;

  return (
    <>
      <PageHeader
        title="Intégrations"
        subtitle={`${connected} service(s) connecté(s) sur ${INTEGRATIONS.length}.`}
      />

      <div className="mb-5">
        <Callout>
          Une intégration se connecte en posant un secret côté serveur, jamais depuis le navigateur : cet
          écran indique ce qui est branché et où effectuer le réglage.
        </Callout>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {INTEGRATIONS.map(i => (
          <Card key={i.key} className={i.connected ? "" : "border-[#f3e2c4]"}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span
                  className={`grid h-9 w-9 shrink-0 place-content-center rounded-lg ${
                    i.connected ? "bg-[#eef7f0] text-[#15803d]" : "bg-admin-canvas text-admin-ink-3"
                  }`}
                >
                  {i.connected ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <XCircle className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-[14.5px] font-semibold text-admin-ink">{i.name}</h3>
                  <p className="text-[12.5px] text-admin-ink-3">{i.role}</p>
                </div>
              </div>
              <StatusBadge status={statusOf(i.key) ?? (i.connected ? "active" : "inactive")} />
            </div>

            <p className="text-[13px] leading-relaxed text-admin-ink-2">{i.detail}</p>

            {i.action && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-[#fdf8ee] px-3 py-2 text-[12.5px] leading-relaxed text-[#7a5b12]">
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {i.action}
              </p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

export { Plug, ago, CardHeader };

import { Activity, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, Callout, Card, CardHeader, PageHeader, Skeleton } from "../../console/Ui";
import { StatusBadge } from "../../console/StatusBadge";
import { useTable } from "../lib/adminData";
import { ago } from "../../console/format";

type Service = {
  key: string;
  label_fr: string;
  status: string;
  detail_fr: string | null;
  checked_at: string;
  position: number;
};

const TONE: Record<string, { ring: string; dot: string; text: string }> = {
  operational: { ring: "border-[#d7e6d9]", dot: "bg-[#15803d]", text: "text-[#15803d]" },
  degraded: { ring: "border-[#f3e2c4]", dot: "bg-amber-500", text: "text-[#a16207]" },
  outage: { ring: "border-[#f0cfcd]", dot: "bg-[#b3261e]", text: "text-[#b3261e]" },
  maintenance: { ring: "border-admin-line", dot: "bg-admin-ink-3", text: "text-admin-ink-3" },
};

/** Spec §50. */
export function SystemHealth() {
  const { rows, loading, error, reload } = useTable<Service>({
    from: "system_services",
    sort: { col: "position", dir: "asc" },
    pageSize: 50,
  });

  const down = rows.filter(s => s.status === "outage");
  const degraded = rows.filter(s => s.status === "degraded" || s.status === "maintenance");
  const allGood = rows.length > 0 && down.length === 0 && degraded.length === 0;

  return (
    <>
      <PageHeader
        title="État du système"
        subtitle="Services dont dépend la plateforme."
        actions={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Actualiser
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <>
          <div
            className={cn(
              "mb-5 flex items-center gap-3 rounded-xl border px-5 py-4",
              down.length > 0
                ? "border-[#f0cfcd] bg-[#fdf3f2]"
                : degraded.length > 0
                  ? "border-[#f3e2c4] bg-[#fdf8ee]"
                  : "border-[#d7e6d9] bg-[#eef7f0]",
            )}
          >
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-content-center rounded-full bg-white",
                down.length > 0 ? "text-[#b3261e]" : degraded.length > 0 ? "text-[#a16207]" : "text-[#15803d]",
              )}
            >
              {allGood ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Activity className="h-5 w-5" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold text-admin-ink">
                {down.length > 0
                  ? `${down.length} service(s) en panne`
                  : degraded.length > 0
                    ? `${degraded.length} service(s) dégradé(s)`
                    : "Tous les systèmes sont opérationnels"}
              </p>
              <p className="text-[13px] text-admin-ink-2">
                {down.length > 0
                  ? down.map(s => s.label_fr).join(", ")
                  : degraded.length > 0
                    ? degraded.map(s => s.label_fr).join(", ")
                    : "Aucun incident en cours."}
              </p>
            </div>
          </div>

          {error && <Callout tone="warning">{error}</Callout>}

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(s => {
              const tone = TONE[s.status] ?? TONE.maintenance;
              return (
                <Card key={s.key} className={cn("flex items-start gap-3", tone.ring)}>
                  <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-semibold text-admin-ink">{s.label_fr}</p>
                      <StatusBadge status={s.status} />
                    </div>
                    {s.detail_fr && (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-admin-ink-2">{s.detail_fr}</p>
                    )}
                    <p className="mt-1.5 text-[11.5px] text-admin-ink-3">Vérifié {ago(s.checked_at)}</p>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="mt-5">
            <Card>
              <CardHeader title="Comment ces états sont établis" />
              <p className="text-[13px] leading-relaxed text-admin-ink-2">
                Les états sont tenus à jour manuellement dans la table <code className="rounded bg-admin-canvas px-1.5 py-0.5 text-[12px]">system_services</code>{" "}
                et reflètent ce que l'équipe sait de chaque dépendance. Les deux services actuellement
                signalés le sont pour une raison réelle : le fournisseur de courriel intégré est limité en
                débit tant qu'un SMTP personnalisé n'est pas configuré, et aucun fournisseur SMS n'est
                branché. Une sonde automatique remplacera cette saisie manuelle quand les fonctions Edge de
                surveillance seront en place.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

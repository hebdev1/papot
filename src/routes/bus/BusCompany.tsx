import { Link, useParams } from "react-router-dom";
import { formatUsd } from "../../lib/currency";
import { usePageMeta, siteOrigin } from "../../lib/seo";
import { useBusCompany, busDuration, busTime, citySlug } from "../../lib/bus";

/**
 * La page publique d'une compagnie d'autocars.
 *
 * `bus_company_public` answers only for an **active** company with at least
 * one published route, and returns null otherwise — so a suspended company's
 * page stops existing rather than rendering an empty shell that still ranks.
 *
 * The fleet appears as a count, never as vehicles: a plate and a fleet number
 * are operational details a competitor would enjoy and a passenger cannot use.
 */

export function BusCompany() {
  const { slug } = useParams<{ slug: string }>();
  const { company, loading } = useBusCompany(slug);

  usePageMeta(
    company ? `${company.name} — autocars` : null,
    company
      ? `${company.name} dessert ${company.routes.length} trajet(s) en Haïti. Horaires, tarifs et billets en ligne sur PAPOT.`
      : null,
    company ? `${siteOrigin()}/autocar/${company.slug}` : null,
  );

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="h-64 rounded-2xl bg-white/60 animate-pulse" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <span className="text-4xl block mb-3" aria-hidden>🚌</span>
        <h1 className="font-display text-2xl font-bold text-[#002089] mb-2">
          Cette compagnie n'est pas disponible
        </h1>
        <p className="text-[#7a6355] text-sm mb-6">
          Elle n'a aucun trajet publié pour le moment, ou le lien n'est plus valable.
        </p>
        <Link
          to="/bus"
          className="inline-flex bg-[#002089] hover:bg-[#001b6e] text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          Voir tous les autocars
        </Link>
      </div>
    );
  }

  const reviews = company.reviews ?? { count: 0, rating: null };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 lg:py-10">
      <nav className="text-[12.5px] text-[#7a6355] mb-4">
        <Link to="/bus" className="hover:underline">Autocars</Link>
        <span className="mx-1.5">/</span>
        <span className="text-[#3E2C23]">{company.name}</span>
      </nav>

      <header className="bg-white rounded-2xl border border-[#e2d5c3] p-6 mb-4">
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#002089]">
          {company.name}
        </h1>
        <p className="text-[13px] text-[#7a6355] mt-1">
          {[company.city, company.country].filter(Boolean).join(", ")}
          {reviews.count > 0 && (
            <> · ★ {Number(reviews.rating).toFixed(1)} ({reviews.count} avis)</>
          )}
        </p>

        <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-[#e2d5c3]">
          <Fact label="Trajets" value={String(company.routes.length)} />
          <Fact label="Autocars" value={String(company.coaches)} />
          <Fact label="Gares" value={String(company.terminals)} />
        </div>
      </header>

      <h2 className="font-display text-lg font-bold text-[#3E2C23] mb-3">
        Trajets desservis
      </h2>

      {company.routes.length === 0 ? (
        <p className="text-[13px] text-[#7a6355]">Aucun trajet publié.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {company.routes.map(r => (
            <li
              key={r.listing_id}
              className="bg-white rounded-2xl border border-[#e2d5c3] p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-[180px]">
                <p className="font-display font-bold text-[#002089]">{r.name}</p>
                <p className="text-[12.5px] text-[#7a6355] mt-0.5">
                  {r.next ? (
                    <>
                      Prochain départ le{" "}
                      {new Date(`${r.next.departs_on}T12:00:00`).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                      })}{" "}
                      à {busTime(r.next.departs_at)} · {busDuration(r.next.duration_minutes)}
                    </>
                  ) : (
                    // Said plainly rather than hidden: a route with no dates on
                    // sale is a route you cannot buy today.
                    <>Aucun départ en vente pour le moment</>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-display font-bold text-[#3E2C23] tabular-nums">
                  {formatUsd(r.price)}
                </span>
                {r.from && r.to ? (
                  <Link
                    to={`/bus/${citySlug(r.from)}/${citySlug(r.to)}`}
                    className="bg-[#002089] hover:bg-[#001b6e] text-white text-[13px] font-bold px-4 py-2 rounded-xl transition-colors"
                  >
                    Voir les départs
                  </Link>
                ) : (
                  <Link
                    to="/bus"
                    className="bg-[#002089] hover:bg-[#001b6e] text-white text-[13px] font-bold px-4 py-2 rounded-xl transition-colors"
                  >
                    Chercher
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#7a6355]">{label}</p>
      <p className="font-display font-bold text-[#3E2C23] text-xl tabular-nums">{value}</p>
    </div>
  );
}

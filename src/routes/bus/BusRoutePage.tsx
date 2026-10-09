import { Link, Navigate, useParams } from "react-router-dom";
import { usePageMeta, siteOrigin } from "../../lib/seo";
import { useBusCities, citySlug } from "../../lib/bus";

/**
 * `/bus/port-au-prince/cap-haitien` — l'adresse qu'on partage.
 *
 * A shareable, indexable address for a city pair, which `/bus?from=…&to=…`
 * cannot be: a query string reads as a session, not as a page about a route.
 *
 * Two segments rather than the one the plan sketched (`:from-to-:to`): Haitian
 * city names contain hyphens — Port-au-Prince, Cap-Haïtien — so a single
 * segment could not be split back into two cities without guessing.
 *
 * The cities come from `bus_cities_served`, never from a list in this file.
 * A pair nobody serves says so and offers the ones that exist, instead of
 * showing an empty result for a route that was never going to have one.
 */

export function BusRoutePage() {
  const { from, to } = useParams<{ from: string; to: string }>();
  const { cities, loading } = useBusCities();

  const origin = cities.find(c => citySlug(c.city) === from && c.as_origin > 0);
  const destination = cities.find(c => citySlug(c.city) === to && c.as_destination > 0);

  usePageMeta(
    origin && destination ? `Autocar ${origin.city} → ${destination.city}` : "Autocars en Haïti",
    origin && destination
      ? `Horaires, tarifs et billets d'autocar entre ${origin.city} et ${destination.city}. Réservation en ligne sur PAPOT.`
      : "Comparez les compagnies d'autocars en Haïti et achetez votre billet en ligne.",
    `${siteOrigin()}/bus/${from}/${to}`,
  );

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="h-40 rounded-2xl bg-white/60 animate-pulse" />
      </div>
    );
  }

  if (origin && destination) {
    const q = new URLSearchParams({ from: origin.city, to: destination.city });
    return <Navigate to={`/bus?${q.toString()}`} replace />;
  }

  const origins = cities.filter(c => c.as_origin > 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="font-display text-2xl font-bold text-[#002089] mb-2">
        Ce trajet n'est pas desservi
      </h1>
      <p className="text-[13.5px] text-[#7a6355] mb-6">
        Aucune compagnie ne relie ces deux villes sur PAPOT pour le moment.
      </p>

      {origins.length > 0 && (
        <>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#7a6355] mb-2">
            Villes de départ desservies
          </p>
          <ul className="flex flex-wrap gap-2 mb-6">
            {origins.map(c => (
              <li key={c.city}>
                <Link
                  to={`/bus?from=${encodeURIComponent(c.city)}`}
                  className="inline-flex bg-white border border-[#e2d5c3] hover:border-[#002089] text-[13px] text-[#3E2C23] px-3 py-1.5 rounded-xl transition-colors"
                >
                  {c.city}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <Link
        to="/bus"
        className="inline-flex bg-[#002089] hover:bg-[#001b6e] text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
      >
        Chercher un autocar
      </Link>
    </div>
  );
}

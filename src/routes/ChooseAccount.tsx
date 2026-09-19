import { Link } from "react-router-dom";
import { ArrowRight, Building2, Compass } from "lucide-react";

/**
 * Canvas 2z — "Se connecter" asks which side you are on first.
 *
 * PAPOT has two audiences with two different destinations: a traveller lands on
 * the site, a partner lands on their business dashboard. One sign-in button that
 * always went to the traveller flow left partners with no way in at all — the
 * dashboard existed and nothing pointed to it.
 *
 * This is a router, not a gate: both paths lead to a real sign-in form, and the
 * account itself decides what it can reach.
 */

const OPTIONS = [
  {
    to: "/login",
    icon: Compass,
    eyebrow: "Voyageur",
    title: "Je réserve",
    body: "Retrouvez vos réservations, vos voyages et vos favoris.",
    cta: "Espace voyageur",
    accent: "#002089",
    tint: "#D6F0FB",
    tintText: "#00508a",
  },
  {
    to: "/partenaire",
    icon: Building2,
    eyebrow: "Partenaire",
    title: "J'accueille",
    body: "Gérez vos annonces, vos réservations, vos tarifs et vos revenus.",
    cta: "Espace partenaire",
    accent: "#e76f2e",
    tint: "#E9F9FE",
    tintText: "#7a6355",
  },
];

export function ChooseAccount() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#E9F9FE] px-4 py-10">
      <Link to="/" className="mb-8 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e76f2e]">
          <span className="font-display text-base font-black leading-none text-white">P</span>
        </span>
        <span className="font-display text-2xl font-black tracking-tight text-[#002089]">PAPOT</span>
      </Link>

      <div className="mb-8 text-center">
        <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-[#002089] sm:text-[32px]">
          Comment souhaitez-vous continuer&nbsp;?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-[#7a6355]">
          Choisissez votre espace. Vous pourrez passer de l'un à l'autre à tout moment.
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {OPTIONS.map(o => (
          <Link
            key={o.to}
            to={o.to}
            className="group flex flex-col rounded-2xl border-2 border-[#e2d5c3] bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#002089] hover:shadow-[0_10px_28px_rgba(62,44,35,.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ad7fb] focus-visible:ring-offset-2"
          >
            <span
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: o.tint, color: o.tintText }}
            >
              <o.icon className="h-5 w-5" aria-hidden />
            </span>

            <span
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: o.accent }}
            >
              {o.eyebrow}
            </span>
            <span className="mt-1 font-display text-[22px] font-extrabold leading-tight text-[#3E2C23]">
              {o.title}
            </span>
            <span className="mt-2 flex-1 text-[13.5px] leading-relaxed text-[#7a6355]">{o.body}</span>

            <span
              className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold"
              style={{ color: o.accent }}
            >
              {o.cta}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-[13.5px] text-[#7a6355]">
        Pas encore de compte&nbsp;?{" "}
        <Link to="/signup" className="font-bold text-[#002089] hover:underline">
          S'inscrire
        </Link>
        <span className="mx-2 text-[#e2d5c3]">·</span>
        <Link to="/" className="font-medium text-[#7a6355] hover:text-[#002089]">
          Retour au site
        </Link>
      </p>
    </div>
  );
}

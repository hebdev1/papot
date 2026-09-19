import { Icon } from "./Icon";

/**
 * The "become a partner" section on the home page.
 *
 * Extracted from PartnerModal.tsx, which also held a self-contained
 * application form superseded by the 15-step PartnerOnboarding wizard. That
 * form wrote a `details` column that does not exist on partner_applications
 * and omitted three NOT NULL columns, so it could only ever have failed at
 * runtime, and nothing rendered it. Only this section was reachable, so it now
 * lives on its own and the dead form is gone.
 *
 * The three cards are presentation only: choosing a type happens inside the
 * wizard, which owns the real list of partner types.
 */
const PARTNER_TYPES = [
  {
    id: "guesthouse",
    emoji: "\u{1F3E1}",
    label: "Maison d'h\u00f4tes",
    description:
      "Chambres d'h\u00f4tes, B&B, villas priv\u00e9es \u2014 accueillez des voyageurs dans votre espace.",
    img: "https://images.unsplash.com/photo-1783835541391-f632e3393397?w=600&h=400&fit=crop&auto=format",
  },
  {
    id: "restaurant",
    emoji: "\u{1F37D}\uFE0F",
    label: "Restaurant",
    description:
      "Tables gastronomiques, bistrots, terrasses \u2014 proposez vos tables \u00e0 la r\u00e9servation.",
    img: "https://images.unsplash.com/photo-1574966739987-65e38db0f7ce?w=600&h=400&fit=crop&auto=format",
  },
  {
    id: "car",
    emoji: "\u{1F697}",
    label: "Location de voiture",
    description: "Citadines, SUV, v\u00e9hicules de luxe \u2014 mettez votre flotte en location.",
    img: "https://images.unsplash.com/photo-1533558701576-23c65e0272fb?w=600&h=400&fit=crop&auto=format",
  },
];

export function PartnerSection({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="py-10 lg:py-12 px-4 lg:px-8">
      {/* Section header */}
      <div className="text-center mb-8">
        <p className="text-xs font-semibold text-[#e76f2e] uppercase tracking-widest mb-2">Rejoignez notre réseau</p>
        <h2 className="font-display text-3xl lg:text-4xl font-bold text-[#3E2C23] mb-3">
          Vous avez un établissement ?<br />Rejoignez PAPOT.
        </h2>
        <p className="text-[#7a6355] max-w-xl mx-auto text-sm leading-relaxed">
          Maisons d'hôtes, restaurants, loueurs de voitures — mettez votre établissement en ligne en moins de 10 minutes et touchez des millions de voyageurs.
        </p>
      </div>

      {/* 3 type cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto mb-7">
        {PARTNER_TYPES.map(type => (
          <button
            key={type.id}
            onClick={onOpen}
            className="group relative rounded-2xl overflow-hidden text-left h-64 bg-[#C5E9F8] hover:shadow-2xl hover:shadow-[rgba(0,32,137,0.15)] transition-all duration-300"
          >
            <img src={type.img} alt={type.label} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/>
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,32,137,0.85)] via-[rgba(0,32,137,0.3)] to-transparent"/>
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <span className="text-3xl block mb-2">{type.emoji}</span>
              <h3 className="font-display font-bold text-white text-xl mb-1">{type.label}</h3>
              <p className="text-[#6ad7fb] text-xs leading-relaxed mb-3">{type.description.split("—")[0]}</p>
              <span className="inline-flex items-center gap-1.5 bg-[#e76f2e] text-white text-xs font-bold px-3 py-1.5 rounded-full group-hover:bg-white group-hover:text-[#e76f2e] transition-colors">
                Commencer <Icon.ArrowRight />
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Stats band */}
      <div className="max-w-5xl mx-auto bg-[#002089] rounded-2xl p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        {[
          { value: "18 000+", label: "Partenaires actifs" },
          { value: "8%", label: "Commission seulement" },
          { value: "48h", label: "Premier paiement reçu" },
          { value: "2M+", label: "Voyageurs / mois" },
        ].map(stat => (
          <div key={stat.label}>
            <p className="font-display font-black text-[#6ad7fb] text-2xl">{stat.value}</p>
            <p className="text-[#a8d8f0] text-xs mt-1 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

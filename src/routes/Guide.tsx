import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BedDouble,
  Car,
  CreditCard,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Ticket,
  UtensilsCrossed,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAiEnabled } from "../lib/aiChat";

/**
 * How PAPOT works, start to finish.
 *
 * The help screen was eight buttons that did nothing and a note meant for a
 * developer — "les tickets nécessitent une table support_tickets" — shown to
 * travellers. The footer's "Aide" link had no route at all and quietly
 * redirected to the home page.
 *
 * This is written from what the platform actually does, and two sections read
 * live state rather than assert: the demonstration card numbers only appear
 * while `demo_payments` is on, and AI Papot only appears while its flag is. A
 * guide that keeps teaching a feature after it is switched off is worse than no
 * guide, because the reader trusts it.
 *
 * What is deliberately absent: "Vols". The header offers the tab, but
 * `listing_kind` has three values — stay, restaurant, car — so a flight search
 * returns nothing. Teaching it would send people to an empty page.
 */

type Step = { title: string; body: React.ReactNode };
type Section = {
  id: string;
  label: string;
  Glyph: typeof Search;
  intro: string;
  steps: Step[];
};

const A = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="font-semibold text-[#002089] hover:underline">
    {children}
  </Link>
);

function useDemoPayments() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.rpc("demo_payments_enabled").then(({ data, error }) => {
      if (live) setOn(error ? null : Boolean(data));
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
}

export function Guide() {
  const demo = useDemoPayments();
  const { enabled: aiOn } = useAiEnabled();

  const sections: Section[] = [
    {
      id: "chercher",
      label: "Chercher",
      Glyph: Search,
      intro:
        "Tout part de la barre de recherche, sur l'accueil. Trois métiers y vivent : les hébergements, les voitures et les tables.",
      steps: [
        {
          title: "Dites où, quand, et combien vous êtes",
          body: (
            <>
              La destination, l'arrivée, le départ et le nombre de voyageurs voyagent avec vous
              jusqu'à la fiche : les prix que vous verrez sont ceux de vos dates, pas d'un exemple.
              Vous pouvez les changer à tout moment sans repartir de zéro.
            </>
          ),
        },
        {
          title: "Affinez dans les résultats",
          body: (
            <>
              La colonne de gauche filtre par prix, par type, par équipements et par politique
              d'annulation. Chaque métier a ses propres filtres — une voiture se filtre par boîte
              et par carburant, un restaurant par cuisine.{" "}
              <A to="/search?kind=stay">Voir les hébergements</A>.
            </>
          ),
        },
      ],
    },
    {
      id: "choisir",
      label: "Choisir",
      Glyph: BedDouble,
      intro: "La fiche est l'endroit où l'on décide. Tout y est daté, et rien n'y est supposé.",
      steps: [
        {
          title: "La disponibilité est réelle",
          body: (
            <>
              Une chambre déjà prise à vos dates le dit et ne se laisse pas réserver ; quand il en
              reste peu, la fiche vous le signale — mais seulement si des chambres sont réellement
              parties, jamais pour vous presser. « Retirée de la vente » veut dire autre chose :
              l'établissement ne la propose plus du tout.
            </>
          ),
        },
        {
          title: "Les offres",
          body: (
            <>
              Un établissement peut réunir plusieurs prestations sous un seul prix — une chambre
              avec le petit-déjeuner, une voiture avec chauffeur. L'économie n'est affichée que
              lorsque chaque élément a un tarif : sans quoi il n'y a pas de chiffre à annoncer, et
              PAPOT n'en invente pas.
            </>
          ),
        },
        {
          title: "« Réserver » mène à la fiche",
          body: (
            <>
              Depuis une carte de résultat, les deux boutons mènent au même endroit. C'est voulu :
              une carte ne connaît ni votre chambre, ni vos dates, ni le nombre de voyageurs. Le
              choix se fait sur la fiche, et c'est là que la disponibilité est vérifiée.
            </>
          ),
        },
      ],
    },
    {
      id: "panier",
      label: "Le panier",
      Glyph: ShoppingBag,
      intro: "Un séjour, une voiture et des tables peuvent voyager ensemble et se régler en une fois.",
      steps: [
        {
          title: "Ajoutez ce que vous voulez",
          body: (
            <>
              Chaque fiche propose de compléter le voyage avec les autres métiers, en gardant vos
              dates. Deux dîners à deux soirs différents comptent pour deux lignes : rien ne
              remplace rien.
            </>
          ),
        },
        {
          title: "Vérifiez avant de payer",
          body: (
            <>
              <A to="/panier">Votre panier</A> montre chaque ligne avec ses dates et son prix, et
              permet d'en retirer une sans toucher au reste. Le montant y est une attente : il est
              recalculé au moment du paiement, à partir des tarifs de l'établissement.
            </>
          ),
        },
      ],
    },
    {
      id: "payer",
      label: "Payer",
      Glyph: CreditCard,
      intro: "Un seul paiement pour tout le panier, par carte ou par mobile.",
      steps: [
        {
          title: "Carte, MonCash ou NatCash",
          body: (
            <>
              Le total est recomposé côté serveur à partir du catalogue, donc le chiffre annoncé
              est celui qui est débité. Chaque établissement du panier reçoit sa part séparément —
              vous, vous ne payez qu'une fois.
            </>
          ),
        },
        ...(demo
          ? [
              {
                title: "Le site est en mode démonstration",
                body: (
                  <>
                    Aucune vraie carte n'est acceptée et rien n'est débité. Pour parcourir le
                    parcours complet, y compris les refus, utilisez ces numéros :
                    <ul className="mt-2.5 flex flex-col gap-1.5">
                      {[
                        ["4242 4242 4242 4242", "paiement accepté"],
                        ["4000 0000 0000 0002", "carte refusée"],
                        ["4000 0000 0000 9995", "provision insuffisante"],
                        ["4000 0000 0000 0069", "carte expirée"],
                        ["+509 0000 0000", "mobile accepté"],
                        ["+509 0000 0001", "refusé par l'opérateur"],
                        ["+509 0000 0002", "solde insuffisant"],
                      ].map(([n, effet]) => (
                        <li key={n} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                          <code className="rounded bg-[#D6F0FB] px-1.5 py-0.5 font-mono text-[#002089]">
                            {n}
                          </code>
                          <span className="text-[#7a6355]">{effet}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ),
              },
            ]
          : []),
        {
          title: "Un compte, si vous le voulez",
          body: (
            <>
              La case au moment du paiement crée votre compte avec la réservation, pour que vous
              puissiez la suivre. Vous pouvez la décocher : la réservation se fait quand même, et
              vous pourrez la rattacher plus tard en créant un compte avec la même adresse.
            </>
          ),
        },
      ],
    },
    {
      id: "apres",
      label: "Après la réservation",
      Glyph: Ticket,
      intro: "Votre référence commence par PPT. Gardez-la : c'est elle que le support demande.",
      steps: [
        {
          title: "Retrouver une réservation",
          body: (
            <>
              La page de confirmation se rouvre avec la référence <em>et</em> le courriel utilisé.
              Les deux sont demandés : une référence seule ne suffit pas à ouvrir le dossier de
              quelqu'un d'autre. Si vous êtes connecté avec l'adresse de la réservation, elle
              s'affiche sans rien saisir.
            </>
          ),
        },
        {
          title: "Votre espace",
          body: (
            <>
              <A to="/compte/voyages">Voyages</A> regroupe vos réservations par séjour,{" "}
              <A to="/compte/reservations">Réservations</A> les liste une par une, et{" "}
              <A to="/compte/paiements">Paiements</A> garde chaque reçu. Les{" "}
              <A to="/compte/favoris">favoris</A> gardent une fiche de côté sans la réserver.
            </>
          ),
        },
      ],
    },
    {
      id: "manger",
      label: "Commander un repas",
      Glyph: UtensilsCrossed,
      intro: "Certains restaurants prennent la commande en ligne, en plus de la table.",
      steps: [
        {
          title: "Composer et commander",
          body: (
            <>
              Sur la fiche d'un restaurant qui l'accepte, la carte se parcourt par section. Les
              plats à choix — une taille, des accompagnements — s'ouvrent avant d'être ajoutés, et
              le prix suit ce que vous choisissez. La livraison dépend de votre zone.
            </>
          ),
        },
        {
          title: "Suivre la commande",
          body: (
            <>
              Le suivi se fait avec la référence de la commande et le numéro de téléphone laissé au
              restaurant. Tant qu'elle n'est pas acceptée, vous pouvez l'annuler en ligne ; après,
              il faut appeler.
            </>
          ),
        },
      ],
    },
    ...(aiOn
      ? [
          {
            id: "ai",
            label: "AI Papot",
            Glyph: Sparkles,
            intro: "Un assistant qui cherche dans PAPOT et explique ce qu'il trouve.",
            steps: [
              {
                title: "Ce qu'il fait, et ce qu'il ne fait pas",
                body: (
                  <>
                    Dites où vous voulez aller, combien vous êtes et le budget à ne pas dépasser :
                    il cherche dans le catalogue et compare. Il ne réserve rien et ne paie rien —
                    la réservation reste un geste que vous faites vous-même, sur la fiche.{" "}
                    <A to="/planifier">Ouvrir AI Papot</A>.
                  </>
                ),
              },
            ],
          } as Section,
        ]
      : []),
    {
      id: "partenaire",
      label: "Inscrire son établissement",
      Glyph: Store,
      intro: "Hôtels, maisons d'hôtes, restaurants et loueurs de véhicules peuvent vendre sur PAPOT.",
      steps: [
        {
          title: "Déposer une candidature",
          body: (
            <>
              Le formulaire demande l'entreprise, ses documents, ses photos et ce qu'elle propose —
              chambres, véhicules ou carte. Il se remplit en plusieurs étapes et se reprend là où
              vous l'avez laissé. <A to="/?partner=1">Proposer mon établissement</A>.
            </>
          ),
        },
        {
          title: "Une fois accepté",
          body: (
            <>
              Vos annonces sont créées à partir de ce que le dossier décrivait, en brouillon : vous
              les complétez et vous les publiez vous-même. Rien n'est inventé à votre place — un
              équipement que le formulaire n'a pas demandé n'apparaîtra pas sur votre fiche.
            </>
          ),
        },
        {
          title: "Le tableau de bord",
          body: (
            <>
              <A to="/partenaire">L'espace partenaire</A> tient le calendrier et les
              disponibilités, les réservations, la carte et le stock pour un restaurant, les offres
              groupées, et les revenus avec la commission déjà déduite. Une date sans règle est
              considérée disponible : vous ne bloquez que ce qui doit l'être.
            </>
          ),
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Sommaire — sur écran large il reste visible pendant la lecture. */}
      <nav aria-label="Sommaire" className="w-full lg:w-56 shrink-0 lg:sticky lg:top-24">
        <p className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold mb-2">
          Sur cette page
        </p>
        <ul className="flex flex-wrap lg:flex-col gap-1.5">
          {sections.map(s => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-medium text-[#002089] hover:bg-white transition-colors"
              >
                <s.Glyph className="h-4 w-4 shrink-0" aria-hidden />
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 min-w-0 flex flex-col gap-8">
        {sections.map(section => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-[#002089] flex items-center gap-2.5">
              <section.Glyph className="h-5 w-5 shrink-0" aria-hidden />
              {section.label}
            </h2>
            <p className="text-[15px] text-[#3E2C23] mt-1.5 leading-relaxed">{section.intro}</p>

            <ol className="mt-4 flex flex-col gap-3">
              {section.steps.map((step, i) => (
                <li
                  key={step.title}
                  className="bg-white rounded-2xl border border-[#e2d5c3] p-5 flex gap-4"
                >
                  {/* The number is the order you do these in, which is real
                      information — not decoration. */}
                  <span className="grid h-7 w-7 shrink-0 place-content-center rounded-full bg-[#D6F0FB] font-display text-[13px] font-bold text-[#002089] tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-[#3E2C23]">{step.title}</h3>
                    <div className="text-[14px] text-[#7a6355] mt-1 leading-relaxed">{step.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <section className="bg-[#D6F0FB] rounded-2xl p-5">
          <h2 className="font-display text-lg font-bold text-[#002089]">Il reste un problème ?</h2>
          <p className="text-[14px] text-[#00508a] mt-1.5 leading-relaxed">
            Les coordonnées de l'établissement se trouvent sur le détail de votre réservation, dans{" "}
            <A to="/compte/reservations">vos réservations</A> — pour une arrivée tardive, une
            allergie ou un changement de dernière minute, c'est le chemin le plus court. Les
            conditions d'annulation sont rappelées sur chaque fiche avant le paiement.
          </p>
        </section>
      </div>
    </div>
  );
}

/** La page publique : lisible sans compte, puisque c'est avant d'en avoir un qu'on se demande comment ça marche. */
export function GuidePage() {
  return (
    <main className="max-w-6xl mx-auto px-4 lg:px-8 py-8 lg:py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-[#002089]">Comment ça marche</h1>
        <p className="text-[15px] text-[#3E2C23] mt-2 max-w-2xl leading-relaxed">
          Réserver un hébergement, une voiture et une table en un seul paiement, suivre une
          commande, ou inscrire votre établissement — voici le chemin pour chacun.
        </p>
      </header>
      <Guide />
    </main>
  );
}

export default GuidePage;

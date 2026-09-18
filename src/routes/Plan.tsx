import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AiConversation } from "../components/AiConversation";
import { TOOL_LABEL, useAiEnabled } from "../lib/aiChat";

/**
 * §55 — AI Papot en grand.
 *
 * Conversation à gauche, canevas du voyage à droite ; sur un écran étroit la
 * conversation prend la largeur. La conversation elle-même vit dans
 * `AiConversation`, partagée avec la bulle flottante : une seule implémentation
 * du flux, des tours et du composeur.
 *
 * Le canevas montre ce qui s'est réellement passé — les recherches faites dans
 * PAPOT. Il ne dessine pas de barre de budget, parce que rien ne calcule encore
 * un budget, et une barre remplie de chiffres inventés vaudrait moins que pas
 * de barre.
 */

export function Plan() {
  const { enabled, loading } = useAiEnabled();
  const [lookups, setLookups] = useState<string[]>([]);

  if (loading) {
    return <main className="max-w-7xl mx-auto px-4 py-16 text-[#7a6355]">Chargement…</main>;
  }

  // La route disparaît avec l'interrupteur : une passerelle fermée n'est pas
  // une page qui échoue, c'est une page qui n'est pas là.
  if (!enabled) return <Navigate to="/" replace />;

  return (
    <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-10">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <section className="flex-1 min-w-0 w-full">
          <div className="mb-5">
            <h1 className="font-display text-3xl font-bold text-[#002089]">AI Papot</h1>
            <p className="text-sm text-[#7a6355] mt-1">
              Dites où vous voulez aller, combien vous êtes et le budget que vous ne voulez pas
              dépasser.
            </p>
          </div>

          <AiConversation onLookups={setLookups} />
        </section>

        <aside className="w-full lg:w-[320px] shrink-0 lg:sticky lg:top-24">
          <div className="bg-white rounded-2xl border border-[#e2d5c3] p-5">
            <h2 className="font-display text-lg font-bold text-[#002089]">Votre voyage</h2>

            {lookups.length === 0 ? (
              <p className="text-[13px] text-[#7a6355] mt-2 leading-relaxed">
                Rien encore. Posez votre première question : ce que l'assistant consulte dans PAPOT
                s'affichera ici.
              </p>
            ) : (
              <>
                <p className="text-[13px] text-[#7a6355] mt-2 mb-2.5">
                  Ce qui a été consulté dans PAPOT :
                </p>
                <ul className="flex flex-col gap-1.5">
                  {[...new Set(lookups)].map(tool => (
                    <li key={tool} className="flex items-start gap-2 text-[13px] text-[#3E2C23]">
                      <span className="text-[#15803d] font-bold" aria-hidden>
                        ✓
                      </span>
                      <span>{(TOOL_LABEL[tool] ?? tool).replace("…", "")}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="text-[12px] text-[#7a6355] mt-4 pt-4 border-t border-[#e2d5c3] leading-relaxed">
              Le budget et l'itinéraire jour par jour arriveront à une prochaine étape. Pour
              l'instant l'assistant cherche, compare et explique — il ne réserve rien.
            </p>

            <Link
              to="/search?kind=stay"
              className="mt-4 block text-center text-sm font-semibold text-[#002089] border-2 border-[#e2d5c3] hover:border-[#002089] rounded-xl px-4 py-2.5 transition-colors"
            >
              Parcourir sans l'assistant
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

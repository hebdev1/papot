import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { TOOL_LABEL, askAi, useAiEnabled } from "../lib/aiChat";

/**
 * §55 — AI Papot.
 *
 * Conversation on the left, trip canvas on the right; on a narrow screen the
 * conversation takes the width and the canvas folds underneath.
 *
 * What the canvas shows in this phase is what actually happened: the lookups
 * the assistant really performed. It does not draw a budget bar, because
 * nothing computes a budget yet — §18's engine arrives in Faz 2, and a bar
 * filled with invented numbers would be worse than no bar at all.
 */

type Turn = {
  role: "user" | "assistant";
  text: string;
  /** Tools this turn actually called, in order. */
  lookups?: string[];
};

const SUGGESTIONS = [
  "J'ai 850 $ pour deux personnes, 4 nuits à Jacmel.",
  "Montre-moi des restaurants à Pétion-Ville.",
  "Où aller pour un week-end en amoureux ?",
  "Quelles destinations PAPOT couvre-t-il ?",
];

export function Plan() {
  const { enabled, loading } = useAiEnabled();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, status]);

  if (loading) {
    return <main className="max-w-7xl mx-auto px-4 py-20 text-[#7a6355]">Chargement…</main>;
  }

  // The route disappears with the switch, so a closed gateway is not a page
  // that fails — it is a page that is not there.
  if (!enabled) return <Navigate to="/" replace />;

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;

    setDraft("");
    setError(null);
    setBusy(true);
    setTurns(t => [...t, { role: "user", text: message }, { role: "assistant", text: "", lookups: [] }]);

    try {
      for await (const ev of askAi(message, { conversationId })) {
        if (ev.type === "open") {
          setConversationId(ev.conversationId);
        } else if (ev.type === "text") {
          setStatus(null);
          setTurns(t => {
            const next = [...t];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, text: last.text + ev.text };
            return next;
          });
        } else if (ev.type === "status") {
          setStatus(TOOL_LABEL[ev.tool] ?? "Recherche…");
          setTurns(t => {
            const next = [...t];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, lookups: [...(last.lookups ?? []), ev.tool] };
            return next;
          });
        } else if (ev.type === "error") {
          setError(ev.message);
        }
      }
    } catch {
      setError("La connexion a été interrompue. Réessayez.");
    } finally {
      setBusy(false);
      setStatus(null);
      // An answer that never arrived leaves no empty bubble behind.
      setTurns(t => (t.length && t[t.length - 1].role === "assistant" && !t[t.length - 1].text ? t.slice(0, -1) : t));
    }
  };

  const lookups = turns.flatMap(t => t.lookups ?? []);

  return (
    <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── conversation ── */}
        <section className="flex-1 min-w-0 w-full">
          <div className="mb-5">
            <h1 className="font-display text-3xl font-bold text-[#002089]">AI Papot</h1>
            <p className="text-sm text-[#7a6355] mt-1">
              Dites où vous voulez aller, combien vous êtes et le budget que vous ne voulez pas
              dépasser.
            </p>
          </div>

          {turns.length === 0 && (
            <div className="bg-white rounded-2xl border border-[#e2d5c3] p-5 mb-4">
              <p className="text-sm text-[#3E2C23] mb-3">Par exemple :</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-[13px] text-[#002089] border-2 border-[#e2d5c3] hover:border-[#002089] rounded-xl px-3 py-2 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {turns.map((t, i) => (
              <article
                key={i}
                className={
                  t.role === "user"
                    ? "self-end max-w-[85%] bg-[#002089] text-white rounded-2xl rounded-br-md px-4 py-3"
                    : "self-start max-w-[92%] bg-white border border-[#e2d5c3] rounded-2xl rounded-bl-md px-4 py-3"
                }
              >
                <p
                  className={`text-sm whitespace-pre-wrap leading-relaxed ${
                    t.role === "user" ? "text-white" : "text-[#3E2C23]"
                  }`}
                >
                  {t.text}
                </p>
              </article>
            ))}

            {status && (
              <p className="self-start text-[13px] text-[#7a6355] px-1" aria-live="polite">
                {status}
              </p>
            )}
          </div>

          {error && (
            <p className="mt-3 text-[13px] font-medium text-[#b3261e] bg-white border border-[#e2d5c3] rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div ref={endRef} />

          <form
            onSubmit={e => {
              e.preventDefault();
              void send(draft);
            }}
            className="sticky bottom-4 mt-5 flex gap-2 bg-white rounded-2xl border-2 border-[#e2d5c3] p-2 shadow-lg"
          >
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Écrivez en kreyòl, français, English o español…"
              aria-label="Votre message"
              className="flex-1 min-w-0 px-3 py-2.5 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none bg-transparent"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="shrink-0 bg-[#e76f2e] hover:bg-[#d05e20] disabled:bg-[#e2d5c3] disabled:text-[#7a6355] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              {busy ? "…" : "Envoyer"}
            </button>
          </form>
        </section>

        {/* ── trip canvas ── */}
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

            {/* Said plainly rather than mocked up: the budget and the itinerary
                are computed by engines that do not exist yet, and a canvas that
                drew them now would be drawing fiction. */}
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

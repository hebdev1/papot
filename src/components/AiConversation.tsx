import { useEffect, useRef, useState } from "react";
import { TOOL_LABEL, askAi } from "../lib/aiChat";

/**
 * The conversation itself, without a frame around it.
 *
 * It is used twice — full width at /planifier, and inside the floating panel —
 * so there is one implementation of the stream, the turns and the composer. Two
 * copies would drift, and the one that drifted would be the one nobody tested.
 */

export type Turn = {
  role: "user" | "assistant";
  text: string;
  lookups?: string[];
};

const SUGGESTIONS = [
  "J'ai 850 $ pour deux personnes, 4 nuits à Jacmel.",
  "Montre-moi des restaurants à Pétion-Ville.",
  "Où aller pour un week-end en amoureux ?",
  "Quelles destinations PAPOT couvre-t-il ?",
];

export function AiConversation({
  compact = false,
  onLookups,
}: {
  /** Inside the floating panel: tighter spacing, fewer suggestions. */
  compact?: boolean;
  /** Lets a host draw what the assistant actually looked up. */
  onLookups?: (tools: string[]) => void;
}) {
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

  useEffect(() => {
    onLookups?.(turns.flatMap(t => t.lookups ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

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
      setTurns(t =>
        t.length && t[t.length - 1].role === "assistant" && !t[t.length - 1].text ? t.slice(0, -1) : t,
      );
    }
  };

  const shown = compact ? SUGGESTIONS.slice(0, 2) : SUGGESTIONS;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 ${compact ? "px-4 py-3" : ""}`}>
        {turns.length === 0 && (
          <div className={compact ? "" : "bg-white rounded-2xl border border-[#e2d5c3] p-5"}>
            <p className="text-sm text-[#3E2C23] mb-3">Par exemple :</p>
            <div className="flex flex-wrap gap-2">
              {shown.map(s => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="text-left text-[13px] text-[#002089] border-2 border-[#e2d5c3] hover:border-[#002089] rounded-xl px-3 py-2 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

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

        {error && (
          <p className="text-[13px] font-medium text-[#b3261e] bg-white border border-[#e2d5c3] rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          void send(draft);
        }}
        className={`flex gap-2 bg-white rounded-2xl border-2 border-[#e2d5c3] p-2 ${
          compact ? "m-3 mt-0" : "sticky bottom-4 mt-5 shadow-lg"
        }`}
      >
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Kreyòl, français, English o español…"
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
    </div>
  );
}

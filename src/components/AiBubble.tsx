import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AiConversation } from "./AiConversation";
import { useAiEnabled } from "../lib/aiChat";

/**
 * AI Papot, reachable from wherever the traveller already is.
 *
 * A floating button that only navigated to /planifier would be the hero link
 * with a shadow. What makes the bubble worth its place on every page is that
 * the question can be asked without leaving the fiche being read — so it opens
 * the conversation in place.
 *
 * It appears on the public site only. The admin and partner consoles are work
 * surfaces with their own dense chrome, and a travel assistant has nothing to
 * say to someone approving a listing.
 */
export function AiBubble() {
  const { enabled } = useAiEnabled();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);

  // The page that *is* the assistant does not need a button to reach it.
  if (!enabled || pathname === "/planifier") return null;

  return (
    <>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="AI Papot"
          className="fixed z-50 flex flex-col bg-[#DAF5FE] shadow-2xl border border-[#e2d5c3]
                     inset-x-3 bottom-3 top-16 rounded-2xl
                     sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-24 sm:w-[380px] sm:h-[min(560px,70vh)]"
        >
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e2d5c3] shrink-0">
            <div className="min-w-0">
              <p className="font-display font-bold text-[#002089] leading-tight">AI Papot</p>
              <p className="text-[12px] text-[#7a6355] truncate">
                Il cherche dans PAPOT — il ne réserve rien.
              </p>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              aria-label="Fermer AI Papot"
              className="shrink-0 h-8 w-8 rounded-full text-[#7a6355] hover:bg-white hover:text-[#002089] transition-colors text-lg leading-none"
            >
              ×
            </button>
          </header>

          <AiConversation compact />

          <Link
            to="/planifier"
            onClick={() => setOpen(false)}
            className="shrink-0 text-center text-[12.5px] font-semibold text-[#002089] hover:underline px-4 pb-3"
          >
            Ouvrir en grand
          </Link>
        </div>
      )}

      <button
        ref={trigger}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={open ? "Fermer AI Papot" : "Ouvrir AI Papot"}
        className="fixed z-50 right-4 bottom-4 sm:right-5 sm:bottom-5 flex items-center gap-2
                   bg-[#002089] hover:bg-[#001a6e] text-white font-bold
                   rounded-full pl-4 pr-5 py-3 shadow-xl shadow-[rgba(0,32,137,0.3)]
                   transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6ad7fb]/50"
      >
        <span aria-hidden className="text-base leading-none">
          {open ? "×" : "✨"}
        </span>
        {/* The word is what tells a first-time visitor what the bubble is; a
            bare icon leaves them guessing. It folds away where width is scarce. */}
        <span className="text-sm hidden sm:inline">
          {open ? "Fermer" : "Planifier"}
        </span>
      </button>
    </>
  );
}

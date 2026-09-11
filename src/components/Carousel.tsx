import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Horizontal scroller used by the homepage sections.
 * Native scroll-snap does the work; the arrows page by one viewport width and
 * hide themselves when there is nothing left to scroll.
 */
export function Carousel({
  children,
  ariaLabel,
}: {
  children: React.ReactNode;
  ariaLabel: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = () => {
    const el = track.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  };

  useEffect(() => {
    sync();
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.9), behavior: "smooth" });
  };

  const arrow =
    "w-9 h-9 rounded-full bg-white border border-[#e2d5c3] flex items-center justify-center text-[#002089] shadow-sm transition-colors hover:border-[#002089] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-[#e2d5c3]";

  return (
    <div className="relative">
      <div className="flex justify-end gap-2 mb-3">
        <button onClick={() => page(-1)} disabled={atStart} className={arrow} aria-label="Précédent">
          <Icon.ArrowLeft />
        </button>
        <button onClick={() => page(1)} disabled={atEnd} className={arrow} aria-label="Suivant">
          <Icon.ArrowRight />
        </button>
      </div>
      <div
        ref={track}
        onScroll={sync}
        aria-label={ariaLabel}
        className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}

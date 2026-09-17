import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import {
  MAX_ADULTS,
  MAX_CHILDREN,
  formatGuests,
  type Guests,
} from "../lib/guests";

/**
 * The travellers control.
 *
 * It looked like a dropdown and was a `<span>` with a chevron — a chevron is a
 * promise, and this one was not kept. Now it opens, counts, and closes; the
 * value it holds is the one that reaches the booking.
 */
export function GuestsPicker({
  value,
  onChange,
  label = "Voyageurs",
  className = "",
}: {
  value: Guests;
  onChange: (g: Guests) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={box}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="w-full flex flex-col gap-1 px-3 py-2 rounded-xl border-2 border-[#e2d5c3] hover:border-[#002089] focus-visible:border-[#6ad7fb] focus-visible:outline-none transition-colors text-left"
      >
        <span className="text-[10px] font-semibold text-[#7a6355] uppercase tracking-wide">{label}</span>
        <span className="flex items-center gap-2">
          <Icon.Users />
          <span className="text-sm text-[#3E2C23] flex-1 truncate">{formatGuests(value)}</span>
          <Icon.ChevronDown />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choisir le nombre de voyageurs"
          className="absolute z-30 left-0 right-0 top-[calc(100%+6px)] min-w-[260px] bg-white rounded-2xl border-2 border-[#e2d5c3] shadow-xl p-3 flex flex-col gap-1"
        >
          <Stepper
            label="Adultes"
            hint="13 ans et plus"
            value={value.adults}
            min={1}
            max={MAX_ADULTS}
            onChange={n => onChange({ ...value, adults: n })}
          />
          <Stepper
            label="Enfants"
            hint="12 ans et moins"
            value={value.children}
            min={0}
            max={MAX_CHILDREN}
            onChange={n => onChange({ ...value, children: n })}
          />
        </div>
      )}
    </div>
  );
}

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const btn =
    "h-8 w-8 shrink-0 rounded-full border-2 border-[#e2d5c3] text-[#002089] font-bold leading-none transition-colors hover:border-[#002089] disabled:opacity-35 disabled:hover:border-[#e2d5c3] disabled:cursor-not-allowed";

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#3E2C23]">{label}</span>
        <span className="block text-xs text-[#7a6355]">{hint}</span>
      </span>
      <span className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Moins d'${label.toLowerCase()}`}
          className={btn}
        >
          −
        </button>
        <span aria-live="polite" className="w-5 text-center text-sm font-semibold tabular-nums text-[#3E2C23]">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`Plus d'${label.toLowerCase()}`}
          className={btn}
        >
          +
        </button>
      </span>
    </div>
  );
}

import { todayInHaiti, withCheckin, withCheckout, type StayDates } from "../lib/stayDates";

/**
 * The two dates, on the fiche.
 *
 * The booking panel printed "12 oct." and "16 oct." as plain text inside two
 * bordered boxes — they looked exactly like fields and accepted nothing. This
 * is the same two boxes, made real.
 *
 * `min` keeps the pair coherent from the browser's side, and `withCheckin` /
 * `withCheckout` keep it coherent when the browser's own date widget lets a
 * value through anyway.
 */
export function StayDatesPicker({
  value,
  onChange,
  labels = ["Arrivée", "Départ"],
  className = "",
}: {
  value: StayDates;
  onChange: (d: StayDates) => void;
  labels?: [string, string];
  className?: string;
}) {
  const box =
    "flex-1 min-w-0 flex flex-col gap-1 px-3 py-2 rounded-xl border-2 border-[#e2d5c3] focus-within:border-[#6ad7fb] transition-colors";
  const cap = "text-[10px] font-semibold text-[#7a6355] uppercase tracking-wide";
  const field = "text-sm text-[#3E2C23] outline-none bg-transparent w-full";

  return (
    <div className={`flex gap-2 ${className}`}>
      <label className={box}>
        <span className={cap}>{labels[0]}</span>
        <input
          type="date"
          value={value.checkin}
          min={todayInHaiti()}
          onChange={e => onChange(withCheckin(value, e.target.value))}
          className={field}
        />
      </label>

      <label className={box}>
        <span className={cap}>{labels[1]}</span>
        <input
          type="date"
          value={value.checkout}
          min={value.checkin}
          onChange={e => onChange(withCheckout(value, e.target.value))}
          className={field}
        />
      </label>
    </div>
  );
}

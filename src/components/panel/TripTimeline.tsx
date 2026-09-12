import { SERVICE } from "./Badges";
import { formatTime, parseDay } from "../../lib/panel";
import type { TripItem } from "../../lib/trips";

/**
 * Trip timeline (spec §6). A stay and a car each produce two events — arrival
 * and departure — so the customer sees "check in" and "check out" as separate
 * moments in the day order, exactly as the spec's Miami example does, rather
 * than one row they have to mentally unpack.
 */

type Event = {
  day: string;
  time: string | null;
  kind: TripItem["kind"];
  label: string;
  place: string | null;
  detail: string | null;
};

const CHECK_IN_TIME = "15:00:00";
const CHECK_OUT_TIME = "11:00:00";

export function buildEvents(items: TripItem[]): Event[] {
  const events: Event[] = [];

  for (const i of items) {
    if (!i.starts_on) continue;
    const place = i.location ?? i.city ?? null;

    if (i.kind === "stay") {
      events.push({
        day: i.starts_on, time: CHECK_IN_TIME, kind: i.kind,
        label: `Arrivée · ${i.title}`, place, detail: null,
      });
      if (i.ends_on && i.ends_on !== i.starts_on) {
        events.push({
          day: i.ends_on, time: CHECK_OUT_TIME, kind: i.kind,
          label: `Départ · ${i.title}`, place, detail: null,
        });
      }
    } else if (i.kind === "car") {
      events.push({
        day: i.starts_on, time: i.start_time ?? "09:00:00", kind: i.kind,
        label: `Retrait · ${i.title}`, place, detail: null,
      });
      if (i.ends_on && i.ends_on !== i.starts_on) {
        events.push({
          day: i.ends_on, time: i.start_time ?? "09:00:00", kind: i.kind,
          label: `Retour · ${i.title}`, place, detail: null,
        });
      }
    } else {
      events.push({
        day: i.starts_on, time: i.start_time, kind: i.kind,
        label: i.title, place,
        detail: i.party ? `${i.party} convives` : null,
      });
    }
  }

  return events.sort((a, b) =>
    a.day === b.day ? (a.time ?? "").localeCompare(b.time ?? "") : a.day.localeCompare(b.day),
  );
}

const dayLabel = (d: string) =>
  parseDay(d)
    .toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

export function TripTimeline({ items }: { items: TripItem[] }) {
  const events = buildEvents(items);
  if (events.length === 0) {
    return <p className="text-sm text-[#7a6355]">Aucune étape datée pour ce voyage.</p>;
  }

  // Group by day so the date is printed once per day, not once per event.
  const days: { day: string; events: Event[] }[] = [];
  for (const e of events) {
    const last = days[days.length - 1];
    if (last && last.day === e.day) last.events.push(e);
    else days.push({ day: e.day, events: [e] });
  }

  return (
    <ol className="relative">
      {days.map(({ day, events: dayEvents }) => (
        <li key={day} className="relative pb-1">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#7a6355]">
            {dayLabel(day)}
          </p>
          <ul className="flex flex-col">
            {dayEvents.map((e, idx) => {
              const { Icon } = SERVICE[e.kind];
              return (
                <li key={idx} className="relative flex gap-3.5 pb-5 last:pb-2">
                  {/* Rail joining the events of a day and beyond */}
                  <span
                    aria-hidden
                    className="absolute left-[15px] top-8 bottom-0 w-px bg-[#e2d5c3]"
                  />
                  <span className="relative z-10 grid h-8 w-8 shrink-0 place-content-center rounded-full border border-[#e2d5c3] bg-white text-[#002089]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-semibold leading-snug text-[#3E2C23]">{e.label}</p>
                    <p className="mt-0.5 text-[13px] text-[#7a6355]">
                      {e.time && <span className="font-medium text-[#002089]">{formatTime(e.time)}</span>}
                      {e.time && (e.place || e.detail) && " · "}
                      {e.place}
                      {e.place && e.detail && " · "}
                      {e.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
      {/* Cap the rail so it does not dangle past the last event */}
      <li aria-hidden className="absolute bottom-0 left-[15px] h-2 w-px bg-[#FBF7F0]" />
    </ol>
  );
}

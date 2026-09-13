import { useId, useState } from "react";
import { cn } from "../lib/utils";
import { count, money } from "./format";

/**
 * Charts are hand-rolled SVG rather than a charting library.
 *
 * The console needs five shapes — a sparkline, a line, bars, a donut and a
 * funnel — and a library that renders all of them costs more than the whole
 * admin bundle. These are also easier to make accessible: each carries a table
 * of its own values for screen readers.
 */

const BLUE = "#002089";
const ORANGE = "#e76f2e";
const GRID = "#E7E9EE";

/** Tiny trend line inside a KPI card (spec §4). */
export function Sparkline({
  values,
  tone = "blue",
  className,
}: {
  values: number[];
  tone?: "blue" | "orange" | "green" | "red";
  className?: string;
}) {
  const id = useId();
  const stroke = { blue: BLUE, orange: ORANGE, green: "#15803d", red: "#b3261e" }[tone];
  if (values.length < 2) return <div className={cn("h-8", className)} />;

  const w = 100;
  const h = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pt = (v: number, i: number) => [
    (i / (values.length - 1)) * w,
    h - ((v - min) / span) * (h - 4) - 2,
  ];
  const line = values.map((v, i) => pt(v, i).join(",")).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      role="img"
      aria-label={`Tendance : de ${values[0]} à ${values[values.length - 1]}`}
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#spark-${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export type Series = { label: string; values: number[]; tone?: "blue" | "orange" | "muted" };

/** Revenue over time, with an optional comparison series (spec §7). */
export function LineChart({
  labels,
  series,
  height = 240,
  formatValue = (v: number) => money(v),
}: {
  labels: string[];
  series: Series[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();

  const all = series.flatMap(s => s.values);
  const max = Math.max(1, ...all);
  const w = 640;
  const h = height;
  const padL = 52;
  const padB = 26;
  const padT = 12;
  const innerW = w - padL - 12;
  const innerH = h - padB - padT;
  const n = labels.length;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const colour = (tone?: string) => (tone === "orange" ? ORANGE : tone === "muted" ? "#A9B2C0" : BLUE);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => max * f);

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-labelledby={`lc-${id}`}>
        <title id={`lc-${id}`}>
          {series.map(s => `${s.label} : maximum ${formatValue(Math.max(...s.values, 0))}`).join(". ")}
        </title>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - 12} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#8A93A2">
              {formatValue(t).replace(/\s?\$$/, "")}
            </text>
          </g>
        ))}

        {series.map(s => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const stroke = colour(s.tone);
          return (
            <g key={s.label}>
              <polygon
                points={`${padL},${padT + innerH} ${pts} ${x(n - 1)},${padT + innerH}`}
                fill={stroke}
                opacity={s.tone === "muted" ? 0.05 : 0.08}
              />
              <polyline
                points={pts}
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.tone === "muted" ? "4 4" : undefined}
              />
            </g>
          );
        })}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke={BLUE} strokeWidth="1" opacity="0.4" />
        )}
        {hover !== null &&
          series.map(s => (
            <circle key={s.label} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="3.5" fill={colour(s.tone)} />
          ))}

        {labels.map((l, i) => {
          const step = Math.ceil(n / 7);
          if (i % step !== 0 && i !== n - 1) return null;
          return (
            <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fill="#8A93A2">
              {l}
            </text>
          );
        })}

        {/* Invisible hit areas: one per point, so hover works without a library. */}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={x(i) - innerW / (2 * Math.max(n - 1, 1))}
            y={padT}
            width={innerW / Math.max(n - 1, 1)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-4">
        {series.map(s => (
          <span key={s.label} className="flex items-center gap-1.5 text-[12.5px] text-admin-ink-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: colour(s.tone) }}
              aria-hidden
            />
            {s.label}
            {hover !== null && (
              <strong className="font-semibold text-admin-ink">{formatValue(s.values[hover] ?? 0)}</strong>
            )}
          </span>
        ))}
        {hover !== null && <span className="text-[12.5px] text-admin-ink-3">{labels[hover]}</span>}
      </figcaption>
    </figure>
  );
}

/** Horizontal bars — booking distribution, top cities, top partners (§8, §9). */
export function BarList({
  items,
  formatValue = (v: number) => count(v),
  emptyLabel = "Aucune donnée sur cette période.",
}: {
  items: { label: string; value: number; hint?: string; tone?: "blue" | "orange" }[];
  formatValue?: (v: number) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...items.map(i => i.value));
  if (items.length === 0 || items.every(i => i.value === 0)) {
    return <p className="py-6 text-center text-[13px] text-admin-ink-3">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map(i => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] font-medium text-admin-ink">{i.label}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-admin-ink">
              {formatValue(i.value)}
              {i.hint && <span className="ml-1.5 font-normal text-admin-ink-3">{i.hint}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-admin-line">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max((i.value / max) * 100, 2)}%`,
                background: i.tone === "orange" ? ORANGE : BLUE,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Share of reservations by service or status (spec §8). */
export function Donut({
  slices,
  total,
  centerLabel,
}: {
  slices: { label: string; value: number; color: string }[];
  total?: number;
  centerLabel?: string;
}) {
  const sum = total ?? slices.reduce((s, x) => s + x.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;

  if (sum === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="h-[132px] w-[132px] rounded-full border-[14px] border-admin-line" />
        <p className="text-[13px] text-admin-ink-3">Aucune réservation à répartir.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 132 132" className="h-[132px] w-[132px] shrink-0 -rotate-90" role="img"
           aria-label={slices.map(s => `${s.label} ${s.value}`).join(", ")}>
        <circle cx="66" cy="66" r={r} fill="none" stroke={GRID} strokeWidth="14" />
        {slices.map(s => {
          const len = (s.value / sum) * c;
          const el = (
            <circle
              key={s.label}
              cx="66"
              cy="66"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>

      <div className="min-w-0 flex-1">
        {centerLabel && (
          <p className="mb-2 font-display text-[22px] font-semibold text-admin-ink">{centerLabel}</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {slices.map(s => (
            <li key={s.label} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="truncate text-admin-ink-2">{s.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-admin-ink">
                {count(s.value)}
                <span className="ml-1.5 font-normal text-admin-ink-3">
                  {Math.round((s.value / sum) * 100)} %
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Marketplace funnel with conversion at each step (spec §45). */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const first = steps[0]?.value || 0;

  return (
    <ol className="flex flex-col gap-1.5">
      {steps.map((s, i) => {
        const prev = i === 0 ? s.value : steps[i - 1].value;
        const width = first ? Math.max((s.value / first) * 100, 6) : 6;
        const stepRate = prev ? (s.value / prev) * 100 : 0;
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-admin-ink">{s.label}</span>
              <span className="text-[13px] font-semibold tabular-nums text-admin-ink">{count(s.value)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-7 flex-1 overflow-hidden rounded-md bg-admin-line/60">
                <div
                  className="flex h-full items-center rounded-md px-2 transition-[width] duration-500"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${BLUE} 0%, #24409e 100%)`,
                  }}
                />
              </div>
              {i > 0 && (
                <span
                  className={cn(
                    "w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums",
                    stepRate < 40 ? "text-[#b3261e]" : "text-admin-ink-3",
                  )}
                >
                  {stepRate.toFixed(0)} %
                </span>
              )}
              {i === 0 && <span className="w-14 shrink-0" />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Geographic performance (spec §9).
 *
 * Cities are plotted from real coordinates on an equirectangular projection of
 * Haiti's bounding box. It is a position plot, not a boundary map: drawing
 * approximate departmental borders by hand would look authoritative while being
 * wrong, and wrong geography in an ops console is worse than none.
 */
const CITY_COORDS: Record<string, [number, number]> = {
  "Port-au-Prince": [18.5944, -72.3074],
  "Pétion-Ville": [18.5125, -72.2853],
  Kenscoff: [18.4489, -72.2853],
  Delmas: [18.5504, -72.3011],
  Jacmel: [18.2341, -72.5348],
  "Cap-Haïtien": [19.7579, -72.2044],
  "Les Cayes": [18.1961, -73.7469],
  Gonaïves: [19.4475, -72.6892],
  Jérémie: [18.6503, -74.1167],
  Hinche: [19.15, -72.0167],
  "Port-de-Paix": [19.9333, -72.8333],
  "Saint-Marc": [19.1083, -72.6944],
  Léogâne: [18.5108, -72.6339],
  Miragoâne: [18.4453, -73.0897],
  "Fort-Liberté": [19.6656, -71.8419],
};

const BOUNDS = { north: 20.1, south: 18.0, west: -74.5, east: -71.6 };

export function GeoMap({
  points,
  metric = "bookings",
}: {
  points: { city: string; listings: number; partners: number; bookings: number; revenue: number }[];
  metric?: "bookings" | "revenue" | "listings";
}) {
  const [hover, setHover] = useState<string | null>(null);
  const known = points.filter(p => CITY_COORDS[p.city]);
  const max = Math.max(1, ...known.map(p => Number(p[metric])));

  const project = (lat: number, lon: number) => [
    ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * 100,
    ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * 100,
  ];

  return (
    <div className="relative overflow-hidden rounded-lg border border-admin-line bg-[#f4f8fd]">
      <div className="relative aspect-[3/2] w-full">
        {/* Latitude/longitude guides, so the plot reads as a map rather than a scatter. */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {[25, 50, 75].map(p => (
            <g key={p}>
              <line x1={p} x2={p} y1="0" y2="100" stroke="#dbe4f3" strokeWidth="0.2" />
              <line x1="0" x2="100" y1={p} y2={p} stroke="#dbe4f3" strokeWidth="0.2" />
            </g>
          ))}
        </svg>

        {known.map(p => {
          const [lat, lon] = CITY_COORDS[p.city];
          const [x, y] = project(lat, lon);
          const value = Number(p[metric]);
          const size = 10 + (value / max) * 26;
          const on = hover === p.city;
          return (
            <button
              key={p.city}
              onMouseEnter={() => setHover(p.city)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.city)}
              onBlur={() => setHover(null)}
              style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white transition-transform",
                on ? "z-20 scale-125" : "z-10",
                value > 0 ? "bg-[#002089]/75" : "bg-[#A9B2C0]/70",
              )}
              aria-label={`${p.city} : ${value}`}
            />
          );
        })}

        {hover && (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 translate-y-2 rounded-lg border border-admin-line bg-white px-2.5 py-1.5 text-[12px] shadow-lg"
            style={{
              left: `${project(CITY_COORDS[hover][0], CITY_COORDS[hover][1])[0]}%`,
              top: `${project(CITY_COORDS[hover][0], CITY_COORDS[hover][1])[1]}%`,
            }}
          >
            <p className="font-semibold text-admin-ink">{hover}</p>
            {(() => {
              const p = known.find(k => k.city === hover)!;
              return (
                <p className="text-admin-ink-3">
                  {count(p.bookings)} réservations · {money(p.revenue)} · {count(p.listings)} annonces
                </p>
              );
            })()}
          </div>
        )}
      </div>

      {known.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-[13px] text-admin-ink-3">
          Aucune ville reconnue à afficher.
        </p>
      )}
    </div>
  );
}

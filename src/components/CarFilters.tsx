import { Icon } from "./Icon";
import { formatUsd } from "../lib/currency";
import type { Tables } from "../types/database";

export type CarDetail = Tables<"car_details">;

export type CarFilterState = {
  maxPrice: number;
  makes: string[];
  models: string[];
  bodies: string[];
  gearboxes: string[];
  fuels: string[];
  drivetrains: string[];
  minSeats: number | null;
  options: string[];
  minYear: number | null;
};

export const emptyCarFilters = (maxPrice: number): CarFilterState => ({
  maxPrice,
  makes: [],
  models: [],
  bodies: [],
  gearboxes: [],
  fuels: [],
  drivetrains: [],
  minSeats: null,
  options: [],
  minYear: null,
});

/** Option flags map to their boolean column on car_details. */
export const CAR_OPTIONS: { id: string; label: string; field: keyof CarDetail }[] = [
  { id: "driver", label: "Avec chauffeur", field: "with_driver" },
  { id: "ac", label: "Climatisation", field: "air_conditioning" },
  { id: "km", label: "Kilométrage illimité", field: "unlimited_km" },
  { id: "airport", label: "Livraison aéroport", field: "airport_delivery" },
];

export function carMatches(d: CarDetail | undefined, price: number, f: CarFilterState): boolean {
  if (price > f.maxPrice) return false;
  if (!d) return f.makes.length + f.models.length + f.bodies.length + f.gearboxes.length +
               f.fuels.length + f.drivetrains.length + f.options.length === 0 &&
               f.minSeats === null && f.minYear === null;

  if (f.makes.length && !f.makes.includes(d.make)) return false;
  if (f.models.length && !f.models.includes(d.model)) return false;
  if (f.bodies.length && !f.bodies.includes(d.body)) return false;
  if (f.gearboxes.length && !f.gearboxes.includes(d.gearbox)) return false;
  if (f.fuels.length && !f.fuels.includes(d.fuel)) return false;
  if (f.drivetrains.length && !f.drivetrains.includes(d.drivetrain)) return false;
  if (f.minSeats !== null && d.seats < f.minSeats) return false;
  if (f.minYear !== null && d.year < f.minYear) return false;

  for (const id of f.options) {
    const opt = CAR_OPTIONS.find(o => o.id === id);
    if (opt && d[opt.field] !== true) return false;
  }
  return true;
}

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-[13px] font-medium border-2 transition-colors ${
    on
      ? "bg-[#002089] border-[#002089] text-white"
      : "bg-white border-[#e2d5c3] text-[#3E2C23] hover:border-[#002089]"
  }`;

const rowBtn = (on: boolean) =>
  `w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-lg transition-all text-left ${
    on ? "bg-[#002089] text-white font-semibold" : "text-[#3E2C23] hover:bg-[#DAF5FE]"
  }`;

const box = (on: boolean) =>
  `w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
    on ? "bg-[#6ad7fb] border-[#6ad7fb]" : "border-[#e2d5c3]"
  }`;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-2.5">{title}</p>
      {children}
    </div>
  );
}

/** Canvas 3b filter rail, extended: marque, modèle, boîte, carburant, transmission, places, année. */
export function CarFilters({
  details,
  filters,
  setFilters,
  priceBounds,
}: {
  details: CarDetail[];
  filters: CarFilterState;
  setFilters: React.Dispatch<React.SetStateAction<CarFilterState>>;
  priceBounds: { min: number; max: number };
}) {
  const uniq = (fn: (d: CarDetail) => string) => Array.from(new Set(details.map(fn))).sort();

  const toggle = (key: keyof CarFilterState, value: string) =>
    setFilters(prev => {
      const list = prev[key] as string[];
      return { ...prev, [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] };
    });

  // Models are scoped to the chosen makes, so the list stays meaningful.
  const modelPool = filters.makes.length ? details.filter(d => filters.makes.includes(d.make)) : details;
  const models = Array.from(new Set(modelPool.map(d => d.model))).sort();

  const years = Array.from(new Set(details.map(d => d.year))).sort((a, b) => b - a);

  return (
    <>
      <Group title="Prix par jour">
        <input
          type="range"
          min={priceBounds.min}
          max={priceBounds.max}
          step={1}
          value={filters.maxPrice}
          onChange={e => setFilters(p => ({ ...p, maxPrice: Number(e.target.value) }))}
          className="w-full accent-[#002089]"
        />
        <div className="flex justify-between text-xs text-[#7a6355] mt-1">
          <span>{formatUsd(priceBounds.min)}</span>
          <span className="font-semibold text-[#002089]">Jusqu'à {formatUsd(filters.maxPrice)}</span>
        </div>
      </Group>

      <Group title="Type de véhicule">
        <div className="flex flex-wrap gap-1.5">
          {uniq(d => d.body).map(b => (
            <button key={b} onClick={() => toggle("bodies", b)} className={chip(filters.bodies.includes(b))}>
              {b}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Marque">
        <div className="flex flex-wrap gap-1.5">
          {uniq(d => d.make).map(m => (
            <button key={m} onClick={() => toggle("makes", m)} className={chip(filters.makes.includes(m))}>
              {m}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Modèle">
        <div className="flex flex-wrap gap-1.5">
          {models.map(m => (
            <button key={m} onClick={() => toggle("models", m)} className={chip(filters.models.includes(m))}>
              {m}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Boîte de vitesses">
        <div className="space-y-2">
          {uniq(d => d.gearbox).map(g => (
            <button key={g} onClick={() => toggle("gearboxes", g)} className={rowBtn(filters.gearboxes.includes(g))}>
              <span className={box(filters.gearboxes.includes(g))}>
                {filters.gearboxes.includes(g) && <Icon.Check />}
              </span>
              {g}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Carburant">
        <div className="space-y-2">
          {uniq(d => d.fuel).map(f => (
            <button key={f} onClick={() => toggle("fuels", f)} className={rowBtn(filters.fuels.includes(f))}>
              <span className={box(filters.fuels.includes(f))}>{filters.fuels.includes(f) && <Icon.Check />}</span>
              {f}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Transmission">
        <div className="space-y-2">
          {uniq(d => d.drivetrain).map(t => (
            <button key={t} onClick={() => toggle("drivetrains", t)} className={rowBtn(filters.drivetrains.includes(t))}>
              <span className={box(filters.drivetrains.includes(t))}>
                {filters.drivetrains.includes(t) && <Icon.Check />}
              </span>
              {t}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Places minimum">
        <div className="flex flex-wrap gap-1.5">
          {[2, 4, 5, 7].map(n => (
            <button
              key={n}
              onClick={() => setFilters(p => ({ ...p, minSeats: p.minSeats === n ? null : n }))}
              className={chip(filters.minSeats === n)}
            >
              {n}+
            </button>
          ))}
        </div>
      </Group>

      <Group title="Année minimum">
        <div className="flex flex-wrap gap-1.5">
          {years.map(y => (
            <button
              key={y}
              onClick={() => setFilters(p => ({ ...p, minYear: p.minYear === y ? null : y }))}
              className={chip(filters.minYear === y)}
            >
              {y}+
            </button>
          ))}
        </div>
      </Group>

      <Group title="Options">
        <div className="space-y-2">
          {CAR_OPTIONS.map(o => (
            <button key={o.id} onClick={() => toggle("options", o.id)} className={rowBtn(filters.options.includes(o.id))}>
              <span className={box(filters.options.includes(o.id))}>
                {filters.options.includes(o.id) && <Icon.Check />}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      </Group>
    </>
  );
}

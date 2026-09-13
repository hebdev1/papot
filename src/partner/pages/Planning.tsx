import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, Callout, Card, CardHeader, PageHeader, Skeleton, inputClass, labelClass, selectClass } from "../../console/Ui";
import { Modal } from "../../console/Dialog";
import { friendlyError, rpc, useTable } from "../../console/data";
import { money, parseDay } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";

type AvailabilityRow = {
  listing_id: string;
  day: string;
  status: string;
  quantity: number | null;
  price_override: number | null;
};

type ListingLite = { id: string; name: string; price: number; status: string };

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  available: { bg: "bg-[#eef7f0] text-[#15803d]", label: "Disponible" },
  booked: { bg: "bg-[#eef3fb] text-[#002089]", label: "Réservé" },
  blocked: { bg: "bg-admin-canvas text-admin-ink-3", label: "Bloqué" },
  maintenance: { bg: "bg-[#fdf8ee] text-[#7a5b12]", label: "Maintenance" },
  closed: { bg: "bg-[#fdf3f2] text-[#b3261e]", label: "Fermé" },
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function monthMatrix(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Spec §22 — the operational calendar. */
export function Calendar() {
  const { active } = usePartner();
  const [anchor, setAnchor] = useState(new Date());
  const [listingId, setListingId] = useState<string>("");

  const listings = useTable<ListingLite>({
    from: "listings",
    select: "id, name, price, status",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "name", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  const days = useMemo(() => monthMatrix(anchor), [anchor]);
  const from = iso(days[0]);
  const to = iso(days[days.length - 1]);

  const availability = useTable<AvailabilityRow>({
    from: "listing_availability",
    select: "listing_id, day, status, quantity, price_override",
    filters: [
      { col: "day", op: "gte", value: from },
      { col: "day", op: "lte", value: to },
      ...(listingId ? [{ col: "listing_id", op: "eq" as const, value: listingId }] : []),
    ],
    pageSize: 1000,
    enabled: !!active,
  });

  // Only this partner's listings, since listing_availability is world-readable.
  const mine = new Set(listings.rows.map(l => l.id));
  const byDay = new Map<string, AvailabilityRow[]>();
  for (const a of availability.rows) {
    if (!mine.has(a.listing_id)) continue;
    const list = byDay.get(a.day) ?? [];
    list.push(a);
    byDay.set(a.day, list);
  }

  const monthLabel = anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        title="Calendrier"
        subtitle="Ce qui est réservé, libre ou bloqué."
        actions={
          <Button as="link" to="/partenaire/disponibilite" variant="primary">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Modifier la disponibilité
          </Button>
        }
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Mois précédent"
              onClick={() => setAnchor(a => new Date(a.getFullYear(), a.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="min-w-[160px] text-center font-display text-[15px] font-semibold capitalize text-admin-ink">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Mois suivant"
              onClick={() => setAnchor(a => new Date(a.getFullYear(), a.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
              Aujourd'hui
            </Button>
          </div>

          <select
            value={listingId}
            onChange={e => setListingId(e.target.value)}
            aria-label="Filtrer par annonce"
            className={cn(selectClass, "max-w-[240px]")}
          >
            <option value="">Toutes les annonces</option>
            {listings.rows.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-7 border-b border-admin-line bg-admin-raised">
          {WEEKDAYS.map(d => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
              {d}
            </div>
          ))}
        </div>

        {availability.loading ? (
          <div className="p-5"><Skeleton className="h-80 w-full" /></div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const key = iso(d);
              const outside = d.getMonth() !== anchor.getMonth();
              const isToday = key === iso(new Date());
              const entries = byDay.get(key) ?? [];
              const booked = entries.filter(e => e.status === "booked").length;
              const blocked = entries.filter(e => e.status === "blocked" || e.status === "maintenance").length;

              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[84px] border-b border-r border-admin-line p-1.5",
                    outside && "bg-admin-raised/60",
                    i % 7 === 6 && "border-r-0",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium",
                      isToday ? "bg-[#002089] text-white" : outside ? "text-admin-ink-3" : "text-admin-ink",
                    )}
                  >
                    {d.getDate()}
                  </span>

                  <div className="mt-1 flex flex-col gap-0.5">
                    {booked > 0 && (
                      <span className="truncate rounded bg-[#eef3fb] px-1.5 py-0.5 text-[10.5px] font-medium text-[#002089]">
                        {booked} réservé{booked > 1 ? "s" : ""}
                      </span>
                    )}
                    {blocked > 0 && (
                      <span className="truncate rounded bg-admin-canvas px-1.5 py-0.5 text-[10.5px] font-medium text-admin-ink-3">
                        {blocked} bloqué{blocked > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 border-t border-admin-line px-5 py-3">
          {Object.entries(STATUS_STYLE).map(([k, s]) => (
            <span key={k} className="flex items-center gap-1.5 text-[12px] text-admin-ink-2">
              <span className={cn("h-2.5 w-2.5 rounded-sm", s.bg.split(" ")[0])} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      </Card>

      {listings.rows.length === 0 && !listings.loading && (
        <div className="mt-4">
          <Callout>
            Vous n'avez pas encore d'annonce, donc rien à planifier. Créez une annonce pour
            commencer à gérer un calendrier.
          </Callout>
        </div>
      )}
    </>
  );
}

/** Spec §23–§24 — availability, with the bulk editor as the main tool. */
export function Availability() {
  const { active, can } = usePartner();
  const [open, setOpen] = useState(false);

  const listings = useTable<ListingLite>({
    from: "listings",
    select: "id, name, price, status",
    filters: [{ col: "partner_id", op: "eq", value: active?.partner_id ?? "" }],
    sort: { col: "name", dir: "asc" },
    pageSize: 100,
    enabled: !!active,
  });

  const upcoming = useTable<AvailabilityRow>({
    from: "listing_availability",
    select: "listing_id, day, status, quantity, price_override",
    filters: [{ col: "day", op: "gte", value: new Date().toISOString().slice(0, 10) }],
    sort: { col: "day", dir: "asc" },
    pageSize: 500,
    enabled: !!active,
  });

  const mine = new Set(listings.rows.map(l => l.id));
  const rows = upcoming.rows.filter(r => mine.has(r.listing_id));
  const blocked = rows.filter(r => r.status !== "available");

  return (
    <>
      <PageHeader
        title="Disponibilité"
        subtitle="Ouvrez, fermez ou bloquez des dates, sur une ou plusieurs annonces à la fois."
        actions={
          can("manage_availability") ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Mettre à jour
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5">
        <Callout>
          Une date sans règle est considérée <strong className="font-semibold">disponible</strong>.
          Vous ne bloquez que ce qui doit l'être, plutôt que d'ouvrir chaque jour un par un.
        </Callout>
      </div>

      <Card padded={false}>
        <div className="border-b border-admin-line px-5 py-4">
          <h2 className="font-display text-[15px] font-semibold text-admin-ink">Dates non disponibles à venir</h2>
          <p className="text-[12.5px] text-admin-ink-3">
            {blocked.length === 0 ? "Tout est ouvert." : `${blocked.length} date(s) fermée(s) ou bloquée(s).`}
          </p>
        </div>

        {upcoming.loading ? (
          <div className="p-5"><Skeleton className="h-24 w-full" /></div>
        ) : blocked.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-admin-ink-3">
            Aucune date bloquée. Toutes vos annonces sont ouvertes à la réservation.
          </p>
        ) : (
          <ul className="divide-y divide-admin-line">
            {blocked.slice(0, 60).map(r => {
              const listing = listings.rows.find(l => l.id === r.listing_id);
              const style = STATUS_STYLE[r.status] ?? STATUS_STYLE.blocked;
              return (
                <li key={`${r.listing_id}-${r.day}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-admin-ink">
                      {listing?.name ?? "Annonce"}
                    </span>
                    <span className="block text-[12px] text-admin-ink-3">
                      {parseDay(r.day)?.toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </span>
                  </span>
                  {r.price_override !== null && (
                    <span className="text-[12.5px] tabular-nums text-admin-ink-2">
                      {money(r.price_override)}
                    </span>
                  )}
                  <span className={cn("rounded-md px-2 py-1 text-[11.5px] font-semibold", style.bg)}>
                    {style.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <BulkAvailability
        open={open}
        onClose={() => setOpen(false)}
        listings={listings.rows}
        onDone={() => upcoming.reload()}
      />
    </>
  );
}

/** Spec §24 — the bulk editor. */
function BulkAvailability({
  open,
  onClose,
  listings,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  listings: ListingLite[];
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState("blocked");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const apply = async () => {
    setError(null);
    if (picked.length === 0) return setError("Choisissez au moins une annonce.");
    if (!start || !end) return setError("Indiquez une date de début et de fin.");

    setBusy(true);
    const { error } = await rpc("partner_set_availability", {
      p_listings: picked,
      p_start: start,
      p_end: end,
      p_status: status,
      p_weekdays: weekdays.length ? weekdays : null,
    });
    setBusy(false);

    if (error) return setError(friendlyError(error));
    setDone(`${picked.length} annonce(s) mise(s) à jour du ${start} au ${end}.`);
    onDone();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mettre à jour la disponibilité"
      subtitle="S'applique à toutes les annonces sélectionnées."
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Fermer</Button>
          <Button variant="primary" onClick={apply} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />}
            Appliquer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className={labelClass}>Annonces</legend>
          {listings.length === 0 ? (
            <p className="text-[13px] text-admin-ink-3">Aucune annonce à modifier.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setPicked(picked.length === listings.length ? [] : listings.map(l => l.id))}
                className="self-start text-[12.5px] font-semibold text-[#002089] hover:underline"
              >
                {picked.length === listings.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-admin-line">
                {listings.map(l => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-admin-line px-3 py-2 text-[13px] last:border-0 hover:bg-admin-canvas"
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(l.id)}
                      onChange={() =>
                        setPicked(p => (p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id]))
                      }
                      className="h-4 w-4 accent-[#002089]"
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="a-start">Du</label>
            <input id="a-start" type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="a-end">Au</label>
            <input id="a-end" type="date" value={end} onChange={e => setEnd(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="a-status">État</label>
            <select id="a-status" value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
              <option value="available">Disponible</option>
              <option value="blocked">Bloqué</option>
              <option value="closed">Fermé</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>

        <fieldset>
          <legend className={labelClass}>Appliquer à ces jours seulement</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <label
                key={d}
                className={cn(
                  "cursor-pointer rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors",
                  weekdays.includes(i)
                    ? "border-[#002089] bg-[#f4f8fd] text-[#002089]"
                    : "border-admin-line text-admin-ink-2",
                )}
              >
                <input
                  type="checkbox"
                  checked={weekdays.includes(i)}
                  onChange={() => setWeekdays(w => (w.includes(i) ? w.filter(x => x !== i) : [...w, i]))}
                  className="sr-only"
                />
                {d}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-admin-ink-3">
            Aucun jour coché : toute la période est modifiée.
          </p>
        </fieldset>

        {error && <p className="text-[13px] font-medium text-[#b3261e]">{error}</p>}
        {done && (
          <p className="rounded-lg bg-[#eef7f0] px-3 py-2 text-[13px] font-medium text-[#15803d]">{done}</p>
        )}
      </div>
    </Modal>
  );
}

export { CardHeader };

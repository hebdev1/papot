import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ScanLine, Search, Users, XCircle } from "lucide-react";
import { Button, Callout, Card, EmptyState, PageHeader, Skeleton, inputClass, labelClass, selectClass } from "../../console/Ui";
import { Stat } from "../../console/Cards";
import { StatusBadge } from "../../console/StatusBadge";
import { friendlyError, rpc, useTable } from "../../console/data";
import { count } from "../../console/format";
import { usePartner } from "../lib/partnerAuth";
import { setDepartureStatus } from "../../lib/bus";

/**
 * L'embarquement.
 *
 * Built for one hand at a gare door, not for a desk: the scan box is focused on
 * load and refocused after every result, so an agent with a USB barcode reader
 * — which types the code and presses Enter — never touches the screen. The same
 * box accepts a ticket number typed by hand, because a phone with a cracked
 * screen still has a readable `BUS-XXXXXXXX` on the printed slip.
 *
 * The verdict is deliberately enormous and colour-coded. An agent reads it at
 * arm's length in daylight while a queue waits; a polite sentence in 13px is
 * the wrong answer to "can this person get on".
 *
 * No camera. The browser can open one, but a gare's own barcode readers and
 * the printed number already cover the job, and a camera permission prompt
 * between a passenger and the door is a worse failure than typing eight
 * characters. The manifest search below covers the rest.
 */

type Verdict = {
  result: "VALID" | "ALREADY_USED" | "WRONG_TRIP" | "CANCELLED" | "INVALID";
  passenger?: string;
  seat?: string;
  ticket_no?: string;
  fare_class?: string;
  checked_in_at?: string;
  reason?: string;
  its_departure?: { on: string; at: string; route: string };
};

type Manifest = {
  departure_id: string;
  route: string;
  departs_on: string;
  departs_at: string;
  status: string;
  seats_total: number;
  sold: number;
  checked_in: number;
  passengers: {
    ticket_no: string;
    name: string;
    seat: string | null;
    seat_no: number | null;
    phone: string | null;
    fare_class: string;
    status: string;
    checked_in_at: string | null;
    reference: string;
  }[];
};

const asTime = (t: string | null | undefined) => (t ?? "").slice(0, 5);

export function BusBoarding() {
  const { active, can } = usePartner();
  const [departureId, setDepartureId] = useState("");
  const [code, setCode] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [q, setQ] = useState("");
  const box = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  /** Today's departures, in time order: the only ones anyone boards. */
  const departures = useTable<{
    id: string; route: string; departs_at: string; status: string;
    seats_total: number; sold: number;
  }>({
    from: "bus_departure_rows",
    select: "id, route, departs_at, status, seats_total, sold",
    filters: [
      { col: "partner_id", op: "eq", value: active?.partner_id ?? "" },
      { col: "departs_on", op: "eq", value: today },
    ],
    sort: { col: "departs_at", dir: "asc" },
    pageSize: 50,
    enabled: !!active,
  });

  const chosen = departureId || departures.rows[0]?.id || "";
  const current = departures.rows.find(d => d.id === chosen) ?? null;

  const loadManifest = async (id: string) => {
    if (!id) return setManifest(null);
    const { data, error } = await rpc("bus_manifest", { p_departure: id });
    if (error) {
      setError(friendlyError(error));
      return;
    }
    setManifest((data as Manifest | null) ?? null);
  };

  useEffect(() => {
    void loadManifest(chosen);
    box.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  const scan = async () => {
    const value = code.trim();
    if (!value || !chosen) return;
    setBusy(true);
    setError(null);
    const { data, error } = await rpc("bus_validate_ticket", {
      p_code: value,
      p_departure: chosen,
    });
    setBusy(false);
    setCode("");
    box.current?.focus();
    if (error) {
      setError(friendlyError(error));
      return;
    }
    setVerdict(data as Verdict);
    void loadManifest(chosen);
  };

  const undo = async (ticketNo: string) => {
    const { error } = await rpc("bus_undo_checkin", { p_ticket_no: ticketNo });
    if (error) return setError(friendlyError(error));
    setVerdict(null);
    void loadManifest(chosen);
  };

  const rows = useMemo(() => {
    const list = manifest?.passengers ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      p =>
        p.name.toLowerCase().includes(needle) ||
        p.ticket_no.toLowerCase().includes(needle) ||
        (p.seat ?? "").toLowerCase().includes(needle) ||
        (p.phone ?? "").includes(needle),
    );
  }, [manifest, q]);

  if (!can("board_passengers")) {
    return (
      <>
        <PageHeader title="Embarquement" />
        <Callout tone="warning">
          Vous n'avez pas la capacité « Embarquer les passagers ». Demandez-la au
          propriétaire de l'entreprise.
        </Callout>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Embarquement"
        subtitle="Scannez le QR d'un billet, ou tapez son numéro. Les départs du jour uniquement."
      />

      {departures.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : departures.rows.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title="Aucun départ aujourd'hui"
          body="L'embarquement ne concerne que les départs du jour. Revenez le matin du voyage."
        />
      ) : (
        <>
          <div className="mb-4">
            <label className={labelClass} htmlFor="b-dep">Départ</label>
            <select
              id="b-dep"
              value={chosen}
              onChange={e => { setDepartureId(e.target.value); setVerdict(null); }}
              className={selectClass}
            >
              {departures.rows.map(d => (
                <option key={d.id} value={d.id}>
                  {asTime(d.departs_at)} — {d.route} ({d.sold}/{d.seats_total})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
            <Stat label="Billets vendus" value={count(manifest?.sold ?? 0)} />
            <Stat label="Embarqués" value={count(manifest?.checked_in ?? 0)} />
            <Stat
              label="Restent à venir"
              value={count(Math.max((manifest?.sold ?? 0) - (manifest?.checked_in ?? 0), 0))}
            />
          </div>

          {/* Where the coach is in its day, moved from the screen that is
              actually standing at the gare. Cancelling is deliberately absent:
              it owes the passengers a refund, so it lives on Départs where the
              consequence can be spelled out. */}
          {can("manage_departures") && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-admin-ink-3">
                État du départ
              </span>
              <StatusBadge status={current?.status ?? "scheduled"} />
              {([
                ["boarding", "Embarquement"],
                ["departed", "Parti"],
                ["arrived", "Arrivé"],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={current?.status === value ? "primary" : "secondary"}
                  disabled={busy || !chosen || current?.status === value}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await setDepartureStatus(chosen, value);
                      departures.reload();
                    } catch (e) {
                      setError(friendlyError(e as never));
                    }
                    setBusy(false);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}

          {/* The scan box. Enter submits, because that is what a barcode
              reader sends after the code. */}
          <Card>
            <label className={labelClass} htmlFor="b-code">Code du billet</label>
            <div className="flex gap-2">
              <input
                id="b-code"
                ref={box}
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void scan(); } }}
                placeholder="Scannez le QR, ou tapez BUS-XXXXXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className={`${inputClass} font-mono text-base`}
              />
              <Button variant="primary" onClick={scan} disabled={busy || !code.trim()}>
                {busy ? "…" : "Vérifier"}
              </Button>
            </div>
            {error && <p className="mt-3 text-[13px] font-medium text-[#b3261e]">{error}</p>}
          </Card>

          {verdict && <VerdictBanner v={verdict} onUndo={undo} />}

          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <h2 className="font-display text-[15px] font-semibold text-admin-ink">
                Liste des passagers
              </h2>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-ink-3"
                  aria-hidden
                />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Nom, siège, billet, téléphone"
                  aria-label="Chercher un passager"
                  className={`${inputClass} pl-8 w-[260px]`}
                />
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title={q ? "Personne ne correspond" : "Aucun passager"}
                body={
                  q
                    ? "Vérifiez l'orthographe, ou cherchez par numéro de billet."
                    : "Aucun billet vendu sur ce départ pour l'instant."
                }
              />
            ) : (
              <Card padded={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-admin-line bg-admin-raised">
                        {["Place", "Passager", "Billet", "Téléphone", "État", ""].map(h => (
                          <th
                            key={h}
                            className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-admin-line">
                      {rows.map(p => (
                        <tr key={p.ticket_no}>
                          <td className="px-5 py-3 text-[13px] font-semibold text-admin-ink tabular-nums">
                            {p.seat ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-[13px] font-medium text-admin-ink">
                            {p.name}
                          </td>
                          <td className="px-5 py-3 text-[12.5px] font-mono text-admin-ink-2">
                            {p.ticket_no}
                          </td>
                          <td className="px-5 py-3 text-[13px]">{p.phone ?? "—"}</td>
                          <td className="px-5 py-3">
                            <StatusBadge status={p.status} />
                          </td>
                          <td className="px-5 py-3 text-right">
                            {p.status === "checked_in" && (
                              <Button size="sm" variant="ghost" onClick={() => undo(p.ticket_no)}>
                                Annuler
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}

/**
 * The verdict, at arm's length.
 *
 * Five outcomes, five colours, and the word itself is the headline. Everything
 * an agent needs to act is in the first line; the detail underneath is for the
 * conversation that follows a refusal.
 */
function VerdictBanner({ v, onUndo }: { v: Verdict; onUndo: (ticketNo: string) => void }) {
  const tone =
    v.result === "VALID"
      ? { bg: "#e7f6ec", border: "#b7e3c5", fg: "#116a32", Icon: CheckCircle2, word: "VALIDE" }
      : v.result === "ALREADY_USED"
        ? { bg: "#fff8e1", border: "#f0dca8", fg: "#8a6d1f", Icon: XCircle, word: "DÉJÀ UTILISÉ" }
        : v.result === "WRONG_TRIP"
          ? { bg: "#fff8e1", border: "#f0dca8", fg: "#8a6d1f", Icon: XCircle, word: "AUTRE DÉPART" }
          : v.result === "CANCELLED"
            ? { bg: "#fdecea", border: "#f5c2bd", fg: "#b3261e", Icon: XCircle, word: "ANNULÉ" }
            : { bg: "#fdecea", border: "#f5c2bd", fg: "#b3261e", Icon: XCircle, word: "INVALIDE" };

  return (
    <div
      role="status"
      aria-live="assertive"
      className="mt-4 rounded-2xl border px-5 py-5"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      <div className="flex items-center gap-3">
        <tone.Icon className="h-8 w-8 shrink-0" style={{ color: tone.fg }} aria-hidden />
        <p className="font-display text-2xl font-black tracking-tight" style={{ color: tone.fg }}>
          {tone.word}
        </p>
      </div>

      {v.passenger && (
        <p className="mt-2 text-[15px] font-semibold text-admin-ink">
          {v.passenger}
          {v.seat && <span className="text-admin-ink-2"> · place {v.seat}</span>}
        </p>
      )}

      {v.result === "ALREADY_USED" && v.checked_in_at && (
        <p className="mt-1 text-[13px]" style={{ color: tone.fg }}>
          Embarqué à{" "}
          {new Date(v.checked_in_at).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          . Si c'est une erreur de scan, annulez l'embarquement dans la liste ci-dessous.
        </p>
      )}
      {v.result === "WRONG_TRIP" && v.its_departure && (
        <p className="mt-1 text-[13px]" style={{ color: tone.fg }}>
          Ce billet est pour le {v.its_departure.on} à {asTime(v.its_departure.at)} —{" "}
          {v.its_departure.route}.
        </p>
      )}
      {v.result === "CANCELLED" && v.reason && (
        <p className="mt-1 text-[13px]" style={{ color: tone.fg }}>{v.reason}</p>
      )}
      {v.result === "INVALID" && (
        <p className="mt-1 text-[13px]" style={{ color: tone.fg }}>
          Aucun billet ne correspond à ce code sur vos départs. Cherchez le passager par son
          nom dans la liste.
        </p>
      )}

      {v.result === "VALID" && v.ticket_no && (
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => onUndo(v.ticket_no!)}>
          Annuler cet embarquement
        </Button>
      )}
    </div>
  );
}

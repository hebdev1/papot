import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";
import { pdfText } from "./pdf-text.ts";

/**
 * Mails a passenger their tickets, as a PDF with a QR code on each one.
 *
 * Authorization, the same shape as the three mail functions that came before:
 * it takes **a booking id, never an address**. It reads the rows with the
 * service role and mails whatever address is stored on the booking, so it
 * cannot be pointed at an arbitrary recipient, and a caller who guesses an id
 * can only cause that buyer to receive their own tickets again.
 *
 * `ticket_sent_at` makes it single-shot per ticket. The fifteen-minute window
 * the food-order function uses is deliberately *not* copied: a traveller who
 * loses the mail three weeks before departure must be able to ask for it again,
 * which the dashboard and the confirmation page both offer. What is bounded
 * instead is the departure — tickets for a coach that has already left are not
 * re-sent.
 *
 * The QR carries `qr_code`, a 128-bit random value, and not the ticket number:
 * the number is printed for a human to read aloud, the QR is the credential the
 * scanner trusts. Encoding the readable number would have made every printed
 * ticket forgeable from a photograph of another one.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("PARTNER_EMAIL_FROM") ?? "PAPOT <onboarding@resend.dev>";
const SITE = (Deno.env.get("SITE_URL") ?? "https://papotht.com").replace(/\/$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const money = (n: number) => `${Number(n).toFixed(2).replace(/\.00$/, "")} $`.replace(".", ",");

const hhmm = (t: string | null) => (t ?? "").slice(0, 5);

/** Base64 in 8 KB slices, so a large attachment cannot overflow the stack. */
const toBase64 = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(out);
};

const frDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** "360" -> "6 h", "330" -> "5 h 30" */
const duration = (m: number) => {
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
};

type TicketRow = {
  id: string;
  ticket_no: string;
  qr_code: string;
  access_token: string;
  seat_no: number | null;
  seat_code: string | null;
  passenger_first: string;
  passenger_last: string;
  fare_class: string;
  amount: number;
  status: string;
  ticket_sent_at: string | null;
  bus_departures: {
    departs_on: string;
    departs_at: string;
    duration_minutes: number;
    status: string;
    listings: { name: string; partner_id: string } | null;
  } | null;
};

const FARE_LABEL: Record<string, string> = {
  standard: "Plein tarif",
  child: "Enfant",
  senior: "Senior",
  promo: "Promotion",
  vip: "VIP",
};

/**
 * One A5-landscape page per ticket, which is what a boarding pass wants to be:
 * it prints two to a sheet and reads on a phone without pinching.
 */
async function buildPdf(
  tickets: TicketRow[],
  reference: string,
  gare: { terminal: string | null; city: string | null; arrive: number | null },
) {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`Billets PAPOT — ${reference}`));
  doc.setCreator("PAPOT");

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const plain = await doc.embedFont(StandardFonts.Helvetica);

  const navy = rgb(0, 0.125, 0.537);
  const ink = rgb(0.243, 0.173, 0.137);
  const muted = rgb(0.478, 0.388, 0.333);
  const line = rgb(0.886, 0.835, 0.765);

  for (const t of tickets) {
    const d = t.bus_departures;
    const page = doc.addPage([595, 421]); // A5 landscape, points
    const { width, height } = page.getSize();

    // Header band
    page.drawRectangle({ x: 0, y: height - 58, width, height: 58, color: navy });
    page.drawText(pdfText("PAPOT"), { x: 28, y: height - 38, size: 20, font: bold, color: rgb(1, 1, 1) });
    page.drawText(pdfText("Billet d'autocar"), {
      x: 96,
      y: height - 34,
      size: 11,
      font: plain,
      color: rgb(0.65, 0.84, 0.94),
    });
    page.drawText(pdfText(t.ticket_no), {
      x: width - 28 - bold.widthOfTextAtSize(pdfText(t.ticket_no), 13),
      y: height - 37,
      size: 13,
      font: bold,
      color: rgb(1, 1, 1),
    });

    // Route and date
    const route = d?.listings?.name ?? "Trajet";
    page.drawText(pdfText(route), { x: 28, y: height - 96, size: 17, font: bold, color: navy });
    page.drawText(pdfText(d ? frDate(d.departs_on) : ""), {
      x: 28,
      y: height - 116,
      size: 10,
      font: plain,
      color: muted,
    });

    // The three facts an agent reads
    const facts: [string, string][] = [
      ["Départ", d ? `${hhmm(d.departs_at)} · ${duration(d.duration_minutes)}` : "—"],
      ["Passager", `${t.passenger_first} ${t.passenger_last}`.trim()],
      ["Place", t.seat_code ?? (t.seat_no !== null ? String(t.seat_no) : "Non numérotée")],
    ];
    let fx = 28;
    for (const [k, v] of facts) {
      page.drawText(pdfText(k.toUpperCase()), { x: fx, y: height - 158, size: 7.5, font: bold, color: muted });
      page.drawText(pdfText(v), { x: fx, y: height - 176, size: 13, font: bold, color: ink });
      fx += 150;
    }

    page.drawLine({
      start: { x: 28, y: height - 196 },
      end: { x: width - 28, y: height - 196 },
      thickness: 1,
      color: line,
    });

    // Where to be, and when
    const gareLines = [
      gare.terminal ? `Gare : ${gare.terminal}${gare.city ? ` — ${gare.city}` : ""}` : null,
      gare.arrive !== null ? `Se présenter ${gare.arrive} minutes avant le départ.` : null,
      `Tarif : ${FARE_LABEL[t.fare_class] ?? t.fare_class} · ${money(t.amount)}`,
      `Référence : ${reference}`,
    ].filter(Boolean) as string[];

    let gy = height - 220;
    for (const l of gareLines) {
      page.drawText(pdfText(l), { x: 28, y: gy, size: 10, font: plain, color: ink });
      gy -= 17;
    }

    page.drawText(pdfText("Présentez ce QR à l'embarquement. Il n'est valable qu'une fois."), {
      x: 28,
      y: 42,
      size: 9,
      font: plain,
      color: muted,
    });

    // The QR itself
    const dataUrl: string = await QRCode.toDataURL(t.qr_code, { margin: 1, width: 480 });
    const png = await doc.embedPng(
      Uint8Array.from(atob(dataUrl.split(",")[1]), c => c.charCodeAt(0)),
    );
    const size = 150;
    page.drawImage(png, { x: width - 28 - size, y: 70, width: size, height: size });
  }

  return await doc.save();
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let bookingId: unknown;
  try {
    const body = await req.json();
    bookingId = body?.booking_id;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof bookingId !== "string" || !UUID_RE.test(bookingId)) {
    return json({ error: "booking_id must be a uuid" }, 400);
  }

  // Said plainly rather than pretended: without a key nothing can be sent, and
  // a caller that is told "sent" would stop retrying.
  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY is not configured" }, 503);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, reference, first_name, last_name, email")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return json({ error: bErr.message }, 500);
  if (!booking?.email) return json({ error: "Booking not found" }, 404);

  const { data: items, error: iErr } = await admin
    .from("booking_items")
    .select("id, listing_id")
    .eq("booking_id", bookingId)
    .eq("kind", "bus");
  if (iErr) return json({ error: iErr.message }, 500);
  if (!items || items.length === 0) return json({ error: "No bus tickets on this booking" }, 404);

  const { data: tickets, error: tErr } = await admin
    .from("bus_tickets")
    .select(
      "id, ticket_no, qr_code, access_token, seat_no, seat_code, passenger_first, passenger_last," +
        " fare_class, amount, status, ticket_sent_at," +
        " bus_departures(departs_on, departs_at, duration_minutes, status, listings(name, partner_id))",
    )
    .in(
      "booking_item_id",
      items.map(i => i.id),
    )
    .order("seat_no", { ascending: true });
  if (tErr) return json({ error: tErr.message }, 500);

  const live = ((tickets ?? []) as unknown as TicketRow[]).filter(
    t =>
      t.status !== "cancelled" &&
      t.status !== "refunded" &&
      t.bus_departures?.status !== "cancelled" &&
      // A coach that has left cannot be boarded, so its ticket is not re-sent.
      !["departed", "arrived", "completed"].includes(t.bus_departures?.status ?? ""),
  );
  if (live.length === 0) return json({ error: "No sendable tickets on this booking" }, 409);

  // The boarding gare, read from the route rather than written into the ticket:
  // a company that corrects its gare's name corrects every ticket not yet sent.
  let gare = { terminal: null as string | null, city: null as string | null, arrive: null as number | null };
  const listingId = items[0]?.listing_id;
  if (listingId) {
    const { data: stop } = await admin
      .from("bus_route_stops")
      .select("position, boarding, bus_terminals(name, city, arrive_minutes_before)")
      .eq("listing_id", listingId)
      .eq("boarding", true)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    const term = (stop as { bus_terminals?: { name: string; city: string; arrive_minutes_before: number } } | null)
      ?.bus_terminals;
    if (term) gare = { terminal: term.name, city: term.city, arrive: term.arrive_minutes_before };
  }

  let pdf: Uint8Array;
  try {
    pdf = await buildPdf(live, booking.reference, gare);
  } catch (e) {
    console.error("PDF generation failed:", e);
    return json({ error: `PDF generation failed: ${(e as Error).message}` }, 500);
  }

  // Chunked on purpose. `String.fromCharCode(...bytes)` spreads every byte as
  // an argument, and a three-ticket PDF with its QR images is well past the
  // argument limit — it would throw "Maximum call stack size exceeded" on
  // exactly the bookings most worth emailing.
  const base64 = toBase64(pdf);
  const first = live[0];
  const dep = first.bus_departures;
  const routeName = dep?.listings?.name ?? "votre trajet";

  const rows = live
    .map(
      t => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2d5c3;font:14px Helvetica,Arial">
          <strong>${escapeHtml(`${t.passenger_first} ${t.passenger_last}`.trim())}</strong><br>
          <span style="color:#7a6355;font-size:13px">
            Place ${escapeHtml(t.seat_code ?? String(t.seat_no ?? "—"))} · ${escapeHtml(t.ticket_no)}
          </span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #e2d5c3;text-align:right;font:14px Helvetica,Arial">
          <a href="${SITE}/billet/${t.access_token}" style="color:#002089;font-weight:bold;text-decoration:none">
            Voir le billet
          </a>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;background:#E9F9FE;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#002089;padding:22px 26px">
      <span style="font:bold 20px Helvetica,Arial;color:#fff">PAPOT</span>
      <span style="font:13px Helvetica,Arial;color:#a8d8f0;margin-left:8px">Billet d'autocar</span>
    </td></tr>
    <tr><td style="padding:26px">
      <h1 style="margin:0 0 6px;font:bold 19px Helvetica,Arial;color:#002089">${escapeHtml(routeName)}</h1>
      <p style="margin:0 0 20px;font:14px Helvetica,Arial;color:#7a6355">
        ${dep ? escapeHtml(frDate(dep.departs_on)) : ""} · départ ${dep ? hhmm(dep.departs_at) : ""}
        ${gare.terminal ? ` · ${escapeHtml(gare.terminal)}` : ""}
      </p>
      ${
        gare.arrive !== null
          ? `<p style="margin:0 0 20px;padding:12px 14px;background:#E9F9FE;border-radius:10px;font:13px Helvetica,Arial;color:#00508a">
               Présentez-vous à la gare <strong>${gare.arrive} minutes avant le départ</strong>, avec une pièce d'identité au nom du billet.
             </p>`
          : ""
      }
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <p style="margin:20px 0 0;font:13px Helvetica,Arial;color:#7a6355">
        Vos billets sont aussi en pièce jointe, prêts à imprimer. Le QR de chaque billet
        n'est valable qu'une fois, à l'embarquement.
      </p>
      <p style="margin:14px 0 0;font:13px Helvetica,Arial;color:#b0a090">
        Référence ${escapeHtml(booking.reference)}
      </p>
    </td></tr>
  </table>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [booking.email],
      subject: `Vos billets — ${routeName}${dep ? `, ${hhmm(dep.departs_at)}` : ""}`,
      html,
      attachments: [{ filename: `billets-${booking.reference}.pdf`, content: base64 }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Resend rejected the ticket email:", detail);
    // The PDF built; only delivery failed. Saying which is what lets the caller
    // decide whether to retry, and stops `ticket_sent_at` claiming a send.
    return json({ error: "Email delivery failed", pdf_bytes: pdf.length, detail }, 502);
  }

  await admin
    .from("bus_tickets")
    .update({ ticket_sent_at: new Date().toISOString() })
    .in(
      "id",
      live.map(t => t.id),
    );

  return json({ sent: live.length, pdf_bytes: pdf.length });
});

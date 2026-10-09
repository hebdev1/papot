import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Drains the pending email deliveries queued by `notify_event`.
 *
 * The business logic never sends anything. A cancellation writes rows and
 * commits; this worker turns them into mail afterwards. That separation is the
 * whole point: a Resend outage in the middle of `bus_cancel_departure` would
 * otherwise roll back the refunds along with the email.
 *
 * It takes **no recipient**. Every address comes from the queued row, so the
 * endpoint cannot be pointed at anyone, and a caller who triggers it early
 * only makes the platform's own queued mail leave sooner.
 *
 * Failures are recorded and retried: `attempts` climbs, and a delivery that
 * has failed MAX_ATTEMPTS times is marked `failed` rather than retried for
 * ever. A row is claimed before it is sent, so two overlapping runs cannot
 * mail the same notice twice.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("PARTNER_EMAIL_FROM") ?? "PAPOT <onboarding@resend.dev>";
const SITE = (Deno.env.get("SITE_URL") ?? "https://papotht.com").replace(/\/$/, "");

const MAX_ATTEMPTS = 5;
const DEFAULT_LIMIT = 50;

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

const escapeHtml = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

type Row = {
  id: string;
  attempts: number;
  notifications: {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    email: string | null;
    payload: Record<string, unknown> | null;
  } | null;
};

/** The same shell the other three functions use, so one sender is recognisable. */
function render(title: string, body: string | null, cta: { href: string; label: string } | null) {
  return `<!doctype html>
<html><body style="margin:0;background:#E9F9FE;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#002089;padding:22px 26px">
      <span style="font:bold 20px Helvetica,Arial;color:#fff">PAPOT</span>
    </td></tr>
    <tr><td style="padding:26px">
      <h1 style="margin:0 0 10px;font:bold 19px Helvetica,Arial;color:#002089">${escapeHtml(title)}</h1>
      ${body ? `<p style="margin:0 0 20px;font:14px/1.6 Helvetica,Arial;color:#3E2C23">${escapeHtml(body)}</p>` : ""}
      ${
        cta
          ? `<p style="margin:0 0 8px"><a href="${cta.href}" style="display:inline-block;background:#002089;color:#fff;font:bold 14px Helvetica,Arial;text-decoration:none;padding:12px 20px;border-radius:10px">${escapeHtml(cta.label)}</a></p>`
          : ""
      }
      <p style="margin:18px 0 0;font:12px Helvetica,Arial;color:#b0a090">
        Vous recevez ce message parce que vous avez un billet sur PAPOT.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY is not configured" }, 503);
  }

  let limit = DEFAULT_LIMIT;
  try {
    const body = await req.json();
    const asked = Number(body?.limit);
    if (Number.isFinite(asked) && asked > 0) limit = Math.min(asked, 200);
  } catch {
    // An empty body is the normal call.
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin
    .from("notification_deliveries")
    .select(
      "id, attempts, notifications(id, kind, title, body, email, payload)",
    )
    .eq("channel", "email")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as unknown as Row[];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const n = row.notifications;
    if (!n?.email) {
      await admin
        .from("notification_deliveries")
        .update({ status: "skipped", error: "no address on the notification" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    // Claim it first. Two overlapping runs then cannot both send this one.
    const { data: claimed } = await admin
      .from("notification_deliveries")
      .update({ status: "processing", attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const token = (n.payload?.access_token as string | undefined) ?? null;
    const cta = token
      ? { href: `${SITE}/billet/${token}`, label: "Voir mon billet" }
      : null;

    let ok = false;
    let detail = "";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [n.email],
          subject: n.title,
          html: render(n.title, n.body, cta),
        }),
      });
      ok = res.ok;
      if (!ok) detail = await res.text();
    } catch (e) {
      detail = (e as Error).message;
    }

    if (ok) {
      await admin
        .from("notification_deliveries")
        .update({ status: "sent", provider: "resend", sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      sent++;
    } else {
      const giveUp = row.attempts + 1 >= MAX_ATTEMPTS;
      await admin
        .from("notification_deliveries")
        .update({ status: giveUp ? "failed" : "pending", error: detail.slice(0, 500) })
        .eq("id", row.id);
      failed++;
    }
  }

  return json({ considered: rows.length, sent, failed, skipped });
});

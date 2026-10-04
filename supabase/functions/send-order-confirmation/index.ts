import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Sends the customer their own copy of a food order.
 *
 * Without it, the browser URL is the only record a guest ever has: there is no
 * account to attach the order to, and losing the tab loses the reference.
 *
 * Authorization note, same shape as `send-partner-confirmation`: it is called
 * from the browser, so it takes only an order id — never an address. It reads
 * the row with the service role and mails whatever address is stored on it, so
 * it cannot be pointed at an arbitrary recipient. `confirmation_sent_at` makes
 * it single-shot and the fifteen-minute window stops an old order being
 * re-triggered by someone replaying the id.
 *
 * The tracking link deliberately carries no telephone. `track_food_order` asks
 * for the reference *and* the number, and a link that answered both halves
 * would turn a forwarded email into a key. The recipient knows their own
 * number; the email says so.
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

const MODE_LABELS: Record<string, string> = {
  pickup: "À emporter",
  delivery: "Livraison",
  dine_in: "Sur place",
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const money = (n: number) =>
  `${n.toFixed(2).replace(/\.00$/, "")} $`.replace(".", ",");

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return json({ error: "Body must be { id: <uuid> }" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: order, error } = await supabase
    .from("restaurant_orders")
    .select(
      "id, reference, customer_name, customer_email, fulfillment, scheduled_for, total, currency, payment_method, listing_id, listings(name)",
    )
    .eq("id", id)
    .is("confirmation_sent_at", null)
    .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  // Already sent, too old, or unknown id — all indistinguishable on purpose.
  if (!order) return json({ skipped: true }, 200);

  // The address is optional at checkout. No address, nothing to send, and
  // nothing broken: the order itself is unaffected.
  if (!order.customer_email) return json({ skipped: true, reason: "no email" }, 200);

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY is not configured" }, 503);
  }

  const { data: items } = await supabase
    .from("restaurant_order_items")
    .select("name, quantity, line_total")
    .eq("order_id", order.id)
    .order("position");

  const restaurant = (order.listings as { name: string } | null)?.name ?? "le restaurant";
  const mode = MODE_LABELS[order.fulfillment] ?? order.fulfillment;
  const lines = (items ?? [])
    .map(
      it => `<tr>
            <td style="padding:6px 0;font-size:14px;color:#3E2C23;">${escapeHtml(String(it.quantity))} × ${escapeHtml(it.name)}</td>
            <td style="padding:6px 0;font-size:14px;color:#3E2C23;text-align:right;white-space:nowrap;">${money(Number(it.line_total))}</td>
          </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#F5E9D8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5E9D8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2d5c3;">
          <tr><td style="background:#002089;padding:24px 32px;">
            <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">PAPOT</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 4px;font-size:22px;color:#3E2C23;">Commande ${escapeHtml(order.reference)}</h1>
            <p style="margin:0 0 20px;font-size:14px;color:#7a6355;">
              ${escapeHtml(restaurant)} · ${escapeHtml(mode)}
            </p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Bonjour ${escapeHtml(order.customer_name)}, votre commande est partie au restaurant.
              Il la confirme avant de préparer.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2d5c3;border-bottom:1px solid #e2d5c3;margin-bottom:20px;">
              ${lines}
              <tr>
                <td style="padding:10px 0 6px;font-size:15px;font-weight:700;color:#3E2C23;border-top:1px solid #e2d5c3;">Total</td>
                <td style="padding:10px 0 6px;font-size:15px;font-weight:700;color:#3E2C23;text-align:right;border-top:1px solid #e2d5c3;">${money(Number(order.total))}</td>
              </tr>
            </table>
            <p style="margin:0 0 24px;">
              <a href="${SITE}/commande/${encodeURIComponent(order.reference)}"
                 style="display:inline-block;background:#e76f2e;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px;">
                Suivre ma commande
              </a>
            </p>
            <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#7a6355;">
              Le suivi vous demandera le numéro de téléphone laissé au restaurant.
              C'est ce qui empêche quelqu'un d'autre d'ouvrir votre commande.
            </p>
            <p style="margin:0;font-size:13px;color:#7a6355;">— L'équipe PAPOT</p>
          </td></tr>
        </table>
        <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#7a6355;text-align:center;">
          Vous recevez cet email car une commande a été passée avec cette adresse sur PAPOT.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [order.customer_email],
      subject: `Votre commande ${order.reference} — ${restaurant}`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Resend failed:", res.status, detail);
    // Leave confirmation_sent_at null so a retry is still possible.
    return json({ error: "Email provider rejected the request", status: res.status }, 502);
  }

  await supabase
    .from("restaurant_orders")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", order.id);

  return json({ sent: true });
});

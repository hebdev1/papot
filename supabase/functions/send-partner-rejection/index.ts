import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Tells an applicant their dossier was refused, and why.
 *
 * The admin screen already promises this: the confirm dialog behind "Refuser"
 * says "Le motif est conservé et transmis au demandeur", and
 * `admin_decide_application` refuses a rejection carrying fewer than five
 * characters of note. The reason was being stored in `review_note` and shown
 * to nobody.
 *
 * Same contract as the other mail functions: **an application id, never an
 * address**, read with the service role, mailed to whatever is on the row.
 * Single-shot on `rejection_sent_at`, its own column — see the migration for
 * why it is not shared with `approval_sent_at`.
 *
 * Two things this letter deliberately does NOT do:
 *   * no link to /partenaire. There is no space to reach, and a button that
 *     leads to a dead end on top of a refusal is worse than no button;
 *   * no invented explanation. If an admin somehow recorded no reason, the
 *     mail says the decision plainly rather than inventing a motive — but the
 *     RPC makes that nearly impossible, which is why the reason is quoted as
 *     given rather than paraphrased.
 *
 * `review_note` is free text an admin typed, so it goes through `escapeHtml`
 * like every other interpolation here.
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

const TYPE_LABELS: Record<string, string> = {
  hotel: "Hôtel",
  guesthouse: "Maison d'hôtes",
  restaurant: "Restaurant",
  car: "Location de voiture",
  bus: "Transport par autocar",
};

const escapeHtml = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

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

  const { data: app, error } = await supabase
    .from("partner_applications")
    .select("id, type, first_name, email, business_name, status, review_note, rejection_sent_at")
    .eq("id", id)
    .eq("status", "rejected")
    .is("rejection_sent_at", null)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  // Not refused, already told, or unknown id — all indistinguishable on purpose.
  if (!app) return json({ skipped: true }, 200);

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY is not configured" }, 503);
  }

  const label = TYPE_LABELS[app.type] ?? app.type;
  const business = app.business_name ?? label;
  const reason = String(app.review_note ?? "").trim();

  const reasonBlock = reason
    ? `<div style="margin:0 0 24px;padding:16px 18px;background:#F5E9D8;border-radius:12px;">
         <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#7a6355;">
           Motif
         </p>
         <p style="margin:0;font-size:15px;line-height:1.6;color:#3E2C23;">
           ${escapeHtml(reason)}
         </p>
       </div>`
    : "";

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
            <h1 style="margin:0 0 16px;font-size:22px;color:#3E2C23;">Votre dossier n'a pas été retenu</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Bonjour ${escapeHtml(app.first_name)},
            </p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Nous avons examiné votre demande de partenariat pour
              <strong>${escapeHtml(String(business))}</strong> (${escapeHtml(label)}),
              et nous ne pouvons pas y donner suite pour le moment.
            </p>
            ${reasonBlock}
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Cette décision ne vous ferme pas la porte : si la situation évolue ou si le
              point ci-dessus peut être corrigé, vous pouvez déposer un nouveau dossier
              depuis <a href="${SITE}" style="color:#002089;font-weight:600;">papotht.com</a>.
            </p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#7a6355;">
              Si quelque chose vous semble inexact, répondez simplement à cet e-mail.
            </p>
            <p style="margin:0;font-size:13px;color:#7a6355;">— L'équipe PAPOT</p>
          </td></tr>
        </table>
        <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#7a6355;text-align:center;">
          Vous recevez cet email car une demande de partenariat a été soumise avec cette adresse sur PAPOT.
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
      to: [app.email],
      subject: `Votre demande de partenariat PAPOT — ${business}`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Resend failed:", res.status, detail);
    // Leave rejection_sent_at null so a retry is still possible.
    return json({ error: "Email provider rejected the request", status: res.status }, 502);
  }

  await supabase
    .from("partner_applications")
    .update({ rejection_sent_at: new Date().toISOString() })
    .eq("id", app.id);

  return json({ sent: true, to: app.email, had_reason: reason.length > 0 });
});

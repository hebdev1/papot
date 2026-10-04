import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Sends the confirmation email the success screen promises.
 *
 * Authorization note: this is called from the browser, so it takes only an
 * application id — never an address. It looks the row up with the service role
 * and mails whatever address is stored there, so it cannot be used to send mail
 * to an arbitrary recipient. `confirmation_sent_at` makes it single-shot, and
 * the 15-minute window stops old applications being re-triggered.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("PARTNER_EMAIL_FROM") ?? "PAPOT <onboarding@resend.dev>";

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
  guesthouse: "Maison d'hôtes",
  restaurant: "Restaurant",
  car: "Location de voiture",
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c =>
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
    .select("id, type, first_name, email, business_name, created_at, confirmation_sent_at")
    .eq("id", id)
    .is("confirmation_sent_at", null)
    .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  // Already sent, too old, or unknown id — all indistinguishable on purpose.
  if (!app) return json({ skipped: true }, 200);

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY is not configured" }, 503);
  }

  const label = TYPE_LABELS[app.type] ?? app.type;
  // `details` n'existe plus sur cette table : le nom du commerce vit dans
  // `business_name` depuis que le formulaire a ete refait. La fonction
  // demandait toujours l'ancienne colonne, PostgREST refusait la requete, et
  // elle rendait 500 a chaque appel -- silencieusement, puisque rien ne
  // l'appelait.
  const business = app.business_name ?? label;

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
            <h1 style="margin:0 0 16px;font-size:22px;color:#3E2C23;">Demande bien reçue \u{1F389}</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Bonjour ${escapeHtml(app.first_name)},
            </p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Nous avons bien reçu votre demande de partenariat pour
              <strong>${escapeHtml(String(business))}</strong> (${escapeHtml(label)}).
              Notre équipe partenaires examine votre dossier et revient vers vous
              sous 24 heures ouvrées.
            </p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#7a6355;">
              Aucune action de votre part n'est nécessaire pour le moment.
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
      subject: "Votre demande de partenariat PAPOT",
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
    .from("partner_applications")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", app.id);

  return json({ sent: true });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Tells an applicant their dossier was approved, and where to sign in.
 *
 * Approval had been silent since the beginning: `admin_decide_application`
 * creates the business, the owner membership and the draft listings, writes an
 * audit row, and stops. Meanwhile the wizard promises this email twice — "Vous
 * recevrez un e-mail de confirmation avec le statut de votre demande" and
 * "Vous serez notifié par e-mail dès que votre annonce sera approuvée".
 *
 * Same authorization shape as the receipt: it takes **an application id, never
 * an address**. It reads the row with the service role and mails whatever is
 * stored there, so it cannot be pointed at an arbitrary recipient.
 * `approval_sent_at` makes it single-shot — a separate column from the
 * receipt's `confirmation_sent_at`, because these are two different letters
 * sent days apart and one flag could not track both.
 *
 * Unlike the receipt there is **no 15-minute window**: approval happens
 * whenever an admin gets to the dossier. The guard is the status plus the flag.
 *
 * The letter has to survive two awkward truths about real data:
 *   * the contact address on the form and the account that will actually sign
 *     in can differ (they do on the first bus company), so when they differ the
 *     mail names the account;
 *   * the owner may have no account yet — approval writes the membership as
 *     `invited` against an address — so the mail says to use exactly that one.
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

/** The receipt's copy of this list is stale — it predates hotels and buses. */
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
    .select("id, type, first_name, email, business_name, status, approval_sent_at")
    .eq("id", id)
    .eq("status", "accepted")
    .is("approval_sent_at", null)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  // Not approved, already told, or unknown id — all indistinguishable on purpose.
  if (!app) return json({ skipped: true }, 200);

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY is not configured" }, 503);
  }

  // The business approval produced, and the owner seat inside it. Read
  // separately rather than as one nested select: these are two different
  // questions, and a missing partner row should not take the whole mail down.
  const { data: partner } = await supabase
    .from("partners")
    .select("id, business_name")
    .eq("application_id", app.id)
    .maybeSingle();

  let ownerEmail: string | null = null;
  let ownerHasAccount = true;
  if (partner?.id) {
    const { data: owner } = await supabase
      .from("partner_members")
      .select("email, user_id")
      .eq("partner_id", partner.id)
      .eq("role", "owner")
      .maybeSingle();
    if (owner) {
      ownerEmail = owner.email ?? null;
      ownerHasAccount = owner.user_id !== null;
    }
  }

  const label = TYPE_LABELS[app.type] ?? app.type;
  const business = partner?.business_name ?? app.business_name ?? label;
  const sameAddress =
    !ownerEmail || ownerEmail.trim().toLowerCase() === String(app.email).trim().toLowerCase();

  // Three situations, three different sentences. Saying "connectez-vous" to
  // somebody who has no account yet, or omitting the address when the dossier
  // was filed from a different mailbox, is how an approved partner ends up
  // unable to find their own dashboard.
  const accountNote = !ownerHasAccount
    ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3E2C23;">
         Votre invitation est enregistrée sur l'adresse
         <strong>${escapeHtml(ownerEmail ?? String(app.email))}</strong>. Connectez-vous
         avec cette adresse exacte, ou créez votre compte avec elle : c'est ce qui
         rattache votre espace à votre entreprise.
       </p>`
    : sameAddress
      ? ""
      : `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3E2C23;">
           Connectez-vous avec le compte
           <strong>${escapeHtml(ownerEmail!)}</strong> — c'est celui qui est rattaché à
           votre espace partenaire.
         </p>`;

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
            <h1 style="margin:0 0 16px;font-size:22px;color:#3E2C23;">C'est approuvé \u{1F389}</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Bonjour ${escapeHtml(app.first_name)},
            </p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Votre dossier pour <strong>${escapeHtml(String(business))}</strong>
              (${escapeHtml(label)}) est accepté. Votre espace partenaire est ouvert :
              vous pouvez y gérer vos annonces, vos réservations et vos revenus.
            </p>
            ${accountNote}
            <p style="margin:0 0 28px;">
              <a href="${SITE}/partenaire"
                 style="display:inline-block;background:#e76f2e;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:12px;">
                Accéder à mon tableau de bord
              </a>
            </p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">
              Première étape : vos annonces ont été créées en <strong>brouillon</strong> à
              partir de votre dossier. Complétez-les et publiez-les — elles n'apparaissent
              pas encore dans les recherches tant qu'elles ne sont pas publiées.
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
      subject: `Votre espace partenaire PAPOT est ouvert — ${business}`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Resend failed:", res.status, detail);
    // Leave approval_sent_at null so a retry is still possible.
    return json({ error: "Email provider rejected the request", status: res.status }, 502);
  }

  await supabase
    .from("partner_applications")
    .update({ approval_sent_at: new Date().toISOString() })
    .eq("id", app.id);

  return json({ sent: true, to: app.email, account: ownerEmail, has_account: ownerHasAccount });
});

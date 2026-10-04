import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { render, verifyUrl } from "./_templates.ts";

/**
 * Le Send Email Hook : PAPOT envoie lui-même ses courriels d'authentification.
 *
 * Avant, c'était Supabase : gabarits anglais modifiables seulement dans le
 * tableau de bord, expéditeur `noreply@mail.app.supabase.io`, et surtout --
 * tant qu'aucun SMTP personnalisé n'est configuré -- une livraison refusée
 * pour toute adresse étrangère à l'organisation. Autrement dit, aucun vrai
 * client ne recevait son lien de réinitialisation.
 *
 * Ici les gabarits sont dans `_templates.ts`, en français, versionnés, et le
 * courrier part par Resend comme les deux autres courriels du projet.
 *
 * ## Ce qui authentifie l'appel
 *
 * Pas un JWT : le hook se déclenche avant qu'il en existe un. C'est la
 * signature Standard Webhooks qui fait foi, vérifiée avec le secret partagé
 * avec GoTrue. Sans secret, la fonction refuse de servir -- une fonction
 * d'envoi de courriel non authentifiée est une machine à spam avec l'adresse
 * du projet dessus.
 *
 * ## Ce qui est en jeu si elle échoue
 *
 * Une fois le hook activé côté Supabase, **plus aucun courriel
 * d'authentification ne part sans passer par ici**. Une erreur bloque les
 * inscriptions et les réinitialisations. D'où deux précautions : le budget de
 * cinq secondes est respecté (un seul appel réseau, pas de rendu lourd), et
 * un type d'action inconnu reçoit quand même un courriel générique correct
 * plutôt que rien du tout.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
const FROM = Deno.env.get("AUTH_EMAIL_FROM") ?? "PAPOTHT <onboarding@resend.dev>";
const SITE = (Deno.env.get("SITE_URL") ?? "https://papotht.com").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GoTrue exige du JSON sur toutes les réponses, y compris les erreurs. */
const fail = (message: string, status = 500, httpCode = status) =>
  new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status,
    headers: JSON_HEADERS,
  });

type HookPayload = {
  user: { email: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
  };
};

Deno.serve(async req => {
  if (req.method !== "POST") return fail("Method not allowed", 405);

  if (!HOOK_SECRET) {
    console.error("SEND_EMAIL_HOOK_SECRET is not configured");
    return fail("Hook secret is not configured", 500);
  }
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not configured");
    return fail("Email provider is not configured", 500);
  }

  const raw = await req.text();
  let payload: HookPayload;
  try {
    // Le secret arrive sous la forme `v1,whsec_<base64>` ; la bibliothèque
    // attend la partie base64 seule. Plusieurs secrets séparés par `|`
    // permettent une rotation : on les essaie l'un après l'autre.
    const secrets = HOOK_SECRET.split("|").map(s => s.trim().replace("v1,whsec_", ""));
    const headers = Object.fromEntries(req.headers);
    let verified: unknown = null;
    let last: unknown = null;
    for (const secret of secrets) {
      try {
        verified = new Webhook(secret).verify(raw, headers);
        break;
      } catch (e) {
        last = e;
      }
    }
    if (!verified) throw last ?? new Error("signature mismatch");
    payload = verified as HookPayload;
  } catch (e) {
    console.error("Webhook signature rejected:", e);
    return fail("Invalid signature", 401, 401);
  }

  const { user, email_data: d } = payload;
  const action = d.email_action_type;

  // `email_change_new` porte le jeton de la *nouvelle* adresse ; les autres
  // utilisent le jeton principal. Se tromper ici enverrait un lien qui ne
  // valide rien.
  const tokenHash = action === "email_change_new" ? d.token_hash_new : d.token_hash;
  const token = action === "email_change_new" ? d.token_new : d.token;

  const link = verifyUrl({
    supabaseUrl: SUPABASE_URL,
    tokenHash,
    type: action,
    redirectTo: d.redirect_to || SITE,
  });

  const { subject, html } = render({
    action,
    link,
    token,
    email: user.email,
    siteUrl: SITE,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, ...JSON_HEADERS },
    body: JSON.stringify({ from: FROM, to: [user.email], subject, html }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Resend failed:", res.status, detail);
    // 429 et 503 sont les seuls codes que GoTrue réessaie. Une panne
    // passagère du fournisseur mérite une deuxième chance ; un refus ferme
    // (adresse invalide, domaine non vérifié) n'en mérite pas.
    const retryable = res.status === 429 || res.status >= 500;
    return new Response(
      JSON.stringify({ error: { http_code: res.status, message: "Email provider rejected the request" } }),
      {
        status: retryable ? 429 : 500,
        headers: retryable ? { ...JSON_HEADERS, "retry-after": "true" } : JSON_HEADERS,
      },
    );
  }

  return new Response(JSON.stringify({}), { status: 200, headers: JSON_HEADERS });
});

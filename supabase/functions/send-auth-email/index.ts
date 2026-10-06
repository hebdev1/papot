import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { render, verifyUrl, type VerifyType } from "./_templates.ts";

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
 * inscriptions et les réinitialisations. D'où l'invariant du fichier : GoTrue
 * reçoit du JSON quoi qu'il arrive, et chaque entrée manquante est refusée
 * fort plutôt que contournée en silence.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
/**
 * Plus de repli.
 *
 * `?? "PAPOTHT <onboarding@resend.dev>"` était le bac à sable de Resend, qui ne
 * livre qu'au titulaire du compte -- exactement la panne que cette fonction
 * existe pour réparer, et la seule des entrées qui échouait en silence : les
 * logs disaient 200, les clients ne recevaient rien.
 */
const FROM = Deno.env.get("AUTH_EMAIL_FROM");
const SITE = (Deno.env.get("SITE_URL") ?? "https://papotht.com").replace(/\/$/, "");
/** Injectée par la plateforme. `?? ""` donnait `new URL("/auth/v1/verify")`
 *  sans base, donc un TypeError non rattrapé et une réponse non-JSON. */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * GoTrue exige du JSON sur toutes les réponses, erreurs comprises.
 *
 * `http_code` est le code que GoTrue doit rendre à *l'application*, et
 * `message` la phrase que l'application montrera à la personne. Ni l'un ni
 * l'autre n'est le code ou le message d'un fournisseur tiers : l'ancienne
 * version mettait `http_code: 503` dans une réponse 429 et faisait remonter
 * « Email provider rejected the request » jusqu'au client.
 */
const fail = (message: string, status = 500) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: JSON_HEADERS,
  });

/**
 * Une erreur que GoTrue réessaiera.
 *
 * Deux conditions documentées : un statut 429 ou 503, et un en-tête
 * `retry-after` non vide. Supabase ne lit pas la valeur (« we only check if it
 * is a non-empty value such as `true` or `10` »), d'où `true`. Un 403 ou un
 * 400 de Resend n'arrive pas ici : la documentation prescrit 500 pour
 * ceux-là, et un refus ferme ne se répare pas en réessayant.
 */
const retry = (message: string, status: 429 | 503) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { ...JSON_HEADERS, "retry-after": "true" },
  });

/**
 * Ce que GoTrue envoie.
 *
 * `user` est le modèle utilisateur sérialisé, pas seulement une adresse :
 * `new_email` y est, et c'est la seule façon de savoir à quelle adresse le
 * message de changement doit partir.
 */
type HookPayload = {
  user: { id?: string; email?: string; new_email?: string };
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

/**
 * Ce que chaque type d'action doit produire.
 *
 * `email_action_type` et le paramètre `type` de `/auth/v1/verify` sont deux
 * vocabulaires différents, et les confondre est ce qui tuait les liens de
 * changement d'adresse : `/verify` n'accepte que `signup`, `invite`,
 * `recovery`, `magiclink`, `email_change` et `email`, et répond « Unsupported
 * verification type » à tout le reste. GoTrue fait lui-même la correspondance
 * dans `GetEmailActionLink` : `email_change_current` et `email_change_new`
 * deviennent tous deux `email_change`.
 *
 * Trois formes de courriel, pas une :
 *   `link`   un lien de vérification ;
 *   `code`   un code à six chiffres et aucun lien -- `reauthentication` n'a pas
 *            de type de vérification, il n'y a donc pas de lien à fabriquer ;
 *   `notice` une notification : il n'y a rien à confirmer, donc surtout pas de
 *            bouton « Confirmer » qui mènerait à une erreur.
 */
type Delivery =
  | { kind: "link"; verify: VerifyType; change?: "current" | "new" | "both" }
  | { kind: "code" }
  | { kind: "notice" };

const DELIVERY: Record<string, Delivery> = {
  // Un seul couple de jetons, une seule adresse.
  signup: { kind: "link", verify: "signup" },
  invite: { kind: "link", verify: "invite" },
  magiclink: { kind: "link", verify: "magiclink" },
  recovery: { kind: "link", verify: "recovery" },
  email: { kind: "link", verify: "email" },

  // Une seule invocation portant les deux couples : il faut écrire aux deux
  // adresses. C'est la forme documentée aujourd'hui.
  email_change: { kind: "link", verify: "email_change", change: "both" },
  // Les deux invocations séparées des versions antérieures de GoTrue. Les deux
  // formes sont gérées parce qu'on ne sait pas laquelle ce projet émet.
  email_change_current: { kind: "link", verify: "email_change", change: "current" },
  email_change_new: { kind: "link", verify: "email_change", change: "new" },

  // Un code, pas un lien : `reauthentication` n'existe pas dans `/verify`.
  reauthentication: { kind: "code" },

  // Rien à vérifier : le changement est déjà fait, on l'annonce.
  password_changed_notification: { kind: "notice" },
  email_changed_notification: { kind: "notice" },
  phone_changed_notification: { kind: "notice" },
  identity_linked_notification: { kind: "notice" },
  identity_unlinked_notification: { kind: "notice" },
  mfa_factor_enrolled_notification: { kind: "notice" },
  mfa_factor_unenrolled_notification: { kind: "notice" },
};

/**
 * Un type que GoTrue ajouterait plus tard.
 *
 * L'ancienne version fabriquait un lien portant le type inconnu, donc un bouton
 * « Confirmer » qui répond « Unsupported verification type ». Un courriel part
 * toujours -- le compte ne doit pas rester bloqué sans explication -- mais sans
 * lien : on ne peut pas deviner un type de vérification, et un lien mort est
 * pire qu'un code.
 */
const deliveryFor = (action: string, d: HookPayload["email_data"]): Delivery =>
  DELIVERY[action] ?? (d.token || d.token_new ? { kind: "code" } : { kind: "notice" });

/** Un message à envoyer. `template` est la clé lue par `render`. */
type Plan = { to: string; template: string; tokenHash: string; token: string };

/**
 * À qui écrire, avec quel jeton.
 *
 * Le piège est dans le nom des champs, et la documentation du hook le dit :
 * « The token hash field names are reversed due to backward compatibility...
 * `token_hash_new` -> use with the **current** email address (`user.email`) and
 * `token` ; `token_hash` -> use with the **new** email address
 * (`user.new_email`) and `token_new`. Do not assume the `_new` suffix refers to
 * the new email address. »
 *
 * L'ancienne version lisait ces noms au premier degré : pour
 * `email_change_new` elle envoyait le jeton de l'adresse *actuelle* à l'adresse
 * *actuelle*. Deux erreurs qui s'additionnent.
 *
 * Les `||` ne sont pas de la prudence décorative. Hors changement d'adresse,
 * `token_hash_new` et `token_new` sont des chaînes vides et le couple unique
 * est `token_hash` / `token` : c'est ce repli qui fait marcher signup,
 * recovery, magiclink, invite et email. Et si GoTrue inversait un jour ces
 * noms, un mauvais pari dégrade en « un des deux courriels porte le jeton de
 * l'autre » plutôt qu'en « aucun courriel ».
 */
function planFor(payload: HookPayload, delivery: Delivery): Plan[] {
  const { user, email_data: e } = payload;
  const action = e.email_action_type;

  // Flux à un seul jeton, plus `code` et `notice`.
  if (delivery.kind !== "link" || !delivery.change) {
    return user.email
      ? [{
          to: user.email,
          template: action,
          tokenHash: e.token_hash || e.token_hash_new,
          token: e.token || e.token_new,
        }]
      : [];
  }

  // Changement d'adresse. Noms de champs inversés, voir ci-dessus.
  const toCurrent: Plan | null = user.email
    ? {
        to: user.email,
        template: "email_change_current",
        tokenHash: e.token_hash_new || e.token_hash,
        token: e.token || e.token_new,
      }
    : null;

  const pending = user.new_email || user.email;
  const toNew: Plan | null = pending
    ? {
        to: pending,
        template: "email_change_new",
        tokenHash: e.token_hash || e.token_hash_new,
        token: e.token_new || e.token,
      }
    : null;

  if (delivery.change === "current") return toCurrent ? [toCurrent] : [];
  if (delivery.change === "new") return toNew ? [toNew] : [];

  // « Secure Email Change » actif : deux couples, deux courriels. Inactif : un
  // seul couple, et seule la nouvelle adresse est à confirmer.
  const secure = !!(e.token_hash && e.token_hash_new);
  if (!secure) return toNew ? [toNew] : [];
  return [toCurrent, toNew].filter((p): p is Plan => !!p);
}

Deno.serve(async req => {
  /**
   * Un seul `try`, pour une seule raison : l'invariant du fichier est que
   * GoTrue reçoive du JSON quoi qu'il arrive. Sans lui, un `SUPABASE_URL`
   * absent, un `req.text()` interrompu ou une coupure réseau sur `fetch`
   * remontent jusqu'à Deno.serve, qui répond 500 en `text/plain` -- et GoTrue
   * n'y lit rien.
   */
  try {
    if (req.method !== "POST") return fail("Method not allowed", 405);

    if (!HOOK_SECRET) {
      console.error("SEND_EMAIL_HOOK_SECRET is not configured");
      return fail("Hook secret is not configured");
    }
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return fail("Email provider is not configured");
    }
    if (!FROM) {
      console.error("AUTH_EMAIL_FROM is not configured");
      return fail("Email sender is not configured");
    }
    if (!SUPABASE_URL) {
      console.error("SUPABASE_URL is not configured");
      return fail("Project URL is not configured");
    }

    const raw = await req.text();
    let payload: HookPayload;
    try {
      // Le secret arrive sous la forme `v1,whsec_<base64>` ; la bibliothèque
      // attend la partie base64 seule. Plusieurs secrets séparés par `|`
      // permettent une rotation : on les essaie l'un après l'autre.
      const secrets = HOOK_SECRET.split("|").map(s => s.trim().replace("v1,whsec_", ""));
      const headers = Object.fromEntries(req.headers);

      // Un booléen explicite. La vérité de la charge utile analysée n'est pas
      // un drapeau de succès : un corps correctement signé qui s'analyse en
      // `null`, `0`, `false` ou `""` était rapporté comme signature invalide.
      let verified = false;
      let parsed: unknown = null;
      let last: unknown = null;
      for (const secret of secrets) {
        try {
          parsed = new Webhook(secret).verify(raw, headers);
          verified = true;
          break;
        } catch (e) {
          last = e;
        }
      }
      if (!verified) throw last ?? new Error("signature mismatch");
      payload = parsed as HookPayload;
    } catch (e) {
      console.error("Webhook signature rejected:", e);
      return fail("Invalid signature", 401);
    }

    const action = payload?.email_data?.email_action_type ?? "";
    const delivery = deliveryFor(action, payload.email_data);
    const plan = planFor(payload, delivery);

    if (plan.length === 0) {
      // Aucune adresse dans la charge utile. Échouer fort plutôt que répondre
      // 200 : « succès » sans courriel envoyé est la classe de bug qu'on
      // répare ici.
      console.error("Hook payload carries no recipient; action:", action);
      return fail("No recipient in the hook payload");
    }

    const messages = plan.map(p => {
      const link =
        delivery.kind === "link"
          ? verifyUrl({
              supabaseUrl: SUPABASE_URL,
              tokenHash: p.tokenHash,
              type: delivery.verify,
              redirectTo: payload.email_data.redirect_to || SITE,
            })
          : "";
      const { subject, html } = render({
        template: p.template,
        link,
        token: p.token,
        email: p.to,
        siteUrl: SITE,
      });
      return { to: p.to, subject, html };
    });

    // En parallèle : le budget du hook est de cinq secondes au total, retries
    // compris. Le seul cas à deux messages est le changement d'adresse, et
    // deux appels simultanés coûtent la latence d'un seul.
    const results = await Promise.all(
      messages.map(m =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, ...JSON_HEADERS },
          body: JSON.stringify({ from: FROM, to: [m.to], subject: m.subject, html: m.html }),
        }),
      ),
    );

    const refused: { status: number; detail: string }[] = [];
    for (const res of results) {
      if (res.ok) continue;
      refused.push({ status: res.status, detail: await res.text() });
    }
    if (refused.length === 0) {
      return new Response(JSON.stringify({}), { status: 200, headers: JSON_HEADERS });
    }

    // Le détail va dans les logs, où quelqu'un peut agir dessus. Un 403
    // « domain is not verified » se lit ici et nulle part ailleurs : Resend
    // n'a jamais accepté le message, il n'y a donc aucune ligne à inspecter
    // dans sa liste d'envois.
    for (const r of refused) console.error("Resend refused:", r.status, r.detail);

    const rateLimited = refused.some(r => r.status === 429);
    const transient = rateLimited || refused.some(r => r.status >= 500);
    return transient
      ? retry(
          "L'envoi du courriel a échoué. Réessayez dans quelques instants.",
          rateLimited ? 429 : 503,
        )
      : fail("Le courriel n'a pas pu être envoyé. Si cela se reproduit, contactez PAPOT.");
  } catch (e) {
    console.error("send-auth-email crashed:", e);
    return fail("Unexpected error while sending the email");
  }
});

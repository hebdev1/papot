/**
 * Les gabarits des courriels d'authentification, en français et aux couleurs
 * de PAPOTHT.
 *
 * Ils vivaient dans le tableau de bord Supabase, en anglais — « Reset your
 * password », « Confirm your signup » — et personne ne pouvait les relire sans
 * ouvrir une console. Ici ils sont dans le dépôt : versionnés, relisibles en
 * diff, et identiques à ceux que le projet envoie déjà pour une commande ou
 * une candidature partenaire. Un client qui reçoit les trois doit reconnaître
 * le même expéditeur.
 *
 * Le coffrage est volontairement le même que `send-order-confirmation` et
 * `send-partner-confirmation` : bandeau bleu, carte blanche, pied de page
 * gris. Si l'un change, changer les trois.
 */

export type AuthEmail = { subject: string; html: string };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Le coffrage commun. `footnote` explique pourquoi ce courriel est arrivé. */
function shell(opts: { title: string; body: string; footnote: string }): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#F5E9D8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5E9D8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2d5c3;">
          <tr><td style="background:#002089;padding:24px 32px;">
            <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">PAPOTHT</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:#3E2C23;">${opts.title}</h1>
            ${opts.body}
            <p style="margin:24px 0 0;font-size:13px;color:#7a6355;">— L'équipe PAPOT</p>
          </td></tr>
        </table>
        <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#7a6355;text-align:center;">
          ${opts.footnote}
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:0 0 20px;">
      <a href="${href}" style="display:inline-block;background:#e76f2e;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px;">${label}</a>
    </p>`;

const para = (text: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">${text}</p>`;

const quiet = (text: string) =>
  `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#7a6355;">${text}</p>`;

/** Le code à six chiffres, pour les cas qui n'ont pas de lien. */
const codeBlock = (token: string) =>
  `<p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#002089;background:#E9F9FE;border-radius:12px;padding:16px;text-align:center;">${escapeHtml(token)}</p>`;

/**
 * Les liens ne sont jamais fabriqués à la main : c'est `/auth/v1/verify` qui
 * consomme le jeton et renvoie ensuite vers `redirect_to`. Court-circuiter ce
 * chemin casserait la vérification.
 */
export function verifyUrl(opts: {
  supabaseUrl: string;
  tokenHash: string;
  type: string;
  redirectTo: string;
}): string {
  const u = new URL(`${opts.supabaseUrl.replace(/\/$/, "")}/auth/v1/verify`);
  u.searchParams.set("token", opts.tokenHash);
  u.searchParams.set("type", opts.type);
  if (opts.redirectTo) u.searchParams.set("redirect_to", opts.redirectTo);
  return u.toString();
}

const WHY_YOU_GOT_THIS =
  "Vous recevez ce message parce que cette adresse a été utilisée sur PAPOT. Si ce n'était pas vous, ignorez-le : sans le lien ci-dessus, rien ne se passe.";

export function render(opts: {
  action: string;
  link: string;
  token: string;
  email: string;
  siteUrl: string;
}): AuthEmail {
  const { action, link, token, email, siteUrl } = opts;

  switch (action) {
    case "signup":
      return {
        subject: "Confirmez votre adresse — PAPOTHT",
        html: shell({
          title: "Bienvenue sur PAPOT",
          body:
            para("Il reste une étape : confirmer que cette adresse est bien la vôtre.") +
            button(link, "Confirmer mon adresse") +
            quiet("Ce lien est valable une heure.") +
            quiet(`Vous pouvez aussi saisir ce code : <strong>${escapeHtml(token)}</strong>`),
          footnote: WHY_YOU_GOT_THIS,
        }),
      };

    case "recovery":
      return {
        subject: "Réinitialiser votre mot de passe — PAPOTHT",
        html: shell({
          title: "Nouveau mot de passe",
          body:
            para("Vous avez demandé à réinitialiser le mot de passe de votre compte PAPOT.") +
            button(link, "Choisir un nouveau mot de passe") +
            quiet("Ce lien est valable une heure et ne sert qu'une fois.") +
            quiet(
              "Si vous connaissez encore votre mot de passe actuel, vous pouvez le changer " +
                `directement depuis votre compte : <a href="${siteUrl}/compte/securite" style="color:#002089;">Sécurité</a>.`,
            ),
          footnote:
            "Vous recevez ce message parce qu'une réinitialisation a été demandée pour " +
            `${escapeHtml(email)}. Si ce n'était pas vous, ignorez-le : votre mot de passe reste inchangé.`,
        }),
      };

    case "magiclink":
      return {
        subject: "Votre lien de connexion — PAPOTHT",
        html: shell({
          title: "Se connecter",
          body:
            para("Voici votre lien de connexion. Il ouvre votre compte sans mot de passe.") +
            button(link, "Me connecter") +
            quiet("Ce lien est valable une heure et ne sert qu'une fois.") +
            quiet(`Vous pouvez aussi saisir ce code : <strong>${escapeHtml(token)}</strong>`),
          footnote: WHY_YOU_GOT_THIS,
        }),
      };

    case "invite":
      return {
        subject: "Vous êtes invité sur PAPOTHT",
        html: shell({
          title: "Une invitation vous attend",
          body:
            para("Quelqu'un vous a invité à rejoindre PAPOT. Le lien ci-dessous crée votre compte.") +
            button(link, "Accepter l'invitation") +
            quiet("Ce lien est valable une heure."),
          footnote:
            `Vous recevez ce message parce que ${escapeHtml(email)} a été invitée sur PAPOT. ` +
            "Si cela ne vous dit rien, ignorez-le.",
        }),
      };

    case "email_change":
    case "email_change_new":
      return {
        subject: "Confirmez votre nouvelle adresse — PAPOTHT",
        html: shell({
          title: "Changement d'adresse",
          body:
            para("Confirmez cette adresse pour qu'elle devienne celle de votre compte PAPOT.") +
            button(link, "Confirmer cette adresse") +
            quiet("Tant que les deux adresses n'ont pas confirmé, rien ne change."),
          footnote:
            "Vous recevez ce message parce qu'un changement d'adresse a été demandé sur PAPOT. " +
            "Si ce n'était pas vous, ignorez-le et changez votre mot de passe.",
        }),
      };

    case "reauthentication":
      return {
        subject: "Votre code de vérification — PAPOTHT",
        html: shell({
          title: "Code de vérification",
          body:
            para("Saisissez ce code pour confirmer que c'est bien vous.") +
            codeBlock(token) +
            quiet("Il est valable quelques minutes. Ne le communiquez à personne."),
          footnote:
            "PAPOT ne vous demandera jamais ce code par téléphone ou par message. " +
            "Si vous n'avez rien demandé, ignorez ce courriel.",
        }),
      };

    default:
      // Un type que GoTrue ajouterait plus tard. Mieux vaut un message
      // générique mais correct qu'un courriel qui ne part pas : sans lui,
      // le compte reste bloqué.
      return {
        subject: "Confirmation — PAPOTHT",
        html: shell({
          title: "Confirmation",
          body:
            para("Une action sur votre compte PAPOT demande confirmation.") +
            button(link, "Confirmer") +
            quiet("Ce lien est valable une heure."),
          footnote: WHY_YOU_GOT_THIS,
        }),
      };
  }
}

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

// `escapeHtml` couvre `&`, `<`, `>`, `"` et `'` : exactement ce qu'il faut dans
// un attribut. `searchParams` percent-encode déjà les valeurs, donc rien n'est
// exploitable aujourd'hui — mais un `&` dans un attribut s'écrit `&amp;`, et
// c'était la seule interpolation du fichier à ne pas passer par ici.
const button = (href: string, label: string) =>
  `<p style="margin:0 0 20px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:#e76f2e;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px;">${escapeHtml(label)}</a>
    </p>`;

const para = (text: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C23;">${text}</p>`;

const quiet = (text: string) =>
  `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#7a6355;">${text}</p>`;

/** Le code à six chiffres, pour les cas qui n'ont pas de lien. */
const codeBlock = (token: string) =>
  `<p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#002089;background:#E9F9FE;border-radius:12px;padding:16px;text-align:center;">${escapeHtml(token)}</p>`;

/**
 * Les seules valeurs que `/auth/v1/verify` accepte pour `type`.
 *
 * Typé plutôt que `string`, et c'est tout l'intérêt : l'appelant passait
 * `email_action_type` tel quel, alors que ce sont deux vocabulaires différents.
 * `/verify` répond « Unsupported verification type » à tout ce qui n'est pas
 * dans cette union, et les liens de changement d'adresse ne validaient donc
 * rien. Désormais s'y tromper ne compile pas.
 */
export type VerifyType =
  | "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

/**
 * Les liens ne sont jamais fabriqués à la main : c'est `/auth/v1/verify` qui
 * consomme le jeton et renvoie ensuite vers `redirect_to`. Court-circuiter ce
 * chemin casserait la vérification.
 */
export function verifyUrl(opts: {
  supabaseUrl: string;
  tokenHash: string;
  type: VerifyType;
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

/**
 * Les notifications.
 *
 * GoTrue peut annoncer un changement *déjà fait* — mot de passe modifié,
 * identité liée, facteur MFA enrôlé. Il n'y a rien à confirmer, donc rien à
 * vérifier : l'ancienne version leur fabriquait pourtant un bouton
 * « Confirmer » portant un type que `/auth/v1/verify` refuse. La valeur d'un
 * courriel de sécurité tient entièrement à ce qu'on puisse lui faire
 * confiance ; un lien mort dessus apprend le contraire.
 */
const NOTICES: Record<string, { subject: string; title: string; what: string }> = {
  password_changed_notification: {
    subject: "Votre mot de passe a été modifié — PAPOTHT",
    title: "Mot de passe modifié",
    what: "Le mot de passe de votre compte PAPOT vient d'être changé.",
  },
  email_changed_notification: {
    subject: "L'adresse de votre compte a changé — PAPOTHT",
    title: "Adresse modifiée",
    what: "L'adresse courriel de votre compte PAPOT vient d'être changée.",
  },
  phone_changed_notification: {
    subject: "Votre numéro de téléphone a changé — PAPOTHT",
    title: "Numéro modifié",
    what: "Le numéro de téléphone de votre compte PAPOT vient d'être changé.",
  },
  identity_linked_notification: {
    subject: "Un nouveau mode de connexion a été ajouté — PAPOTHT",
    title: "Nouveau mode de connexion",
    what: "Un nouveau mode de connexion vient d'être rattaché à votre compte PAPOT.",
  },
  identity_unlinked_notification: {
    subject: "Un mode de connexion a été retiré — PAPOTHT",
    title: "Mode de connexion retiré",
    what: "Un mode de connexion vient d'être retiré de votre compte PAPOT.",
  },
  mfa_factor_enrolled_notification: {
    subject: "Vérification en deux étapes activée — PAPOTHT",
    title: "Deuxième facteur ajouté",
    what: "Une vérification en deux étapes vient d'être ajoutée à votre compte PAPOT.",
  },
  mfa_factor_unenrolled_notification: {
    subject: "Vérification en deux étapes retirée — PAPOTHT",
    title: "Deuxième facteur retiré",
    what: "Une vérification en deux étapes vient d'être retirée de votre compte PAPOT.",
  },
};

export function render(opts: {
  /** La clé du gabarit, choisie par `planFor` — pas toujours l'action brute. */
  template: string;
  /** Vide pour un `code` ou un `notice` : il n'y a pas de lien à offrir. */
  link: string;
  token: string;
  email: string;
  siteUrl: string;
}): AuthEmail {
  const { template, link, token, email, siteUrl } = opts;

  // Une notification : pas de bouton, et un chemin de reprise en main.
  const notice = NOTICES[template];
  if (notice) {
    return {
      subject: notice.subject,
      html: shell({
        title: notice.title,
        body:
          para(notice.what) +
          quiet("Si c'est bien vous, il n'y a rien à faire.") +
          quiet(
            "Si ce n'était pas vous, reprenez la main tout de suite : " +
              `<a href="${escapeHtml(siteUrl)}/reset-password" style="color:#002089;">changez votre mot de passe</a>.`,
          ),
        footnote:
          `Ce message est parti à ${escapeHtml(email)} parce qu'un réglage de sécurité de ce ` +
          "compte a changé. PAPOT ne vous demandera jamais votre mot de passe par courriel.",
      }),
    };
  }

  switch (template) {
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
                `directement depuis votre compte : <a href="${escapeHtml(siteUrl)}/compte/securite" style="color:#002089;">Sécurité</a>.`,
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

    /**
     * L'adresse actuelle.
     *
     * C'est elle que le hook émet sous `email_change_current`, et elle n'avait
     * aucun gabarit : le message tombait dans le `default` générique, qui
     * disait « Confirmez cette adresse » à quelqu'un dont l'adresse ne change
     * pas. Le titulaire actuel est pourtant la personne qu'il faut prévenir si
     * le changement n'est pas de lui.
     */
    case "email_change_current":
      return {
        subject: "Confirmez le changement d'adresse — PAPOTHT",
        html: shell({
          title: "Changement d'adresse demandé",
          body:
            para(
              "Une demande a été faite pour remplacer l'adresse de votre compte PAPOT. " +
                "Confirmez-la depuis cette adresse-ci, celle que vous utilisez aujourd'hui.",
            ) +
            button(link, "Confirmer depuis cette adresse") +
            quiet(
              "La nouvelle adresse reçoit son propre lien. Tant que les deux n'ont pas " +
                "confirmé, rien ne change et cette adresse reste la vôtre.",
            ),
          footnote:
            "Vous recevez ce message parce qu'un changement d'adresse a été demandé sur le " +
            `compte ${escapeHtml(email)}. Si ce n'était pas vous, n'ouvrez pas le lien et ` +
            "changez votre mot de passe : sans votre confirmation, l'adresse reste la vôtre.",
        }),
      };

    // `email_change` (une seule invocation portant les deux couples) et
    // `email_change_new` (deux invocations séparées) écrivent tous deux à la
    // nouvelle adresse.
    case "email_change":
    case "email_change_new":
      return {
        subject: "Confirmez votre nouvelle adresse — PAPOTHT",
        html: shell({
          title: "Votre nouvelle adresse",
          body:
            para("Confirmez cette adresse pour qu'elle devienne celle de votre compte PAPOT.") +
            button(link, "Confirmer cette adresse") +
            quiet("Tant que les deux adresses n'ont pas confirmé, rien ne change."),
          footnote:
            `Vous recevez ce message parce que ${escapeHtml(email)} a été indiquée comme ` +
            "nouvelle adresse d'un compte PAPOT. Si cela ne vous dit rien, ignorez-le.",
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
      /**
       * Un type que GoTrue ajouterait plus tard.
       *
       * Un courriel part quand même : sans lui, la personne attend quelque
       * chose qui ne vient pas. Mais **sans bouton** — on ne peut pas deviner
       * le type que `/verify` accepterait, et l'ancienne version en fabriquait
       * un portant le type inconnu, donc un « Confirmer » qui répond
       * « Unsupported verification type ». Un lien mort coûte plus qu'une
       * absence de lien. Le code à six chiffres, lui, est utilisable tel quel.
       */
      return {
        subject: "Action sur votre compte — PAPOTHT",
        html: shell({
          title: "Action sur votre compte",
          body:
            para("Une action sur votre compte PAPOT demande votre confirmation.") +
            (token
              ? codeBlock(token) + quiet("Saisissez ce code dans l'écran qui vous l'a demandé.")
              : "") +
            quiet(
              "Si vous attendiez un lien et qu'il n'est pas là, relancez la demande depuis " +
                `<a href="${escapeHtml(siteUrl)}" style="color:#002089;">papotht.com</a>.`,
            ),
          // Pas `WHY_YOU_GOT_THIS` : il dit « sans le lien ci-dessus, rien ne
          // se passe », et il n'y a justement plus de lien ici.
          footnote:
            `Ce message est parti à ${escapeHtml(email)} parce qu'une action a été engagée ` +
            "sur ce compte. Si vous n'avez rien demandé, ignorez-le.",
        }),
      };
  }
}

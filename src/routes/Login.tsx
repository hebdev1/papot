import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthError, AuthLayout, fieldInput, fieldLabel, ghostBtn, primaryBtn } from "../components/AuthLayout";
import { supabase } from "../lib/supabase";
import { sessionReturnUrl } from "../lib/authRedirect";
import { resolveSpaceHome } from "../lib/accountSpace";

/** Canvas 2a — /login */
export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  /**
   * Where to land after signing in. Guarded areas send the page they wanted as
   * ?next=, so a session that expires mid-task returns to the same screen.
   * Only same-site paths are honoured: an absolute URL here would turn the
   * login page into an open redirect.
   */
  const next = (() => {
    const raw = params.get("next");
    return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
  })();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * L'adresse qui a échoué, pas celle qui est dans le champ.
   *
   * Un booléen suivait le champ en direct : après l'échec, la personne qui
   * commence à saisir une autre adresse voyait le lien « Renvoyer » pointer sur
   * ce qu'elle était en train de taper, et le renvoi partait ailleurs que vers
   * le compte à confirmer. On garde donc l'adresse du moment de l'échec.
   */
  const [notConfirmed, setNotConfirmed] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotConfirmed(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      /**
       * Une adresse non confirmée n'est pas un mauvais mot de passe.
       *
       * Aplatir toutes les erreurs en une seule phrase était défendable tant
       * que la confirmation par courriel était désactivée : il n'y avait rien
       * d'autre à dire, et ne pas distinguer « compte inconnu » de « mot de
       * passe faux » est ce qui empêche d'énumérer les comptes. Le réglage
       * activé, la même phrase dit à quelqu'un qui a tapé le bon mot de passe
       * qu'il est faux, sans jamais lui indiquer sa boîte de réception. Il
       * réessaie, puis il abandonne.
       *
       * Celui-ci se dit sans rien révéler : GoTrue ne rend
       * `email_not_confirmed` que pour un compte dont le mot de passe vient
       * d'être validé.
       */
      const unconfirmed = error.code === "email_not_confirmed";
      setNotConfirmed(unconfirmed ? email.trim() : null);
      setError(
        unconfirmed
          ? "Votre adresse n'est pas encore confirmée. Ouvrez le lien que nous vous avons envoyé."
          : "Courriel ou mot de passe incorrect.",
      );
      return;
    }
    // Each account type lands in its own dashboard. An explicit ?next still
    // wins — a session that expired mid-task returns where it was, and the
    // guard there sends it on if it does not belong.
    const to = next ?? (await resolveSpaceHome());
    setBusy(false);
    navigate(to);
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: sessionReturnUrl(next ?? "/compte") },
    });
    if (error) setError("La connexion Google n'est pas disponible pour le moment.");
  };

  return (
    <AuthLayout
      title="Bon retour"
      photo="Labadie, dans le Nord"
      img="/photos/labadee.jpg"
      subtitle="Connectez-vous pour retrouver vos réservations."
      footer={
        <div className="mt-auto p-3.5 rounded-xl bg-[#D6F0FB] text-[13px] leading-relaxed text-[#00508a]">
          Vous êtes un établissement ?{" "}
          <Link to="/?partner=1" className="text-[#002089] font-bold">
            Devenir partenaire
          </Link>{" "}
          — même compte, le rôle est accordé après validation.
        </div>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <AuthError message={error} />

        {/* `/verifiez-votre-courriel` a déjà un renvoi de lien, avec son propre
            délai d'attente. Il n'y a rien à réécrire ici, seulement à y mener. */}
        {notConfirmed && (
          <Link
            to={`/verifiez-votre-courriel?email=${encodeURIComponent(notConfirmed)}`}
            className="-mt-1 text-[13px] font-semibold text-[#002089] underline"
          >
            Renvoyer le lien de confirmation
          </Link>
        )}

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Courriel</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="r.duval@exemple.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={fieldInput}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Mot de passe</span>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`${fieldInput} pr-20`}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12.5px] font-semibold text-[#002089]"
            >
              {show ? "Masquer" : "Afficher"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] text-[#3E2C23] cursor-pointer">
            <input type="checkbox" defaultChecked className="w-[18px] h-[18px] rounded-[5px] accent-[#002089]" />
            Rester connecté
          </label>
          <Link to="/reset-password" className="text-[13px] font-semibold text-[#002089]">
            Mot de passe oublié
          </Link>
        </div>

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#e2d5c3]" />
        <span className="text-xs text-[#7a6355]">ou</span>
        <div className="flex-1 h-px bg-[#e2d5c3]" />
      </div>

      <button onClick={google} className={ghostBtn}>
        Continuer avec Google
      </button>

      {/* A partner who lands on the traveller form is one click away from their
          own, rather than stuck wondering why their dashboard is not here. */}
      <span className="text-[13.5px] text-[#7a6355] text-center">
        Vous gérez un établissement ?{" "}
        <Link to="/partenaire" className="text-[#e76f2e] font-bold">
          Espace partenaire
        </Link>
        <br />
        Pas encore de compte ?{" "}
        <Link to="/signup" className="text-[#002089] font-bold">
          S'inscrire
        </Link>
      </span>
    </AuthLayout>
  );
}

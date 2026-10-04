import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/panel/PanelLayout";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

/**
 * Changer son mot de passe en étant connecté.
 *
 * La ligne « Sécurité » du profil menait à `/reset-password`, qui envoie un
 * courriel et fait attendre : le parcours de quelqu'un qui a *oublié* son mot
 * de passe, imposé à quelqu'un qui veut simplement le changer. Et depuis que
 * les courriels d'authentification ne partent qu'aux membres de
 * l'organisation — tant que le SMTP personnalisé n'est pas posé — ce détour ne
 * menait nulle part du tout pour un vrai client.
 *
 * Ici il n'y a pas de courriel : la session prouve déjà qui vous êtes, et
 * `updateUser` suffit.
 *
 * Le mot de passe actuel est quand même demandé. Supabase ne l'exige pas, mais
 * une session ouverte n'est pas une preuve de présence : un téléphone déverrouillé
 * posé sur une table, un ordinateur partagé, et quelqu'un d'autre change le mot
 * de passe et garde le compte. On le vérifie en le rejouant contre
 * `signInWithPassword` — c'est le même utilisateur, donc la session survit.
 *
 * Les règles de solidité sont copiées telles quelles de l'écran de
 * réinitialisation (`ResetNew`) : deux endroits qui exigeraient des choses
 * différentes du même mot de passe seraient un piège.
 */

const field =
  "w-full rounded-xl border border-[#e2d5c3] bg-white px-3.5 py-2.5 text-sm text-[#3E2C23] outline-none focus:border-[#002089]";
const label = "mb-1.5 block text-[13px] font-semibold text-[#3E2C23]";

export function PanelSecurity() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strong = next.length >= 8 && /\d/.test(next) && /[A-Z]/.test(next);
  const matches = next.length > 0 && next === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);

    if (!user?.email) return setError("Reconnectez-vous, puis réessayez.");
    if (!strong) {
      return setError("Mot de passe trop faible : 8 caractères, un chiffre, une majuscule.");
    }
    if (!matches) return setError("Les deux mots de passe ne correspondent pas.");
    if (next === current) return setError("Le nouveau mot de passe est identique à l'ancien.");

    setBusy(true);
    setError(null);

    // Rejouer l'ancien mot de passe : c'est la seule façon de vérifier que
    // c'est bien le titulaire qui est devant l'écran, et non quelqu'un qui a
    // trouvé la session ouverte.
    const { error: wrong } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (wrong) {
      setBusy(false);
      return setError("Le mot de passe actuel est incorrect.");
    }

    const { error: failed } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (failed) {
      console.error("Password change failed:", failed);
      // Le projet peut exiger une re-authentification par code avant tout
      // changement de mot de passe (réglage Auth). Dans ce cas Supabase le dit,
      // et le message générique cacherait la seule chose utile à savoir.
      return setError(
        /reauthentication|nonce/i.test(failed.message)
          ? "Ce compte demande une vérification par courriel avant de changer le mot de passe. Passez par le lien de réinitialisation ci-dessous."
          : "Le changement a échoué. Réessayez dans un instant.",
      );
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  };

  return (
    <>
      <PageHeader title="Sécurité" subtitle="Changer le mot de passe de votre compte." />

      <form onSubmit={submit} className="rounded-2xl border border-[#e2d5c3] bg-white p-5">
        <div className="flex flex-col gap-4">
          <div>
            <label className={label} htmlFor="sec-current">
              Mot de passe actuel
            </label>
            <input
              id="sec-current"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={current}
              onChange={e => setCurrent(e.target.value)}
              placeholder="••••••••••"
              className={field}
            />
          </div>

          <div>
            <label className={label} htmlFor="sec-next">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                id="sec-next"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                value={next}
                onChange={e => setNext(e.target.value)}
                placeholder="••••••••••"
                className={`${field} pr-20`}
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12.5px] font-semibold text-[#002089]"
              >
                {show ? "Masquer" : "Afficher"}
              </button>
            </div>
            {next && (
              <p className={`mt-1 text-xs ${strong ? "text-[#15803d]" : "text-[#7a6355]"}`}>
                {strong ? "Mot de passe solide." : "Au moins 8 caractères, un chiffre, une majuscule."}
              </p>
            )}
          </div>

          <div>
            <label className={label} htmlFor="sec-confirm">
              Confirmer
            </label>
            <input
              id="sec-confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••••"
              className={field}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[#002089] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#6ad7fb] hover:text-[#002089] disabled:opacity-50"
          >
            {busy ? "Changement…" : "Changer le mot de passe"}
          </button>
          {done && (
            <span className="text-[13px] font-semibold text-[#15803d]">
              Mot de passe changé.
            </span>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-[#f5c2bd] bg-[#fdecea] px-3.5 py-2.5 text-[13px] text-[#b3261e]">
            {error}
          </p>
        )}
      </form>

      {/* Celui qui ne connaît plus son mot de passe actuel ne peut rien faire
          du formulaire ci-dessus ; c'est l'autre parcours qui est fait pour
          lui, et il vaut mieux le dire que de le laisser deviner. */}
      <p className="mt-5 text-[13px] leading-relaxed text-[#7a6355]">
        Vous ne vous souvenez plus de votre mot de passe actuel ?{" "}
        <Link to="/reset-password" className="font-semibold text-[#002089] hover:underline">
          Recevez un lien par courriel
        </Link>
        .
      </p>
    </>
  );
}

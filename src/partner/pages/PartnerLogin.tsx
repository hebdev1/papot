import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, LogIn } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, inputClass, labelClass } from "../../console/Ui";

/**
 * Sign-in for the partner dashboard, rendered in place at /partenaire.
 *
 * Staying on the URL matters more here than for the admin: a partner bookmarks
 * this page and opens it every morning. Redirecting to the public /login would
 * replace that address and hand them the traveller's sign-in page.
 *
 * Nothing here grants access. It obtains a session; whether that session
 * belongs to a partner is decided by partner_me() and RLS.
 */
export function PartnerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);
    if (error) {
      setError(
        "Courriel ou mot de passe incorrect. Un espace partenaire s'ouvre avec l'adresse " +
          "exacte de l'invitation : si votre candidature vient d'être approuvée, créez " +
          "d'abord un compte avec cette adresse.",
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-content-center rounded-xl bg-[#002089] font-display text-lg font-bold text-white">
            P
          </span>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-admin-ink">
            Espace partenaire
          </h1>
          <p className="mt-1 text-[13.5px] text-admin-ink-2">
            Gérez vos annonces, vos réservations et vos revenus.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-admin-line bg-admin-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div className="mb-4">
            <label className={labelClass} htmlFor="p-email">Courriel</label>
            <input
              id="p-email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="mb-5">
            <label className={labelClass} htmlFor="p-password">Mot de passe</label>
            <input
              id="p-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-[#fdf3f2] px-3 py-2 text-[13px] font-medium text-[#b3261e]">
              {error}
            </p>
          )}

          <Button variant="primary" size="lg" type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 papot-spin" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
            Se connecter
          </Button>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-admin-ink-3">
            Vous cherchez vos réservations ?{" "}
            <Link to="/login" className="font-semibold text-[#002089] hover:underline">
              Espace voyageur
            </Link>
            <br />
            Pas encore partenaire ?{" "}
            <Link to="/" className="font-semibold text-[#002089] hover:underline">
              Proposez votre établissement
            </Link>
          </p>
        </form>

        <Link
          to="/"
          className="mt-5 flex items-center justify-center gap-1.5 text-[13px] font-medium text-admin-ink-2 transition-colors hover:text-[#002089]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Retour au site
        </Link>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, inputClass, labelClass } from "../components/Ui";

/**
 * Sign-in for the console, rendered in place at /admin.
 *
 * Redirecting to the public /login worked, but it moved the address bar to
 * /login?next=%2Fadmin and handed staff the customer's sign-in page, complete
 * with "S'inscrire" and "Continuer avec Google" — neither of which applies to
 * an internal console. Staying on /admin keeps the URL people bookmark, and
 * once the session lands the provider re-reads admin_me() and the console
 * appears without a navigation.
 *
 * Nothing here grants access. It only obtains a session; whether that session
 * belongs to staff is decided by the database.
 */
export function AdminLogin() {
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
      // Deliberately not saying which of the two was wrong.
      setError("Courriel ou mot de passe incorrect.");
    }
    // On success the auth listener updates the session and the guard re-runs.
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-content-center rounded-xl bg-[#002089] font-display text-lg font-bold text-white">
            P
          </span>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-admin-ink">
            Console d'administration
          </h1>
          <p className="mt-1 text-[13.5px] text-admin-ink-2">
            Réservée au personnel de PAPOT.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-admin-line bg-admin-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div className="mb-4">
            <label className={labelClass} htmlFor="admin-email">
              Courriel
            </label>
            <input
              id="admin-email"
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
            <label className={labelClass} htmlFor="admin-password">
              Mot de passe
            </label>
            <input
              id="admin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-[#fdf3f2] px-3 py-2 text-[13px] font-medium text-[#b3261e]"
            >
              {error}
            </p>
          )}

          <Button variant="primary" size="lg" type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 papot-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
            Se connecter
          </Button>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-admin-ink-3">
            Les accès sont attribués par un administrateur. Il n'y a pas
            d'inscription à cette console.
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

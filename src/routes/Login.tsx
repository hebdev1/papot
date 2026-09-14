import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthError, AuthLayout, fieldInput, fieldLabel, ghostBtn, primaryBtn } from "../components/AuthLayout";
import { supabase } from "../lib/supabase";
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      setError("Courriel ou mot de passe incorrect.");
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
      options: { redirectTo: `${window.location.origin}${next ?? "/compte"}` },
    });
    if (error) setError("La connexion Google n'est pas disponible pour le moment.");
  };

  return (
    <AuthLayout
      title="Bon retour"
      photo="Île-à-Vache"
      subtitle="Connectez-vous pour retrouver vos réservations."
      footer={
        <div className="mt-auto p-3.5 rounded-xl bg-[#EAF8FF] text-[13px] leading-relaxed text-[#00508a]">
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

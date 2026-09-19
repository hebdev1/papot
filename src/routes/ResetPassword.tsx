import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthError, AuthLayout, fieldInput, fieldLabel, primaryBtn } from "../components/AuthLayout";
import { supabase } from "../lib/supabase";
import { emailReturnUrl } from "../lib/authRedirect";

/** Canvas 2c — /reset-password, request a link. */
export function ResetRequest() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: emailReturnUrl("/reset-password/nouveau"),
    });
    setBusy(false);
    if (error) setError("L'envoi a échoué. Vérifiez l'adresse et réessayez.");
    else setSent(true);
  };

  return (
    <AuthLayout
      title="Mot de passe oublié"
      photo="Un coucher de soleil sur la mer"
      img="/photos/plage-coucher-de-soleil.jpg"
      subtitle="Indiquez votre courriel. Nous vous envoyons un lien de réinitialisation valable une heure."
      footer={
        <Link to="/login" className="text-[13px] font-semibold text-[#002089]">
          ← Retour
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
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

        <button type="submit" disabled={busy || sent} className={primaryBtn}>
          {busy ? "Envoi…" : sent ? "Lien envoyé" : "Envoyer le lien"}
        </button>

        <AuthError message={error} />

        {sent && (
          <p className="text-[13px] leading-relaxed text-[#00508a] bg-[#EAF8FF] rounded-xl px-3.5 py-2.5">
            Si un compte existe pour cette adresse, le lien est en route. Il expire dans une heure.
          </p>
        )}
      </form>
    </AuthLayout>
  );
}

/** Canvas 2d — /reset-password, set the new password. */
export function ResetNew() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strong = password.length >= 8 && /\d/.test(password) && /[A-Z]/.test(password);
  const matches = password.length > 0 && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong) return setError("Mot de passe trop faible : 8 caractères, un chiffre, une majuscule.");
    if (!matches) return setError("Les deux mots de passe ne correspondent pas.");

    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError("Le lien a peut-être expiré. Demandez-en un nouveau.");
    else navigate("/");
  };

  return (
    <AuthLayout
      title="Nouveau mot de passe"
      photo="Le bord de mer"
      img="/photos/plage.jpg"
      subtitle="Choisissez un mot de passe pour votre compte."
      footer={
        <p className="text-xs leading-relaxed text-[#7a6355]">
          Ce lien est valable une heure. Passé ce délai,{" "}
          <Link to="/reset-password" className="text-[#002089] font-semibold">
            demandez-en un nouveau
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <AuthError message={error} />

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Nouveau mot de passe</span>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="••••••••••"
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
          {password && (
            <span className={`text-xs ${strong ? "text-[#15803d]" : "text-[#7a6355]"}`}>
              {strong ? "Mot de passe solide." : "Ajoutez un chiffre et une majuscule."}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Confirmer</span>
          <input
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="••••••••••"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className={fieldInput}
          />
        </div>

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Enregistrement…" : "Enregistrer et se connecter"}
        </button>
      </form>
    </AuthLayout>
  );
}

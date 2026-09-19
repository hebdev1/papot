import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthError, AuthLayout, fieldInput, fieldLabel, primaryBtn } from "../components/AuthLayout";
import { supabase } from "../lib/supabase";
import { emailReturnUrl } from "../lib/authRedirect";

/**
 * Plain language, never a code (spec §41). The rate-limit case is worth its
 * own message: it is a project-level email quota, not anything the visitor
 * did, so telling them to "try again" without a delay would just loop them.
 */
function signupMessage(error: { message: string; code?: string }): string {
  const code = error.code ?? "";
  const msg = error.message.toLowerCase();

  if (code === "over_email_send_rate_limit" || msg.includes("rate limit")) {
    return "Nous ne pouvons pas envoyer de courriel de confirmation pour le moment. Réessayez dans une heure.";
  }
  if (code === "email_address_invalid" || msg.includes("is invalid")) {
    return "Cette adresse courriel n'est pas acceptée. Vérifiez l'orthographe ou utilisez une autre adresse.";
  }
  if (code === "user_already_exists" || msg.includes("already")) {
    return "Un compte existe déjà pour cette adresse.";
  }
  if (code === "weak_password") {
    return "Ce mot de passe est trop faible. Ajoutez un chiffre et une majuscule.";
  }
  return "La création du compte a échoué. Réessayez.";
}

const LOCALES = [
  { id: "fr", label: "Français" },
  { id: "ht", label: "Kreyòl" },
  { id: "en", label: "English" },
];

/** Canvas 2b — /signup, client account. */
export function Signup() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState(true);
  const [password, setPassword] = useState("");
  const [locale, setLocale] = useState("fr");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strongEnough = password.length >= 8 && /\d/.test(password) && /[A-Z]/.test(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strongEnough) {
      setError("Le mot de passe doit faire 8 caractères, avec un chiffre et une majuscule.");
      return;
    }
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: emailReturnUrl("/login"),
        data: {
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          phone: phone.trim() ? `+509 ${phone.trim()}` : null,
          whatsapp,
          locale,
        },
      },
    });

    setBusy(false);
    if (error) {
      setError(signupMessage(error));
      return;
    }
    navigate(`/verifiez-votre-courriel?email=${encodeURIComponent(email.trim())}`);
  };

  return (
    <AuthLayout
      title="Créer un compte"
      photo="La Citadelle Laferrière, dans le Nord"
      img="/photos/citadelle-laferriere.jpg"
      subtitle="Un seul compte pour l'hébergement, la voiture et la table."
      pitch={
        <>
          <span className="font-display font-extrabold text-xl leading-[1.25] text-white tracking-tight">
            Réservez en trois minutes
          </span>
          <ul className="flex flex-col gap-1.5 mt-1">
            {[
              "Annulation gratuite jusqu'à 24 h avant",
              "Paiement par carte ou mobile money",
              "Établissements vérifiés",
            ].map(t => (
              <li key={t} className="flex items-start gap-2 text-[13px] leading-relaxed text-[#a8d8f0]">
                <span className="text-[#6ad7fb] font-bold shrink-0">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </>
      }
      footer={
        <span className="text-[13.5px] text-[#7a6355] text-center">
          Déjà un compte ?{" "}
          <Link to="/login" className="text-[#002089] font-bold">
            Se connecter
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <AuthError message={error} />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>Prénom</span>
            <input
              required
              placeholder="Roselaine"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className={fieldInput}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>Nom</span>
            <input
              required
              placeholder="Duval"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className={fieldInput}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Courriel</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={fieldInput}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Téléphone</span>
          <div className="flex items-stretch gap-2">
            <span className="flex items-center px-3.5 rounded-xl border-2 border-[#e2d5c3] bg-white text-sm font-semibold text-[#7a6355]">
              +509
            </span>
            <input
              type="tel"
              placeholder="3712 4408"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className={`${fieldInput} flex-1`}
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-[#3E2C23] cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={whatsapp}
              onChange={e => setWhatsapp(e.target.checked)}
              className="w-[18px] h-[18px] rounded-[5px] accent-[#002089]"
            />
            Ce numéro est sur WhatsApp
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Mot de passe</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="8 caractères minimum"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={fieldInput}
          />
          <span className={`text-xs ${password && !strongEnough ? "text-[#b3261e]" : "text-[#7a6355]"}`}>
            Ajoutez un chiffre et une majuscule.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Langue de l'interface</span>
          <div className="flex gap-2">
            {LOCALES.map(l => (
              <button
                type="button"
                key={l.id}
                onClick={() => setLocale(l.id)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                  locale === l.id
                    ? "border-[#002089] bg-[#002089] text-white"
                    : "border-[#e2d5c3] bg-white text-[#3E2C23] hover:border-[#002089]"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Création…" : "Créer mon compte"}
        </button>

        <span className="text-xs leading-relaxed text-[#7a6355] text-center">
          En vous inscrivant, vous acceptez les{" "}
          <Link to="/conditions" className="text-[#002089] font-semibold">
            conditions générales
          </Link>{" "}
          et la{" "}
          <Link to="/confidentialite" className="text-[#002089] font-semibold">
            politique de confidentialité
          </Link>
          .
        </span>
      </form>
    </AuthLayout>
  );
}

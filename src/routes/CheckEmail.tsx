import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout, primaryBtn } from "../components/AuthLayout";
import { supabase } from "../lib/supabase";
import { emailReturnUrl } from "../lib/authRedirect";

const COOLDOWN_SECONDS = 42; // as drawn on 2e

/** Canvas 2e — confirmation email sent. */
export function CheckEmail() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const [left, setLeft] = useState(COOLDOWN_SECONDS);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const resend = async () => {
    if (!email || left > 0) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: emailReturnUrl("/login") },
    });
    setBusy(false);
    setNote(error ? "Le renvoi a échoué. Réessayez dans un instant." : "Lien renvoyé.");
    setLeft(COOLDOWN_SECONDS);
  };

  return (
    <AuthLayout
      title="Vérifiez votre courriel"
      photo="Une plage de sable blanc"
      img="/photos/plage-sable-blanc.jpg"
      subtitle={
        email
          ? `Nous avons envoyé un lien de confirmation à ${email}. Cliquez dessus pour activer votre compte.`
          : "Nous avons envoyé un lien de confirmation. Cliquez dessus pour activer votre compte."
      }
      footer={
        <Link to="/login" className="text-[13px] font-semibold text-[#002089]">
          ← Retour à la connexion
        </Link>
      }
    >
      <div className="w-14 h-14 rounded-full bg-[#EAF8FF] text-[#002089] flex items-center justify-center text-2xl font-bold">
        ✓
      </div>

      <div className="p-4 rounded-xl bg-[#EAF8FF] flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-[#002089]">Rien reçu ?</span>
        <span className="text-[13px] leading-relaxed text-[#00508a]">
          Le message arrive en général sous deux minutes. Regardez dans les indésirables.
        </span>
      </div>

      <button onClick={resend} disabled={busy || left > 0 || !email} className={primaryBtn}>
        {left > 0 ? `Renvoi possible dans ${left} s` : busy ? "Envoi…" : "Renvoyer le lien"}
      </button>

      {note && <p className="text-[13px] text-[#7a6355] text-center">{note}</p>}
    </AuthLayout>
  );
}

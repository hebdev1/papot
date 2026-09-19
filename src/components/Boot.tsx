import { Component, type ReactNode } from "react";

/**
 * What the user sees when the app cannot start.
 *
 * A blank white page is the worst failure a deployment can have: it tells the
 * visitor nothing and the operator nothing. These two components make sure
 * something legible always renders — a missing-configuration screen before
 * mount, and a caught error afterwards.
 */

const shell =
  "min-h-screen flex items-center justify-center bg-[#E9F9FE] px-4 " +
  "font-[system-ui,sans-serif] text-[#3E2C23]";

const card = "w-full max-w-lg rounded-2xl border border-[#e2d5c3] bg-white p-7 text-center";

function Logo() {
  return (
    <span className="mx-auto mb-4 grid h-12 w-12 place-content-center rounded-xl bg-[#002089] text-lg font-bold text-white">
      P
    </span>
  );
}

/** Shown when the Supabase environment variables are missing (spec: no blank page). */
export function ConfigErrorScreen({ detail }: { detail: string }) {
  return (
    <div className={shell}>
      <div className={card}>
        <Logo />
        <h1 className="text-xl font-bold">PAPOT n'est pas configuré</h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-[#7a6355]">{detail}</p>

        <div className="mt-5 rounded-xl bg-[#E9F9FE] px-4 py-3 text-left">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#7a6355]">
            Pour un déploiement Vercel
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#3E2C23]">
            Ajoutez les deux variables dans Settings → Environment Variables, pour les
            environnements Production, Preview et Development, puis relancez un déploiement.
            Les variables ne sont lues qu'au moment de la construction : un déploiement existant
            ne les récupère pas tout seul.
          </p>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-[12.5px] text-[#002089]">
            <li>VITE_SUPABASE_URL</li>
            <li>VITE_SUPABASE_ANON_KEY</li>
          </ul>
        </div>

        <p className="mt-4 text-[12.5px] text-[#7a6355]">
          En local, ces valeurs viennent du fichier <code>.env</code> à la racine du projet.
        </p>
      </div>
    </div>
  );
}

type State = { error: Error | null };

/**
 * Catches render errors below it. Without this, one thrown component takes the
 * whole page down to white — which is how the deployment failure looked.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Kept for the browser console; there is no error reporting service yet.
    console.error("Erreur non rattrapée :", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className={shell}>
        <div className={card}>
          <Logo />
          <h1 className="text-xl font-bold">Une erreur est survenue</h1>
          <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-[#7a6355]">
            La page n'a pas pu s'afficher. Réessayez : si le problème persiste, revenez à
            l'accueil.
          </p>

          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#002089] px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#001b6e]"
            >
              Recharger
            </button>
            <a
              href="/"
              className="rounded-xl border-2 border-[#e2d5c3] px-5 py-2.5 text-[13px] font-bold text-[#002089] transition-colors hover:border-[#002089]"
            >
              Retour à l'accueil
            </a>
          </div>

          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-[#7a6355]">
              Détail technique
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-[#E9F9FE] px-3 py-2 text-[11.5px] leading-relaxed text-[#3E2C23]">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

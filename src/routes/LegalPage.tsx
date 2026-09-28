import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Conditions générales and Politique de confidentialité.
 *
 * The signup form asks people to accept both, with links to `/conditions` and
 * `/confidentialite`. Neither route existed, so the catch-all sent them back to
 * the home page: the platform takes payments while asking its users to agree to
 * documents they cannot read.
 *
 * The text is not written here. `content_blocks` already exists with exactly
 * the right shape — slug, title, body, status — and an editor at
 * /admin/pages; it is simply empty. So the page reads the block by slug and
 * these documents become real the moment someone writes them, with no deploy.
 *
 * Until then it says so plainly. Inventing terms of service or a privacy policy
 * would be worse than an empty page: people would rely on them, and they would
 * bind nobody.
 */

type Block = { title: string | null; body: string | null; updated_at: string | null };

export function LegalPage({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) {
  const [block, setBlock] = useState<Block | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void supabase
      .from("content_blocks")
      .select("title, body, updated_at")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) console.error("Failed to load legal page:", error);
        setBlock((data as Block) ?? null);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [slug]);

  const updated = block?.updated_at
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(block.updated_at),
      )
    : null;

  return (
    <main className="max-w-3xl mx-auto px-4 lg:px-8 py-8 lg:py-10">
      <h1 className="font-display text-3xl font-bold text-[#002089]">
        {block?.title ?? fallbackTitle}
      </h1>
      {updated && <p className="text-[13px] text-[#7a6355] mt-1.5">Mis à jour le {updated}</p>}

      {loading ? (
        <p className="text-[#7a6355] mt-6">Chargement…</p>
      ) : block?.body ? (
        // Stored as plain text by the editor, so paragraphs are preserved and
        // nothing is interpreted as markup.
        <div className="mt-6 flex flex-col gap-4">
          {block.body.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-[#3E2C23] whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-[#e2d5c3] bg-white p-6">
          <p className="text-[15px] leading-relaxed text-[#3E2C23]">
            Ce document n'est pas encore publié.
          </p>
          <p className="text-[14px] leading-relaxed text-[#7a6355] mt-2">
            Nous préférons vous le dire plutôt que de vous renvoyer ailleurs sans explication. En
            attendant, les conditions d'annulation de chaque prestation sont affichées sur sa fiche
            et rappelées avant le paiement.
          </p>
          <Link
            to="/aide"
            className="inline-block mt-4 font-semibold text-[#002089] hover:underline"
          >
            Voir comment PAPOT fonctionne
          </Link>
        </div>
      )}
    </main>
  );
}

export const TermsPage = () => (
  <LegalPage slug="conditions-generales" fallbackTitle="Conditions générales" />
);

export const PrivacyPage = () => (
  <LegalPage slug="politique-de-confidentialite" fallbackTitle="Politique de confidentialité" />
);

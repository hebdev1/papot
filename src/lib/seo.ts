import { useEffect } from "react";

/**
 * Title and description, set from the page that knows them.
 *
 * Deliberately **not** JSON-LD. `public/.htaccess` sets `script-src 'self'`
 * with no `'unsafe-inline'`, and the build contains no inline script at all —
 * a `<script type="application/ld+json">` block would be the first, and
 * browsers that enforce script-src on non-executable script types drop it
 * without a word. Structured data that silently does not ship is worse than
 * none, because it looks done.
 *
 * What does work without touching the CSP: a real title and description per
 * page (crawlers run the JS), and `scripts/generate-sitemap.mjs`, which lists
 * the routes and companies that actually exist. If JSON-LD becomes worth it,
 * it needs either SSR or a CSP hash — a decision, not an afterthought.
 *
 * The previous values are restored on unmount so a single-page navigation does
 * not leave one page's description attached to the next.
 */

const DEFAULT_TITLE = "PAPOT — Votre prochaine aventure";

function setMeta(name: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageMeta(
  title: string | null,
  description?: string | null,
  canonical?: string | null,
) {
  useEffect(() => {
    const previousTitle = document.title;
    const previousDescription =
      document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null;

    if (title) document.title = `${title} · PAPOT`;
    if (description !== undefined) setMeta("description", description);
    if (canonical !== undefined) setCanonical(canonical ?? null);

    return () => {
      document.title = previousTitle || DEFAULT_TITLE;
      if (description !== undefined) setMeta("description", previousDescription);
      if (canonical !== undefined) setCanonical(null);
    };
  }, [title, description, canonical]);
}

/** The canonical origin, for links that have to be absolute. */
export const siteOrigin = () =>
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") ??
  (typeof window !== "undefined" ? window.location.origin : "https://papotht.com");

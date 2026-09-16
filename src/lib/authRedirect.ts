/**
 * Where an authentication flow comes back to.
 *
 * There are two kinds of return address here, and they are not the same
 * address. Every call site used `window.location.origin`, which quietly
 * conflates them.
 *
 * A link that leaves in an **email** is opened later, often on another device.
 * It has to point at the canonical site. `window.location.origin` would send a
 * confirmation back to whatever host the person happened to be on — a preview
 * deployment, or `www.` when the site lives on the apex — and that link works
 * while taking them to a copy of the site rather than to the site.
 *
 * A redirect that happens **inside one browsing session** is the opposite case:
 * the person is still here, and bouncing them to another host mid-sign-in would
 * drop them out of the deployment they were using. It stays where they are.
 *
 * `VITE_SITE_URL` pins the canonical origin. Leave it unset in development and
 * on preview deployments: the fallback is the current origin, which is exactly
 * what those want.
 */

const CANONICAL = import.meta.env.VITE_SITE_URL?.trim().replace(/\/+$/, "");

/** For a link that travels in an email and is opened later, elsewhere. */
export const emailReturnUrl = (path: string) => `${CANONICAL || window.location.origin}${path}`;

/** For a redirect that lands back in the session the visitor is already in. */
export const sessionReturnUrl = (path: string) => `${window.location.origin}${path}`;

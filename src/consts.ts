/** Site name. Appended to every page title and used as `og:site_name`. */
export const SITE_NAME = "Trix Framework";
/** Fallback meta description for pages that don't set their own. */
export const SITE_DESCRIPTION =
  "Trix is a design-ready Astro framework: one token system shared by designers in Figma and developers in code.";
/** Canonical origin. Resolves canonical URLs, social images, and the sitemap. */
export const SITE_URL = "https://trix.example.com";
/** BCP 47 locale tag: the page language, `og:locale`, and date and number formats. */
export const SITE_LOCALE = "en-US";
/** The organization's profiles elsewhere (LinkedIn, Instagram…), for structured data. */
export const SITE_SOCIALS: string[] = [];
/** Routes excluded from search and the sitemap. Surrounding slashes are ignored. */
export const NOINDEX_ROUTES: string[] = ["/404", "/style-guide", "/components"];
/**
 * Site-wide color mode. `light` and `dark` are fixed; `auto` follows the
 * visitor's system setting, remembers a `ThemeToggle` choice, and adds a
 * small inline script to apply it before first paint.
 */
export const COLOR_MODE: "light" | "dark" | "auto" = "light";
/**
 * A Content Security Policy on every page: scripts and stylesheets only from
 * this site. Turn it on once each third-party script the site loads — a tag
 * manager, analytics, a chat widget — has its origin in `astro.config.mjs` →
 * `security.csp.scriptDirective.resources`, beside `'self'`, or the browser
 * blocks it. Astro's `<ClientRouter />` doesn't support it.
 */
export const CSP: boolean = false;

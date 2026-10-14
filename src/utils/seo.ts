import { NOINDEX_ROUTES } from "../consts.ts";

const normalize = (path: string) => `/${path.replace(/^\/+|\/+$/g, "")}`;

const excluded = new Set(NOINDEX_ROUTES.map(normalize));

/** Checks whether a route should be hidden from search. Used by BaseHead. */
export function isNoindexRoute(pathname: string): boolean {
  return excluded.has(normalize(pathname));
}

/**
 * A page's public path, whatever the build format: `/about`, never
 * `/about.html` or `/about/index.html`. Canonicals, noindex and the current
 * nav link all compare this.
 */
export function pagePath(url: URL): string {
  const path = url.pathname.replace(/\.html$/, "").replace(/\/index$/, "");
  return path.replace(/(.)\/$/, "$1") || "/";
}

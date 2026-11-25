import type { Schema } from "./utils/schema.ts";

/** Page metadata for `BaseHead` and layouts. */
export interface SeoProps {
  /** Page title. The site name is appended. */
  title?: string;
  /** Page and social description. Defaults to `SITE_DESCRIPTION`. */
  description?: string;
  /** Social image. Defaults to `/og-image.jpg`. */
  image?: string;
  /** Open Graph type. */
  type?: "website" | "article";
  /** Override `NOINDEX_ROUTES` for this page's robots tag. */
  noindex?: boolean;
  /** Structured data for this page, from `@/utils/schema.ts`. */
  schema?: Schema | Schema[];
  /** The page's language, for `<html lang>` and `og:locale`. Defaults to `SITE_LOCALE`. */
  lang?: string;
  /**
   * The same page in other languages, by language tag:
   * `{ "fr-FR": "/fr-fr/about" }`. Writes `hreflang` links for them and this
   * page; `x-default` is the `SITE_LOCALE` page unless given.
   */
  alternates?: Record<string, string>;
}

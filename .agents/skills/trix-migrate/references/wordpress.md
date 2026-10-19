# WordPress → Trix

The WordPress detail for `/trix-migrate`. Read the main `SKILL.md` first.

## Identify the build

`inventory.ts` reports the generator and the builder. They decide where the
design system and the content live:

| Build                           | Design system lives in                                                                                                   | Markup looks like                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Block theme (Full Site Editing) | `theme.json`: `settings.color.palette`, `typography.fontSizes` (often `clamp()` fluid), `spacing.spacingSizes`, `custom` | `wp-block-*`, `has-*-color`, `has-*-font-size`        |
| Classic theme                   | the theme's `style.css` and the Customizer                                                                               | theme-specific classes                                |
| Elementor                       | Site Settings → Global Colors / Global Fonts; per-widget settings                                                        | `elementor-*`, `e-con`, `elementor-widget-*` wrappers |
| Divi                            | Theme Options, Global Colors, module settings                                                                            | `et_pb_*`                                             |
| Bricks / Oxygen / Breakdance    | the builder's global classes and variables                                                                               | `brxe-*`, `oxy-*`, `ct-*`, `bde-*`                    |

Whatever the build, **values are measured** (`/trix-style-guide`). `theme.json`
and builder globals give structure and names; the rendered site gives truth.
Builders nest several wrappers per widget — they go, with their rules (main
`SKILL.md` → _Wrappers_).

## Collect

Record each in `PROJECT.md` → **Sources**:

- **Admin access** or an application password for the REST API.
- **Content** — the REST API is the reliable source:
  - `/wp-json/wp/v2/types` — every post type, custom ones included
  - `/wp-json/wp/v2/posts?per_page=100&page=N&_embed` — posts with author,
    featured media and terms embedded (`_embed`); same for `pages` and each
    custom type's `rest_base`
  - `/wp-json/wp/v2/categories`, `/tags`, `/media`, `/users`
  - ACF fields appear under `acf` when the ACF REST option is on; otherwise
    export them (ACF → Tools) or read them from WXR.
  - **Tools → Export** (WXR) as the archive of record.
- **SEO metadata** — Yoast puts each page's resolved title, description,
  canonical, OG and schema in `yoast_head_json` on the REST response; Rank
  Math in `rank_math_*` or its `/rankmath/v1/getHead?url=` endpoint. Carry
  them per entry; do not regenerate them.
- **Redirects** — Redirection plugin (Tools → Redirection → Import/Export →
  CSV), Yoast Premium redirects, Rank Math redirections, or server rules in
  `.htaccess` / nginx config. Collect every source.
- **Permalinks** — Settings → Permalinks (`/%postname%/`,
  `/%category%/%postname%/`, `/blog/%year%/%monthnum%/…`). Astro routes must
  reproduce them exactly, trailing slash included: set `trailingSlash:
"always"` and `build: { format: "directory" }` in `astro.config.mjs` (Trix's
  default is no slash, which would put every old URL behind a redirect).
- **Forms** — Contact Form 7, Gravity Forms, WPForms, Elementor forms: fields,
  validation, notifications, where entries go.
- **Media** — originals from `/wp-content/uploads/` (not the `-300x200` sizes;
  Astro makes its own). Uploads are filed by year and month; here a page's
  images are filed by page (`TRIX.md` → Assets) and a post's by its
  collection (`/trix-cms`).

## Content → collections

- One collection per post type in `src/content.config.ts`, schema from the
  REST fields actually used (and ACF fields).
- **Gutenberg content** is HTML with block comments. Keep it as sanitized HTML
  inside `Typography/RichText` for long-form posts, or convert blocks to
  components where a block carries design (`core/columns`, `core/cover`,
  custom blocks). Replace `wp-block-*` classes with RichText's own styling.
- **Shortcodes** (`[gallery]`, `[contact-form-7 …]`) do not render outside
  WordPress: find every one (`grep -o '\[[a-z_-]\+'` over the content) and map
  each to a component.
- **Taxonomies** — categories and tags become collections or enum fields, with
  their archive routes (`/category/<slug>/`) if the site exposes them.
- **Authors, dates, featured images** — fields on the entry; images local.
- **Comments** — out of scope unless agreed (a third-party service, or
  static); record the decision.
- **Search** — WordPress search becomes Pagefind (static, built at build time)
  or nothing; record the decision.

Counts must match `X-WP-Total` for every type.

## Clean when

- No `wp-`, `elementor-`, `et_pb_` (or the builder's prefix) class, no
  `/wp-content/` or `/wp-includes/` URL, no jQuery or builder script remains.
- Every post type's count matches; every old permalink resolves (directly or
  by redirect).
- Per-page SEO metadata matches the REST `yoast_head_json` / Rank Math head.
- `verify.ts` and `compare-pages.mjs` both pass.

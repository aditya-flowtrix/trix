# WordPress

## Reading it

The REST API is on for every WordPress site (5.0+) at `/wp-json/`:

```bash
node scripts/cms/import.ts wordpress --url https://example.com
node scripts/cms/import.ts wordpress --url https://example.com --types post,case_study --limit 20   # a trial
WP_APP_PASSWORD=… node scripts/cms/import.ts wordpress --url https://example.com --user editor      # with drafts
```

It reads every public post type (posts, pages, custom post types), every
taxonomy they use (categories, tags, custom), featured images, authors,
and per item: title, content, excerpt, dates, the permalink, Yoast's SEO
title, description and image. Types that need a login (form entries,
plugin records) are skipped with a warning.

**Application passwords** (Users → Profile → Application Passwords) are
how drafts, private posts and protected types are read — never the
account password.

## Things to settle on the WordPress side

- **ACF fields** reach the API only with "Show in REST API" on for each
  field group. Simple fields map by type; group, repeater and flexible
  content fields arrive as JSON text with a warning — model them as their
  own fields or collections by hand.
- **Shortcodes and blocks** arrive rendered (`content.rendered`): the HTML
  is what the visitor saw. Embeds become their iframes.
- **Permalinks** decide the URLs. Trix answers `/blog/slug`; WordPress
  usually ends URLs in `/`. Either keep WordPress's style (`trailingSlash:
"always"` and `build.format: "directory"` in astro.config.mjs) or let
  `--route` write the redirects — every old permalink must answer.
- **Media** inside posts is downloaded from `/wp-content/uploads/` and from
  Jetpack's `i0–i3.wp.com`; the old domain's other files with `--host`.
- **Comments, forms, users** are not content collections — agree what
  replaces each (a form provider, nothing, an external comment service).

A site without the REST API (disabled by a security plugin) can be
re-enabled for the migration, or exported (Tools → Export → WXR) and
converted to the common shape (`references/other.md`).

---
name: trix-seo
description: >-
  Search engine optimisation for a Trix site — page metadata, structured data
  (JSON-LD), breadcrumbs, an audit of what search engines read, keeping a
  migrated site's rankings (every old URL answered, metadata carried across),
  and the Search Console and analytics handoff at launch. Use when asked
  about SEO, meta titles or descriptions, canonicals, schema or rich results,
  breadcrumbs, sitemaps or robots.txt, before a launch or a domain cutover,
  or when a migration must not lose traffic.
---

# SEO on Trix

Most of it is already structural. Every page gets its title, description,
canonical, Open Graph and Twitter tags, `og:locale` and `lang` from
`BaseLayout`'s props; the sitemap and `robots.txt` are generated; noindex
routes are left out of both. This skill is the rest: what to set per page,
the structured data, and proving it — before launch and across a migration.

**The rule that outranks the rest: measure what search engines read.** Both
scripts load the real pages in Chrome. A title in the source that a
component overrides, a canonical built from a placeholder `SITE_URL`, an
image whose alt the CMS left empty — only the rendered page shows them.

## 1. Site settings

`src/consts.ts`:

- `SITE_URL` — the production origin. Canonicals, the sitemap, social images
  and structured data all resolve against it.
- `SITE_NAME`, `SITE_DESCRIPTION` (70–160 characters), `SITE_LOCALE` (the
  page `lang` and `og:locale`), `SITE_SOCIALS` (profile URLs for the
  Organization's `sameAs`).
- `NOINDEX_ROUTES` — pages kept out of search and the sitemap.

`public/og-image.jpg` (1200×630) is the default social image.

## 2. Per page

`BaseLayout` takes `SeoProps` (`src/types.ts`):

```astro
<Layout
  title="Control cables"
  description="Push-pull and throttle cables built to OEM spec, since 1962."
  image="/images/og/control-cables.jpg"
  schema={product({
    name: "Push-pull cable",
    url: "/products/push-pull-cable",
    offer: { price: 1200, priceCurrency: "INR", availability: "InStock" },
  })}
/>
```

- **title** — what the page is, ≤ 60 characters with the site name; unique.
- **description** — 70–160 characters; unique; says why to click.
- **image** — a 1200×630 social image when the page has its own.
- **type** — `article` for posts.
- **noindex** — for a page that must exist but not rank (thank-you pages).
- **One h1** per page, then headings in order — never skip a level.
- **Alt text** on every `Img`; `alt=""` only for decoration.

## 3. Structured data

`src/utils/schema.ts` builds schema.org JSON-LD; pass it as `schema`, or
render `<JsonLd data={…} />` anywhere. URLs are made absolute.

| Page                          | Schema                                                                   |
| ----------------------------- | ------------------------------------------------------------------------ |
| Home                          | `organization()`, `website()` (already on `index.astro`)                 |
| Any page below the home       | `<Breadcrumbs items={…}>` — renders the trail and emits `BreadcrumbList` |
| Blog post, case study         | `article({ type: "BlogPosting", … })` from the collection entry          |
| An office, shop, branch       | `localBusiness({ address, telephone, openingHours, … })`                 |
| Something sold, with price    | `product({ offer: { price, priceCurrency, availability } })`             |
| Visible questions and answers | `faqPage([...])` — the text must match the page word for word            |

Only describe what is on the page. FAQ rich results now show only for
authoritative government and health sites, but the data stays valid.

For a CMS collection, build the schema in the `[slug].astro` route from the
entry's fields, so every item gets it.

## 4. Audit

```bash
npm run build && npm run seo                  # the build (also runs in CI)
node scripts/seo/audit.ts --url https://staging.example.com
node scripts/seo/audit.ts --dir dist --production   # before launch
```

Crawls every page reachable from `/` and the sitemap at phone width and
reports, in `.trix/seo-audit.md`:

- **Errors** — a page or linked URL not answering 200, no title, description
  or canonical, a relative canonical, no `lang`, no h1, an image without
  `alt`, structured data that does not parse, a noindex page in the sitemap.
  With `--production`: a placeholder `SITE_URL`, a `robots.txt` that blocks
  the site.
- **Warnings** — long titles, short or long descriptions, duplicates across
  pages, a canonical pointing elsewhere, several h1s, skipped heading levels,
  missing Open Graph, an indexable page missing from the sitemap, layout
  shift over 0.1 or largest paint over 2.5s (lab values on the build — field
  data comes from Search Console).

Fix every error. Treat each warning as a question: a long title can be right.

## 5. A migration keeps its rankings

A moved site loses traffic through URLs that stop answering and pages whose
title or indexability quietly changed. Before cutover, against staging:

```bash
node scripts/seo/parity.ts --old https://www.old-site.com --new https://staging.example.com
# or with local copies, and the old platform's 301 export:
node scripts/seo/parity.ts --old-dir path/to/export --new-dir dist --redirects redirects.csv
```

Every indexable URL of the old site (its sitemap plus a crawl) is checked on
the new one, following redirects, and reported in `.trix/seo-parity.md`:

- **lost** — answers 404 with no redirect, redirects to a page that does not
  load, or became noindex. Each needs a redirect, the page, or the owner's
  decision to let it go — recorded in `PROJECT.md`.
- **changed** — title, description, h1 or structured data differs. Fine when
  intended; confirm each one.
- **same**.

Redirects live in `astro.config.mjs` → `redirects` (or the host's
`_redirects`), old path → new path, permanent. Keep the old platform's own
301 list too — those links still exist out there.

After DNS moves, run parity again with `--old` set to the old URLs on the new
domain (`--old-dir` of the export, `--new https://www.example.com`).

## 6. Launch handoff

- [ ] `npm run seo -- --production` passes on the production build.
- [ ] Parity: no **lost** URLs; every **changed** one confirmed.
- [ ] Search Console: domain property verified (DNS TXT), sitemap
      `sitemap-index.xml` submitted, the key pages inspected and requested.
- [ ] Old domain or host redirects every URL permanently to the new one (when
      the domain changes: Search Console → Change of address).
- [ ] Analytics and consent carried over; conversions and form events firing.
- [ ] For four weeks: watch Search Console → Pages for new 404s and
      "crawled — not indexed", and Performance for queries that dropped.

## 7. Report

- **Audit** — errors and warnings, as numbers, and what was fixed.
- **Structured data** — which types on which page templates.
- **Parity** — same / changed / lost, and the decision for each lost URL.
- **Still open** — anything waiting on the owner.

## Using this without Claude Code

`node scripts/seo/audit.ts` and `node scripts/seo/parity.ts` need Node and a
local Chrome (or `npx playwright install chromium`).

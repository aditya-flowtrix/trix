# Roadmap

## Phase 1 — Framework and migration (v0.1–0.2, now)

- Trix framework on Lumos for Astro: token generator, style guide, components,
  designer guide, Figma variable files.
- Skills: new project, style guide, migrate (Webflow, Framer, WordPress,
  other), Figma import, prop audit, scaling graphic, upgrade.
- Measuring toolkit: inventory, design, propose, variables, classes, verify.
- v0.2: the 12-column grid (`Row`/`Col`, overlay, measured margin and
  gutter), scroll-in reveals, tables and dividers, prefetch — from Mast.

## Phase 2 — SEO

- **SEO audit skill** — titles, descriptions, headings, canonicals, hreflang,
  structured data, internal links, image alt text, Core Web Vitals, measured on
  the built site and the live one.
- **SEO migration parity** — per-URL comparison of old and new metadata,
  status codes and redirects before and after cutover.
- **Structured data components** — JSON-LD for Organization, WebSite,
  BreadcrumbList, Article, Product, FAQ, LocalBusiness, driven by content
  collections.
- **Search Console and analytics handoff** — sitemap submission, coverage
  monitoring after cutover.

## Later

- `Video` pause control: background videos that autoplay for more than five
  seconds need a pause button (WCAG 2.2.2). Needs a wrapper element, which
  changes how `ContentWrapper` detects its visual — do with care.

- `create-trix` CLI that copies, stamps and names a project in one command.
- A published Figma community file mirroring the component library.
- A headless CMS adapter skill (Sanity first) — content collections keep the
  same schema; only the loader changes.
- Measuring toolkit: section-level theme detection (background/text pairs),
  motion inventory (durations and easings from the Web Animations API).

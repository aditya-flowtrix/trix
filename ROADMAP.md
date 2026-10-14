# Roadmap

## Phase 1 — Framework and migration (v0.1–0.2, now)

- Trix framework on Lumos for Astro: token generator, style guide, components,
  designer guide, Figma variable files.
- Skills: new project, style guide, migrate (Webflow, Framer, WordPress,
  other), Figma import, prop audit, scaling graphic, upgrade.
- Measuring toolkit: inventory, design, propose, variables, classes, verify.
- v0.2: the 12-column grid (`Row`/`Col`, overlay, measured margin and
  gutter), scroll-in reveals, tables and dividers, prefetch — from Mast.

## Phase 2 — SEO (v0.2, done)

- `trix-seo` skill: per-page metadata, structured data, the audit, migration
  parity and the launch handoff.
- `scripts/seo/audit.ts` — status, titles, descriptions, canonicals, `lang`,
  h1 and heading order, alt text, Open Graph, structured data, broken links,
  sitemap and robots.txt, layout shift and largest paint; runs in CI.
- `scripts/seo/parity.ts` — every old URL answered on the new site, following
  redirects (live or from a CSV), with title, description, h1, indexability
  and structured data compared.
- Structured data builders (`src/utils/schema.ts`): Organization, WebSite,
  BreadcrumbList, Article, FAQPage, LocalBusiness, Product; `JsonLd` and
  `Breadcrumbs` components.

Still to come: hreflang for multilingual sites (with Astro i18n routing), and
Core Web Vitals field data pulled from the CrUX API instead of lab values.

## Later

- `create-trix` CLI that copies, stamps and names a project in one command.
- A published Figma community file mirroring the component library.
- More headless sources for `cmsLoader`: Sanity, Contentful, Ghost (files
  already work for them through the common JSON shape).
- Measuring toolkit: section-level theme detection (background/text pairs),
  motion inventory (durations and easings from the Web Animations API).

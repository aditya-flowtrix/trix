---
name: trix-migrate
description: Migrate a website from Webflow, Framer, WordPress, Wix, Squarespace or any other platform onto Trix for Astro — visually identical, with its content, CMS, forms, redirects, SEO metadata and animations, and no trace of the old platform. Use when someone wants to migrate, port, rebuild, convert or escape a site, has a code export or a live URL to bring across, or asks how to move CMS content, pages and forms into Astro.
---

# Migrating a site to Trix

**The finished site is indistinguishable from the published one and contains
none of the old platform.** Every section is a Trix component, every value a
Trix token, every utility a Trix utility. Content, URLs and metadata survive
exactly; motion survives and gets smoother.

Platform-specific detail lives in `references/`:

| Platform                                                 | Read                      |
| -------------------------------------------------------- | ------------------------- |
| Webflow (any framework: Lumos, Client-First, Mast, none) | `references/webflow.md`   |
| Framer                                                   | `references/framer.md`    |
| WordPress (blocks, Elementor, Divi, Bricks, classic)     | `references/wordpress.md` |
| Wix, Squarespace, static HTML, anything else             | `references/other.md`     |

Read the main file first, then the platform's reference.

## The record

`PROJECT.md` is the record of this migration: sources, paths, every decision,
every page's status. **Read it before doing anything and write each answer
into it the moment it is given.** The end of a migration is exactly when the
old site gets switched off and the answers stop being checkable.

## Collect first

1. **The live URL** — the rendered truth, and the only place to see motion.
2. **Platform access** — the Webflow MCP, a Framer project invite, WordPress
   admin or REST API, whatever the platform offers. Without it, per-instance
   settings and CMS bindings are guesswork; say so and stop.
3. **Content** — a CSV per CMS collection, a WordPress WXR export, or API access.
4. **The code export** if the platform has one (Webflow does; Framer and
   WordPress do not in a usable form).
5. **The redirects** — the platform's existing 301 list. No API returns these
   on most platforms; once the old site is gone, the record is gone, and the
   links that break have nothing to do with this move.

Record each in `PROJECT.md` → **Sources** as it arrives.

## Step 0 — Inventory

```bash
node scripts/measure/inventory.ts --url https://example.com
node scripts/measure/inventory.ts --dir path/to/export        # if there is one
```

Platform, CSS framework, libraries, every page, every form, image and script
hosts, fonts. Then **stop for anything with no direct equivalent** —
e-commerce, memberships, logic/automation, native site search, multi-language,
gated pages. Each changes the shape of the project; agree an approach before
rebuilding anything and write it into `PROJECT.md` → **Out of scope**.

## The phases, in order

|                    |                                                             | Verified by                             |
| ------------------ | ----------------------------------------------------------- | --------------------------------------- |
| **1. Style guide** | `/trix-style-guide` — tokens, themes, fonts, brand assets   | `verify.ts`: every check identical      |
| **2. Groundwork**  | images, icons, class and variable maps, component work-list | maps written; assets local              |
| **3. First slice** | nav, footer, homepage — all the way to done                 | the gate below                          |
| **4. The rest**    | a page at a time, following the slice's patterns            | content parity per page                 |
| **5. Data**        | CMS → content collections, forms, redirects, SEO            | item counts, form tests, redirect tests |
| **6. Cutover**     | the checklist at the end                                    | live checks                             |

**Do not run a phase across the whole site before the first slice is
signed off.** Site-wide substitutions (tokens, maps, assets) happen once; page
work does not. A mistake found on the homepage costs one page; the same
mistake found on page sixty has already been made fifty-nine times.

## Phase 2 — Groundwork

- **Images** — every image the in-scope pages use, at original resolution,
  into `src/assets/images/` and rendered with `Media/Img` (Astro optimises and
  writes the srcset). Images on the platform's CDN are files that never came
  across; fetch them now — they stop working when the old site does. Note any
  that are referenced but missing from an export.
- **Icons** — icon fonts become `<Icon name>` (Phosphor) or SVG files;
  favicon, webclip and OG image come with the style guide.
- **Class map** — `node scripts/measure/classes.ts --source <live page> --local http://localhost:4321/style-guide`.
  Use it; never a name-based rename. "Same name, different effect" rows are
  the reason.
- **Variable map** — `node scripts/measure/variables.ts`; its
  `rename-variables.sed` rewrites source variable references in CSS being
  moved into components.
- **Component work-list** — the source's own blocks, each of which becomes a
  Trix component. On Webflow, `split-css.mjs` prints them from the stylesheet;
  elsewhere, list the distinct section structures from the inventory.

## Phase 3 — The first slice

Nav, footer and homepage, all the way: markup as Trix components, CSS in the
component that owns it, content bound, motion working.

**Composing a page.** Follow `TRIX.md`. A page is `Section`, `ContentWrapper`,
`Grid`, `Heading`, `Paragraph`, `Eyebrow`, `ButtonWrapper`, `Button`, `Img`,
`Card` and friends. A block that needs its own CSS or script becomes a
component in `src/components/content/` (or `section/` when the CSS acts on the
section itself). Chrome goes in `Global/Nav.astro`, `Global/Footer.astro` and
`BaseLayout` — never in a page.

**Margins.** Sources give blocks a `margin-bottom`; Trix gives the space to
the element receiving it (`--*-margin-top`, `.heading:has(+ .text)`), and a
container's children get a `gap`. Port the number, not the declaration.

**Wrappers.** A div that existed only to give a heading or paragraph a flex
context (Webflow's `u-heading`, Client-First's `heading-wrapper`, Elementor's
`elementor-widget-container`) goes, with its rule.

### The gate before page two

- Content parity exact: `compare-pages.mjs --live <url> --local <url> --shots`.
- Screenshots match side by side at desktop and mobile.
- No source classes, variable names, data attributes or platform scripts
  remain (`grep` for the platform's prefixes; the reference lists them).
- Chrome lives in the layout.
- Sections, headings, buttons and eyebrows are components.
- Animations run, respect `prefers-reduced-motion`, and feel at least as
  smooth as the original.
- **The owner has looked at it** and asked for what they are going to ask for.

## Phase 4 — Page by page

One page at a time through the same steps, each signed off in `PROJECT.md` →
**Pages**. When a page needs something the slice did not establish, decide it
once, record it, and apply it everywhere.

Exports are div soup; fix the semantics while translating, since nobody will
come back for it: one `<h1>` per page and heading levels that step down
without skips (the look comes from `variant`, the level from `tag`),
`<article>` and `<time datetime>` on CMS detail pages, `<th scope="col">` in
table headers, `rel="noopener"` on `target="_blank"` links, and no
`noindex` meta the export or staging left behind.

## Phase 5 — Data

- **CMS → content collections.** One collection per source collection in
  `src/content.config.ts`, schema from the source's fields, one route per
  template. Images as local assets. References as `reference()`. Rich text as
  Markdown/MDX or sanitized HTML. Counts must match the source exactly. A
  headless CMS later only changes the loader.
- **Lists** — every filter, sort and limit, read from the platform (they are
  not in exports), written into `PROJECT.md`. Empty states, pagination and
  filter controls have no runtime in a static site: build them (`.filter()`
  and `.slice()` at build time, `paginate()` routes, or a small script in
  the list's component) or note them as follow-ups — never ship a control
  that does nothing.
- **Forms** — every form, its fields, validation and destination. Pick the
  provider with the owner; test each form end to end.
- **Redirects** — the platform's existing list plus every URL this migration
  changes, in `astro.config.mjs` `redirects` or the host's rules. Test each.
- **SEO parity** — title, description, canonical, OG/Twitter, JSON-LD,
  `noindex`, sitemap and robots per page match the inventory — checked with
  `/trix-seo`'s parity script, not by eye.

## Animations

Rebuild motion with the lightest tool that holds it: CSS transitions and
scroll-driven animations first, the `animate` prop for fade-up reveals (one
or staggered; `--reveal-*` tokens carry the source's timing), GSAP only
for timelines, pinning and scrubbing the platform engine did. Platform engines
(Webflow IX, Framer Motion appear effects) become components' own scripts,
targeting data attributes. Match the original's timing and easing, then make
it smoother: transform and opacity only, no layout thrash, and
`prefers-reduced-motion` respected everywhere.

## Phase 6 — Cutover

- [ ] Every page signed off; `npm run check` and `npm run build` clean.
- [ ] `SITE_URL` is the production domain; canonicals and sitemap use it.
- [ ] Redirects deployed and tested, old and new.
- [ ] Forms tested in production.
- [ ] Analytics, consent and tag manager carried over.
- [ ] 404 page; robots.txt allows indexing (only) in production.
- [ ] DNS switched; the old site unpublished only after the new one is verified live.
- [ ] SEO: `/trix-seo` — `scripts/seo/parity.ts` from the live old site to
      staging shows no **lost** URL, every **changed** title or description
      confirmed; `npm run seo -- --production` passes.
- [ ] Search Console: new sitemap submitted, coverage watched for four weeks
      (`/trix-seo` → launch handoff).

## The report

After each phase: what was done, what was verified (with numbers), what was
decided, what is still open. The open list may be non-empty, as long as it is
stated.

## Using this without Claude Code

Markdown and Node only. Only the automatic triggering and `/trix-migrate` are
Claude Code features.

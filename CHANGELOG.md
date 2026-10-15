# Changelog

## Unreleased

From building a client design on Trix. Lumos stays the base and the defaults
keep its look; every design brings its own type, colours and components, so
the framework now follows what a project adds to `tokens.css` instead of a
fixed set of names.

### More from Mast, under Lumos's names

The rest of what Mast for Astro does better, each rebuilt the Lumos way (typed
props in Lumos's order and wording, CSS in the component, a script only on
pages that use it):

- `Video autoplay` downloads nothing until the video scrolls into view, plays
  only while it is on screen and pauses when it leaves; `desktopOnly` keeps
  it off phones and tablets (poster only, nothing downloaded).
- `Slider`: `loop` wraps the arrows; `playback="auto"` — Lumos's name, from
  `Tabs` — moves a slide every six seconds with a pause button, holding
  while focused, off screen or for reduced motion.
- `Marquee pauseOnHover`, beside the pause button.
- `Modal openOnLoad` and `cooldownDays`, for a newsletter or announcement.
- `NavBanner`: a one-line announcement above the nav, in the brand theme.
- `Dropdown variant="mega"`: the nav's full width from `medium` up.
- `GridOverlay`'s root is `grid-overlay_wrap`, as Lumos names a root.

Left out on purpose: the slider's fade (Lumos's `Tabs playback="auto"` is the
rotating panel), a vertical marquee, and a tabs-to-dropdown menu on phones.

### Lumos's names for the scales (breaking for 0.2 projects)

Trix's values were always Lumos's, but some names pointed elsewhere: Trix's
`--space-4` was Lumos's `--space-3`. Now the names match Lumos for Astro,
so Lumos's docs, examples and components mean the same thing here. Nothing
looks different — every page renders to the same pixels.

| 0.2                                        | 0.3                                      |
| ------------------------------------------ | ---------------------------------------- |
| `--space-2…12`                             | `--space-1…11` (1–8 are Lumos's exactly) |
| `--space-1` (4px, unused)                  | removed                                  |
| `--line-height-xsmall` / `-small`          | `--line-height-small` / `-medium`        |
| `--line-height-medium` (1.2, unused)       | removed                                  |
| `--letter-spacing-tighter`                 | `--letter-spacing-tight`                 |
| `--letter-spacing-tight` (-0.02em, unused) | removed                                  |
| `--radius-medium`                          | `--radius-main`                          |

Utilities (`gap-N`, `padding-*-N`, `margin-*-N`, `radius-main`), the
`SpaceStep` type, `Section`'s default `gap` (`"8"`) and the Figma
variables follow. `/trix-upgrade` renames a 0.2 site in one pass with
`rename-lumos-names.mjs`. The `62rem` breakpoint stays (Webflow's 992px).

### Tokens

- Text styles are opt-in: each `/* Text style — name */` group, and nothing
  else. Before, any group with a `*-font-family` token became one — adding
  `--button-font-family` created `.text-style-button`, a `TextStyle` value, a
  Figma text style and a docs row, silently. A Text style group without its
  `--name-font-family` fails.
- Any number of font families: every `--<word>-family` token is exported to
  Figma as `font/family/*`, so a text style set in a third font (a mono label)
  keeps its family in Figma instead of losing it. `scripts/fonts.ts --write`
  writes `--<family>-trim-*` for each family in a different font, not only
  `secondary`.
- Component groups keep multi-word names in Figma: `/* Components —
content-wrapper */` exports `--content-wrapper-gap` as `content-wrapper.gap`,
  not `content.wrapper-gap`.
- Names that collide in Figma fail instead of overwriting: `--grey` next to
  `--grey-10` would make `color.grey` both a value and a group.
- Contrast is checked for every `--X-text…` / `--X-background…` role pair a
  theme defines, so a project's new component roles are covered without
  editing `conventions.ts`.
- `npm run test:tokens` covers the above.

### Components

- `Button` with an icon: write an `Icon` into the label, before or after the
  text (Mast's way) — it now stays on the text's line instead of breaking it.
  No new prop.
- `Button`: the label's font, size, tracking and case come from
  `--button-label-family`, `--button-label-size`,
  `--button-label-letter-spacing` and `--button-label-text-transform`
  (default `inherit`, as before); `arrow`, `play` and `close` round to
  `--button-icon-radius` (default `var(--radius-round)`).
- `Eyebrow`: set in the `eyebrow` text style (was `text-small`, which ignored
  the eyebrow tokens). The style's defaults are now `text-small`'s, so an
  eyebrow looks as it did — as in Lumos — until a design changes that group.
  `variant="tag"` reads the `--tag-background` and `--tag-text` theme
  roles and `--tag-radius`.
- `Dropdown variant="menu"`: opens in the flow of a mobile menu, floats from
  `medium` up. `Nav` no longer clips a dropdown's panel on desktop; the Nav and
  Dropdown docs show one in a nav. The template's Nav keeps Lumos's plain links.

### Fixed — found comparing Trix with Lumos, page by page

- A `COLOR_MODE: "light"` (or `"dark"`) site turned dark (or light)
  mid-visit when the visitor's OS switched theme: `ThemeToggle`'s script
  shipped and listened whatever the mode. It now compiles away unless the
  mode is `"auto"` — one script fewer on every page of a light or dark site.
- A `Video` with its pause button lost `ContentWrapper`'s visual frame
  (ratio and rounded corners) where it was the page's first video: the
  component's script lands beside it and wasn't on the frame's list.

### Figma import (`/trix-import-figma`, `/trix-design-system`)

- `convert.mjs --fresh` for a new project: the design's type scale and
  palette replace Trix's. Type rows match text styles by name (H1 → `h1`),
  never by size — before, a design's 62px H1 landed on stock `--h2` — and print
  as whole `Text style` groups with family, weight, line height, tracking and
  case; the colours print as ramps. Without it, a design _change_ still snaps
  each value to the nearest token.
- `convert.mjs --from-figma <export>` reads Figma's own variables export (one
  DTCG file per mode) into the inventory: Desktop/Mobile modes paired,
  aliases resolved, theme colours and fonts listed apart. The path for an
  agent without the Figma MCP.
- One rule for mobile values, in both skills: a Mobile value of `0`, empty or
  missing was not drawn. Its min is derived from the token it replaces,
  listed under `GUESSED`, and asked about — or, unattended, written and logged.
  The two skills used to give opposite rules.
- _Working unattended_: the decisions an agent may take alone, and where each
  is logged; fonts get the same section.
- Token names are kebab-case from the Figma label (`Plum-400 (Violet)` →
  `--plum-400`, `r_12` → `--radius-r-12`), not copied raw; `--grey` beside
  `--grey-10` is flagged.
- Text styles are read from `tokens.css` (`text-xlarge`, `text-xsmall`,
  `eyebrow` were missed); un-numbered swatches (`--plum-dark`) are matched.
- `/trix-design-system` asks whether the site is light, dark or the visitor's
  choice (`COLOR_MODE`).
- `npm run test:import-figma`.

### Testing

- `npm run test:browsers` reports a link to a page that isn't built once,
  with the page linking to it, instead of failing every check on the 404 page
  at every width (18 broken links had become ~70 failures that buried the
  real ones). A Playwright browser that doesn't match `playwright-core`
  says `npx playwright-core install <browser>`.
- CI runs `npm run test:tokens` and `npm run test:import-figma`, in Trix and
  in every project; both read the project's own `tokens.css`.
- `npm run test:browsers` refuses a `dist/` older than `src/`, `public/` or
  `astro.config.mjs`, instead of testing a build of code that is gone.

### Housekeeping

- `npx astro dev --background` in `AGENTS.md` and the skills — `astro` alone
  is not on an agent's PATH (the same line is in Lumos's `AGENTS.md`).
- A new project's first `npm run check` no longer shows a hint (an unused
  import in `scripts/cms/write.ts`).
- Changing fonts says to remove the `latin` / `latinExt` ranges in
  `astro.config.mjs` once no family uses them.

## 0.2.0 — 2026-10-14

The best of Mast for Astro, rebuilt the Lumos way: typed components, CSS in
`@layer components`, values from tokens — no Mast code is included. Plus the
SEO phase, fonts from any source and the design-change skill.

### Layout grid

- `Row` and `Col`: the 12-column grid. `span` sets the desktop span and
  tablet and mobile stack automatically (Mast's table, mobile-first);
  `xsmall`–`large` set exact spans; `offset` (0–11 or `center`) and `order`
  (`first`, `last`) apply on desktop and work anywhere in a row. Built on CSS
  Grid with the gutter as `gap`, so a column's box is its content and the
  columns are exactly the designer's.
- `--grid-columns: 12` token; the layout grid per frame (margin, gutter,
  column, content width) in `docs/tokens.md`, on `/style-guide` and as the
  `grid.columns` Figma variable.
- `GridOverlay`: Shift+G draws the layout grid over any page in development
  (or wherever `gridOverlay` is set), remembered across pages.
- Verified in Chrome: every column of every style-guide example lands on the
  grid lines at 15 widths from 320 to 1920 (531 checks).

### Motion

- `animate` on `Section`, `Row`, `Col` and `Grid`: children fade up one after
  another the first time they scroll into view. `--reveal-duration`,
  `--reveal-ease`, `--reveal-distance`, `--reveal-stagger`. Hidden only on
  screen with scripting on and motion allowed — reduced motion, print and
  no-JS visitors see the content at once. Runs as a CSS animation, so it never
  overrides a component's own transitions.

### Elements

- `<hr>` styled as a theme-colored rule; rich-text tables (borders, padding,
  sideways scroll when wide).
- Link prefetch on hover and focus.
- `Video`: autoplaying videos get a pause button (WCAG 2.2.2), which starts
  paused for visitors who prefer reduced motion; `pauseButton={false}` for a
  clip of five seconds or less; `pausePosition` puts it in any of nine
  places (corners, edges, center). Allowed inside `ContentWrapper` visuals.
- `Spacer` (from Mast, rebuilt): space from the scale at one spot. In a
  Section it takes the container's gap back on both sides, so the blocks
  either side are exactly `size` apart — more or less than the gap; in a Col
  it adds `size`. Lumos's own "spacer" was already `Section` padding.

### Fonts and design changes

- `trix-design-system` skill: change fonts, text styles, colors, themes,
  spacing or the grid from a Figma style guide (Trix-named variables map
  directly) or from the owner's answers to one round of questions.
- Fonts from anywhere: uploaded files, or Google, Adobe, Fontshare, Bunny,
  Fontsource or npm through Astro's providers — downloaded at build and
  served from the site. `BaseHead` loads every configured family and
  preloads the first; no per-font edits.
- `scripts/fonts.ts` measures each family's leading trim from the metrics
  the browser uses, writes it, and gives a different heading font its own
  trim tokens.
- Inter's trim corrected from Lumos's 0.4em / 0.38em to the measured
  0.364em / 0.364em: text boxes now run exactly cap height to baseline, as
  Figma's vertical trim does (an h1 was about 4px taller than its text).

### SEO

- `trix-seo` skill: per-page metadata, structured data, audit, migration
  parity, launch handoff.
- `src/utils/schema.ts`: Organization, WebSite, BreadcrumbList, Article,
  FAQPage, LocalBusiness and Product builders; `JsonLd` component; `schema`
  on `BaseLayout`. The home page carries Organization and WebSite.
- `Breadcrumbs`: an accessible trail that emits its BreadcrumbList.
- `scripts/seo/audit.ts` (`npm run seo`, in CI): crawls the build or a live
  site in Chrome and checks status, title, description, canonical, `lang`,
  h1 and heading order, alt text, Open Graph, structured data, broken links,
  sitemap and robots.txt, layout shift and largest paint.
- `scripts/seo/parity.ts`: every indexable URL of the old site checked on the
  new one, through live or CSV redirects — lost, changed or same.
- `og:locale` and the page `lang` come from `SITE_LOCALE`; `SITE_SOCIALS`
  feeds the Organization's profiles. The demo links to a non-existent
  `/about` (found by the audit) now point at real pages.

### CMS

- `trix-cms` skill and `scripts/cms/`: any CMS into typed content
  collections. Importers for Webflow (Data API v2, the MCP connector's
  export, or CSV), WordPress (REST API: post types, taxonomies, ACF, Yoast,
  drafts with an application password), and CSV (Framer, Wix, Airtable,
  Notion, spreadsheets — column types read from the values); any other CMS
  through the common JSON shape.
- `write.ts`: one Markdown file per item (exact JSON frontmatter, rich text
  kept as HTML so Markdown changes nothing), zod schemas with `reference()`,
  enums and `image()`, every image and file downloaded from the CMS's own
  hosts (`--host` for the old domain's PDFs), platform markup stripped,
  internal links moved to new paths, 301s for changed URLs, page scaffolds,
  heading demotion, re-runs that remove deleted items.
- Headless: `cmsLoader` reads Webflow or WordPress at build with the same
  importers; `write.ts --headless` generates it and authorises the CMS's
  image host.
- `verify.ts`: item counts, schemas (`astro sync`), nothing left on the old
  CMS or site, a page per item. `npm run test:cms` (in CI) covers every
  field type and the pipeline on a fixture.
- Tested on real data: a client's Webflow CMS (8 collections, every field
  type, drafts, circular references) and a public WordPress site (posts,
  22 categories, 269 tags, Jetpack images, dated permalinks → 301s), as
  files and headless; and Framer-style CSVs with quoted newlines.

### Browsers

- `npm run test:browsers` (`tests/browsers.ts`): every page crawled from
  `/`, at phone, tablet and desktop widths, in every browser on the
  machine — Chrome, Chromium, Edge, Brave, Firefox, WebKit, and real
  Safari through safaridriver — for script errors, failed requests,
  sideways scroll, unique ids, sized images and WCAG 2.2 AA, and every
  component on the page driven by mouse and keyboard.
- CI runs it once per browser: Chrome, Edge, Brave, Firefox and WebKit on
  Linux, Safari on macOS.

### Flowtrix brand

- The palette is Flowtrix's: brand green `#0fd375` (`--brand-300`, the
  buttons and the brand theme) on an OKLCH scale that keeps its hue at every
  step — `--brand-600` is the green for text on white — with true neutral
  greys, black and white. Light theme: white page, black text. Dark theme:
  black page, white text. Every pair passes the contrast check.
- The favicon, app icon, social image and placeholder background are redrawn
  in green, black and white.
- The website's hero has a moving, grainy glow in the brand green — its own
  WebGL shader, with a CSS fallback and a still frame for reduced motion.

### Full-bleed without the scrollbar

- `Section` is a size container, and ContentWrapper's `breakout` and the
  Slider's bleed size themselves with `100cqw` — the section's real width —
  instead of `100vw`, which also counts a visible scrollbar and overflowed by
  it on Windows and on Macs without a trackpad (found by the real-Safari CI
  job). The browser test now shows Chromium's scrollbars, so CI on Linux
  catches it too.

### Documentation site

- `site/` — the framework's docs, built with Trix itself and rendering the
  components in `src/` directly: Start here, The system (cascade, tokens,
  fluid sizing, theming, typography and fonts, layout, components, utilities
  or props, motion, accessibility), a page per component, Classes, and Guides
  (Lumos, Mast and Trix; agent skills; designers and Figma; migrating a site;
  moving a CMS; SEO; testing; deploying; upgrading).
- Live examples: a fence marked `astro live` renders the component and shows
  its code. Props tables are read from each component's source with
  `scripts/props.ts` (shared with `/trix-audit-props`); the utility and
  pattern lists, the token reference and the skills list are read at build.
- Search (⌘K, Ctrl+K or `/`) from a static index of every page and section;
  light and dark mode; a sidebar that is a drawer on phones.
- `npm run docs:dev`, `docs:build`, `docs:preview`, `docs:deploy`. The
  repository's `wrangler.jsonc` now deploys the website — the `trix` Worker,
  [trix.flowtrix.workers.dev](https://trix.flowtrix.workers.dev) — and
  Cloudflare builds it on every push (`npm run docs:build`, then
  `npx wrangler deploy`). Projects get their own config from the installer.
  CI type-checks, builds and audits it.
- Across all 64 pages: SEO audit clean; 1453/1453 browser checks in Chrome,
  WebKit and Brave.

### Installer

- `npm create trix-astro@latest my-site` — `packages/create-trix-astro`,
  modelled on `create-lumos`. It downloads Trix at one exact commit, leaves
  out the framework's own parts (`site/`, `packages/`, the dependency bots,
  its installer test), names the project after its folder, stamps `package.json` → `trix`
  with `version`, `commit` and `created`, writes the project's own README and
  `wrangler.jsonc`, and installs with the package manager that ran it.
- `npm run test:create` (in CI): the installer on an archive of the commit,
  as GitHub serves it.
- Projects keep `.github/workflows/ci.yml`: one workflow for the framework
  and every project, its docs-site and installer steps running only where
  those exist. Real Safari runs on public repositories; a private project,
  where GitHub bills macOS at ten times Linux, relies on WebKit unless its
  `TRIX_SAFARI` variable is `on`.
- `.wrangler/` (local Cloudflare state) is no longer tracked.

### Found while building the docs

- The `hidden` attribute did not hide a paragraph or heading: the leading
  trim's `display: flow-root` overrode it. `base.css` now makes `hidden` win.
- The local test server answered `/blog` with `blog/index.html` when a
  `blog/` folder existed, so a site with a list page and its posts read as a
  404 to the SEO audit and browser tests. It now looks files up as Cloudflare
  does: `blog.html` first.
- Tables inside RichText collapsed to zero width in a parent sized to its
  content. RichText is capped at its container instead.
- The reveal script is its own component, `Utility/Reveal`, so a layout other
  than `BaseLayout` can include it.
- The browser test fails on visible text or tables narrower than 1px, and on
  a `hidden` element that shows; it waits for reveals to finish before axe
  measures contrast.

### Style guide and docs

- `/style-guide`: section navigation, a Layout grid group (overlay toggle,
  live columns, per-frame Figma table), Row and Col examples, Motion.
- `/components`: four Row/Col layouts — media and text with an offset, a
  centered 8, a sidebar reordered on desktop, a revealed feature row.
- Designer guide: the layout grid per frame, how spans stack, what to
  annotate. `TRIX.md`: which layout component a design calls for.

### Found by the end-to-end audit (Chrome and WebKit, axe WCAG 2.2 AA)

Most of these were inherited from Lumos for Astro, and are fixed at the
source so every project gets them:

- Contrast: secondary text (`--text-2`) 60% → 70% and the light heading
  accent now pass AA in every theme; components use the token instead of
  their own 60% mixes. `npm run check` fails any theme text role below AA,
  unless that theme's line says `contrast: accepted`.
- Slider dots are 24px targets (WCAG 2.2); scrollable rows and rich-text
  tables are keyboard-reachable; Safari returns focus from a closed modal
  and follows the skip link.
- Long words in headings and text break instead of widening the page on a
  phone; wide rich-text tables scroll inside the text.
- URLs: one form per page with no trailing slash (`trailingSlash: "never"`,
  `build.format: "file"`), so links and migrated Webflow URLs answer without
  a redirect; canonicals, noindex and the current nav link read the page
  path in any build format. The audit flags file-name canonicals and links
  that would redirect.
- Hosting: `public/_headers` (security headers, a year's caching for
  fingerprinted assets) and `public/_redirects` (real 301s), verified in
  Cloudflare's local runtime.
- `ThemeToggle` renders in the nav when `COLOR_MODE` is `auto`.
- Measurement is deterministic: elements are matched across widths by
  their place among their siblings and their text, not their index in the
  page; one text slot per size, with other weights put to the owner.
- Same checks on the three demo sites: Lumos 15 elements failing
  (target size), Mast 80 (contrast, target size) and a script error, Trix
  none.

### Measuring and skills

- `design.ts` measures the layout grid: the content edge most text sits on
  (site margin), where content stops growing (max width), the gutter between
  columns side by side (gap or padding gutters), equal-column lists, and how
  many unequal layouts sit on 12 columns. Rows with negative margins (Mast,
  Bootstrap) are seen through.
- `propose.ts` writes `--site-margin`, `--site-gutter` and `--max-width-main`
  from it and asks about layouts off the grid. On the reference project's export it
  recovers the site's own 16→40 margin, 12→16 gutter and 1280 max width.
- `trix-build` (from Mast's `mast-build`): the ten places Trix differs from
  ordinary web practice, loaded whenever markup or CSS is written.
- `trix-migrate`: from Mast's `mast-migrate`, the semantics to fix while
  translating, and no dead pagination or filter controls; spacers from any
  framework become `<Spacer>`; Mast rows and columns to `Row`/`Col`
  (desktop-first to mobile-first), stagger animations to `animate`, IX2 fades to `animate` with
  `--reveal-*` set from the source. New eval for a Mast site.
- `trix-import-figma`: frame layout grids give the site margin and gutter;
  blocks become `span` and `offset`.
- `trix-style-guide`: the layout grid in the proposal, the record and the
  overlay check.
- Leading trim is measured on the source: `design.ts` reports whether
  one-line text boxes are trimmed, `propose.ts` turns trim off for a source
  that never trims (the reference export: 371 blocks, none trimmed), and
  `verify.ts` checks every rebuilt text style against it.
- End to end on the reference export (5 real pages): layout grid 19/19, spacing
  and trim identical; the only differences are one stepped h1 — sizes that
  jump at breakpoints — which the proposal puts to the owner.

## 0.1.0 — 2026-10-14

First release of Trix, forked from Lumos for Astro 0.0.5 (`0e32ded`).
Licensed MIT, © Flowtrix; Lumos for Astro's notice is kept in
`THIRD-PARTY-NOTICES.md`.

### Design system

- `src/styles/tokens.css` and `themes.css` replace the token, theme and text
  style sections of Lumos's `base.css`. Fluid values are `-min`/`-max` pairs;
  everything else is generated by `npm run tokens`.
- Generated: fluid clamps, text-style classes, spacing/section/radius/type/
  grid-span utilities, prop types, Figma DTCG files (`design/tokens/`), token
  docs (`docs/tokens.md`).
- 12-step spacing scale (Lumos step N = Trix step N+1, same values; new 4px
  first step and three larger steps), section sizes xsmall–xlarge, radius
  xsmall–large, line heights xsmall–huge, letter spacing tighter–wider.
- 13 text styles: display, h1–h6, text-xlarge, text-large, text-main,
  text-small, text-xsmall, eyebrow; primary and secondary font families.
- Palette ramps `--neutral-50…950`, `--brand-50…950`; themes light, dark,
  brand with the full semantic token set.
- Component tokens for button, field and card.
- Breakpoints 30 / 48 / 62rem (Webflow's 480 / 768 / 992); `64rem` moved to
  `62rem` in Grid, ContentWrapper and Slider.
- Inter variable (wght 100–900, opsz) as local WOFF2, latin and latin-ext,
  only latin normal preloaded.

### Components

- `Icon` takes `name` (any Phosphor icon, six weights), inlined at build time.
- `ThemeToggle`, and `COLOR_MODE` (`light`, `dark`, `auto`) with a pre-paint
  script.
- Section, ButtonWrapper, Heading, Paragraph, RichText, Card and BaseLayout
  props typed from the generated scales.
- `line-clamp-2/3/4` utilities (Lumos shipped the one-line base only).
- Style guide page and components (`/style-guide`), rendered from the tokens;
  `/example-components` renamed `/components`.
- Favicon, ICO, apple-touch-icon and OG image; `BaseHead` links all three icons.

### Tooling

- `scripts/tokens.ts`, `scripts/conventions.ts` (breakpoints, undefined
  tokens, px lengths) in `npm run check`.
- `scripts/measure/`: inventory, design, propose, variables, classes, verify.
  `propose` keeps Trix's scale names stable (measured values are matched onto
  existing names by nearest value), carries any token the framework still
  references, and writes a component spacing remap. Verified end to end on a
  fresh clone converted from a Webflow export: 152 of 152 checks identical.
- The token parser rejects invalid token names instead of skipping them.

### Skills

- New: `trix-new-project`, `trix-style-guide`, `trix-migrate` (Webflow,
  Framer, WordPress, other).
- Renamed and updated from Lumos: `trix-import-figma` (reads `tokens.css`, fast
  path for files built on Trix variables), `trix-audit-props`,
  `trix-scaling-graphic`, `trix-upgrade` (plus upstream Lumos sync).
- Removed the name-based `map-classes` and `map-variables` scripts — replaced by
  value-based `classes.ts` and `variables.ts`.
- Project records move out of skills into `PROJECT.md`.

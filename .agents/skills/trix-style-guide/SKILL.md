---
name: trix-style-guide
description: >-
  Build or rebuild a project's Trix design system — typography, colors,
  themes, spacing, radius, breakpoints, fonts, brand assets — from any source:
  a live site on any platform (Webflow with Lumos, Mast, Client-First or no
  framework; Framer; WordPress; Wix; Squarespace; hand-built), a code export,
  platform variables, or nothing but a design. Use when starting a migration,
  setting up a new project's style guide, when a source has no style guide and
  one must be derived, or when the user asks to match an existing site's
  design exactly. Every value is measured; nothing is guessed.
---

# Setting up a Trix style guide

The style guide is the first deliverable of every Trix project and the
foundation everything else is checked against. It is finished when:

- `src/styles/tokens.css` and `src/styles/themes.css` hold the project's
  values under **Trix names**.
- `npm run tokens` has regenerated the classes, prop types, Figma files and
  docs from them.
- `/style-guide` renders the system, brand assets included.
- `node scripts/measure/verify.ts` reports **every check identical** against
  the source.
- Every decision is written in `PROJECT.md` → **Design system**.

## The rules that outrank the rest

1. **Measure, never translate by name.** A source class or variable called
   `margin-bottom-2`, `space-8` or `text-large` says nothing about its value
   in Trix. Values come from a real browser's computed styles; names come from
   Trix. On the first site this skill was written against, renaming by name
   would have broken 4 spacing classes and 1 type style, and kept 2 classes
   that had no CSS at all.
2. **Trix names, source values.** Never carry a source naming convention into
   the code (`--_spacing---space--16px`, `u-`, `cc-`, `heading-style-h2`).
   `PROJECT.md` is the only place the two meet.
3. **Ask, don't guess.** Anything ambiguous — two paddings 4px apart, an
   eleventh heading size, a translucent color — goes to the owner as one
   list, with the evidence. Write nothing that is still in question.
4. **Keep the quirks, write them down.** If the source does something odd but
   visible (a style that reads another style's letter spacing, a spacer that
   scales to a different viewport), reproduce it and record why. "Identical"
   means identical.

## Tools

All in `scripts/measure/`, all run against a real browser (system Chrome via
`playwright-core`), all write to `.trix/` (git-ignored).

| Script                                          | Does                                                                                                          | Output                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `inventory.ts --url <site>` or `--dir <export>` | Platform, CSS framework, every page, content to preserve                                                      | `inventory.json`                                      |
| `design.ts --url <site> --sample 8`             | Every visible element at 320–1920px: type, spacing, spacers, radius, colors, media queries, `:root` variables | `design.json`, `design.md`                            |
| `propose.ts`                                    | Fluid range, type slots, spacing scale, palette ramps, breakpoints → a full `tokens.css`                      | `tokens.proposed.css`, `proposal.md`, `proposal.json` |
| `variables.ts --source <site> --local <trix>`   | Each source CSS variable → the Trix token with the same value at 4 widths                                     | `variable-map.md`, `rename-variables.sed`             |
| `classes.ts --source <site> --local <trix>`     | Each source class → the Trix class with the same computed effect                                              | `class-map.md`                                        |
| `verify.ts --local <trix>/style-guide`          | Rebuilt text styles and spacing vs the source, at every width                                                 | `verify.md`, exit 1 on any difference                 |

## Steps

### 0. Read and start the record

Read `PROJECT.md`. Fill **Sources** as each one arrives — the live URL, export
path, Figma link, who owns decisions. Nothing in the repository points at a
file on someone's desktop unless this file does.

Start the Trix dev server: `astro dev --background`.

### 1. Identify the source

```bash
node scripts/measure/inventory.ts --url https://example.com
```

The platform and framework lines decide where the authoritative values live:

| Source                                                          | Structure and names come from                                                                                                              | Values are checked by                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Webflow with Variables (Lumos, Client-First v2, Mast 2, custom) | Variables panel via the Webflow MCP (`data_variable_tool`: collections, modes)                                                             | `design.ts` + `variables.ts`         |
| Webflow without Variables                                       | `design.ts` measurements                                                                                                                   | `classes.ts` against utility classes |
| Framer                                                          | `--token-*` / `--framer-*` custom properties in `design.json → variables`, and the Framer project if available                             | `design.ts`                          |
| WordPress block theme                                           | `theme.json` (`/wp-content/themes/<theme>/theme.json`): `settings.color.palette`, `typography.fontSizes`, `spacing.spacingSizes`, `custom` | `design.ts`                          |
| WordPress page builder (Elementor, Divi, Bricks)                | Builder global colors and fonts (Site Settings), then `design.ts`                                                                          | `design.ts`                          |
| Anything else, or no style guide at all                         | `design.ts` measurements alone                                                                                                             | `verify.ts`                          |
| A Figma file                                                    | `/trix-import-figma` instead                                                                                                               | that skill's report                  |

When a source has named variables, they give **structure** (which colors are
the palette, which modes exist, which sizes are a scale) and intended values.
Measurements give **truth** (what the site actually renders). Where the two
disagree, the rendered value wins unless the owner says otherwise — and the
disagreement goes in the report.

### 2. Measure

```bash
node scripts/measure/design.ts --url https://example.com --sample 8
```

Sample enough pages to see every template: the homepage, a long content page,
a listing, a detail page, a form page. Add `--pages /a,/b` for specific ones.
Read `.trix/design.md` — it is the site's design system as rendered, whether
or not anyone ever wrote one down.

### 3. Propose

```bash
node scripts/measure/propose.ts
```

Read `.trix/proposal.md` top to bottom. It contains:

- **Fluid range** — where values start and stop scaling (Webflow sites often
  stop at 1280, not Trix's 1440). Keep the source's range: every fluid token
  depends on it.
- **Text styles** — measured clusters assigned to Trix slots
  (`display`, `h1`–`h6`, `text-xlarge` … `text-xsmall`, `eyebrow`) by role
  and size, each with its evidence. Assignment by size is a proposal; the
  level a style belongs to is the owner's call.
- **Spacing** — measured min/max pairs, spacer heights included, as one
  numbered scale `--space-1…N`. Series that change at breakpoints instead of
  scaling are listed separately: they belong to a component's media query.
- **Layout grid** — the site margin and gutter (measured at every width:
  the content edge most text sits on, the space between columns side by
  side), the maximum content width, and how many of the site's unequal
  layouts land on 12 columns. Equal-column lists are listed separately: they
  become `<Grid>`, whatever their count.
- **Section space, radius, palette ramps, theme starting point, breakpoints.**
- **Ask before writing** — the list for step 4.

### 4. Ask, all at once

Put every open question to the owner in one message, each with its evidence
and the option to consolidate. Typical ones:

- Heading level for each measured size; whether extra sizes become new styles
  or snap to existing ones.
- Spacing naming — Trix's default is one numbered scale; a source with a
  t-shirt scale may keep a few named section sizes.
- Palette ramp names (`brand`, `neutral`, `accent-1`…) and which hue is the
  brand.
- Themes: which section looks exist (light, dark, a brand color, a tint) —
  each becomes a `.theme-*` class.
- Translucent colors: almost always an existing swatch mixed with
  transparent, never a new swatch.
- Breakpoints beyond three.
- Layouts off the 12-column grid: snap to the nearest span (a visible change)
  or keep the width in that component.

Write each answer into `PROJECT.md` **the moment it is given**.

### 5. Write the tokens

Start from `.trix/tokens.proposed.css`; edit `src/styles/tokens.css` group by
group. The file's comment headings are the groups; keep them.

- **Fonts** — local WOFF2 only, through Astro's fonts API in
  `astro.config.mjs`. Prefer the variable font with the same axes the source
  uses (check `opsz` and `wght` — the same family at a different optical size
  renders at a different width). Split by `unicode-range`; preload only the
  latin normal file (`BaseHead`). Set `fallbacks` so Astro generates a
  metric-matched fallback. Set `--primary-family` (and `--secondary-family`
  for a second family).
- **Text styles** — one group per style, all twelve properties. A source with
  no heading margins (most Webflow builds) gets `0rem` margin tokens. A source
  without leading trim gets `--primary-trim-top/bottom: 0.5lh` (trim off). A
  source that trims (Lumos for Webflow) keeps its own trim values; for a
  font the source never trimmed but the project now should, measure it:
  `node scripts/fonts.ts --url <dev>/style-guide --write`.
- **Spacing** — the numbered scale in size order. If its length or values
  differ from Trix's default, the framework components' `var(--space-N)`
  references must be remapped **by value** to the nearest new step, and the
  map recorded in `PROJECT.md`.
- **Colors** — palette ramps, then each theme in `themes.css` with the full
  set of semantic tokens. Alpha variants are `color-mix(in lab, … N%,
transparent)` of a swatch or `currentcolor`.
- **Layout grid** — `--site-margin`, `--site-gutter` and `--max-width-main`
  from the proposal's _Layout grid_. Check with the overlay: Shift+G on the
  rebuilt `/style-guide` and on the source side by side, at 375, 768 and 1440. Layouts that do not sit on 12 columns are a step 4 question.
- **Breakpoints** — the three source breakpoints as `--breakpoint-*` tokens,
  and the same literal values in every component media query
  (`npm run check` enforces it).
- **Components** — button, field and card tokens from the source's measured
  component styles.

Then `npm run tokens` (automatic while `astro dev` runs) and
`npm run check`.

### 6. Brand assets

- `src/assets/logo/logo.svg` — the wordmark as an SVG using `currentColor`,
  taken from the source's inline SVG where possible (fix `viewbox` →
  `viewBox` when copying from HTML).
- `src/assets/logo/logo-icon.svg` — the mark.
- `public/favicon.svg`, `public/favicon.ico` (32px), `public/apple-touch-icon.png`
  (180px PNG — iOS ignores SVG touch icons), `public/og-image.jpg` (1200×630,
  JPEG).
- Icons: if the source uses an icon font (Phosphor, Font Awesome), map each
  glyph to `<Icon name>` (Phosphor, built in) or a file in `src/assets/icons/`.

### 7. Verify

```bash
node scripts/measure/verify.ts --local http://localhost:4321/style-guide
node scripts/measure/variables.ts --source https://example.com/ --local http://localhost:4321/style-guide
```

`verify.ts` must report every check identical. `variables.ts` should map every
source variable that is still used; the ones it cannot map are either dead in
the source or a token still missing. Then open `/style-guide` at desktop and
mobile and look at it next to the source.

### 8. Record and report

Fill **Design system** in `PROJECT.md`: fluid range, the type slot map
(source style → Trix slot), the spacing scale with the source's names beside
it, palette and theme map, breakpoints, fonts, quirks kept, component remaps.

Report to the owner:

- **Verified** — the verify and variable-map results, as numbers.
- **Decisions** — every answer from step 4.
- **Quirks kept** — what is odd in the source and reproduced on purpose.
- **Not ported yet** — component-level values that land with their components.
- **Still open** — anything unanswered.

## A source with no style guide

The same steps, with two differences. `propose.ts` builds the whole system
from measurement, so the ask list in step 4 is longer and more of it is
consolidation: a messy site has 30 spacing values that are really 12, and six
grays that are really four. Consolidate only with the owner's yes, and report
every value that moved and by how much — those are visible changes, and the
owner has to accept them knowingly.

## Using this without Claude Code

Everything is Markdown and Node: `node scripts/measure/<script>.ts`. Only the
automatic triggering and `/trix-style-guide` are Claude Code features.

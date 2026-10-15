# How Trix works

## What it is made of

Every part is built the same way: a typed component, CSS co-located in
`@layer components`, values from tokens.

| Conventions                                                                  | Features                                                                                                                                                       | Tooling                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cascade layers: base → patterns → components → utilities                     | Token file laid out like a variables panel; edit the min/max pair, never the formula                                                                           | Generator: fluid CSS, text styles, utilities, prop types, Figma DTCG files and docs from one file                                                                               |
| Components with co-located `<style is:global>` in `@layer components`        | Icons inlined by name at build time (Phosphor)                                                                                                                 | Style guide rendered from the tokens — no copied values                                                                                                                         |
| Typed props, `render`, discriminated unions on `variant`                     | Site-wide light/dark mode with a pre-paint script and a toggle                                                                                                 | Measuring toolkit: inventory, design extraction, token proposal, value-based class and variable maps, verification                                                              |
| Spacing owned by the receiving element; containers space children with `gap` | Skill evals (prompts with assertions)                                                                                                                          | Webflow breakpoints as defaults (30 / 48 / 62rem)                                                                                                                               |
| `_wrap` naming, variants as bare classes                                     | 12-column grid with automatic stacking — `Row` / `Col` (`span`, `offset`, `order`); on CSS Grid, mobile-first, with the gutter and margin from the site tokens | A spacing scale with three larger steps, 13 text styles, palette ramps, component tokens                                                                                        |
| Themes as classes with semantic tokens, `theme-invert`                       | Scroll-in reveal with stagger — an `animate` prop, timed by `--reveal-*` tokens, CSS-only hiding (no `html.js` class)                                          | Conventions check in CI; `PROJECT.md` outside the framework                                                                                                                     |
| Agent skills with Node scripts                                               | Link prefetch; rich-text tables and dividers; `Spacer` — rebuilt to take back the container's gap, so the space at that spot is exactly its size               | Platform adapters for Framer, WordPress and others · SEO toolkit: audit, migration parity, structured data, breadcrumbs · fonts from any source, leading trim measured per font |

Also: `Video`
that loads nothing until it is on screen and plays only while seen
(`desktopOnly` keeps it off phones), `Slider playback="auto"` and `loop`,
`Marquee pauseOnHover`, `Modal openOnLoad` with `cooldownDays`, `NavBanner`
and `Dropdown variant="mega"`.

**Names are stable.** A token, utility, prop, theme role or class keeps its
name and value once released; additions follow the same patterns beside them.

What Trix deliberately leaves out: a slider fade effect
(`Tabs playback="auto"` is the rotating panel), a vertical marquee, a
tabs-to-dropdown menu on phones, one global
`components.css` (Trix keeps CSS with its component), `em`-based spacing
utilities (they drift with font size), a `Divider` component (an `<hr>` is styled instead, and the container's `gap` spaces it), negative-margin rows with padding gutters
(CSS Grid's `gap` is the gutter, so a column's box is its content), `cc-` combo classes and `u-` prefixes
(Webflow-era naming), and `light-dark()` as the only theming mechanism (Trix
themes are N classes — light, dark, brand, any number more — which maps to
Figma variable modes one to one).

## The token pipeline

```
src/styles/tokens.css ─┐
src/styles/themes.css ─┴─► src/utils/tokens.ts (parse + model) ─► scripts/tokens.ts
                                                                    ├─ src/styles/generated/fluid.css
                                                                    ├─ src/styles/generated/text-styles.css
                                                                    ├─ src/styles/generated/utilities.css
                                                                    ├─ src/styles/generated/tokens.ts
                                                                    ├─ design/tokens/*.tokens.json
                                                                    └─ docs/tokens.md
```

- `src/utils/tokens.ts` is the single parser, shared by the generator and the
  style guide page. It understands groups (the comment headings), fluid pairs,
  text styles (any group with a `-font-family`), scales by name pattern, and
  themes (any rule whose selector list names `.theme-*`). It resolves `var()`
  chains and evaluates `color-mix()` in srgb and lab exactly as browsers do,
  so the Figma theme values match the rendered colors.
- The generator is deterministic: `npm run tokens -- --check` fails CI when a
  generated file is stale. An Astro integration in `astro.config.mjs` runs it
  at startup and whenever `tokens.css` or `themes.css` is saved.
- The fluid formula:
  `clamp(min, (min − slope·vmin)/16 rem + slope·100vw, max)`, with
  `slope = (max − min)/(vmax − vmin)`. A token may override its own range with
  `--<name>-viewport-min/max`, and a decreasing pair (min > max) is handled.

## CSS layers and files

```
@layer base:        tokens.css → generated/fluid.css → themes.css → base.css → generated/text-styles.css
@layer patterns:    patterns.css   (section, container, heading/text rhythm, fields)
@layer components:  each component's <style is:global>
@layer utilities:   utilities.css → generated/utilities.css
```

Utilities always win; nothing needs `!important`.

## The measuring toolkit

`scripts/measure/` drives the system Chrome through `playwright-core` and
always reads **computed styles**, never class or variable names:

| Script         | Reads                                                              | Answers                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory.ts` | every page (sitemap or crawl)                                      | platform, framework, pages, forms, assets, fonts                                                                                                                       |
| `design.ts`    | every visible element at 320, 375, 768, 992, 1280, 1440, 1920      | type clusters, spacing and spacer series, radius, colors (weighted by area and text length), media queries, `:root` variables                                          |
| `propose.ts`   | `design.json`                                                      | the fluid range (from where series stop growing), type slots, a spacing scale, palette ramps (OKLab clustering), breakpoints — as a full `tokens.css` plus an ask list |
| `variables.ts` | source and Trix `:root` variables, resolved at 4 widths            | which Trix token each source variable _is_, ranked by kind; a sed rename script                                                                                        |
| `classes.ts`   | each class applied to a bare element at 4 widths, both stylesheets | same / renamed / dead / contextual / no match                                                                                                                          |
| `verify.ts`    | the rebuilt text styles and spacing at every width                 | identical or not, per value                                                                                                                                            |

On the reference project (a Webflow site on a `u-` utility system), measure →
propose → generate → verify reproduced the source's type and spacing with all
108 checks identical, and the class map caught four same-name/different-value
classes and two classes with no CSS at all.

## The CMS pipeline

```
Webflow API / MCP export ─┐
WordPress REST API ───────┼─► src/utils/cms/*  ─► .trix/cms/<source>.json   (one shape: model.ts)
CSV (Framer, Wix, …) ─────┘                         │
                                     scripts/cms/write.ts ─► src/content/<collection>/*.md
                                                     │         src/content/collections.ts (zod)
                                                     │         src/assets/cms/, public/cms/
                                                     │         public/_redirects
                                     --headless ─► cmsLoader (same importers, at build)
                                     scripts/cms/verify.ts ─► counts, schemas, no old URLs, pages
```

The importers live in `src/utils/cms/` because both sides use them: the
scripts at the command line, and `cmsLoader` inside Astro's build. Every
source becomes the same `CmsExport` (`model.ts`), so the writer, the
loader, the schemas and the checks know nothing about Webflow or WordPress.

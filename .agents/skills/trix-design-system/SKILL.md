---
name: trix-design-system
description: >-
  Set or change the project's design system — font families and font files,
  text styles, colors and themes, spacing, radius, the layout grid — from a
  designer's Figma style guide, or by asking the owner. Use when a designer
  changes the font, typography, brand colors or any other token; when someone
  shares a Figma style-guide link to apply; when a new project has a design
  direction but no site to measure; or when someone wants to add, upload,
  swap or self-host a font (files, Google Fonts, Adobe Fonts, Fontshare, any
  URL).
---

# Changing the design system

Designers own the values — fonts, type, colors, spacing, radius, grid. Trix
holds them in exactly three places, and everything else follows:

| Values                                                 | Live in                      |
| ------------------------------------------------------ | ---------------------------- |
| sizes, type, spacing, radius, palette, grid, motion    | `src/styles/tokens.css`      |
| what each theme's background, text, button… colors are | `src/styles/themes.css`      |
| which font files load, and from where                  | `astro.config.mjs` → `fonts` |

`npm run tokens` (automatic while `astro dev` runs) regenerates the text-style
classes, utilities, prop types, Figma variable files and token docs, and
`/style-guide` re-renders from them. No component is edited to change the
look.

**The rule that outranks the rest: every value comes from the designer —
from their Figma file or their answer.** A value the design leaves out (a
mobile size nobody drew, a hover nobody drew) is never guessed silently: it
follows the one rule in `/trix-import-figma` → _Mobile values_, is marked as a
guess, and is asked about — or, with nobody to ask, decided and logged as
`/trix-import-figma` → _Working unattended_ says. Nothing else still in
question is written.

| The request                                          | Use                  |
| ---------------------------------------------------- | -------------------- |
| change or set the system from Figma, or from answers | this skill           |
| match an existing website's look                     | `/trix-style-guide`  |
| build pages from a Figma file (messy or not)         | `/trix-import-figma` |

## 0. Read the record

`PROJECT.md` → **Design system** says what was decided before and why. A
change that undoes a recorded decision is confirmed with the owner first.

## 1. Get the values

### With a Figma link

Use the Figma MCP tools on the file's style guide page (or the frame the
designer points at). Without the MCP, the designer exports the variables
(Local variables → each collection → **Export modes**) and
`/trix-import-figma`'s `convert.mjs --from-figma` reads the files — see its
_Getting the values in_.

1. `get_variable_defs` — the variables. **If the names are Trix's**
   (`space/7`, `font-size/h2`, `color/brand/500`, `font/family/primary`,
   theme modes `Light`/`Dark`/`Brand`; see `docs/design/figma-setup.md`),
   there is nothing to convert: each Responsive variable's **Mobile** value is
   the token's `-min`, **Desktop** its `-max`, and every other variable is the
   value of the token at the same path.
2. `get_design_context` on the type specimens — each text style's family,
   weight, size, line height, letter spacing and case. Sizes come in pairs:
   the Desktop frame gives `-max`, the Mobile frame `-min`. A mobile value
   that is missing or `0` was not drawn — `/trix-import-figma` → _Mobile
   values_ says what happens to it.
3. Color styles and variables; the theme modes on section frames.
4. Each frame's layout grid — margin and gutter at 1440 and 375 are
   `--site-margin-*` and `--site-gutter-*`.
5. `get_screenshot` of the style guide, to compare against at the end.

Names that are not Trix's go through `/trix-import-figma`'s converter
(`.agents/skills/trix-import-figma/convert.mjs`): it converts units (px →
rem, line height ÷ size, opacity → `color-mix`), derives the mins nobody drew
and prints the questions. For a new project's design add `--fresh`: the
design's type scale and palette replace Trix's, matched by name, not snapped
to the stock sizes. For a change to this site, leave it off: each value is
matched to the existing token it is closest to.

### Without a link — ask

One message, only about what is changing, every question with Trix's current
value beside it so "keep" is one word:

- **Fonts** — heading and body family; the weights and italics used; and
  where the files come from (→ [fonts](references/fonts.md), step 2).
- **Text styles** — for each of display, h1–h6, text-xlarge … text-xsmall and
  eyebrow that changes: desktop and mobile size, line height, letter spacing,
  weight, uppercase or not.
- **Light or dark** — is the site light, dark, or the visitor's choice? That
  is `COLOR_MODE` in `src/consts.ts` (`"light"`, `"dark"`, `"auto"` with a
  `ThemeToggle`). A dark-first design sets `"dark"`: the dark block of
  `themes.css` is then what most pages show, so it gets the designer's main
  colors. A Figma file shows this too — the theme mode set on the page frames.
- **Colors** — the palette (hex per swatch), and per theme: background, text,
  heading accent, button colors, border. A single brand color is not a
  palette: ask for the shades the design uses, or whether to keep Trix's
  ramp steps around the new color.
- **Spacing, radius, layout grid** — only if they change: the values, desktop
  and mobile.

Write each answer into `PROJECT.md` → **Design system** the moment it is
given.

## 2. Fonts

[`references/fonts.md`](references/fonts.md): asking for the files or where
they are hosted, wiring `astro.config.mjs`, the family tokens, and measuring
the font's leading trim. Do it before the type sizes — every size is
checked in the real font.

## 3. Write the tokens

Edit `tokens.css` and `themes.css` group by group; the comment headings are
the groups — keep them. Where each kind of value goes is the table in
`/trix-import-figma` step 5. In short:

- A fluid value is two plain numbers in px: `--h2-min: 40;` and
  `--h2-max: 64;`. Never write a `clamp()`.
- Line height is unitless (`1.1`), letter spacing in `em` (`-0.02em`).
- A text style is a group of twelve properties — change the ones the design
  changes, leave the rest.
- A themed color goes into **every** theme block, or one theme breaks.
- Remove a token only when nothing references it: `npm run check` lists
  every `var()` left pointing at nothing.

## 4. Regenerate and measure

```bash
npm run tokens
node scripts/fonts.ts --url http://localhost:4321/style-guide --write   # after a font change
npm run tokens && npm run check
```

Open `/style-guide` next to the Figma screenshot at 1440 and at 375: fonts,
every text style, colors in every theme, spacing, the layout grid (Shift+G).
Where they differ, the token is wrong — not the component.

## 5. Back to Figma

The designer imports `design/tokens/*.tokens.json` into Figma's variables
(`docs/design/figma-setup.md`), so a change made from answers reaches the
file too. Figma and code now hold the same values.

## 6. Report

- **Changed** — each token: old → new, and where the value came from (Figma
  node, or the owner's answer).
- **Fonts** — family, source, files or provider, licence note, trim measured.
- **Still open** — anything unanswered; nothing for it was written.

## Using this without Claude Code

The steps are plain edits and Node scripts. Without the Figma MCP, ask the
designer for the variables export (`convert.mjs --from-figma` reads it) or to
fill in the questions above.

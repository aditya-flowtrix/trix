---
name: trix-build
description: >-
  Build and extend pages, sections, components and styles in a Trix project
  the way Trix intends. Use whenever writing markup or CSS here — adding a
  page or section, laying out columns, spacing things, styling, adding a
  variant, theme, token, breakpoint rule, animation or component script.
  Trigger even when the request sounds like plain web work ("build a hero",
  "make this two columns on desktop", "add more space above this", "make it
  dark", "why is there a gap under this heading"): several of those decisions
  go against ordinary web instincts here, and guessing produces markup that
  renders fine but drifts out of the system.
---

# Building with Trix

The depth is in [`TRIX.md`](../../../TRIX.md) — tokens, breakpoints, layout
grid, fonts, SEO, custom components and the checklists — and in
[`docs/components.md`](../../../docs/components.md) for every component's
props. Read the section you need before writing.

What follows are the places where **Trix disagrees with ordinary web
practice** — the ones where doing the normal thing works but is wrong here.

## Ten places Trix diverges

**1. Compose from components; text is a component too.** A section is
`Section` → layout (`Row`/`Col`, `Grid` or `ContentWrapper`) → `Eyebrow`,
`Heading`, `Paragraph`, `RichText`, `ButtonWrapper`, `Button`, `Img`. A plain
`<div>` with classes is the exception. `Heading`'s `tag` is the outline
(`h2`), `variant` is the look (`"h1"`) — never pick a level for its size.

**2. Values come from tokens, never from the page.** No px, no hex, no
`clamp()`. A size that is not in the scale is a design question and, if
answered yes, a token in `tokens.css` — not a local value. `npm run check`
fails on px lengths and on `var()`s that point at nothing.

**3. Containers space their children with `gap`.** Inside a `Section` the
children's margins are zeroed and the container's `gap` spaces them. Change
it for the section (`gap="6"`), or at one spot with `<Spacer size="10" />` —
the blocks either side end up exactly that far apart. Headings and text keep
their own rhythm margins; don't fight them with `margin-top: 0`.

**4. Layout is chosen by what the design is.** Blocks spanning columns
(`8 + 4`, `6` + `5 offset 1`, a centered `8`) → `Row` + `Col span`. Equal
repeated items → `Grid`. Standard text-beside-media → `ContentWrapper`.
Content-sized buttons → `ButtonWrapper`. Never fake columns with widths or
`calc()`. Shift+G shows the grid.

**5. Breakpoints change layout, never size.** Sizes are fluid already. A
media query is mobile-first and uses only the three breakpoint values —
`@media (width >= 30rem | 48rem | 62rem)` — nested in the rule it changes.
Components take `xsmall`–`large` props instead.

**6. Themes are classes; colors are roles.** `theme="dark"` on a `Section`
(or `.theme-*` on any element) switches every role at once. Components use
the role tokens — `--background`, `--text`, `--border`, `--button-*` — never
a palette swatch and never a selector that branches on the theme. A color
that differs per theme is a role in `themes.css`, in every theme block.

**7. A custom component only when CSS or script belongs to it.** Then:
root class ends in `_wrap`, children are `family_role`, a variant is a bare
class beside the root (`.cta_wrap.split`), CSS sits in the component's
`<style is:global>` inside `@layer components`, props are typed with
`render` first. Follow the new component checklist in `TRIX.md`.

**8. Utilities are the last layer, so they already win.** `!important`
means the rule is in the wrong layer. Past about four utilities on one
element, write a custom class instead — and don't mix the two for the same
property.

**9. Motion is built in.** Scroll-in reveals are the `animate` prop on
`Section`, `Row`, `Col` or `Grid` — not a hand-written observer. Hovers use
`--hover-duration` and `--hover-ease`. Everything respects reduced motion.

**10. Media carry their accessibility.** `Img` (optimised; `alt` always,
`""` only for decoration). An autoplaying `Video` keeps its pause button
(`pausePosition` moves it). `Icon name` for Phosphor icons.

## Finishing

```bash
npm run check   # tokens in sync, conventions, types — 0 errors
npm run build
npm run seo     # what search engines read, page by page
```

Then look at it: 390px and 1440px, every theme the page uses, the grid
overlay (Shift+G) against the design, and with reduced motion on. A change
checked only at desktop in one theme is not checked. If no browser is
available, say so and check the built HTML and CSS in `dist/` instead of
skipping the step.

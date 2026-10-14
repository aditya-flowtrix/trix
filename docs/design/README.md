# Designing with Trix

Trix is one design system with two surfaces: the variables, styles and
components in your Figma file, and the tokens, classes and components in the
Astro code. **They share every name.** A designer who uses `space/7`,
`font-size/h2` and `Button / secondary` has already told the developer exactly
what to build, and what you design is what ships — no measuring, no guessing,
no "close enough".

This guide is everything a designer needs. Three more pages go deeper:

- [Figma setup](figma-setup.md) — the file structure, importing the variables,
  text styles, grids and the component library.
- [Handoff checklist](handoff.md) — what "ready for development" means.
- [Token reference](../tokens.md) — every value, generated from the code.

## The rules

### 1. Every value is a variable

Colors, spacing, radius, type sizes, weights, line heights and letter spacing
all come from the Trix variable collections. A raw hex or a typed-in `27px` is
a value the system does not have — either it is one of the existing values
drawn slightly wrong, or it is a new token, and new tokens are decisions to
make on purpose (see rule 9).

### 2. Design two widths; Trix fills in the rest

| Frame                                  | Width | Variable mode                                               |
| -------------------------------------- | ----- | ----------------------------------------------------------- |
| **Desktop**                            | 1440  | Responsive → **Desktop**                                    |
| **Mobile**                             | 375   | Responsive → **Mobile**                                     |
| Tablet (only where the layout changes) | 768   | Responsive → **Desktop** or **Mobile**, whichever is closer |

Type sizes, spacing, section padding, site margin and gutter are **fluid**:
each has a Mobile value (at a 320px screen) and a Desktop value (at 1440px),
and the site scales smoothly between them. You never design 1024 or 1280 —
they are interpolated. On a 375 frame values are 2–5% larger than the Mobile
mode shows; that is expected and not worth correcting by hand.

### 3. Breakpoints are where the layout changes, not the values

| Name   | From | Typical device     |
| ------ | ---- | ------------------ |
| xsmall | 0    | phone, portrait    |
| small  | 480  | phone, landscape   |
| medium | 768  | tablet             |
| large  | 992  | laptop and desktop |

These match Webflow's defaults. Use them for layout decisions — columns
stacking, a nav collapsing into a menu, an image moving — and annotate the
frame when something changes at one.

### 4. Twelve columns

Every page sits on one 12-column grid. The numbers per frame are in
[the token reference](../tokens.md#layout-grid) and on `/style-guide` →
Layout, and **Shift+G** draws the grid over any page while it is developed —
put the browser next to the Figma frame and the columns line up.

| Frame          | Layout grid in Figma                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| Desktop (1440) | 12 columns, stretch, margin `site-margin` (48), gutter `site-gutter` (32)               |
| Tablet (768)   | 12 columns — only where the layout differs from the automatic stacking below            |
| Mobile (375)   | 4 columns, margin 16, gutter 16 — each is exactly 3 of the 12, so nothing is translated |

Content stops growing at `max-width-main` (1440) and centers.

Draw layouts as column spans: text over 6 columns and an image over 5 with
one column of air is `span 6` + `span 5, offset 1`; a centered 8-column
block is `span 8, offset center`. Tablet and mobile follow automatically, so
design them only where they should differ:

| Desktop span | Tablet (768)                      | Mobile landscape (480) | Mobile (375) |
| ------------ | --------------------------------- | ---------------------- | ------------ |
| 1            | 1                                 | 1                      | 1            |
| 2            | half                              | half                   | half         |
| 3            | half                              | half                   | full         |
| 4, 5, 6      | half                              | full                   | full         |
| 7, 8         | half — full when alone in its row | full                   | full         |
| 9–12         | full                              | full                   | full         |

Offsets and reordering (`order first`) apply on desktop. Equal-width lists —
cards, logos, team members — are a **Grid** with a column count per
breakpoint instead of spans.

### 5. Type comes from the ramp, and size is not level

Thirteen text styles: **Display, H1–H6, Text XLarge, Text Large, Text Main,
Text Small, Text XSmall, Eyebrow**. Use only these. The _level_ of a heading
(H1 for the page title, H2 for sections) is semantic and the developer chooses
it; the _style_ is visual and yours. A section heading that should look like
H1 is "H2, styled H1" — say so in an annotation, never make a new style for it.

### 6. Space comes from the scale

`space/1` to `space/12` for everything inside a section (gaps, padding,
margins between elements), `section-space/xsmall` … `xlarge` for the padding
above and below sections. Use auto layout everywhere, with gaps and padding
bound to these variables. Elements inside a section are spaced by the
container's gap, not by individual margins.

### 7. Themes are modes, not recolors

Every section is designed in a theme: **Light**, **Dark** or **Brand** (and
any theme the project adds). Set the frame's **Theme** variable mode; never
recolor a section by hand. Inside a theme, use only the semantic colors —
`background`, `background-2`, `background-3`, `text`, `text-2`, `border`,
`button-*`, `link-*` — so the same component works in every theme. The palette
(`color/brand/500`) is for defining themes, not for drawing with.

### 8. Use the components

The Figma library mirrors the code library one to one (see
[the components](../components.md)): Section, Grid, Content wrapper, Button,
Card, Eyebrow, Accordion, Tabs, Slider, Modal, Marquee, form fields, Nav,
Footer. Pick a variant instead of detaching. A block the library genuinely
cannot express becomes a new component — name it for its role (`Hero Home`,
`Pricing Table`, `Testimonial Slider`), and design all its states.

### 9. New tokens are decisions

If the design really needs a value the system does not have — a 14th type
style, a new brand color, a section padding between two existing ones — add
it to the variables, name it in the Trix pattern, and list it in the handoff.
Two values 2px apart are almost always one value drawn twice.

### 10. States and edges

For every interactive component: default, hover, focus, active, disabled, and
error/success where it applies. For every content block: the longest and
shortest realistic content, and the empty state if it can be empty. Hover
does not exist on phones — anything only visible on hover needs another way
in on Mobile.

## Icons, images, motion

- **Icons** — [Phosphor](https://phosphoricons.com) (Figma plugin and
  community file available), any weight: thin, light, regular, bold, fill,
  duotone. Name the icon in an annotation (`arrow-right, bold`) and the code
  uses it by that name. Custom icons: 24×24 SVG, single color, `currentColor`
  in code.
- **Images** — use the ratio set: 1:1, 16:9, 3:2, 2:3, 2:1, 5:4, 4:5. Deliver
  originals at the largest size they appear (at least 2× the 1440 frame size).
- **Motion** — annotate entrance, scroll and hover animations: what moves,
  from where, duration and easing. The standard scroll-in is Trix's reveal
  (fade up, one block after another): say "reveal" and, if its timing should
  differ, the duration and stagger. Keep motion on position, scale and
  opacity; the site respects "reduce motion" and shows everything without
  animation.
- **Video** — a video that plays by itself gets a pause button in its
  bottom-right corner (an accessibility requirement); leave room for it.

## Fonts

Use any font the project can license for the web. Tell the developer where
it comes from: font files (WOFF2 best), or a host — Google Fonts, Adobe Fonts
(with the web project), Fontshare, Bunny or Fontsource. Fonts are always
served from the site itself, never from the host, so the licence must allow
that. Name a body font (primary) and, if headings differ, a heading font
(secondary); weights are the ones the font actually has.

## Naming, Figma ↔ code

| In Figma                          | In code                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `color/brand/500`                 | `--brand-500`                                           |
| Theme mode `Dark`                 | `theme-dark` class, `<Section theme="dark">`            |
| `font-size/h2` (Mobile / Desktop) | `--h2-min` / `--h2-max` → `--h2`                        |
| Text style `H2`                   | `.text-style-h2`, `<Heading variant="h2">`              |
| `space/7`                         | `--space-7`, `gap-7`, `padding-7`, `margin-top-7`       |
| `section-space/large`             | `--section-space-large`, `<Section paddingTop="large">` |
| `radius/medium`                   | `--radius-medium`, `radius-medium`                      |
| `Button`, variant `secondary`     | `<Button emphasis="secondary">`                         |
| Component `Hero Home`             | `src/components/content/HeroHome.astro`                 |

## The workflow

1. **Set up the file** from [Figma setup](figma-setup.md) — import the Trix
   variables, create the text styles, add the component library.
2. **Make the style guide page first**: brand colors, type, spacing, themes,
   buttons — the project's version of the Trix defaults. Agree it with the
   client before any page.
3. **Design the nav, footer and homepage** at Desktop and Mobile.
4. **Review with the developer** — the homepage settles almost every question
   the other pages will ask.
5. **Design the remaining pages**, reusing the homepage's patterns.
6. **Hand off** with the [checklist](handoff.md).

**Changing the system later** — a new font, a type size, a brand color —
is a change to the style guide page, never to a single screen. Update it in
Figma, then give the developer the link: `/trix-design-system` reads the
style guide and updates the code, and every page follows. No Figma file? The
same skill asks the questions instead.

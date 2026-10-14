# Figma setup

How to build a Figma file on Trix so the developer can implement it without
converting anything. Every name here is the name the code uses.

## 1. Pages

| Page        | Contents                                                                  |
| ----------- | ------------------------------------------------------------------------- |
| Cover       | project name, status, links                                               |
| Style Guide | brand, type, color, themes, spacing, radius, icons — the project's system |
| Components  | the component library and every variant and state                         |
| Desktop     | 1440 frames, one per page                                                 |
| Mobile      | 375 frames, one per page                                                  |
| Handoff     | annotations, motion notes, open questions                                 |

## 2. Import the variables

Trix ships its design tokens as Figma-ready files in
[`design/tokens/`](../../design/tokens/), generated from the code — one file
per collection and mode, in the W3C Design Tokens (DTCG) format:

| File                             | Collection  | Mode    |
| -------------------------------- | ----------- | ------- |
| `Primitives.Value.tokens.json`   | Primitives  | Value   |
| `Responsive.Mobile.tokens.json`  | Responsive  | Mobile  |
| `Responsive.Desktop.tokens.json` | Responsive  | Desktop |
| `Text Styles.Value.tokens.json`  | Text Styles | Value   |
| `Theme.Light.tokens.json`        | Theme       | Light   |
| `Theme.Dark.tokens.json`         | Theme       | Dark    |
| `Theme.Brand.tokens.json`        | Theme       | Brand   |
| `Components.Value.tokens.json`   | Components  | Value   |

Import them with Figma's variable import (Local variables → Import) or a DTCG
plugin such as _DTCG Tokens to Variables_ or _Variables Import_. **Import
Primitives first** — the other collections alias it (`{color.brand.300}`).
For a collection with modes (Responsive, Theme), import each mode file into
the same collection.

What each collection holds:

- **Primitives** — the palette (`color/neutral/50…950`, `color/brand/50…950`,
  `color/white`, `color/black`), font families, weights, line heights (in %),
  letter spacing (in %), radius, breakpoints.
- **Responsive** — every fluid value at Mobile and Desktop: `font-size/*`,
  `space/1…12`, `section-space/*`, `site-margin`, `site-gutter`.
- **Text Styles** — each style's family, weight, line height and letter
  spacing, as aliases to Primitives.
- **Theme** — the semantic colors, one mode per theme.
- **Components** — button, field and card settings (padding, radius).

When a project changes a token in code, `design/tokens/` regenerates; import
again to update the file. When the designer changes variables first, export
the collections and give the files to the developer — `/trix-import-figma`
writes them into the code.

## 3. Text styles

Create one Figma text style per Trix style, named exactly:
**Display, H1, H2, H3, H4, H5, H6, Text XLarge, Text Large, Text Main,
Text Small, Text XSmall, Eyebrow**. Bind each property to variables:

| Property           | Variable                             |
| ------------------ | ------------------------------------ |
| Font family        | `Text Styles/<style>/font-family`    |
| Weight             | `Text Styles/<style>/font-weight`    |
| Size               | `Responsive/font-size/<style>`       |
| Line height (%)    | `Text Styles/<style>/line-height`    |
| Letter spacing (%) | `Text Styles/<style>/letter-spacing` |

Eyebrow is uppercase; set the case on the style. Leading trim: set vertical
trim to **cap height to baseline** — the code trims the same way, so spacing
measured between text boxes in Figma is the spacing in the browser.

## 4. Frames and grids

**Desktop frame** — 1440 wide, Responsive mode **Desktop**, Theme mode
**Light** (or the page's theme). Layout grid: columns, stretch, count bound to
`grid/columns` (12), margin bound to `site-margin` (48), gutter bound to
`site-gutter` (32).

**Mobile frame** — 375 wide, Responsive mode **Mobile**. Layout grid: 4
columns, stretch, margin bound to `site-margin` (16), gutter bound to
`site-gutter` (16). One mobile column is exactly three of the twelve.

**Tablet frame** (only where the layout differs from the automatic stacking)
— 768 wide, 12 columns, margin 28.8, gutter 22.4.

**Sections** — each section is a full-width frame with vertical auto layout,
padding top and bottom bound to `section-space/*`, theme mode set on the frame,
containing a **Container** frame: max width 1440 minus the margins, centered,
vertical auto layout with its gap bound to `space/*`.

## 5. The component library

Build each component with auto layout and variables only, with Figma
variants that match the code's props:

| Component                           | Variants (Figma property → code prop)                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Section**                         | Theme: inherit, light, dark, brand · Padding top/bottom: none, even, xsmall, small, medium, large, xlarge, navoverlap · Align: start, center, end  |
| **Content wrapper**                 | Variant: stack, auto-width, columns, breakout, contain, sticky-content, sticky-visual, card · Reverse · Centered                                   |
| **Row / Col**                       | Col: span 1–12 (desktop) · offset 0–11 or center · order first, last · per-breakpoint spans only where they differ from the automatic stacking     |
| **Spacer**                          | Size: 1–12, xsmall–xlarge (an empty frame of that height between two blocks, in place of the gap there)                                            |
| **Grid**                            | Columns per breakpoint (xsmall, small, medium, large), or autofit / autofill with a minimum column width                                           |
| **Button**                          | Variant: main, link, arrow, play, close · Emphasis: primary, secondary · Direction (arrow): forward, back · State: default, hover, focus, disabled |
| **Card**                            | Variant: default, cover, stacked · Theme: inherit, light, dark, brand, invert                                                                      |
| **Eyebrow**                         | Variant: default, tag                                                                                                                              |
| **Heading / Paragraph / Rich text** | Variant: any text style                                                                                                                            |
| **Icon**                            | Size: small (1em), medium (1.5em), large (2em), full-width · Phosphor name and weight                                                              |
| **Image / Video**                   | Ratio: 1-1, 16-9, 3-2, 2-3, 2-1, 5-4, 4-5                                                                                                          |
| **Overlay**                         | Variant: solid, gradient                                                                                                                           |
| **Accordion**                       | Item: closed, open                                                                                                                                 |
| **Tabs**                            | Variant: horizontal, side                                                                                                                          |
| **Slider**                          | Variant: bleed, crop-start, contained · slides per breakpoint                                                                                      |
| **Modal**                           | Variant: small, side-panel, full-screen                                                                                                            |
| **Marquee**                         | Direction: forwards, backwards                                                                                                                     |
| **Form fields**                     | Input, Textarea, Select (list, month, day, year, state), Choice (default, toggle, chip), Range · State: default, focus, filled, error, disabled    |
| **Theme toggle**                    | Pressed: false, true (only on sites with automatic dark mode)                                                                                      |
| **Nav, Footer**                     | the project's own, built from the above                                                                                                            |

The full list with descriptions is in [the components](../components.md).

## 6. Annotate

On the Handoff page, or as Figma annotations on the frames:

- Heading levels where they differ from the style (`H2, styled H1`).
- Anything that changes at a breakpoint.
- Motion: trigger, what moves, distance, duration, easing.
- Links and destinations; form fields, validation and where submissions go.
- New tokens and new components, each with a reason.

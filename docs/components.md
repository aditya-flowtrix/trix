# Components

Every component in Trix, for designers and developers alike. Figma variants
use the same names as the props here. Live examples of all of them are on the
`/components` page; prop types and descriptions show in the editor.

Every component takes `render` (set `false` to output nothing) and passes
other attributes to its root element. `class` accepts utility classes only.

## Layout

| Component                | Use it for                                                                      | Variants and key props                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Wrapper/Section`        | every full-width band of a page; owns padding, theme and the centered container | `theme` (inherit, light, dark, brand) · `paddingTop` / `paddingBottom` (none, even, xsmall, small, medium, large, xlarge, navoverlap) · `gap` (0, 1–12, xsmall–xlarge) · `align` · `fullHeight` · `background` slot |
| `Wrapper/ContentWrapper` | a block of eyebrow, heading, text and buttons, alone or beside media            | `variant`: stack, auto-width, columns, breakout, contain, sticky-content, sticky-visual, card · `reverse` · `centered` · `column2` slot                                                                             |
| `Wrapper/Grid`           | repeating items in columns                                                      | `xsmall` / `small` / `medium` / `large` column counts, or `variant` autofit / autofill with `minColumnWidth`, `maxColumnCount` · children may use `span-*` classes                                                  |
| `Wrapper/ButtonWrapper`  | a row of buttons                                                                | `marginTop` (default, 0, 1–12, auto)                                                                                                                                                                                |

## Typography

| Component              | Use it for                | Variants and key props                                                                                |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Typography/Heading`   | headings                  | `tag` (h1–h6, the level) · `variant` (any text style; defaults to the tag) · `maxWidth` in characters |
| `Typography/Paragraph` | body text                 | `tag` (p, span, div) · `variant` (any text style) · `maxWidth`                                        |
| `Typography/Eyebrow`   | the label above a heading | `variant`: default (with marker), tag                                                                 |
| `Typography/RichText`  | CMS and long-form content | `variant` (base text style)                                                                           |

## Actions and items

| Component   | Use it for              | Variants and key props                                                                                                                     |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`    | links and buttons       | `variant`: main, link, arrow, play, close · `emphasis`: primary, secondary · `element`: button, link (with `href`) · `direction` for arrow |
| `Item/Card` | a repeated content item | `variant`: default, cover, stacked · `theme` (inherit, a theme, invert) · `image`                                                          |

## Media

| Component       | Use it for                                 | Variants and key props                                                                                                                                    |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Media/Img`     | every image (optimised, responsive srcset) | `variant`: full-width, constrained, densities · `width` / `height` · `transparent` · `loading`, `fetchPriority`                                           |
| `Media/Video`   | video                                      | ratio: 2-1, 16-9, 3-2, 5-4, 1-1, 4-5, 2-3, custom, auto                                                                                                   |
| `Media/Icon`    | icons                                      | `name` (a Phosphor icon) + `weight` (thin, light, regular, bold, fill, duotone), or `src` (an imported SVG) · `variant`: small, medium, large, full-width |
| `Media/Overlay` | a tint over media                          | `variant`: solid, gradient                                                                                                                                |

## Interactive

| Component                                 | Use it for               | Variants and key props                                          |
| ----------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| `Interactive/Accordion` + `AccordionItem` | FAQs, expandable details | native `<details>`                                              |
| `Interactive/Tabs` + `TabLink`            | switching between panels | `variant`: horizontal, side                                     |
| `Interactive/Slider`                      | carousels                | `variant`: bleed, crop-start, contained · slides per breakpoint |
| `Interactive/Modal`                       | dialogs                  | `variant`: small, side-panel, full-screen · native `<dialog>`   |
| `Interactive/Dropdown`                    | menus                    | native `<details>`, keyboard support                            |
| `Interactive/Marquee`                     | logo strips, tickers     | `direction`: forwards, backwards                                |
| `Interactive/ThemeToggle`                 | light/dark switch        | renders only when `COLOR_MODE` is `auto`                        |

## Forms

| Component                     | Use it for                                       | Variants and key props                                  |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `Form/Form`                   | a form with its status messages                  | provider-agnostic `action`                              |
| `Form/Fieldset`               | grouped fields                                   | `variant`: stack, columns, thirds, inline               |
| `Form/Input`                  | text inputs with the right type and autocomplete | `variant`: text, first-name, last-name, email, phone, … |
| `Form/Textarea`, `Form/Range` | long text, sliders                               |                                                         |
| `Form/Select`                 | selects                                          | `variant`: list, month, day, year, state                |
| `Form/Choice`                 | checkboxes and radios                            | `variant`: default, toggle, chip                        |

## Global

| Component                      | Use it for                                             |
| ------------------------------ | ------------------------------------------------------ |
| `Global/Nav`, `Global/NavLink` | the site navigation — the project's own, in the layout |
| `Global/Footer`                | the site footer — the project's own, in the layout     |
| `Global/SkipLink`              | the skip-to-content link                               |
| `Utility/BaseHead`             | `<head>`: SEO, social, fonts, icons, color mode        |
| `Utility/FormattedDate`        | dates in the site's locale                             |

## Building a new component

When the library cannot express a block, follow the checklists in
[`TRIX.md`](../TRIX.md): name it for its role (`HeroHome`, `PricingTable`),
root class ending in `_wrap`, CSS in its own `<style is:global>` inside
`@layer components`, variants as props, tokens only.

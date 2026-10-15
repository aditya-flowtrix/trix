# Components

Every component in Trix, for designers and developers alike. Figma variants
use the same names as the props here. Live examples of all of them are on the
`/components` page; prop types and descriptions show in the editor.

Every component takes `render` (set `false` to output nothing) and passes
other attributes to its root element. `class` accepts utility classes only.

## Layout

| Component                     | Use it for                                                                                  | Variants and key props                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Wrapper/Section`             | every full-width band of a page; owns padding, theme and the centered container             | `theme` (inherit, light, dark, brand) · `paddingTop` / `paddingBottom` (none, even, xsmall, small, medium, large, xlarge, navoverlap) · `gap` (0, 1–12, xsmall–xlarge) · `align` · `fullHeight` · `background` slot (by hand: `.section_background`)                                              |
| `Wrapper/Row` + `Wrapper/Col` | any layout drawn on the 12-column grid — `8 + 4`, `6` + `5 offset 1`, a centered `8`        | Row: `gap`, `rowGap` (0, 1–12; default the site gutter) · `align` · `animate`. Col: `span` 1–12 (desktop; tablet and mobile stack automatically) · `xsmall` / `small` / `medium` / `large` (exact spans, win over `span`) · `offset` (0–11, center) · `order` (first, last) · `align` · `animate` |
| `Wrapper/ContentWrapper`      | a block of eyebrow, heading, text and buttons, alone or beside media                        | `variant`: stack, auto-width, columns, breakout, contain, sticky-content, sticky-visual, card · `reverse` · `centered` · `distribute` · `column2` slot                                                                                                                                            |
| `Wrapper/Grid`                | repeating, equal-width items: cards, logos, team                                            | `xsmall` / `small` / `medium` / `large` column counts, or `variant` autofit / autofill with `minColumnWidth`, `maxColumnCount` · `animate` · children may use `span-*` classes                                                                                                                    |
| `Global/Breadcrumbs`          | the trail from the home page to this one, with its BreadcrumbList structured data           | `items` (label, href; the last item is this page) · `schema` (default true)                                                                                                                                                                                                                       |
| `Global/NavBanner`            | a one-line announcement above the nav, in the brand theme; before `<Nav />` in `BaseLayout` | `href` (omit for plain text)                                                                                                                                                                                                                                                                      |
| `Wrapper/Spacer`              | one spot that needs more (or less) space than the container's gap                           | `size` (1–11, xsmall–xlarge): in a Section the blocks either side end up exactly this far apart; in a Col it adds this much                                                                                                                                                                       |
| `Wrapper/ButtonWrapper`       | a row of buttons                                                                            | `marginTop` (default, 0, 1–11, auto)                                                                                                                                                                                                                                                              |

`Section`, `Row`, `Col` and `Grid` take `animate`: their children fade up
one after another the first time they scroll into view. Timing is the
`--reveal-*` tokens; visitors who prefer reduced motion, print, and browsers
without JavaScript see the content immediately.

`Utility/GridOverlay` draws the layout grid over the page — **Shift+G**, or a
`data-grid-overlay-toggle` button. `BaseLayout` includes it in development, or
anywhere with `gridOverlay`.

`Utility/JsonLd` renders structured data from `@/utils/schema.ts`
(`organization`, `website`, `breadcrumbList`, `article`, `faqPage`,
`localBusiness`, `product`); pages usually pass it as `BaseLayout`'s
`schema` prop instead.

## Typography

| Component              | Use it for                | Variants and key props                                                                                |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Typography/Heading`   | headings                  | `tag` (h1–h6, the level) · `variant` (any text style; defaults to the tag) · `maxWidth` in characters |
| `Typography/Paragraph` | body text                 | `tag` (p, span, div) · `variant` (any text style) · `maxWidth`                                        |
| `Typography/Eyebrow`   | the label above a heading | `variant`: default (with marker), tag                                                                 |
| `Typography/RichText`  | CMS and long-form content | `variant` (base text style)                                                                           |

## Actions and items

| Component   | Use it for              | Variants and key props                                                                                                                                                  |
| ----------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`    | links and buttons       | `variant`: main, link, arrow, play, close · `emphasis`: primary, secondary · `element`: button, link (with `href`) · `size`: small, main, large · `direction` for arrow |
| `Item/Card` | a repeated content item | `variant`: default, cover, stacked · `theme` (inherit, a theme, invert) · `image`                                                                                       |

## Media

| Component       | Use it for                                 | Variants and key props                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Media/Img`     | every image (optimised, responsive srcset) | `variant`: full-width, constrained, densities · `width` / `height` · `transparent` · `loading`, `fetchPriority`                                                                                                                                                           |
| `Media/Video`   | video                                      | ratio: 2-1, 16-9, 3-2, 5-4, 1-1, 4-5, 2-3, custom, auto · `pauseButton` (on with `autoplay`; WCAG 2.2.2) · `pausePosition` (top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right) · `autoplay` loads and plays only on screen · `desktopOnly` |
| `Media/Icon`    | icons                                      | `name` (a Phosphor icon) + `weight` (thin, light, regular, bold, fill, duotone), or `src` (an imported SVG) · `variant`: small, medium, large, full-width                                                                                                                 |
| `Media/Overlay` | a tint over media                          | `variant`: solid, gradient                                                                                                                                                                                                                                                |

## Interactive

| Component                                 | Use it for               | Variants and key props                                                                                                                                                            |
| ----------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Interactive/Accordion` + `AccordionItem` | FAQs, expandable details | native `<details>`                                                                                                                                                                |
| `Interactive/Tabs` + `TabLink`            | switching between panels | `variant`: horizontal, side                                                                                                                                                       |
| `Interactive/Slider`                      | carousels                | `variant`: bleed, crop-start, contained · slides per breakpoint · `loop` · `playback`: manual, auto (pause button) · `controls`: bottom, top (beside a `header` slot) · `markers` |
| `Interactive/Modal`                       | dialogs                  | `variant`: small, side-panel, full-screen · native `<dialog>` · `openOnLoad`, `cooldownDays`                                                                                      |
| `Interactive/Dropdown`                    | menus                    | native `<details>`, keyboard support · `variant`: default, menu, mega                                                                                                             |
| `Interactive/Marquee`                     | logo strips, tickers     | `direction`: forwards, backwards · `pauseOnHover`                                                                                                                                 |
| `Interactive/Compare`                     | before/after, two views  | `before` and `after` slots · `start` · native range input                                                                                                                         |
| `Interactive/ThemeToggle`                 | light/dark switch        | renders only when `COLOR_MODE` is `auto`                                                                                                                                          |

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

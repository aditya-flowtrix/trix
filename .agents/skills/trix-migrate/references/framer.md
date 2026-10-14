# Framer → Trix

The Framer detail for `/trix-migrate`. Read the main `SKILL.md` first.

## What Framer gives you, and what it does not

- **No code export.** Framer publishes a React-rendered site; there is no
  folder of HTML and CSS to bring across. The rendered site is the source, so
  everything is measured from the live URL (`inventory.ts`, `design.ts`).
- **Hashed classes.** `framer-1a2b3c` names mean nothing and change between
  publishes. There is no class map to make — every block is rebuilt from its
  measured styles, with Trix components and tokens.
- **Layer names survive.** `data-framer-name="Hero / Title"` attributes carry
  the designer's layer names. They are the best guide to what a block _is_
  and what its Trix component should be called.
- **Tokens as variables.** Framer color styles and some text styles are
  emitted as `--token-<uuid>` custom properties on `:root`.
  `design.ts` lists them under _Root variables_; `variables.ts` maps them to
  Trix tokens by value once the style guide is in.

## Collect

Record each in `PROJECT.md` → **Sources**:

- **Live URL**, and the Framer project (an editor invite) — the only place to
  read breakpoints, component variants, CMS bindings and interactions.
- **CMS** — Framer CMS → each collection → ⋯ → Export CSV. Images in the CSV
  point at `framerusercontent.com`; download them during groundwork.
- **Redirects** — Site settings → Redirects. Copy the list; there is no export.
- **Forms** — each form's destination (Framer forms, webhooks, a third party).
- **Fonts** — Site settings → Fonts. Framer serves Google fonts and uploaded
  fonts from its own CDN: get the original files (Google Fonts, or the owner's
  licensed files) as WOFF2 — never hotlink Framer's.

## Breakpoints

Framer sites are designed at the project's breakpoints — by default **Desktop
≥ 1200px, Tablet 810–1199px, Phone ≤ 809px**, but projects change them. Read
them from the measured media queries (`design.md` → _Media queries_, usually
`(min-width: 1200px)`, `(min-width: 810px) and (max-width: 1199px)`,
`(max-width: 809px)`) and set the `--breakpoint-*` tokens to them: `50.625rem`
(810) and `75rem` (1200) for the defaults, with the third breakpoint where the
site has one. Record the mapping in `PROJECT.md`.

Framer layouts are often **fixed per breakpoint, not fluid**: type and spacing
jump at 810 and 1200 rather than scaling. `propose.ts` reports those as
_stepped_. Keep them stepped where the design depends on it — a component
media query at a breakpoint token — or, with the owner's yes, make them fluid
between the breakpoint values (usually the better result, and what Trix's
`-min`/`-max` tokens express).

## Rebuilding

- **Stacks become flex.** Framer's Stack (direction, gap, padding, distribute)
  maps to `ContentWrapper`, `Grid`, `ButtonWrapper` or a component's own flex
  rule. Gaps are tokens; a fixed 24px gap is the nearest `--space-*` step
  measured at the same width.
- **Components and variants.** Each Framer component becomes a Trix component;
  its variants become the component's `variant` prop, and hover/pressed
  variants become `:hover` / `:active` rules.
- **Images.** `framerusercontent.com/images/<id>.png?scale-down-to=1024` —
  download the original (drop the query) into `src/assets/images/` and use
  `Media/Img`; Astro writes the srcset.
- **Rich text** from the CMS becomes Markdown or sanitized HTML inside
  `Typography/RichText`.
- **Embeds and code components** — read each one; most are an iframe or a
  small script that becomes a component's own `<script>`.

## Motion

Framer Motion effects are the site's character; inventory them on the live
site before rebuilding (scroll the page slowly, at desktop and phone):

| Framer                                           | Trix                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Appear effect (fade/slide in on load or in view) | a component script with `IntersectionObserver` and a CSS transition on `transform`/`opacity`                              |
| Scroll transforms, parallax                      | CSS scroll-driven animations (`animation-timeline: view()`), GSAP ScrollTrigger only where support or sequencing needs it |
| Hover and press variants                         | `:hover` / `:active` transitions on the component                                                                         |
| Page transitions                                 | Astro view transitions                                                                                                    |
| Ticker                                           | `Interactive/Marquee`                                                                                                     |
| Carousel / Slideshow                             | `Interactive/Slider`                                                                                                      |

Match timing and easing (Framer springs ≈ `cubic-bezier(0.22, 1, 0.36, 1)` for
the default ease-out feel; measure durations with the browser's animation
panel), keep everything on `transform` and `opacity`, and respect
`prefers-reduced-motion`.

## Clean when

- No `framer-` class, `data-framer-*` attribute, `framerusercontent.com` URL or
  Framer script remains.
- Every CMS item exists as a content collection entry, with its images local.
- `verify.ts` (style guide) and `compare-pages.mjs` (content) both pass.

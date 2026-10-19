# Webflow → Trix

The Webflow detail for `/trix-migrate`. Read the main `SKILL.md` first; this
file assumes its phases, its record (`PROJECT.md`) and its tools.

**Webflow-specific sources to collect**, each recorded in `PROJECT.md`:

- **The Webflow MCP, connected** — the only source for per-instance component
  props, Variables (collections and modes), CMS bindings, list filters and
  sorts. Without it, stop and say so.
- **The code export** (Site settings → Export code), unzipped.
- **A CSV per collection** (CMS → each collection → Export).
- **The 301 redirects** (Site settings → Publishing → Export CSV). No API
  returns these.

**Which Webflow framework built it** decides how much is a lookup. The
inventory's *Built with* line says: a `u-` utility system (`u-` utilities,
`data-*-columns`), Finsweet Client-First (`padding-global`, `text-size-*`,
`heading-style-*`), a `cc-` combo-class system (`cc-` combos, `row`/`col-*`),
Relume, or hand-built.
Whatever it is, **values are measured** (`/trix-style-guide`, `classes.ts`,
`variables.ts`) — the framework only tells you which classes are components.

**The finished site is indistinguishable from the published one and contains no
Webflow.** Every section is a Trix component, every value a Trix token, every
utility a Trix utility.

**It is a substitution, not a rewrite.** Keep the original HTML, CSS and
JavaScript. Swap three things — variables, classes, components — for their
Trix equivalents, and move what Webflow kept in global files into the
component that uses it. Markup you re-author is markup you have to re-verify,
and the export is the only record of what the site actually was.

A **`u-` utility** site maps onto Trix
structurally — `u-section` is `Section`, `u-heading` is `Heading` — but **not
by value**: Trix's spacing scale, type ramp and palette are its own, and the
site's are the site's. `--_spacing---space--8` is *not* `--space-8`. Measure
(`/trix-style-guide` sets the project's scale to the site's values), then map
by value (`classes.ts`, `variables.ts`). A Client-First, `cc-` combo-class or
hand-built site takes more component work, but the destination is the same.

## The passes, and the order to apply them

Three kinds of work:

|       |                                                                                               | Verified by                        |
| ----- | --------------------------------------------------------------------------------------------- | ---------------------------------- |
| **1** | Bring it across as it is — HTML, CSS, JS, fonts, and every component the class names outright | Matches the live site              |
| **2** | Substitute variables, breakpoints, classes, the components left; relocate JS                  | Still matches pass 1               |
| **3** | Bind the CMS, routes and forms                                                                | Item counts and content match live |

Pass 1 produces a **provable baseline**: parity exact, screenshots overlaying,
because the CSS is Webflow's own. Everything after is measured against it, so a
difference has one cause — the change just made.

**Do not run each pass across the whole site.** The site-wide substitutions
happen once, but the page work does not: convert one page at a time and stop
after the first.

1. **Groundwork, once.** Fonts, images, the split stylesheet, the variables,
   the breakpoints, the class renames. All of it is mechanical and all of it is
   shared, so it is done before any page is finished.
2. **The first slice: nav, footer, homepage — all the way to done.** Pass 1,
   then 2, then 3, on those three alone.
3. **Stop and show it.** Expect several rounds of revision here, and take them:
   this is where the patterns are decided.
4. **Then the rest, a page at a time**, following the pattern the first slice
   established.

**Why the chrome and the homepage.** Every other page depends on the nav and
footer, so they cannot be provisional. And a homepage exercises nearly the
whole library at once — sections, layout, buttons, headings, eyebrows, a
slider, CMS lists — so getting it right decides almost every question the
remaining pages will ask. A mistake found here costs one page; the same mistake
found on the last page has already been made fifty-nine times, which is exactly
how a nav ends up copied into forty-seven of them.

### The gate before page two

Nothing else starts until the homepage passes all of this:

- **It matches the live site** — content parity exact, screenshots side by
  side at desktop and mobile.
- **`grep -rn "u-" src/pages src/components` is empty** except classes with no
  equivalent, listed and justified.
- **No `--_theme---`, `--_spacing---`, `--_trigger`, `--_state`,
  `--_responsive`, `data-trigger`, `data-state` or `@container` survive.**
- **The chrome is in the layout**, not in the page — `grep navbar_wrapper
src/pages` finds nothing.
- **Sections, headings, buttons and eyebrows are components**, not divs
  wearing Webflow classes.
- **The person who owns the site has looked at it** and asked for whatever they
  are going to ask for.

The last one is not a formality. Revisions to the homepage are cheap and
revisions to a pattern already applied to fifty-nine pages are not.

## Collect first

1. **The Webflow MCP, connected** — the only source for per-instance component
   props, and the best source for CMS bindings. Without it, stop and say so.
2. **The published URL** — the rendered truth, and the only place to see motion.
3. **A CSV per collection** — the item content.
4. **The code export, unzipped**.
5. **The 301 redirects** — Site Settings → Publishing, exports as CSV. **No API
   returns these**; once the site is unpublished the record is gone. They are
   not the redirects this migration creates — they are years of earlier ones,
   and losing them breaks links that have nothing to do with the move.

Record each one in `PROJECT.md` as it arrives — the paths especially, since
they sit on someone's machine and nothing in the repository points at them.

## Step 0 — Scan

```bash
node .agents/skills/trix-migrate/scripts/webflow-scan-export.mjs path/to/export
```

Reports the site and page IDs (`data-wf-site`, `data-wf-page` — how every MCP
call addresses things), the component inventory, collection templates, widgets,
lists, forms, libraries and embeds.

**Read the provenance line first.** `u-*` classes and `data-*-columns`
attributes mean the site was built on a **`u-` utility system**, and pass 2
becomes a lookup rather than a search.

**The export did not lose the components.** Webflow writes each instance as
`data-wf--<component>--<prop>="<value>"`, so names and variants survive in the
attribute names — on a real site, the whole inventory with usage counts.

**Templates are not pages.** `detail_<slug>.html` uses the collection's own
slug; matched against `get_collection_list` the binding is exact. Each becomes
one dynamic route.

**Per-page list counts mislead.** A CMS-driven nav and footer put eleven
collection lists on every page. Those bind once in the layout, not fifty-nine
times.

Then stop for anything with no equivalent here — **Ecommerce** (`w-commerce`,
`w-checkout`), **Memberships**, **Logic**, **native search**. Each changes the
shape of the project. Agree an approach before rebuilding anything, and write
what was agreed into `PROJECT.md` — a decision taken in conversation is
invisible to whoever picks the work up next.

---

# Pass 1 — Rebuild it exactly

Not idiomatic. Identical.

## The layout comes first

**Change the framework's own files. Never create a second version of one.** An
import runs on a fresh scaffold: `BaseLayout.astro`, `Global/Nav.astro`,
`Global/Footer.astro` and the tokens are placeholders that exist to be
overwritten. A `WebflowLayout` beside `BaseLayout` leaves two layouts, one
wired to nothing. Replace what is inside `Nav`; do not build a second one.

**Webflow has no layout, so every exported page repeats the chrome.** The
scanner's SITE CHROME table names the blocks — on a real site,
`header.navbar_wrapper` and `footer.footer_wrap` on 36 of 59 pages, a
`div.page_wrap` around everything and a `main.page_main` inside it. Import each
one **once**:

| Export                                                        | Goes to                                       |
| ------------------------------------------------------------- | --------------------------------------------- |
| the outer wrapper (`page_wrap`)                               | `BaseLayout`, around everything               |
| `header.navbar_wrapper`                                       | `Global/Nav.astro`, replacing its contents    |
| `footer.footer_wrap`                                          | `Global/Footer.astro`, replacing its contents |
| fixed and furniture blocks (`u-position-fixed`, `guide_wrap`) | `BaseLayout`                                  |
| `main.page_main`                                              | `<main><slot /></main>` in `BaseLayout`       |
| everything inside `page_main`                                 | the page file, and nothing else               |

**A page file holds only what was inside `main`.** Nav markup in a page means
it is in the wrong place — and it will be in every page, because that is how
the export was written.

**Page metadata uses the layout's existing `SeoProps` and `Utility/BaseHead`.**
Title and description props on a new layout rebuild what the framework does.

**Pages, one for one**, at the same routes, body markup as-is with Webflow's
class names intact — those classes _are_ the styling. Bring across the
homepage first and leave the rest until the first slice is signed off; the
groundwork below is shared, but converted pages are not.

### Except the classes that already name a component

**On a `u-` utility site, a `u-` class that names a component is not a
class to keep and convert later — it is the component, spelled differently.**
Those come in as the component on the way in, on the first pass, in the same
edit that brings the page across.

| In the export                                                          | Comes in as                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `u-section` + `u-container` + `u-section-spacer` + `u-background-slot` | one `Wrapper/Section` — it renders all four                    |
| `u-content-wrapper`, `u-layout-column-*`                               | `Wrapper/ContentWrapper` and a `variant`                       |
| `u-button-wrapper`                                                     | `Wrapper/ButtonWrapper`                                        |
| `button_main_wrap`, `clickable`                                        | `Button`                                                       |
| `u-heading` wrapping `<h1>`–`<h6>`                                     | `Typography/Heading`, inner tag → `tag`, attribute → `variant` |
| `u-text`                                                               | `Typography/Paragraph`                                         |
| `u-eyebrow-wrapper` + `-layout` + `-marker` + `-text`                  | `Typography/Eyebrow` — all four                                |
| `u-rich-text`                                                          | `Typography/RichText`                                          |
| `u-svg`                                                                | `Media/Icon`                                                   |

**A `cc-` system's rows and columns are the 12-column grid**, also by name:
`row` → `Wrapper/Row`, `col` → `Wrapper/Col`. Its grid is desktop-first and
Trix is mobile-first, so translate the classes, do not copy them:

| `cc-` system                                                                         | Trix                                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `col-N` (smart column)                                                               | `span={N}` — the automatic stacking is the same table                         |
| `col-lg-N`                                                                           | `large={N}`                                                                   |
| `col-md-N` / `col-sm-N` / `col-xs-N` (apply _below_ 992 / 768 / 480)                 | `medium` / `small` / `xsmall` (apply _from_ 768 / 480 / 0)                    |
| `col-lg-offset-N`                                                                    | `offset={N}`; `row-justify-center` around one column → `offset="center"`      |
| `col-lg-first` / `col-lg-last`                                                       | `order="first"` / `"last"`                                                    |
| `col-shrink`, `row-gap-button`                                                       | `Wrapper/ButtonWrapper` (content-sized items are not grid columns)            |
| `row-align-*`                                                                        | `Row` `align`                                                                 |
| `row-gap-0` / `-sm` / `-md`                                                          | `Row` `gap` — the step whose measured value matches (`variables.ts`)          |
| `col-lg-contain-left` / `-right`                                                     | `Wrapper/ContentWrapper variant="breakout"` (`reverse` for right)             |
| `data-animate="stagger-children"`                                                    | `animate` on the same element — `Section`, `Row`, `Col` or `Grid`             |
| `spacer-component` (`cc-sm`, `cc-md`, `cc-lg`)                                       | `<Spacer size>` — the step whose measured height matches                      |
| `u-border` dividers                                                                  | `<hr>` — spaced by the container's gap                                        |

**Spacer elements from any framework** — the `cc-` system's `spacer-component`,
Client-First's `spacer-small` … `spacer-huge` (or `padding-bottom` on an
empty div), Relume's spacers — become `<Spacer size>` with the step whose
value matches the measured height at every width (`design.json` lists
spacer heights with the spacing series). The `u-` system's
`u-section-spacer` is not one of them: it is section padding, so it becomes
`Section`'s `paddingTop` / `paddingBottom`.

Then check the result with the grid overlay (Shift+G) against the live site:
a `cc-` grid's gutter is padding inside each column, Trix's is the row's `gap`, so the
column _boxes_ differ by half a gutter on each side while the content lines
up. A column with a background or border shows the difference; give that
background to an element inside the `Col`, which is where Trix wants it.

**Nothing is being guessed at here.** These are the same components under the
other convention, and the scanner's provenance line already said so. Carrying
them in as divs means editing the same markup twice to reach a state one edit
could have produced, and it puts the site through an intermediate form where a
run that stops early has shipped Webflow classes as the deliverable.

**Their CSS goes to the framework component, not into the page.** The rules
under `u-heading`, `u-button-wrapper` and the eyebrow family are that
component's design — `split-css --prefix eyebrow`, then into
`Typography/Eyebrow.astro`'s `<style is:global>` and inside its
`@layer components`, replacing what ships there and coming out of the site
stylesheet in the same edit. Copying
them into a page's own `<style>` is the mistake this ordering exists to
prevent: pass 2 then has to delete rules pass 1 just wrote.

### Margins are held by a different element here

**Do not carry a margin across with the rule it sat in.** Webflow gives a block
its own `margin-bottom`; this framework gives the space to the element
receiving it, as a `margin-top`, and makes the bottom margin conditional. The
value is right and the declaration is wrong, which is the hardest kind of
difference to see — the page looks nearly correct and the rhythm is doubled or
missing by one gap.

The system is five rules in `patterns.css`:

```css
.heading,
.text {
  margin-top: var(--_margin-top);
}
.heading:has(+ .text) {
  margin-bottom: var(--_margin-bottom);
}
.heading + .text {
  margin-top: 0;
}
.container > [class] {
  margin-top: 0;
  margin-bottom: 0;
}
.button-wrapper {
  margin-top: var(--space-6);
}
```

`--_margin-top` and `--_margin-bottom` resolve per type variant, so the value
is a token: `--h1-margin-top` … `--h6-margin-bottom`, `--display-*`,
`--text-{small,main,large}-*` — in `src/styles/tokens.css`. On most Webflow
builds every one of them is `0rem`: Webflow spaces with spacers and gaps.

| Webflow puts it                                 | Here it is                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `margin-bottom` on `u-eyebrow-wrapper`          | `--h*-margin-top` on the heading below — `Eyebrow` carries no margin     |
| `margin-bottom` on `u-heading`                  | `--h*-margin-bottom`, and only when `.heading:has(+ .text)` matches      |
| `margin-top` on `u-text` under a heading        | nothing — `.heading + .text` zeroes it; the heading's bottom margin wins |
| `margin-top` on `u-button-wrapper`              | `.button-wrapper`'s own, or `ButtonWrapper`'s `marginTop` prop           |
| margins between the blocks inside `u-container` | `Section`'s `gap` — the container zeroes its children's margins          |

**Port the number, not the declaration.** Read the value off the Webflow rule,
find which of the twenty tokens expresses it, and set that. Writing
`margin-bottom` into `Eyebrow.astro` puts a margin where the `:has()` and `+`
selectors cannot see it, so it stacks with the one the heading already applies
the moment a paragraph follows.

Which makes this variable work, not component work — do it in the same step as
the colours, before anything is compared.

### And the wrappers those margins needed

**Webflow wrapped every eyebrow, heading and paragraph in a div of its own** —
`width: 100%; display: flex; align-items: inherit` — because the parent was a
block. The wrapper supplied the flex row a marker and text needed, passed the
parent's alignment down, and left the parent in block layout so sibling margins
could still collapse into each other.

**None of that applies here.** `.section` and `.container` are
`display: flex; flex-direction: column` with
`align-items: var(--_alignment, start)`, so the alignment comes from the parent
and flex children do not collapse their margins — which is the whole reason the
rhythm above is top margins and does not have to reason about overlap. The
wrapper has nothing left to do.

**So delete the rule, not only the element.** That trio —
`width: 100%`, `display: flex`, `align-items: inherit` (with `justify-content`
and `text-align` inherit alongside) on a div whose only child is one typography
block — is the signature. Where a wrapper genuinely has to stay for structure,
`display-contents` is how it contributes no box.

**The names invert, which is how this rule survives the swap.** Webflow's
`wrapper` is the scaffolding; this framework's `_wrap` is the row Webflow
called `layout`:

| Webflow                               | Here                                      |
| ------------------------------------- | ----------------------------------------- |
| `u-eyebrow-wrapper` — the scaffolding | nothing; the element and its rule both go |
| `u-eyebrow-layout`                    | `.eyebrow_wrap`                           |
| `u-eyebrow-marker`, `u-eyebrow-text`  | `.eyebrow_marker`, `.eyebrow_text`        |
| `u-heading` — the scaffolding         | nothing; `.heading` _is_ the `<h1>`       |
| `u-text` — the scaffolding            | nothing; `.text` _is_ the `<p>`           |

`split-css --prefix eyebrow` prints all four families together and `wrapper`
reads like `wrap`, so the one element with no counterpart is the one whose
rules get merged into the element that survives. The result is an
`.eyebrow_wrap` at `width: 100%` and `display: flex` instead of `inline-flex` —
the old layout model reassembled inside the new component, from a div that was
correctly deleted.

**A hand-built Webflow site gets none of this.** With no `u-` prefix there is
no lookup, only judgement about what a div was for — and judgement belongs
after the baseline proves what the div did. Bring those across as they are and
convert them in pass 2.

**CSS.** `normalize.css` and `webflow.css` are framework and stay global. The
site stylesheet holds every component's rules, scattered across breakpoints.

```bash
node .agents/skills/trix-migrate/scripts/split-css.mjs export/css/site.webflow.css
node .agents/skills/trix-migrate/scripts/split-css.mjs export/css/site.webflow.css --prefix hero
```

The first shows the component groups; the second prints one group's rules with
media queries intact, ready for that component's `<style>`. It separates
library CSS (Swiper and friends) and reports two things it will not decide:
rules whose selector spans two components, and what is genuinely global.

**Fonts and images.** `@font-face` blocks and the font files come across now —
a missing font changes every measurement and makes the later diffs meaningless.

Images move too. The export ships an `images/` folder and rewrites `src` and
`srcset` to point at it; keep those paths working. What each image becomes is a
pass-2 decision — a plain `<img>` becomes `Media/Img` and moves to its page's
folder in `src/assets/pages/` for optimisation (`TRIX.md` → Assets; the
export's flat folder of hashed names doesn't come across as it is), while a
CMS-bound image stays a URL until pass 3 binds it. Anything still served from `cdn.prod.website-files.com` is a file
that never came across, and it stops working when the Webflow site does.

### Every remaining block becomes a component

**Everything the table did not claim is still a component — it just doesn't
have a name yet.** A site's own blocks arrive as a family of classes on a run
of nested divs: `dot-grid_wrap`, `dot-grid_contain`, `dot-grid_layout`,
`dot-grid_row`, `dot-grid_circle_wrap`. That is one component, and it is a
component whether or not this framework ships something like it.

**The work-list is not a judgement call — the splitter prints it:**

```bash
node .agents/skills/trix-migrate/scripts/split-css.mjs export/css/site.webflow.css
```

Every row of that GROUP table that is not library CSS and not a class from the
table above is a component to create. Work down it. A group left on the list is
a block still sitting inline in a page with its rules in a global file, which
is the state the export was already in.

**Three things move, and it is one edit, not three:**

| Where it is now                                       | Where it goes              |
| ----------------------------------------------------- | -------------------------- |
| the nested divs in the page                           | the component's template   |
| its rules in `site.webflow.css` (`--prefix dot-grid`) | the component's `<style>`  |
| its `u-embed-js` child, or its part of `webflow.js`   | the component's `<script>` |

The page is left with `<DotGrid />` and nothing else of it.

**Moved CSS always has the same shape**, whether it lands in a component you
just made or in one the framework ships:

```astro
<style is:global>
  @layer components {
    .dot-grid_wrap { … }
  }
</style>
```

- **`is:global`.** Astro scopes a plain `<style>` by stamping the elements in
  its own template, and markup arriving through a slot never gets the stamp.
  Every component in the library declares its styles this way; the only plain
  `<style>` blocks are `<noscript>` fallbacks, deliberately left unlayered so
  they win.
- **`@layer components`.** Unlayered CSS outranks every layer, so rules left
  outside it beat base, patterns and utilities alike — a component whose styles
  no utility can override. Inside the layer it sits exactly where the rest of
  the library sits.
- **Delete the rules from the site stylesheet in the same edit.** Not at the
  end — as each one moves. The stylesheet is global and unlayered, so a copy
  left behind outranks the layered copy just written: the component reads as
  broken, the fix looks like a specificity problem, and the file that is
  supposed to be emptying never shrinks.

**Naming.** Drop Webflow's structural suffix from the root class —
`dot-grid_wrap` is `DotGrid.astro` — and leave the inner class names as they
are, so the rules transfer untouched. Then pick the folder by what the block
does: `Media/` for a graphic, `Interactive/` for anything with behaviour,
`Item/` for a block that repeats over content, `Wrapper/` for layout only,
`Global/` for chrome. A decorative graphic built from real elements that has to
scale as one piece is `/trix-scaling-graphic`.

**The check is the stylesheet.** When every group has moved, the site
stylesheet holds fonts, genuinely global rules and nothing else. Anything still
in it is a component that was not made — and it will keep working, silently,
which is why this is checked rather than noticed.

**JavaScript.** Keep `webflow.js` for now if widgets need it; it leaves in pass 2. Read every embed, and give each one to the component whose markup it drives
rather than leaving it in the page — a `u-embed-js` sitting inside
`dot-grid_wrap` is the dot grid's script, and it is the reason the block has a
`data-script-initial` attribute on it.

**Verify, and keep the screenshots.**

```bash
node .agents/skills/trix-migrate/scripts/compare-pages.mjs \
  --live https://old-site.webflow.io/about \
  --local http://localhost:4321/about --shots
```

Content parity must be exact — headings, links, images, fields, counted not
merely matched. Screenshots should overlay. **This is the baseline.**

And on a `u-` utility site, the table's classes are already gone:

```bash
grep -rn "u-section\|u-heading\|u-text\|u-eyebrow\|u-button-wrapper\|u-content-wrapper\|u-rich-text\|u-svg\|button_main_wrap\|clickable" src/pages src/components
```

Anything it finds is a swap that was skipped, and it is cheaper to finish now
than after pass 2 has styled around it. Re-run `split-css` for the other half
of the same question: a group still listed is a block still inline in a page.

---

# Pass 2 — Make it Trix

## First, the variables — by value

The style guide (`/trix-style-guide`) already put the site's values into
`tokens.css` under Trix names and verified them. What is left is the CSS
carried across in pass 1, which still refers to Webflow's variable names —
3859 `var()` uses on a real site.

```bash
node scripts/measure/variables.ts --dir path/to/export --page /index.html --local http://localhost:4321/style-guide
```

Resolves every Webflow variable and every Trix token at four widths and pairs
them by value, kind first (a spacing variable maps to a `--space-*`, a palette
color to a swatch, a theme color to a semantic token). `rename-variables.sed`
applies it, longest names first:

```bash
sed -i '' -f .trix/rename-variables.sed src/components/content/Hero.astro
```

Run it over each component's CSS **as the rules move in**, rebuild, and
compare. A variable the map cannot pair is either dead in the source or a
token still missing — never invent a name for it in place.

Theme colours live in the `.theme-*` blocks in `themes.css`, not `:root`. A
site with dark sections has a value for each.

## Then the classes — by effect

```bash
node scripts/measure/classes.ts --dir path/to/export --page /index.html --local http://localhost:4321/style-guide --prefix u-
```

Applies every class the page uses to a bare element at four widths, in the
export's stylesheets and in Trix's, and pairs them by computed effect. Read
`.trix/class-map.md`:

- **same** — same name, same effect: drop the `u-`.
- **renamed** — use the Trix class listed. **"Same name differs"** rows are
  the trap a name-based rename falls into (`u-margin-bottom-2` is
  `margin-bottom-7` on a site whose scale has twenty steps).
- **dead** — no CSS rule in the export at all: delete the class.
- **contextual** — no effect on a bare element (`u-inherit-text-style`,
  combo-only classes): decide where it is used.
- **no match** — a value Trix has no utility for: a token, a component's own
  rule, or a decision.

Classes a component owns — `u-section`, `u-container`, `u-heading`, `u-text`,
`u-button-wrapper`, `u-eyebrow-*`, `u-rich-text`, `u-svg`, `u-content-wrapper` —
are replaced by the component (pass 1's table), not renamed. And:

- `u-embed-css`, `u-embed-js` → drop the wrapper, keep only its child `<style>`
  or `<script>`, in the component whose markup it drives
- `u-hide-if-empty` → render nothing instead: a slot check or the `render`
  prop, decided at build time rather than hidden with CSS

**Everything else stays exactly as it is.** Those classes are the site's own,
their rules came across in pass 1, and inventing framework utilities to absorb
them is how a substitution turns into a rewrite.

## Then the components, one at a time

**This is the components pass 1 could not resolve by name** — a slider, a card,
a nav, anything hand-built. The table's components are already in and already
styled; do not revisit them here.

**A swap has two halves, and the second is the one that gets skipped.** Replace
the markup with the Trix component, _then style that component to match the
original_. Keeping `u-eyebrow-wrapper` markup because it already looks right
leaves the site with no component, no reuse, and the Webflow class still in it
— the design survived and the substitution did not.

The framework's components are placeholders, exactly like `BaseLayout` was.
`Button.astro`, `Typography/Eyebrow.astro`, `Wrapper/ButtonWrapper.astro` ship
with defaults meant to be replaced by the site being imported. Change them.
Every instance across every page then inherits the design, which is the whole
reason to use a component.

For each component:

1. **Find its markup and its CSS.** The class map and `split-css` name the families —
   `u-eyebrow-wrapper`, `u-eyebrow-layout`, `u-eyebrow-marker`,
   `u-eyebrow-text` are one component, not four utilities. `split-css --prefix
eyebrow` prints their rules.
2. **Move those rules into the Trix component's `<style is:global>`**, inside
   its `@layer components` and out of the site stylesheet, replacing what is
   there. The two components have the same anatomy — a marker and a text node
   in `Eyebrow`, a wrapper and a label in `Button` — so the rules transfer
   nearly as they are. **Margins are the exception**: they are held by a
   different element here, and go to a token rather than into the component.
   See "Margins are held by a different element here".
3. **Map the Webflow variants onto the component's props**, from the
   `data-wf--<component>--variant` values the scanner found.
4. **Swap the markup and delete the Webflow classes.** They are expressed by
   the component now. A class left behind is a rule that will contradict the
   component later.
5. **Diff the page.** Nothing should move.

### Variables that stand in for selectors

Webflow's UI cannot author a `:hover` rule on a nested element, so a `u-`
utility system encodes state as numbers that cascade. Three systems do this, and none
of them is needed here.

**Trigger** — `--_trigger---on` / `---off`, a 1/0 pair flipped by real
selectors and then read by descendants:

```css
[data-trigger] {
  --_trigger---on: 0;
  --_trigger---off: 1;
}
@media (hover: hover) {
  [data-trigger~="hover"]:hover {
    --_trigger---on: 1;
    --_trigger---off: 0;
  }
}
[data-trigger~="focus"]:is(:focus-visible, :has(:focus-visible)) {
  --_trigger---on: 1;
}
```

The selector at the top is the real one. Write it directly on the element that
changes — `&:hover`, `&:focus-visible`, or `:has()` where the change is on a
descendant — and delete the flag, the `calc()` that read it, and the
`data-trigger` attribute.

**State** — `--_state---true` / `---false`, the same trick for `checked`,
`current`, `active` and external links. These become `:checked`,
`[aria-current]`, `.is-active` and `[target="_blank"]`, which is what the
Webflow CSS is already testing for underneath.

**Responsive** — `--_responsive---large` / `medium` / `small` / `xsmall`, set
at `:root` and flipped by max-width queries so a value elsewhere can be chosen
by arithmetic. Replace the arithmetic with a media query.

**Move the framework's breakpoints to the site's, not the other way round.**
Trix ships Webflow's own defaults — `30rem / 48rem / 62rem`, the inverses of
479px, 767px and 991px — so a site on Webflow's standard breakpoints needs no
change. A site with custom breakpoints (the `u-` system's container-based
`20em / 35em / 50em`, or added 1280/1440/1920 breakpoints) does: keep Trix's
and the design reflows at widths it never reflowed at before — `35em` is 560px
against 480px — a visible difference the diffs will report and no token will
explain.

The conversion is exact: in a media query `em` and `rem` are both
root-relative, so `50em` is `50rem`. Only the direction changes, since Webflow
shrinks downward and this framework builds upward. On this site:

| Webflow flag | Applies  | Becomes                   |
| ------------ | -------- | ------------------------- |
| `xsmall`     | `< 20em` | base, written unqualified |
| `small`      | `< 35em` | `@media (width >= 20rem)` |
| `medium`     | `< 50em` | `@media (width >= 35rem)` |
| `large`      | default  | `@media (width >= 50rem)` |

Which is also `Grid`'s four tiers under the same names, so its props take those
values directly.

The scanner reports the site's breakpoints already inverted. Those numbers
replace the framework's: set the `--breakpoint-*` tokens in `tokens.css`, then
change the literal values in every component media query (a media query cannot
read a custom property). `npm run check` lists any query that does not use a
breakpoint token, so nothing is missed:

```bash
grep -rn "@media (width >= " src/
```

Change them before swapping components, for the same reason the variables go
first: every component then reflows where the original did, and a difference
afterwards is a real one.

**Container queries go the same way.** The export uses `@container (width <
40em)` and friends for component-level responsiveness. Unless a component
genuinely has to respond to its own width rather than the page's — a card in a
narrow column — a media query at the framework's breakpoints is what belongs
here. `/trix-scaling-graphic` covers the case where container units are
genuinely the answer.

### Markup Webflow needed and this framework does not

Webflow cannot make a component's own element a link, or style text without a
wrapper, so its components carry scaffolding. **Drop the scaffolding, keep what
carries design.** The test: does this element exist because the design has it,
or because Webflow had no other way?

- **Eyebrow** arrives as four nested divs — `u-eyebrow-wrapper`,
  `u-eyebrow-layout`, then the marker and the text. `Typography/Eyebrow` is the
  whole thing. Only the outermost is scaffolding: `u-eyebrow-layout` is the
  component's own root under another name, so it is `.eyebrow_wrap` and it
  keeps its rules, while `u-eyebrow-wrapper` and everything declared on it go.
- **Heading** arrives as `<div class="u-heading" data-wf--typography-heading--variant="h2"><h1>…</h1></div>`.
  Read it before deleting it: the inner tag is the semantics and the attribute
  is the style, which is the pair `Heading` separates — `<Heading tag="h1"
variant="h2">`. Take both, drop the div. `u-text` is `Typography/Paragraph`
  the same way.
- **`clickable`** is pure workaround, and on this site the most-used component
  of all at 1445 instances: an empty, absolutely positioned button laid over
  its parent, because a Webflow component cannot be a link itself.

```html
<div class="button_main_wrap" data-wf--button-main--variant="link-reversed">
  <div class="clickable_wrap u-cover-absolute">
    <button type="button" aria-label="Back" class="clickable_btn"></button>
  </div>
  <div class="button_main_element">
    <div aria-hidden="true" class="button_main_text">Back</div>
    <svg class="button_main_arrow">…</svg>
  </div>
</div>
```

`Button` renders the `<button>` or `<a>` itself, so the whole `clickable_wrap`
subtree goes, and the label wrappers with it. **Carry the accessible name as
you delete it**: the name lived on the empty button and the visible text is
`aria-hidden`, so collapsing the structure without moving it leaves a button
with no accessible name. The text becomes the label and the `aria-hidden` comes
off.

**The SVG stays** — that is design. Bring it through `Media/Icon`, or as
`Button`'s `arrow` variant where it matches. Anything else a custom button
holds is design too, and if `Button` has no place for it, that is a prop to
add.

If a Webflow variant has no matching prop, add the prop — it is the framework's
own component and the site needs it. Say so in the report.

For a `u-` utility site this is mostly a table. The variants are already
the prop values:

| Webflow                                                                        | Becomes                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `typography-heading` `display`/`h1`–`h6`                                       | `Typography/Heading` `variant`                               |
| `typography-paragraph` `inherit`/`text-large`/`text-small`                     | `Typography/Paragraph` `variant`                             |
| `section` `inherit`/`dark`/`brand`                                             | `Wrapper/Section` `theme`                                    |
| `spacer` `none`/`small`/`main`/`large`/`page-top`                              | `Section` padding (`main`→`medium`, `page-top`→`navoverlap`) |
| `layout` `stack`/`columns`/`contain`/`breakout`/`card`/`auto-width`/`sticky-*` | `Wrapper/ContentWrapper` `variant`, `-reversed` → `reverse`  |
| `button-main` `primary`/`secondary`/`tertiary`/`link*`                         | `Button` `emphasis` and `variant`                            |
| `button-wrapper`                                                               | `Wrapper/ButtonWrapper`                                      |
| `form-input`, `form-label-text` `hidden`                                       | `Form/Input`, `labelHidden`                                  |
| `data-{xsmall,small,medium,large}-columns`                                     | `Wrapper/Grid`'s four column props                           |
| `u-text-style-*`                                                               | the `text-style-*` utilities, same names                     |

**Props the export does not carry come from the page, not the component.**
`get_component_properties` returns a component's _defaults_ — a Button Main has
ten properties and only `variant` reaches the export. Instance values are in
`data_localization_tool` → `get_page_content`, as `component-instance` nodes
with `propertyOverrides`. Join three calls:

- `list_components` — id to name and group
- `get_component_properties` — property id to label
- `get_page_content` — this instance's values

That recovers what the export never had: a Section's `Container Classes`, each
button's own label, a video URL passed as a property.

**Widgets, where Webflow's own were used.** `w-slider` → `Interactive/Slider`,
`w-tabs` → `Interactive/Tabs`, `w-dropdown`, `w-nav`, `w-form`, `w-richtext`.
Do not expect to find them: a `u-` utility site builds its own, so the
carousel is Swiper and the nav is custom markup.

**Third-party libraries come across as they are.** Swiper, GSAP, Three.js and
Lenis are the site's behaviour, not Webflow's, and swapping Swiper for
`Interactive/Slider` changes how the site moves. Install them, keep the
initialisation code with the component that needs it, and only replace a
library where its markup was Webflow's own widget.

**Styles that came with a section — how it was set in Webflow decides.**

- A **named class** stays a custom class on the Trix component, its rules in
  that component's `<style>`. It was a decision; keep it one.
- A **utility** becomes the matching Trix utility or prop — `Section`'s
  `paddingTop`, `theme`, `gap`. A utility means the same thing in both systems.
- A **one-off** folds into the component's styles, or disappears if a prop
  covers it.

**Delete what the swap killed.** The rules for replaced markup go with it. A
stylesheet carrying styles for components that no longer exist is how this kind
of migration fails.

**JavaScript moves; it does not get rewritten.** A custom embed goes into the
component that owns the markup it acts on, unchanged. A site-wide script stays
site-wide, in the layout.

The single exception is Webflow's own IX2, which is compiled into `webflow.js`
against `data-w-id` attributes and cannot be lifted out. Only that gets
rebuilt: hovers in CSS; fades and staggered scroll reveals with the
framework's `animate` prop (timing in the `--reveal-*` tokens — set them to
the IX2 duration and easing the live site measures); anything else with an
`IntersectionObserver` in the owning component; timelines and scrub-linked animation watched on the
live site, described, and confirmed as worth the effort before anyone starts.
When the last Webflow widget is gone, so is `webflow.js` — and nothing else
about the site's behaviour should have changed.

**Later pages will need variants the homepage never used** — a button style,
a layout arrangement, a section theme. Add them to the component as they come
up rather than starting a second component; the inventory from the scanner says
how many variants each component has, so the shape of what is coming is known
from the start.

**Verify against the pass-1 baseline, not against live.** Capture the pages
before starting pass 2 and again after each swap; the sibling skill's
`visual-check.mjs` does both and pixel-diffs the pairs:

```bash
node .agents/skills/trix-upgrade/visual-check.mjs capture before
node .agents/skills/trix-upgrade/visual-check.mjs capture after
node .agents/skills/trix-upgrade/visual-check.mjs compare
```

Here a pixel diff is the right instrument, unlike pass 1 against live: both
sides are the same build on the same machine, so anything that moved, moved
because of the swap. A difference now was caused by the change just made. It is a defect, not drift: the tokens are the
site's own, so the components should land where the Webflow markup did. Chase
it to the token or prop that is wrong rather than accepting it.

---

# Pass 3 — Connect the data

**Where content lives**, decided before converting anything, by who edits the
site: **Astro content collections** (typed, in git, no bill, no editor UI), **a
headless CMS** (closest to what they are leaving, plus a subscription), or
**Webflow as a headless backend** (least disruption, keeps the bill).

**Bindings.** Two are exact, one is not:

- **Templates** — `detail_<slug>.html` names the collection's slug.
- **CSVs** — each is named with its collection ID and carries a `Collection ID`
  column.
- **Lists on a page** — nothing in the export says which collection. Compare
  the fields inside `w-dyn-item` against `get_collection_details`, or read the
  binding from the element tree (`data_element_tool` → `query_elements`, then
  `get_attributes` with `with_resolved_bindings: false`). **When two
  collections could both fit, ask.**

**Record the CMS, form and search choices in `PROJECT.md` as each is made.**
They are the three decisions the code will never explain, and whoever made them
will not be in the next session.

**Filters and sorts are the one thing nothing hands you.** The published HTML
is the result of a filter, not the filter; the CMS API filters what you ask
for, it does not report how a page's list was configured. Look in the element
tree; failing that, the record is the client's Designer. Confirm each against
the live site — a list showing nine of forty items has a filter, and a rebuild
without it shows forty. **Write every one into `PROJECT.md`**: it is the one
fact in the whole migration with no source left once Webflow is unpublished.

**Collection templates become dynamic routes** — `/blog/[slug].astro` with
`getStaticPaths`, at the URLs the items already had.

**Forms.** Fields survive, submission does not. Rebuild with `Form/*`, keeping
the honeypot and the success and error states, then choose a provider.
**Recommend Cloudflare** — a Worker plus Cloudflare Email Service, same
platform as the hosting, no third party. A recommendation: an existing CRM
usually decides it.

---

## Finish

**What should be gone:** `u-` prefixes, Webflow's variable names, Webflow's
component markup, `webflow.js`, and any rule a Trix token or component now
expresses.

Grep for it. A page still containing `u-eyebrow-wrapper`, `u-heading` or
`u-button-wrapper` is a component that was never swapped — the design will look
right, which is why this is worth checking rather than eyeballing. The same
goes for `--_trigger`, `--_state`, `--_responsive`, `data-trigger`,
`data-state` and `@container`: each is a selector or a media query that was
copied instead of written.

**What should still be there:** the site's own classes, its own CSS, its own
JavaScript and its own libraries — each now living with the component that uses
it rather than in a global file. A migration that deleted them rewrote the site
instead of moving it.

**And the site stylesheet is empty of blocks.** Run `split-css` once more: what
it reports should be fonts and global rules, not a list of groups. Every group
still there is a block that never became a component, still inline in a page,
still styled from a global file.

Every page still matches. Anything Webflow that survived is named in the report
with the reason nothing here replaced it.

**Hosting.** Recommend **Cloudflare Workers**, which this framework is
configured for, with Cloudflare Email Service for form mail.

**Redirects, one map from two sets.** The inherited CSV, carried across
unchanged, and the ones this move created. Check them against each other:
`/services → /what-we-do` plus `/what-we-do → /work` should be flattened to one
hop. Then the domain, SSL and DNS cutover, keeping Webflow published until the
new site answers.

## The report

- **Pass 1** — pages, components created, CSS split, what stayed global, rules
  spanning two components and the decision made.
- **Variables** — ported, added, and any left unmapped.
- **Pass 2** — components mapped, props from the export versus from
  `get_page_content`, props with no equivalent, styles kept as classes versus
  moved to utilities, CSS deleted, libraries reimplemented or carried,
  interactions rebuilt or dropped.
- **Pass 3** — collections and where they landed, bindings inferred rather than
  told, filters confirmed, forms and provider.
- **Parity** — every page checked, and any that did not match.
- **Webflow that survived** — with a reason each.
- **Out of scope**, **redirects**, **still open**.

## Versions

Webflow reference 1.0.0 (tested against a 59-page Webflow export on a `u-`
utility system: 13 collections, 147 variables, a 363 KB
stylesheet). All scripts read only; `variables.ts` writes a rename script for
you to run and review.

---
name: trix-import-figma
description: Build a page or fill in Trix tokens from a Figma file, especially a messy one missing global variables. Use when the user shares a Figma link or design and asks to implement it, translate it into Trix, fill in the design tokens, or when the design's spacing, type and color are inconsistent and need reconciling against src/styles/tokens.css.
---

# Building Trix from a Figma file

A design file is a picture of an intention, not a source of truth. The job is
to land the intention in the token system with as few new tokens as possible,
and to be explicit about every guess.

**The rule that outranks the rest: never invent a variable or a class to paper
over an inconsistency in the design. Surface it and ask.** Two paddings that
differ by 6px are usually one padding drawn twice. Ask which it is before
writing anything. With nobody to ask, follow [Working unattended](#working-unattended).

**Which job is it?**

- **A new project** — the design replaces Trix's look. Its type scale and
  palette _become_ the tokens: run the converter with `--fresh`, which matches
  type rows to text styles by name, never by size, and prints the palette as
  ramps.
- **A change** — the design adjusts a site that already has its system. Each
  value is matched to the token it is closest to and snapped within 2px.

## Getting the values in

| What you have                               | Read it with                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the Figma MCP                               | `get_variable_defs`, `get_design_context`, `get_screenshot`                                                                                                                                                     |
| a **variables export** (no MCP)             | the designer, in Figma: Local variables → right-click each collection → **Export modes**. The zip holds one `.tokens.json` per mode. `convert.mjs --from-figma <folder>` turns them into the inventory (step 2) |
| only the file in a browser, or a spec / PDF | Dev Mode's variables table and inspect panel, written into the inventory by hand. Screenshot each frame at 100% so measurements are design px                                                                   |

Variables carry no text styles: whichever way the values arrive, each text
style's line height, letter spacing, weight, family and case come from the
style guide's type specimens.

## Fast path: a file built on the Trix Figma setup

A designer who followed `docs/design/figma-setup.md` built the file on Trix's
own variable collections — Primitives, Responsive (Mobile/Desktop), Text Styles,
Theme (one mode per theme) and Components — with Trix's names. Check first:

1. `get_variable_defs` on the main frame (or open the variables export). If
   the names are Trix's
   (`space/7`, `font-size/h2`, `color/brand/500`, theme modes `Light`/`Dark`),
   there is nothing to convert: the Responsive collection's Mobile value is the
   token's `-min`, Desktop is `-max`, and every other variable is the value of
   the token with the same path.
2. Write those values into `src/styles/tokens.css` and `src/styles/themes.css`
   and run `npm run tokens`. Then diff `design/tokens/*.json` against the
   designer's export — they should be the same file.
3. Skip to step 7 and build pages.

Everything below is for files that were not built that way.

## What Figma cannot say

Three conversions are always needed, because the file physically cannot hold
the values this system uses.

| In Figma                                  | In Trix                                                | Conversion                             |
| ----------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| `32px`                                    | `2rem`                                                 | ÷ 16                                   |
| line height `70px` on a `64px` size       | `1.094`                                                | line height ÷ font size                |
| letter spacing `-2.4px` on an `80px` size | `-0.03em`                                              | letter spacing ÷ font size, or % ÷ 100 |
| `#FFFFFF` at 60% opacity                  | `color-mix(in lab, var(--light-100) 60%, transparent)` | alpha becomes the mix percentage       |

One refinement on the last row. If the faded hex is whatever a theme uses for
`--text`, the answer is `currentcolor`, not that swatch — otherwise the muted
label stays dark when the section flips to the dark theme. The script spots
this and says so.

The opacity one matters most. A designer who wants a muted label has no
`color-mix`, so they restate the base hex at lower opacity. That is not a new
color — it is the existing swatch, mixed. Adding `--grey-400: #999` for it is
the mistake this skill exists to prevent.

## Mobile values: the one rule

`/trix-design-system` follows this rule too.

Tokens here are fluid: `--space-6-min: 32` at a 320px viewport, `--space-6-max: 40`
at 1440px. A value read off the desktop frame (or a variable's **Desktop**
mode) is the token's **max**; the mobile frame's (or **Mobile** mode's) is its
**min** — give it to the converter as `mobilePx`.

**A mobile value of `0`, an empty one, or none at all means "not drawn"** —
never a size of 0. Figma files often carry a Mobile mode nobody filled in.

A min that was not drawn is **derived and marked as a guess**: `convert.mjs`
takes the ratio of the token it replaces (in `--fresh`, the style of the same
name) or else the one closest in size, and lists it under `GUESSED`. Then:

- someone to ask — put the guesses to the designer with the other questions;
- unattended — write them, and log each in `PROJECT.md` → Still open.

A guess is never written silently, and the report says which mins were
measured and which derived. A 375px frame is not the 320px `--viewport-min`:
say which width you measured.

## Steps

1. **Read the file** — see [Getting the values in](#getting-the-values-in).
   With the MCP: `get_variable_defs` for whatever variables do exist,
   `get_design_context` for the frame, `get_screenshot` to see what it should
   look like. Start with the variables: they tell you how much of the system
   the designer actually used. Every value and every line of copy comes from
   the design context; the screenshot is the target to compare against, never
   a source of numbers. A section the context returns sparse is fetched again
   by its child nodes, not read off the picture.

   **Check for a mobile frame now.** If the file has only desktop frames, say
   so before building: every `-min`, every stacking decision and every mobile
   height will be a guess, and the report opens with that.

   **Find what moves.** A frame is a still picture: a marquee, a slider and a
   static row of logos look the same in it. Save `get_metadata`'s output for
   the page frame to `.trix/figma-meta.xml` and run:

   ```bash
   node .agents/skills/trix-import-figma/patterns.mjs --xml .trix/figma-meta.xml
   ```

   It lists each part that looks like it moves or responds — see
   [What moves](#what-moves) — with its evidence and a question. Run
   `get_motion_context` on the frame too: any node it returns animates, and is
   a finding of its own. None of this is decided yet; the questions go to the
   user in step 4.

2. **Inventory before converting.** List every distinct spacing value, type
   size with its line height, and color with its opacity. Distinct _values_,
   not distinct layers — the same 24px appearing eleven times is one value.
   From a variables export, `--from-figma` writes the first draft:

   ```bash
   node .agents/skills/trix-import-figma/convert.mjs --from-figma ~/Downloads/variables > design.json
   ```

   It pairs Desktop and Mobile modes, resolves aliases, drops a Mobile `0`,
   lists each weight once, and prints what it could not place — theme colours
   (map them onto `themes.css` roles), font families (→ `/trix-design-system`
   fonts), line heights and borders — on stderr. Name the rows (`"token"`) and
   add each type row's details from the specimens before converting.

   Add each frame's **layout grid** (count, margin, gutter): the desktop and
   mobile margins are `--site-margin-max`/`-min`, the gutters
   `--site-gutter-max`/`-min`. A frame with no layout grid, or one that is not
   12 columns on desktop, is a question for the designer, not a value to
   invent.

3. **Convert and match.** Write the inventory to JSON and run the script:

   ```bash
   node .agents/skills/trix-import-figma/convert.mjs --json design.json            # a change
   node .agents/skills/trix-import-figma/convert.mjs --json design.json --fresh    # a new project
   ```

   The script does the arithmetic because there is a lot of it and it is easy
   to get quietly wrong: forty values, each measured against twenty fluid token
   pairs, plus RGB distance for every colour. It reads the tokens out of
   `tokens.css` rather than carrying a copy, so it cannot drift from the system.

   ```json
   {
     "space": [{ "name": "stack gap", "px": 30, "mobilePx": 20 }],
     "type": [
       {
         "name": "Section title",
         "token": "h2",
         "sizePx": 64,
         "mobilePx": 40,
         "lineHeightPx": 70,
         "letterPct": -2,
         "weight": "Medium",
         "family": "secondary"
       },
       {
         "name": "Label",
         "token": "eyebrow",
         "sizePx": 12,
         "family": "mono",
         "uppercase": true
       }
     ],
     "letter": [{ "name": "Hero tracking", "px": -2.4, "sizePx": 80 }],
     "radius": [{ "name": "Card corner", "px": 16 }],
     "weight": [{ "name": "Heading", "value": "Medium" }],
     "color": [
       { "name": "Plum/Plum-400 (Violet)", "hex": "#735385" },
       { "name": "Muted label", "hex": "#FFFFFF", "alpha": 0.6 }
     ]
   }
   ```

   `mobilePx` is the mobile frame's value — leave it out, or `0`, when there is
   none. A type row's `lineHeightPx` (or `lineHeightPct`), `letterPx`/`letterPct`,
   `weight`, `family` (a role: `primary`, `secondary`, `mono`…) and `uppercase`
   fill its Text style group in `--fresh`. Every name becomes kebab-case from
   the last part of a Figma path, without the designer's (aside):
   `Plum/Plum-400 (Violet)` → `--plum-400`.

   Add `"on": "#1F1D1E"` and `"sizePx"` to a colour and the script also reports
   its WCAG contrast, using the large-text bar of 3:1 at 24px and above. These
   are flagged, never blocking — a decorative label may fail deliberately — but
   an unreadable body colour is usually the design being messy rather than a
   decision, so raise it with the other questions.

   `letter` takes either `px` with its `sizePx`, or `pct`. Add `"token": "name"`
   to any entry to choose what a new variable would be called. Unknown keys are
   rejected rather than silently ignored, so a typo does not read as "nothing
   to convert".

   It reads the real tokens out of `src/styles/tokens.css`, converts the units,
   snaps anything within 2px to the token it is drifting from, derives the
   mins nobody drew (`GUESSED`), and prints an `ASK BEFORE WRITING` list.
   Values off by more than 2px are decisions, not drift, and belong in that
   list.

   With `--fresh` it also prints each type row as a whole `Text style — name`
   group (replacing the stock style of that name, or `NEW`), the Trix styles
   the design leaves undefined, and the palette as ramps — flagging a swatch
   like `--grey` beside `--grey-10`, which Figma cannot hold.

   For one-off lookups: `--px 30`, `--lh 50/42`, `--color "#FFFFFF@60"`.

4. **Ask the questions.** Put the whole `ASK BEFORE WRITING` and `GUESSED`
   lists to the user at once, each with the option to consolidate:

   > The design uses 30px, 32px and 34px gaps in three places. `--space-5` is
   > 32px. Consolidate all three, or is one of them deliberate?

   Ask about each part from **Find what moves** in the same round, one
   question per part, naming it by its section and its text so the user can
   find it, with the script's options and its suggestion first. In Claude Code
   that is `AskUserQuestion`, up to four questions a call; elsewhere a
   numbered list. Close with one question the script cannot ask: _does
   anything else on the page move or respond — a sticky nav, a hover reveal,
   a counter?_ An empty finding list still gets that question.

   Wait for answers. Do not write tokens for anything still in question, and
   do not build a part as static while its question is open.
   Unattended, decide by [Working unattended](#working-unattended) instead.

5. **Place the tokens yourself.** The script prints what to add under
   `TO PLACE BY HAND`; it does not touch `tokens.css`. Where a token goes says
   what it means, and `:root` is ordered by kind — put each one with its own:

   | Kind            | Goes in group                                                                          |
   | --------------- | -------------------------------------------------------------------------------------- |
   | spacing         | `Spacing — scale`, in size order                                                       |
   | section spacing | `Spacing — section`                                                                    |
   | type size       | a new `Text style — <name>` group with all twelve properties (copy one), in size order |
   | line height     | `Typography — line height`                                                             |
   | letter spacing  | `Typography — letter spacing`                                                          |
   | radius          | `Radius`                                                                               |
   | font weight     | `Typography — weights`                                                                 |
   | swatch          | `Color — palette`                                                                      |
   | themed color    | **every** theme block in `themes.css`, or it breaks on one theme                       |

   A fluid token is two lines, `-min` and `-max`; `npm run tokens` (or saving
   while `astro dev` runs) generates the `clamp()`, the utilities, the prop
   types, the Figma files and the docs. Keep the scale in order: a step
   measured between `--space-8` and `--space-9` means renumbering, and that
   is a question for the user, not a quiet insert.

6. **Fill the gaps the design forgot.** A messy file will be missing states
   nobody drew: hover and focus colors, the dark-theme counterpart of a button,
   disabled text. Derive them from what the file does show, following the
   existing pattern in `tokens.css` — each theme block defines the same set of
   `--button-*` variables, so a missing dark-theme hover has an obvious shape
   to fill. **Every one of these is a guess and goes in the report.**

7. **Build with what exists, then build what doesn't.** Compose from the
   library first — `Wrapper/Section` and `Wrapper/ContentWrapper` for layout,
   `Wrapper/Row` + `Wrapper/Col` for blocks laid on the frame's layout grid
   (read each block's start and end column: that is `span` and `offset`),
   `Wrapper/Grid` for equal repeated items, `Item/Card` for repeated blocks,
   `Typography/*` for text. A design that "needs" a new class usually needs an
   existing variant, and a one-off class is how a system stops being one.

   When something genuinely does not compose — a testimonial slider, a stats
   row — build it, following the new component checklist in `TRIX.md`. List
   every component you added in the report, with a sentence on why nothing
   existing covered it. That list is the one most worth arguing with: it is
   where the system grows, and growth is harder to undo than a token.

   Check the library's options before building around one: `Button size`,
   `Slider controls="top"` with a `header` slot and `markers`,
   `ContentWrapper distribute` (heading at the top, text at the bottom of a
   tall column), `Section`'s `background` slot. A design background goes in
   that slot, or in a `.section_background` — any other child of a section
   stays in the flow.

   **Build one section, look at it, then the next** (step 8). A layering or
   inheritance mistake made in the first section is repeated in every one
   after it, and no check catches it: `npm run check` passes on a heading
   hidden under an overlay.

8. **Look at it.** Tokens matching the table does not mean the page matches the
   design. Start the dev server, open the page, and compare it against the
   screenshot from step 1:

   ```bash
   npx astro dev --background
   ```

   Measure the page against the frame, section by section — the design's
   heights in order are the top-level frames `get_metadata` lists:

   ```bash
   node scripts/measure/sections.ts --url http://localhost:4321/ \
     --widths 1440,375 --expect 970,162,800,861 --shots
   ```

   It flags each section off by more than 16px and any width that scrolls
   sideways, and saves a screenshot per section in `.trix/sections/`. Put each
   beside the design's screenshot of the same section. Then check the width
   you did _not_ measure — a design given only at 1440px still has to survive
   375px, and that is where derived mins show up as wrong. Report what does
   not match rather than quietly adjusting tokens until it does: a mismatch is
   often the design being inconsistent, which is a question, not a bug.

## What moves

What `patterns.mjs` looks for, and what each answer builds. The signals are
structure only — positions, sizes, names, hidden layers — so a finding is a
reason to ask, never a decision.

| Part            | Signals in the frame                                                                              | Builds with                                |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| marquee         | five or more images in one row across most of the width; stronger if the row overflows or repeats | `Interactive/Marquee`                      |
| slider          | blocks of one size in a row that runs past the frame; two square buttons nearby                   | `Interactive/Slider`                       |
| before/after    | a long thin line with a small square handle centred on it, splitting two pictures                 | none yet — a new component, if confirmed   |
| accordion       | three or more stacked rows of one width, each ending in an icon                                   | `Interactive/Accordion`                    |
| pagination dots | three or more small dots evenly spaced                                                            | `Interactive/Slider` or `Interactive/Tabs` |
| a second state  | a hidden layer the same size, exactly under a visible one                                         | a hover, a tab panel, or nothing           |
| named parts     | a layer named marquee, slider, carousel, compare, tabs, faq, modal, dropdown, video, sticky       | the component of that name                 |

A line at the page's edge (the frame's side rules) is not a compare, and a
row of images inside the frame is not a slider: the script leaves both out.
What it cannot see at all — a sticky nav, a scroll reveal, a hover that
changes nothing's size — is why step 4 always asks the closing question.

## Working unattended

With no designer or owner to answer — an agent building alone — these are
the only decisions to take alone. Each one is logged where the table says, so
a person can reverse it later; anything not listed stays open.

| Decision                                                                        | Rule                                                                                                                                                      | Log it in                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| a value within 2px (line height 0.05, tracking 0.005em) of a token              | snap to it                                                                                                                                                | report → Snapped                                     |
| a min nobody drew                                                               | the converter's derived value                                                                                                                             | `PROJECT.md` → Still open, report → Guesses          |
| a size or colour off every token by more than 2px                               | type size, colour, radius: a new token, named from the design. Spacing: snap to the nearest step and note the drift — a new step would renumber the scale | `PROJECT.md` → Design system, report → New variables |
| a frame with no layout grid                                                     | keep Trix's 12 columns, gutter and margin; take the margin from where the content edge sits, if it shows                                                  | `PROJECT.md` → Still open                            |
| a state the design did not draw (hover, focus, the dark-theme twin of a button) | derive it from the pattern in `themes.css`                                                                                                                | report → Guesses                                     |
| a table and a real text style that disagree                                     | the text style — it is what the designer applies                                                                                                          | `PROJECT.md` → Design system                         |
| a design colour below its contrast floor in a theme role                        | keep the designer's colour with `/* contrast: accepted — why */` on its line in `themes.css`                                                              | `PROJECT.md` → Still open                            |
| a font                                                                          | `/trix-design-system` → fonts, [Unattended](../trix-design-system/references/fonts.md#unattended)                                                         | `PROJECT.md` → Design system                         |
| a part [What moves](#what-moves) flags                                          | build the script's suggestion where it has one; with none, build it static. Never build a new component for it                                            | `PROJECT.md` → Still open, report → Behaviour        |

Never decide alone: a renumbered scale, a removed token something uses, a
licence, or anything the design contradicts itself on twice.

## The report

Open with what the file did not have — a mobile frame, a layout grid — then
close with seven lists. Anything empty, say so.

- **New variables** — name, value, and what in the design asked for it.
- **New components** — what was built, and why nothing existing covered it.
- **Behaviour** — each part from [What moves](#what-moves): what it was built
  as, and whether the user said so or it was decided unattended.
- **Guesses** — derived fluid mins, invented states (dark-theme button hover,
  focus rings), anything the file did not actually specify.
- **Snapped** — values moved to an existing token, with the delta. These were
  applied without asking; the user may still want to reverse one.
- **Contrast** — any pair below its WCAG floor, with the ratio. Flagged, not
  fixed.
- **Still open** — inconsistencies the user has not ruled on yet.

## Versions

This skill versions separately from the framework. A fix here does not need a
Trix release, and a Trix release does not invalidate the skill.

- **Skill version** — `SKILL_VERSION` in `convert.mjs`. Bump it when the
  conversion rules or the workflow change.
- **Trix version** — `package.json` (`trix.version`) is the source of truth. Nothing here
  duplicates it; the script reads it and prints both on every run:

  ```
  trix-import-figma 1.2.0  ·  Trix <whatever package.json says>
  ```

  If the running project is a different version than `TESTED_AGAINST`, the
  script says so. That is a prompt to check `tokens.css` still looks the way this
  skill assumes — token names, the `clamp()` shape, the theme blocks — not a
  reason to stop.

## Using this without Claude Code

Nothing here is Claude-specific except the loading. The workflow is this file
and the script is plain Node, so another assistant can be pointed at
`.agents/skills/trix-import-figma/SKILL.md` and follow it, and anyone can run
`node .agents/skills/trix-import-figma/convert.mjs` by hand. Only the automatic
triggering and `/trix-import-figma` are Claude Code features.

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
writing anything.

## Fast path: a file built on the Trix Figma setup

A designer who followed `docs/design/figma-setup.md` built the file on Trix's
own variable collections — Primitives, Responsive (Mobile/Desktop), Text Styles,
Theme (one mode per theme) and Components — with Trix's names. Check first:

1. `get_variable_defs` on the main frame. If the names are Trix's
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

## A desktop frame is the maximum, not the value

Tokens here are fluid: `--space-6-min: 32` at a 320px viewport, `--space-6-max: 40`
at 1440px. A measurement taken off a 1440px frame is therefore the token's
**max**. The min has to come from somewhere:

**Check which frames exist before measuring anything** — files differ, and the
two paths produce different work:

- **Both frames.** Measure each. The mobile value is the min, the desktop value
  is the max, and nothing is guessed. Say which frame widths you measured, since
  a 375px frame and a 320px `--viewport-min` are not the same thing — a value
  read at 375 is slightly larger than the token's true min.
- **Desktop only.** `convert.mjs` derives the min from the ratio of whichever
  existing token is closest in size, and marks it as a guess. Every derived min
  goes in the report; they are the values most likely to be wrong.

Never mix the two silently. If half the tokens are measured and half derived,
the report has to say which is which.

## Steps

1. **Read the file.** Use the Figma MCP tools — `get_variable_defs` for whatever
   variables do exist, `get_design_context` for the frame, `get_screenshot` to
   see what it should look like. Start with the variables: they tell you how
   much of the system the designer actually used.

2. **Inventory before converting.** List every distinct spacing value, type
   size with its line height, and color with its opacity. Distinct _values_,
   not distinct layers — the same 24px appearing eleven times is one value.
   Add each frame's **layout grid** (count, margin, gutter): the desktop and
   mobile margins are `--site-margin-max`/`-min`, the gutters
   `--site-gutter-max`/`-min`. A frame with no layout grid, or one that is not
   12 columns on desktop, is a question for the designer, not a value to
   invent.

3. **Convert and match.** Write the inventory to JSON and run the script:

   ```bash
   node .agents/skills/trix-import-figma/convert.mjs --json design.json
   ```

   The script does the arithmetic because there is a lot of it and it is easy
   to get quietly wrong: forty values, each measured against twenty fluid token
   pairs, plus RGB distance for every colour. It reads the tokens out of
   `tokens.css` rather than carrying a copy, so it cannot drift from the system.

   ```json
   {
     "space": [{ "name": "stack gap", "px": 30 }],
     "type": [{ "name": "Section title", "sizePx": 64, "lineHeightPx": 70 }],
     "letter": [{ "name": "Hero tracking", "px": -2.4, "sizePx": 80 }],
     "radius": [{ "name": "Card corner", "px": 16 }],
     "weight": [{ "name": "Heading", "value": "Medium" }],
     "color": [{ "name": "Muted label", "hex": "#FFFFFF", "alpha": 0.6 }]
   }
   ```

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
   snaps anything within 2px to the token it is drifting from, derives fluid
   mins, and prints an `ASK BEFORE WRITING` list. Values off by more than 2px
   are decisions, not drift, and belong in that list.

   For one-off lookups: `--px 30`, `--lh 50/42`, `--color "#FFFFFF@60"`.

4. **Ask the questions.** Put the whole `ASK BEFORE WRITING` list to the user
   at once, each with the option to consolidate:

   > The design uses 30px, 32px and 34px gaps in three places. `--space-5` is
   > 32px. Consolidate all three, or is one of them deliberate?

   Wait for answers. Do not write tokens for anything still in question.

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

8. **Look at it.** Tokens matching the table does not mean the page matches the
   design. Start the dev server, open the page, and compare it against the
   screenshot from step 1:

   ```bash
   astro dev --background
   ```

   Screenshot the built page at the same width as the frame you measured, and
   check the two side by side. Then check the width you did _not_ measure —
   a design given only at 1440px still has to survive 375px, and that is where
   derived mins show up as wrong. Report what does not match rather than
   quietly adjusting tokens until it does: a mismatch is often the design
   being inconsistent, which is a question, not a bug.

## The report

Close with four lists. Anything empty, say so.

- **New variables** — name, value, and what in the design asked for it.
- **New components** — what was built, and why nothing existing covered it.
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
  trix-import-figma 1.0.0  ·  Trix <whatever package.json says>
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

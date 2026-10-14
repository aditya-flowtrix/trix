# Trix

**A design-ready Astro framework.** One design system with two surfaces — the
variables, text styles and components a designer uses in Figma, and the
tokens, classes and components a developer uses in Astro — sharing every name.
What gets designed is what ships.

Trix also moves existing sites onto it: Webflow, Framer, WordPress or anything
else, measured in a real browser, rebuilt with Trix's components and verified
value by value against the original.

## Why Trix

- **Designers and developers speak the same language.** `space/7` in Figma is
  `--space-7` in CSS, `gap-7` in a utility and `"7"` in a typed prop. The Figma
  variables are generated from the code ([`design/tokens/`](design/tokens/)).
- **One file is the design system.** [`src/styles/tokens.css`](src/styles/tokens.css)
  holds every value as plain numbers — fluid sizes are a Mobile and a Desktop
  value. Everything else (clamps, text styles, utilities, prop types, Figma
  files, the token docs) is generated from it and kept in sync by CI.
- **A style guide that cannot drift.** [`/style-guide`](src/pages/style-guide.astro)
  renders straight from the tokens: brand, type, color, themes, spacing,
  radius, the 12-column layout grid, motion, icons.
- **One 12-column grid, in Figma and in code.** `Row` and `Col` lay blocks
  across the columns a designer draws (`span={8}`, `offset="center"`); tablet
  and mobile stack automatically. Shift+G overlays the grid on any page.
- **Migrations without guesswork.** The measuring toolkit reads what a site
  renders at seven widths and maps it to Trix by value, never by name — then
  proves the rebuild matches.
- **Fast by default.** Static Astro, zero runtime dependencies, native
  `<details>` and `<dialog>`, icons inlined at build time, local variable fonts,
  cascade layers so nothing needs `!important`.
- **Agent-ready.** Every procedure is a skill with scripts; every project keeps
  its decisions in `PROJECT.md`.

## Start a project

```bash
npx degit aditya-flowtrix/trix my-site
cd my-site
npm install
npm run dev
```

Then run the `trix-new-project` skill (or follow
[its steps](.agents/skills/trix-new-project/SKILL.md)) to stamp, name and brand
the project. Open `/style-guide` and `/components`.

## For designers

Start with [Designing with Trix](docs/design/README.md) — the rules, the
breakpoints, the naming — then [Figma setup](docs/design/figma-setup.md) to
import the variables and build the file, and the
[handoff checklist](docs/design/handoff.md).

## For developers

| Read                                           | For                                               |
| ---------------------------------------------- | ------------------------------------------------- |
| [`TRIX.md`](TRIX.md)                           | how to build pages, components, styles and tokens |
| [`docs/components.md`](docs/components.md)     | every component and its variants                  |
| [`docs/tokens.md`](docs/tokens.md)             | every token, generated                            |
| [`docs/architecture.md`](docs/architecture.md) | how Trix works and why                            |
| [`PROJECT.md`](PROJECT.md)                     | the project's own record                          |

| Command          | Does                                                           |
| ---------------- | -------------------------------------------------------------- |
| `npm run dev`    | dev server; regenerates tokens on save                         |
| `npm run tokens` | regenerate everything derived from `tokens.css` / `themes.css` |
| `npm run check`  | tokens in sync, conventions, type-check                        |
| `npm run build`  | static build to `dist/`                                        |

## Skills

In [`.agents/skills/`](.agents/skills/), loaded by Claude Code as
`/trix-<name>` and readable by any assistant:

| Skill                  | Does                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| `trix-build`           | build pages, sections and styles the Trix way                               |
| `trix-new-project`     | start a new site from Trix                                                  |
| `trix-style-guide`     | build the design system from any source — measured, never guessed, verified |
| `trix-migrate`         | migrate from Webflow, Framer, WordPress, Wix, Squarespace or anything else  |
| `trix-design-system`   | change fonts, type, colors or any token — from Figma or by asking           |
| `trix-import-figma`    | build tokens and pages from a Figma file                                    |
| `trix-seo`             | metadata, structured data, SEO audit, migration parity, launch handoff      |
| `trix-audit-props`     | keep component props consistent                                             |
| `trix-scaling-graphic` | build a graphic that scales as one piece                                    |
| `trix-upgrade`         | upgrade a site to the latest Trix; sync Trix with Lumos                     |

The measuring toolkit they share is in [`scripts/measure/`](scripts/measure/):
`inventory`, `design`, `propose`, `variables`, `classes`, `verify`.

## Roadmap

[ROADMAP.md](ROADMAP.md) — phase 2 adds the SEO skills.

## Credits

Trix is built on **[Lumos for Astro](https://github.com/lumosframework/lumos-for-astro)**
by Timothy Ricks (MIT) — its component library, cascade layers, conventions and
skills are the foundation, and its history is preserved in this repository.
Ideas from **[Mast for Astro](https://github.com/CoreyMoen/mast-astro)** by
Corey Moen / No-Code Supply Co. (MIT) — the 12-column grid with automatic
stacking, the token file organised like a variables panel with generated
fluid formulas, build-time icons, site-wide color mode, scroll-in reveals,
and skill evals. Icons by [Phosphor](https://phosphoricons.com)
(MIT). Typeface [Inter](https://rsms.me/inter/) by Rasmus Andersson (OFL).

## License

[MIT](LICENSE), © Flowtrix. Third-party notices, including Lumos for Astro's
license, are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

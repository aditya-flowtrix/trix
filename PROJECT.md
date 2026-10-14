# Project record

**Read this before doing anything else, and fill it in as you go.** A project
runs across many sessions, people and agents. Nothing below is recoverable
from the code: a path lives on someone's desktop, a provider was chosen in
conversation, a decision was made by the owner on a call. Whoever picks this
up next has this file and the repository, and that is all.

Write each answer **the moment it is given**, with the date. Leave `—` until
something is decided. This file belongs to the project: Trix upgrades never
touch it.

## Project

- **Name** — —
- **Owner / who decides** — —
- **Production domain** — — (also `SITE_URL` in `src/consts.ts`)
- **Hosting** — —
- **Started from Trix** — version and commit (also `trix` in `package.json`)

## Sources

- **Live URL** — what every page is compared against, until cutover
- **Platform** — Webflow / Framer / WordPress / … (from `scripts/measure/inventory.ts`)
- **Built with** — CSS framework and libraries detected
- **Code export** — path to the unzipped folder
- **Design file** — Figma link
- **Content export** — CMS CSVs, WordPress WXR, Framer CMS CSVs: paths
- **301 redirects** — path to the platform's redirect export
- **Platform IDs** — site ID, workspace, anything an API needs

## Design system

Filled by `/trix-style-guide`. Trix names in the code; this is the only place
the source's names appear.

- **Fluid range** — `--viewport-min` / `--viewport-max`, and why
- **Fonts** — family, files, axes, what is preloaded
- **Text styles** — source style → Trix slot, one line each
- **Spacing** — the scale, with the source's names beside each step
- **Section space** — source → Trix names
- **Radius** — source → Trix names
- **Palette** — ramps and what each was in the source
- **Themes** — source section variants → `.theme-*` classes
- **Breakpoints** — source media queries → `--breakpoint-*`
- **Component remaps** — framework component spacing/radius refs moved to the project scale
- **Quirks kept** — odd source behaviour reproduced on purpose, and why
- **Verified** — date and result of `verify.ts` / `variables.ts`

## Migration

Filled by `/trix-migrate`.

- **CMS** — content collections / headless CMS, and why
- **Collections** — each one, and the route or component it landed in
- **List filters and sorts** — per list
- **Forms** — provider, and where submissions go
- **Search** — what replaced the platform's, or none
- **Animations** — library and approach
- **Out of scope** — and what was agreed instead
- **Class map** — notable renames (full map: `.trix/class-map.md`)
- **Pages** — status per page: not started / pass 1 / pass 2 / done / signed off

## Decisions

Dated, one line each.

- —

## Still open

- —

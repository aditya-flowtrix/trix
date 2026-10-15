# `trix-consent` — cookie consent skill

Status: draft for review · 2026-10-15

## Goal

A skill that lets a developer, with Claude Code or any agent, add a cookie
consent banner to a Trix site that is compliant, light, and in the site's own
design. It explains the choices in plain words, asks the developer for the
requirements, builds the banner and the gating, sets up where consent is
recorded, verifies that nothing tracks before consent, and writes every
decision into `PROJECT.md`.

Success: a developer who knows nothing about consent law or c15t ends with a
banner that blocks every tracker until the visitor chooses, records the
choice where the project decided, passes the accessibility check, and has a
record of why each choice was made.

## Decisions already made

| Decision                 | Choice                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Consent engine           | c15t **v3**, headless runtime (`c15t/runtime`), bundled by Astro                                                  |
| Banner UI                | Trix components and tokens — no React, Svelte or Vue, no c15t stock UI or CSS                                     |
| Where records go         | Asked per project: browser only, Inth (c15t's hosted service), or self-hosted                                     |
| Default when self-hosted | One Worker per client, on the client's Cloudflare account, with its own Postgres; the skill sets it up end to end |
| Backend code             | Written fresh from c15t v3's docs — no code reused from earlier projects                                          |
| Weight                   | Nothing is added to a project that does not run the skill: no dependency, no component                            |
| Client names             | None in the Trix repo; templates are generic                                                                      |

## What the spike established

c15t v3's backend (`@c15t/backend` 3.0.0, Postgres through `@effect/sql-pg`)
was run in Cloudflare's local Worker runtime (`wrangler dev`, `nodejs_compat`)
against a real Postgres, with a static page saving consent from a browser.

- Migrations run from Node with c15t's CLI (`c15t self-host migrate`); the
  Worker never migrates.
- The Worker bundles at 700 KB gzipped once the unused drivers
  (`@effect/sql-sqlite-node`, `@effect/sql-mysql2`, `@upstash/redis`) are
  aliased to a stub.
- **One backend instance per request, disposed after the response.** A shared
  instance hung on the first save every time (4 of 4); per request, 5 of 5
  saved first time in about 30 ms. Workers forbid reusing a connection opened
  by another request.
- **The database's time zone must be UTC.** A non-UTC session shifted stored
  times by its offset.
- The backend's `/c15t.headless.js` route cannot work on a Worker (it reads a
  file from disk). Irrelevant here: the site bundles the client itself.
- Not covered locally: TLS to a hosted database, Hyperdrive, Cloudflare's
  network. The go-live check (below) covers them on the first deploy.
- c15t v3 cannot run against a Cloudflare D1 binding, and a v3 client cannot
  talk to a v2 backend.

## How the skill runs

The skill is `.agents/skills/trix-consent/SKILL.md`, with its templates and
scripts beside it, linked from `.claude/skills/trix-consent`. Every new
project gets it from the installer; existing ones get it on `/trix-upgrade`.

### 1. Read first

`PROJECT.md` → **Consent**. If it is filled, this is a change to an existing
setup: apply only what changed, and never touch stored records.

The c15t API comes from `node_modules/c15t/docs` and
`node_modules/@c15t/backend/docs` after install — they match the installed
version, and v3 renamed most v2 APIs. The skill gives the decisions and the
Trix shape; the docs give the calls.

### 2. Explain, then ask — one question at a time

Each question says what it decides, in a sentence, and offers a recommended
default. Answers are written to `PROJECT.md` as they are given, with the date.

1. **Where visitors come from** → the region rules. Default: Europe, EEA and
   UK opt-in (nothing loads until the visitor accepts), US opt-out with
   Global Privacy Control honoured, everyone else opt-in, and an unknown
   location gets the strictest rule. Countries can be moved between rules;
   the skill says this is the owner's legal decision, not a technical one.
2. **Where consent is recorded.**
   - _Browser only_ — no backend, no proof of consent. Not for production;
     the skill says so.
   - _Inth_ — c15t's hosted service; paste its backend URL.
   - _Self-hosted_ (default) — the skill builds the Worker (step 4). Two
     follow-ups: the database provider (default Neon) and its location —
     EU jurisdiction, or nearest to the visitors. **The location can only be
     set when the database is created**; the skill says so before creating it.
3. **What the site loads.** The skill finds every third-party script and
   embed — in the code (`<script>` tags, `astro.config.mjs`, layouts) and on
   the live site if there is one — and lists them. The developer confirms the
   category of each. Anything the team wants to run regardless of consent is
   recorded as a decision with its reason, not silently left ungated.
4. **Categories** — only those something on the site uses, from c15t's set
   (`necessary`, `measurement`, `marketing`, `functionality`, `experience`),
   each with a one-line description the developer can edit.
5. **Google Consent Mode v2** — asked only when a Google tag is present;
   default on.
6. **Design.**
   - Layout: `bar` (full width, bottom) or `card` (bottom corner). Default
     `card`.
   - Theme: one of the project's own `.theme-*` classes.
   - Copy: a default text in plain words, editable; the privacy (and cookie)
     policy link.
   - "Reject all" is always as prominent as "Accept all" — same size, same
     emphasis. Regulators treat a weaker reject as invalid consent; this is
     not a design option.
7. **Behaviour.** Defaults: settings toggles start off, consent lasts 365
   days, withdrawing a consent reloads the page (a script that already ran
   cannot be un-run), a "Cookie settings" link in the footer.

### 3. Build into the project

| File                                        | What it is                                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/consent.ts`                            | The one runtime (`createConsentRuntime`, hosted or offline mode), the backend URL, and the gated scripts list. Nothing runs until `start()`. |
| `src/components/global/ConsentBanner.astro` | The banner and the settings panel. Placed once in `BaseLayout`.                                                                              |
| `BaseHead` (head slot)                      | An inline script, first in `<head>`, that sets Consent Mode defaults to denied (only with Consent Mode on). It runs before any tag.          |
| `Footer.astro`                              | A "Cookie settings" button that reopens the settings panel.                                                                                  |
| `package.json`                              | `c15t`, plus `@c15t/integrations` only if a vendor helper is used. All c15t packages on one version.                                         |
| `public/_headers`                           | Unchanged unless the project has a Content-Security-Policy, in which case the backend origin is added to `connect-src`.                      |

**The banner** is Trix markup: `consent_wrap` with family-prefixed children,
Lumos prop order, project tokens only, its own `<style>` in
`@layer components`. Props: `layout` (`bar` | `card`), `theme`, `text`,
`policyHref`. It renders nothing visible until the runtime says
`activeUI === "banner"`, and renders the buttons
`resolveConsentPresentation` returns, in its order. It sits above any
third-party widget (`z-index` at the top of the scale), because widgets with
invisible wrappers have swallowed banner clicks before.

**The settings panel** reuses Trix's `Modal` (native `<dialog>`: focus trap,
Escape, focus returned to the opener) and `Choice` switches, one per category
from `policyRule.scope`, `necessary` shown as "Always on". Save records the
switches; Close records nothing.

**Gating.** Each third-party script moves from its own tag into the runtime's
scripts list with its category, or to `type="text/plain"` with
`data-c15t-category` where it must stay in markup. Embeds (YouTube, Maps) use
`data-src` and `data-category` so the iframe blocker holds them until
allowed. With Google Tag Manager, the `gtm.js` start event is pushed before
GTM loads — without it GTM loads but none of its tags fire — and a
`consent-update` event is pushed on every change.

**Motion.** Enter and exit animate with the project's motion tokens; with
reduced motion, both are instant. Exit waits for its animation before hiding.

### 4. Self-hosted backend (when chosen)

Scaffolded into `consent-api/` in the project repository, as its own
package — a site deploy never touches it.

| File                                 | What it is                                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consent-api/src/index.ts`           | `c15tInstance` per request, `dispose()` in `waitUntil`, `basePath: "/api/c15t"`, the region rules from step 2, `trustedOrigins` = the production, staging and preview origins |
| `consent-api/c15t-backend.config.ts` | The same config, read by the migration CLI                                                                                                                                    |
| `consent-api/wrangler.jsonc`         | `nodejs_compat`, the Hyperdrive binding, the stub aliases for unused drivers, a route on `consent.<domain>`                                                                   |
| `consent-api/package.json`           | `@c15t/backend`, `@effect/sql-pg` and `effect` at the versions the backend pins; scripts `dev`, `migrate:plan`, `migrate`, `deploy`, `check`                                  |

Setup, each outward-facing step confirmed with the developer first:

1. Create the Postgres database (Neon by default) in the chosen location.
2. Confirm its time zone is UTC (`SHOW timezone`); set it on the role if not.
3. `npm run migrate:plan`, review, `npm run migrate`.
4. Create the Hyperdrive config from the connection string; the string stays
   a secret, never committed.
5. Deploy, and attach `consent.<domain>`.
6. **Go-live check** (`npm run check`): `/status` and `/init` answer through
   the public URL, a test save returns a subject, `GET /subjects/:id` reads it
   back, the stored `givenAt` matches the save's within a second, and the
   site's origin passes CORS. Fails loudly on any step. If saves cannot work
   on the Worker at all, the fallback is the same config on a small Node
   service; the skill says so and stops for a decision.

### 5. Verify

`.agents/skills/trix-consent/verify.ts`, run against the production build:

- No request to any gated vendor before a choice.
- Reject all → still none, and the choice survives a reload.
- Accept all → each gated vendor loads; gated iframes get their `src`.
- Withdrawing a category from the settings panel reloads and the vendor stays
  gone.
- The banner and the open settings panel pass axe (WCAG 2.2 AA); Escape closes
  the panel and focus returns to the opener.
- Reject and Accept have the same size and emphasis.
- Nothing covers the banner's buttons (the element at each button's centre is
  the button).

### 6. Record

`PROJECT.md` gets a **Consent** section: region rules, where records go (and
the database location and why), the vendor → category table, ungated
exceptions with their reasons, design choices, the date of each. Plus two
standing rules for whoever comes next: consent records are legal evidence and
are never deleted once the site is live; changing categories or rules is a
decision for the owner, not an optimisation.

## Changes in the Trix repository

- `.agents/skills/trix-consent/`: `SKILL.md`, `templates/` (banner,
  `consent.ts`, the head script, `consent-api/`), `verify.ts`,
  `evals/evals.json`.
- `.claude/skills/trix-consent` → `../../.agents/skills/trix-consent`.
- `AGENTS.md` skills list and the docs site's agent-skills guide; a docs
  guide `guides/cookie-consent.mdx`.
- A test that copies the templates into a scratch copy of the framework,
  builds it in offline mode with a fake vendor script, and runs `verify.ts`,
  so the templates cannot rot unseen. Added to CI.
- `CHANGELOG.md` → Unreleased.

## Out of scope

- IAB TCF (ad-tech publisher consent strings).
- One shared consent service for several clients — the per-project question
  offers Inth or self-hosted instead.
- Server-side consent resolution (Trix sites are static).
- Banner copy in more than one language — a later addition when a project
  asks.
- Legal advice. The skill presents the trade-offs and records the owner's
  decisions; it does not decide them.

## Open items

- The first real self-hosted deploy confirms TLS to Neon and Hyperdrive on
  Cloudflare's network; the go-live check is built to catch either failing.
- Whether `Modal` and `Choice` can be driven by the runtime without changes is
  checked at the start of implementation; if not, the smallest change goes
  into those components rather than a parallel dialog.

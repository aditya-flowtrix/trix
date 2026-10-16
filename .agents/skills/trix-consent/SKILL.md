---
name: trix-consent
description: >-
  Add or change the site's cookie consent: a banner and settings panel in the
  site's own design, every third-party script and embed held until the
  visitor allows it, choices recorded in the browser, on Inth, or on a
  self-hosted backend (a Cloudflare Worker + Postgres, set up end to end).
  Built on c15t. Use when someone wants a cookie banner, GDPR or CCPA
  consent, Google Consent Mode, to gate analytics or ads, a "cookie
  settings" link, or to set up where consent records are kept.
---

# Cookie consent

A consent banner is a legal control, not decoration. This skill explains each
choice in plain words, asks for the requirements, builds the banner and the
gating, sets up where consent is recorded, proves nothing tracks before
consent, and writes every decision down.

It is finished when:

- `node .agents/skills/trix-consent/verify.ts` passes with every vendor named
- `npm run check` and `npm run build` pass
- for a self-hosted backend, `live-check.ts` passes against the live site
- `PROJECT.md` → **Consent** says what was decided, by whom, and when

The banner is the site's own Trix component. **c15t** is the engine: it
decides whether a banner shows and what may load. It runs headless, with no
React and none of its stock UI.

## 1. Read first

- `PROJECT.md` → **Consent**. If it is filled, this is a change to an existing
  setup. Apply only what changed, and never touch stored records.
- After installing, read c15t's own docs in `node_modules/@c15t/core/docs`
  (`frameworks/javascript/headless.md` first) and, when self-hosting,
  `node_modules/@c15t/backend/docs`. They match the installed version. v3
  renamed most of v2's API, so write from the docs, not from memory.

## 2. Explain, then ask: one question at a time

Each question says what it decides and offers the default. Write each answer
into `PROJECT.md` → **Consent** as it is given, with the date.

1. **Where the visitors are** decides the region rules. Default:
   - EEA, UK and Gibraltar are opt-in: nothing optional runs until the visitor
     accepts.
   - The US states with privacy laws are opt-out, and Global Privacy Control
     is honoured.
   - Everyone else is opt-in.
   - A visitor whose location is unknown gets the strictest rule.

   Countries can move between rules. Say that this is the owner's legal
   decision, not a technical one. With records kept in the browser only,
   there is no location, so everyone gets opt-in.

2. **Where consent is recorded.**
   - _Browser only._ No backend and no proof of consent. Say plainly that it
     is not for production.
   - _Inth_ (c15t's hosted service). The developer pastes the project's
     backend URL. The region rules are set on Inth, not here.
   - _Self-hosted_ (default). A Cloudflare Worker on the site's own account,
     with its own Postgres, built in step 4. Two follow-ups:
     - The database provider. Default: Neon.
     - Its location: EU jurisdiction, or nearest the visitors. **The location
       can only be chosen when the database is created**, so say so before
       creating it.

3. **What the site loads.** Find every third-party script and embed:
   - `<script` tags, especially `is:inline`, in `src/` and `public/`
   - `astro.config.mjs` integrations
   - `BaseHead` and the layouts
   - `<iframe` embeds (YouTube, Vimeo, Maps)
   - with a live site, every third-party request its homepage makes
   - the tags inside a Google Tag Manager container, from the container

   List them in a table: vendor, where it loads from, proposed category. The
   developer confirms each category. Anything the team wants to run
   regardless of consent is recorded under **Decisions** with its reason and
   who decided. It is never silently left ungated.

4. **Categories.** Only those something on the site uses, from c15t's set:
   `necessary`, `functionality`, `measurement`, `experience`, `marketing`.
   Each has a one-line description the developer can edit (the banner's
   `categories` prop).

5. **Google Consent Mode v2.** Ask only when a Google tag is present. Default:
   on, in basic mode. The `@c15t/integrations` helpers handle it:
   - `googleTagManager({ id, loadMode: "after-consent" })` holds GTM until
     measurement or marketing is allowed, then starts it with the visitor's
     consent state, the `gtm.js` start event (without it GTM loads but none
     of its tags fire), and an update on each later change.
   - `googleTag({ id, loadMode: "after-consent" })` does the same for gtag.js.
   - Advanced mode is the helpers' default (`loadMode` left out): Google's
     script loads for every visitor with every signal denied, so Google
     receives cookieless pings before any choice. That is an ungated
     exception: offer it only if the owner asks, record it under
     **Decisions**, and verify with `--allow www.googletagmanager.com`
     instead of its `--vendor`.
   - The tags inside the container are vendors too, and verify cannot see
     them. Google's own tags follow the consent signals. Every other tag (a
     Meta Pixel, LinkedIn Insight, Hotjar) either moves out of the container
     into `scripts`, through its `@c15t/integrations` helper where one
     exists, or gets GTM's **Additional consent checks** for its category:
     `analytics_storage` for measurement, `ad_storage` for marketing.
     Otherwise it fires as soon as the visitor allows Analytics alone. A
     container holding only analytics tags takes `category: "measurement"`.

6. **Design.**
   - Layout: `variant="card"` (bottom corner, the default) or `"bar"` (full
     width).
   - Theme: one of the project's `theme-*` classes.
   - Copy: the default `heading` and `text`, or the developer's own, plus
     the privacy policy link (`policyHref`).
   - "Reject all" is always as prominent as "Accept all": same size, same
     emphasis. Regulators treat a weaker reject as invalid consent. **This is
     not a design option**: if asked to weaken it, say why and offer to
     restyle both equally.

7. **Behaviour.** Defaults:
   - Settings switches start off.
   - A choice lasts 365 days.
   - Withdrawing a consent reloads the page, because a script that already
     ran cannot be un-run.
   - A "Cookie settings" link sits in the footer.

## 3. Build

Install the exact version the templates are tested with, and never mix c15t
versions:

```bash
npm install --save-exact @c15t/core@3.0.0
npm install --save-exact @c15t/integrations@3.0.0   # only with a vendor helper
```

1. **`src/consent.ts`**: copy `templates/consent.ts`.
   - `BACKEND_URL`: `null` (browser only), the Inth URL, or
     `https://consent.<domain>/api/c15t`.
   - `scripts`: every vendor from question 3, with its category. Use a helper
     from `@c15t/integrations` where one exists (its docs list 50+), or a
     plain `{ id, src, category }`:

     ```ts
     import { googleTagManager } from "@c15t/integrations/google-tag-manager";

     const scripts: Script[] = [
       googleTagManager({ id: "GTM-XXXXXXX", loadMode: "after-consent" }),
       {
         id: "vendor",
         src: "https://cdn.vendor.example/tag.js",
         category: "marketing",
       },
     ];
     ```

   - Remove each vendor's own tag wherever it was: `BaseHead`, layouts,
     pages, `astro.config.mjs`.

2. **`src/components/global/ConsentBanner.astro`**: copy
   `templates/ConsentBanner.astro`. Place it once in `BaseLayout`, after
   `<Footer />`, with the props from questions 4 and 6, so every page has it:
   under `<ClientRouter />` the banner and the panel move from page to page,
   and a page without them drops them until a reload. Keep its `popover`
   attribute: it puts the banner in the browser's top layer, above every
   third-party widget whatever its z-index.

3. **Footer**: in the footer's links list, using the footer's own link class:

   ```html
   <li hidden data-consent-open>
     <button
       type="button"
       class="footer_link"
       data-modal-open="consent-settings"
     >
       Cookie settings
     </button>
   </li>
   ```

   It shows once there are settings to open.

4. **Embeds**: `src` becomes `data-src`, plus the category. c15t fills `src`
   once that category is allowed. Give the space a styled placeholder:

   ```html
   <iframe
     data-src="https://www.youtube-nocookie.com/embed/ID"
     data-category="marketing"
     title="…"
   ></iframe>
   ```

5. **The Content Security Policy**, when `CSP` in `src/consts.ts` is on: add
   each vendor's origin to `scriptDirective.resources` in `astro.config.mjs`,
   keeping `'self'`, then open every page with **Accept all** chosen and the
   console open. A vendor that runs inline code is reported there — in Chrome,
   with the hash it needs, which goes in `scriptDirective.hashes`. That policy covers
   scripts, styles and fonts, so the backend needs no entry; a
   `Content-Security-Policy` in `public/_headers` is a second one — add the
   backend's origin to its `connect-src` and each vendor to its `script-src`.

Trix conventions apply: `consent_` classes, project tokens, the component's
own `<style>`.

## 4. A self-hosted backend

Copy `templates/consent-api/` to `consent-api/` at the project's root. It is
its own package, and a site deploy never touches it. Then edit:

- `wrangler.jsonc`: `name` (`<site>-consent`), the route
  (`consent.<domain>`), and the `SAVES` limiter's `namespace_id` if another
  limiter on the account already uses `1001`. The limiter caps each address
  at 20 saves a minute: `trustedOrigins` only stops browsers, and records are
  never deleted.
- `src/settings.ts`: `trustedOrigins` (production, www, staging) and the
  rules from question 1

Then run `cd consent-api && npm install`.

Confirm each outward-facing step with the developer before running it. Steps
that need an account or a password are the developer's to run.

1. **Create the database** in the chosen location (Neon by default). The
   location is permanent. If the Neon connector is available, use it, after
   confirming.
2. **Time zone.** Run `SHOW timezone;`. If it is not `UTC`, run
   `ALTER ROLE <role> SET timezone = 'UTC';` and reconnect. A non-UTC session
   shifts every stored time by its offset.
3. **Migrate.** Put the direct (not pooled) connection string in the shell as
   `DATABASE_URL`, never in a file. Run `npm run migrate:plan`, review it,
   then run `npm run migrate`.
4. **Hyperdrive.** Run
   `npx wrangler hyperdrive create <site>-consent --connection-string="$DATABASE_URL"`
   and put its id in `wrangler.jsonc`.
5. **Deploy.** Run `npm run deploy`. The route attaches `consent.<domain>`,
   which must be a domain on the same Cloudflare account.
6. **Go live.** Deploy the site with `BACKEND_URL` set, then run:

   ```bash
   node .agents/skills/trix-consent/live-check.ts --site https://www.<domain> --backend https://consent.<domain>/api/c15t
   ```

   Record the consent it saved. If saves cannot work on the Worker at all,
   the fallback is the same `settings.ts` on a small Node service
   (`c15tInstance` under Node). Stop and ask before building it.

For local backend work, `npm run dev` with `DATABASE_URL` in
`consent-api/.dev.vars` (ignored by git). The site's own `npm run dev` never
records: it runs offline.

## 5. Verify

```bash
npm run check && npm run build
node .agents/skills/trix-consent/verify.ts --vendor googletagmanager.com --vendor youtube-nocookie.com
```

- Name every gated vendor with `--vendor`.
- verify checks one page, `/` unless `--page` says otherwise. Run it again
  with `--page` for each page that loads something the homepage does not: a
  blog post with a video, a page with a map or a booking widget.
- `--allow <host>` is only for an exception recorded under **Decisions**.
- verify builds in offline mode into a temporary folder, so it never writes
  to the live record.

## 6. Record

Add to `PROJECT.md`, before **Decisions**:

```markdown
## Consent

- **Engine** — c15t 3.0.0, headless; `src/consent.ts`, `src/components/global/ConsentBanner.astro`
- **Region rules** — what applies where, who decided, the date
- **Records** — browser only / Inth (URL) / self-hosted at consent.<domain>, Postgres at <provider, region>, and why there
- **Vendors** — vendor · loads from · category · how it is gated
- **Ungated exceptions** — vendor, reason, who decided, the date (also under Decisions)
- **Design** — variant, theme, copy, policy link
- **Go-live check** — the date and the subject it saved

Consent records are legal evidence: never delete one once the site is live.
Changing categories or region rules is the owner's decision, not an optimisation.
```

## Later changes

- **A new vendor:** add it to `scripts` (or `data-src` for an embed), then
  re-run verify with its `--vendor`.
- **Upgrading c15t:** move every c15t package together, read the upgrade
  guide in its docs, run `migrate:plan` before `migrate`, then re-run
  verify and the go-live check.

## Without Claude Code

Every step is plain npm, editing and Node scripts.

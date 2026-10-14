---
name: trix-new-project
description: Start a new website from the Trix framework — copy it, stamp it, name it, set the domain, fonts and brand, and hand off to the style guide or migration skill. Use when the user wants to create a new project, start a site with Trix, clone or copy the framework for a client, or set up a fresh Astro site on Trix.
---

# Starting a project on Trix

A new project is a copy of Trix, stamped with the commit it came from so it
can be upgraded later, with the framework's placeholders replaced by the
project's own. It is finished when `npm run check` and `npm run build` pass,
`/style-guide` shows the project's brand, and `PROJECT.md` says what the
project is.

## 1. Copy

```bash
npx degit aditya-flowtrix/trix my-site
cd my-site
git init && npm install
```

(Or GitHub → **Use this template** on `aditya-flowtrix/trix`, then clone.)

## 2. Stamp

Record which Trix the project started from — `/trix-upgrade` merges against
this commit, and without it every upgrade is a guess.

```bash
git ls-remote https://github.com/aditya-flowtrix/trix HEAD
```

In `package.json`: set `name` to the project's, `version` to `0.1.0`, and add
`"created"` (today's date) and `"commit"` (the hash above) inside `trix`,
keeping `trix.version`. Remove `description` and `repository` (they describe
the framework) or replace them with the project's.

## 3. Name and domain

`src/consts.ts`:

- `SITE_NAME` — the brand name, as it should appear after every page title.
- `SITE_DESCRIPTION` — the default meta description.
- `SITE_URL` — the **production** origin. Canonicals, the sitemap and social
  images resolve against it; a placeholder here ships wrong canonicals.
- `SITE_LOCALE`, `COLOR_MODE` (`light`, `dark`, or `auto` for a site that
  follows the visitor's system and offers `ThemeToggle`).

`wrangler.jsonc` (or the host's config): the project's name and domain.

## 4. Record

Fill **Project** in `PROJECT.md`: name, owner, domain, hosting, the Trix stamp.
Then **Sources** for whatever this project starts from.

## 5. The design system

Choose by what exists:

| The project has                                                         | Run                                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| a live site to migrate (Webflow, Framer, WordPress, anything)           | `/trix-migrate` — it starts with `/trix-style-guide`                                            |
| a Figma design built on Trix's variables (`docs/design/figma-setup.md`) | `/trix-import-figma` — the fast path                                                            |
| a Figma design built any other way                                      | `/trix-import-figma`                                                                            |
| a site whose look must be matched but not migrated                      | `/trix-style-guide`                                                                             |
| nothing yet                                                             | give the designer `docs/design/README.md`; meanwhile set fonts and brand colors in `tokens.css` |

## 6. Brand and fonts

- **Fonts** — WOFF2 files in `src/assets/fonts/<family>/`, declared in
  `astro.config.mjs` (`fonts`, local provider, `unicodeRange` per subset,
  `fallbacks`), referenced by `--primary-family` / `--secondary-family`.
  Update the preload in `BaseHead` if the family's CSS variable changes.
- **Logo** — `src/assets/logo/logo.svg` and `logo-icon.svg`, `currentColor`.
- **Site icons** — `public/favicon.svg`, `favicon.ico` (32px),
  `apple-touch-icon.png` (180px PNG), `og-image.jpg` (1200×630).

## 7. Clear the demo

- `src/pages/index.astro` — the Trix placeholder; replace it with the
  project's homepage when the first slice is built.
- Keep `/style-guide` and `/components` (both `noindex`): they are the
  project's living documentation.
- `README.md` — replace with the project's own: what it is, how to run it,
  where it deploys. Keep a line saying it is built on Trix and which version.

## 8. Check

```bash
npm run check && npm run build
astro dev --background   # then open /style-guide
```

## Using this without Claude Code

Plain git, npm and editing. Only the automatic triggering and
`/trix-new-project` are Claude Code features.

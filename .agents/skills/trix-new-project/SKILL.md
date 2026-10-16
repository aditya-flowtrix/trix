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
npm create trix-astro@latest my-site
cd my-site
git init
```

The installer copies the latest Trix release (`-- --ref <tag|branch|commit>`
copies another), leaves out the framework's own
parts (its docs site, installer and dependency bots), names the project after the folder,
gives it its own README and `wrangler.jsonc`, installs dependencies, and
stamps `package.json` → `trix` with `version`, `commit` and `created` — what
`/trix-upgrade` merges against.

## 2. Check the stamp

```bash
node -p "require('./package.json').trix"
```

It should show `commit`, read from the download itself. If it doesn't, the
installer said so: every later upgrade becomes a guess, so add it by hand from
`git ls-remote https://github.com/aditya-flowtrix/trix <the tag it copied>`.

A project copied any other way (a clone, GitHub's **Use this template**) needs
by hand what the installer does: `name` and `version: "0.1.0"`, the stamp,
`description` and `repository` removed, and the framework's own parts gone —
`rm -rf site packages tests/create.ts tests/consent.ts tests/components.ts tests/scratch.ts tests/fixtures .github/dependabot.yml .github/workflows/dependabot-automerge.yml`, the `docs:*`, `test:create`,
`test:consent` and `test:components` scripts, and `npm uninstall @astrojs/mdx` unless the project writes MDX.

## 3. Name and domain

`src/consts.ts`:

- `SITE_NAME` — the brand name, as it should appear after every page title.
- `SITE_DESCRIPTION` — the default meta description.
- `SITE_URL` — the **production** origin. Canonicals, the sitemap and social
  images resolve against it; a placeholder here ships wrong canonicals, so
  the project's CI fails until it is set.
- `SITE_LOCALE` (the page language), `SITE_SOCIALS` (profile URLs for
  structured data), `COLOR_MODE` (`light`, `dark`, or `auto` for a site that
  follows the visitor's system and offers `ThemeToggle`), `CSP` (a Content
  Security Policy on every page — turn it on once each third-party script's
  origin is in `astro.config.mjs`).

`wrangler.jsonc` (or the host's config): the project's name and domain.
`public/_headers` already sets security headers and a year's caching for
fingerprinted assets; `public/_redirects` holds permanent redirects. Both work
on Cloudflare and Netlify; on another host, move them into its config.

## 4. Record

Fill **Project** in `PROJECT.md`: name, owner, domain, hosting, the Trix stamp.
Then **Sources** for whatever this project starts from.

## 5. The design system

Choose by what exists:

| The project has                                                         | Run                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| a live site to migrate (Webflow, Framer, WordPress, anything)           | `/trix-migrate` — it starts with `/trix-style-guide`                       |
| a Figma design built on Trix's variables (`docs/design/figma-setup.md`) | `/trix-import-figma` — the fast path                                       |
| a Figma design built any other way                                      | `/trix-import-figma`                                                       |
| a site whose look must be matched but not migrated                      | `/trix-style-guide`                                                        |
| a design direction but no file or site yet (fonts, colors, type)        | `/trix-design-system` — it asks; give the designer `docs/design/README.md` |

## 6. Brand and fonts

- **Fonts** — `/trix-design-system` → fonts: it asks for the files or where
  the font is hosted (Google, Adobe, Fontshare, any URL), configures
  `astro.config.mjs`, and measures the font's leading trim.
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
npx astro dev --background   # then open /style-guide
```

## Using this without Claude Code

Plain git, npm and editing. Only the automatic triggering and
`/trix-new-project` are Claude Code features.

# Trix

This is **Trix**, Flowtrix's design-ready Astro framework, styled with plain
CSS and custom properties. Do not apply conventions from other frameworks or
Webflow class systems (Client-First, `u-` utilities, Tailwind and the like).

Read in this order before changing anything:

1. [`PROJECT.md`](PROJECT.md) — this project's record: sources, decisions,
   what is still open. Write each decision into it the moment it is made.
2. [`TRIX.md`](TRIX.md) — how to build pages, components, styles and tokens.
3. The skill for the task, in `.agents/skills/`.

## Development

Start the dev server in background mode:

```
npx astro dev --background
```

Use `npx astro dev stop`, `npx astro dev status`, and `npx astro dev logs` to
manage it (`astro` alone is not on the shell's PATH). The site is at the URL
`npx astro dev status` prints — `http://localhost:4321` unless that port was
taken; the commands in the skills assume 4321.

- `npm run tokens` — regenerate everything derived from `src/styles/tokens.css`
  and `themes.css` (also runs on save while `astro dev` is running).
- `npm run check` — tokens in sync, conventions, `astro check`. Must pass.
- `npm run build` — must pass.

Never edit `src/styles/generated/`, `design/tokens/` or `docs/tokens.md`.

## The docs site

In the Trix repository, `site/` is the framework's documentation site, built
with Trix itself (`npm run docs:dev`, `npm run docs:build`). It renders the
components in `src/` directly, so a component change shows up there as it is.
When a component's behaviour, variants or props change, update its page in
`site/src/content/docs/components/` — the props table regenerates on its own,
the prose does not. The root `wrangler.jsonc` deploys it: Cloudflare runs
`npm run docs:build` and `npx wrangler deploy` on every push to `main`.
Projects created with `npm create trix-astro` have neither `site/` nor this
config — the installer writes them their own.

## Astro documentation

Use the relevant [Astro documentation](https://docs.astro.build) before working
on these areas:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Skills

Task-specific procedures live in `.agents/skills/<name>/SKILL.md`, alongside
any scripts they need. Measuring tools shared by several skills live in
`scripts/measure/`.

- `trix-build` — build pages, sections, components and styles the Trix way.
- `trix-new-project` — start a new site from Trix.
- `trix-style-guide` — build the design system from any source, measured and verified.
- `trix-migrate` — migrate a Webflow, Framer, WordPress or any other site.
- `trix-design-system` — set or change fonts, type, colors and other tokens, from a Figma style guide or by asking.
- `trix-import-figma` — build pages or tokens from a Figma file.
- `trix-cms` — move a CMS (Webflow, WordPress, Framer, CSV, any API) into content collections, or keep it headless.
- `trix-seo` — metadata, structured data, the SEO audit, migration parity and the launch handoff.
- `trix-consent` — add or change cookie consent: the banner, gated scripts, where consent is recorded.
- `trix-audit-props` — check prop order and tooltip consistency.
- `trix-scaling-graphic` — build an editable graphic that scales as one piece.
- `trix-upgrade` — upgrade a site to the latest Trix.

`.agents/skills/` is the source of truth. Claude Code loads the same skills from
relative symlinks in `.claude/skills/`. For each new skill, add
`.claude/skills/<name>` pointing to `../../.agents/skills/<name>`.

- Codex: use `$trix-style-guide` or ask for the skill by name. Restart Codex
  if a new skill does not appear.
- Claude Code: use `/trix-style-guide` or let it load the skill when relevant.
- Other assistants: read `SKILL.md` directly. Instructions are Markdown and
  scripts are Node.

# Trix

This is **Trix**, a design-ready Astro framework built on Lumos for Astro,
styled with plain CSS and custom properties. Do not apply conventions from
Lumos for Webflow, Mast, Client-First or Tailwind.

Read in this order before changing anything:

1. [`PROJECT.md`](PROJECT.md) — this project's record: sources, decisions,
   what is still open. Write each decision into it the moment it is made.
2. [`TRIX.md`](TRIX.md) — how to build pages, components, styles and tokens.
3. The skill for the task, in `.agents/skills/`.

## Development

Start the dev server in background mode:

```
astro dev --background
```

Use `astro dev stop`, `astro dev status`, and `astro dev logs` to manage it.

- `npm run tokens` — regenerate everything derived from `src/styles/tokens.css`
  and `themes.css` (also runs on save while `astro dev` is running).
- `npm run check` — tokens in sync, conventions, `astro check`. Must pass.
- `npm run build` — must pass.

Never edit `src/styles/generated/`, `design/tokens/` or `docs/tokens.md`.

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

- `trix-new-project` — start a new site from Trix.
- `trix-style-guide` — build the design system from any source, measured and verified.
- `trix-migrate` — migrate a Webflow, Framer, WordPress or any other site.
- `trix-design-system` — set or change fonts, type, colors and other tokens, from a Figma style guide or by asking.
- `trix-import-figma` — build pages or tokens from a Figma file.
- `trix-seo` — metadata, structured data, the SEO audit, migration parity and the launch handoff.
- `trix-audit-props` — check prop order and tooltip consistency.
- `trix-scaling-graphic` — build an editable graphic that scales as one piece.
- `trix-upgrade` — upgrade a site to the latest Trix; sync Trix with Lumos.

`.agents/skills/` is the source of truth. Claude Code loads the same skills from
relative symlinks in `.claude/skills/`. For each new skill, add
`.claude/skills/<name>` pointing to `../../.agents/skills/<name>`.

- Codex: use `$trix-style-guide` or ask for the skill by name. Restart Codex
  if a new skill does not appear.
- Claude Code: use `/trix-style-guide` or let it load the skill when relevant.
- Other assistants: read `SKILL.md` directly. Instructions are Markdown and
  scripts are Node.

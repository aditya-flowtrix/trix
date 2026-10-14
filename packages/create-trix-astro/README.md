# create-trix-astro

Start a new [Astro](https://astro.build) site from **Trix**, the design-ready
framework: Lumos's components and tokens, Mast's 12-column grid, one token
system shared with Figma, and agent skills that move existing sites onto it.

```sh
npm create trix-astro@latest my-site
cd my-site
npm run dev
```

The command copies Trix into `my-site` at one exact commit, names the project
after the folder, records which Trix it started from (so upgrades know what to
merge against), writes a Cloudflare config of its own, and installs
dependencies with whichever package manager you ran it with — `npm`, `pnpm`,
`yarn` or `bun`.

Run it without a directory name and it asks for one. `--no-install` skips the
install. Node 22.19 or newer.

## What you get

- **Layout** — `Section`, `Row` and `Col` on a 12-column grid, `Grid`,
  `ContentWrapper`, `ButtonWrapper`, `Spacer`
- **Content** — `Heading`, `Paragraph`, `Eyebrow`, `RichText`, `Button`, `Card`
- **Media** — `Img`, `Video`, `Icon`, `Overlay`
- **Interactive** — `Accordion`, `Tabs`, `Modal`, `Dropdown`, `Slider`,
  `Marquee`, `ThemeToggle`
- **Forms** — `Form`, `Fieldset`, `Input`, `Textarea`, `Select`, `Choice`, `Range`
- **Site** — `Nav`, `Footer`, `Breadcrumbs`, `SkipLink`, `BaseHead`, `JsonLd`

Fluid design tokens in one file, exported as Figma variables; four themes and
automatic dark mode; a style guide page; SEO, CMS migration and browser tests;
and agent skills for Claude Code and Codex.

## Documentation

[github.com/aditya-flowtrix/trix](https://github.com/aditya-flowtrix/trix)

## License

[MIT](https://github.com/aditya-flowtrix/trix/blob/main/LICENSE). Built on
[Lumos for Astro](https://github.com/lumosframework/lumos-for-astro) (MIT).

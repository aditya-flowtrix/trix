# Fonts

Fonts are always self-hosted: the browser never asks a third party for them,
which is faster (no extra connection) and keeps visitors' IP addresses away
from font CDNs. Astro's fonts API does the work — for hosted families it
downloads the files at build time and serves them from the site itself.

## 1. Ask

One question, before touching anything:

> Which fonts — for headings and for body text — and which weights and
> italics does the design use? For each one, either:
>
> - **upload the font files** (WOFF2 best; WOFF, TTF or OTF also work) — drop
>   them in the chat or give the folder path;
> - or tell me **where it is hosted**: Google Fonts, Adobe Fonts (with the
>   web project's kit ID), Fontshare, Bunny Fonts, Fontsource, or another URL.
>
> Is the font licensed for web use on this site?

## 2. What each answer means

| The answer                                                 | What happens                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Files uploaded**                                         | Copy them to `src/assets/fonts/<family>/` with any licence file. Local provider.                                                                                                                                                                                      |
| **Google Fonts**, **Fontsource**, **Bunny**, **Fontshare** | Nothing to download by hand: the provider fetches the files at build. Use the family name exactly as the service lists it.                                                                                                                                            |
| **Adobe Fonts**                                            | Needs the web project's kit ID (fonts.adobe.com → Web Projects). Adobe provider. Adobe licenses fonts per web project and domain: confirm its terms allow the files to be served from this site; if not, use Adobe's embed code in `BaseHead` instead and record why. |
| **An npm package** (`@fontsource/…`, a vendor package)     | `npm install` it; npm provider.                                                                                                                                                                                                                                       |
| **Another URL** (the client's CDN, the old site)           | Only once the owner confirms the licence covers this site: download the WOFF2 files its `@font-face` rules point at into `src/assets/fonts/<family>/`. Local provider.                                                                                                |
| **A commercial font, no files and no licence**             | Stop. Ask for the files or for a licence — never take a font from a site that serves it under its own licence.                                                                                                                                                        |
| **Not sure / no answer**                                   | Keep the current font and record the question in `PROJECT.md` → Still open.                                                                                                                                                                                           |

Prefer a **variable** font when the family has one: one file per style
covers every weight (`weight: "100 900"`). Static fonts are one file per
weight and style.

## 3. Configure `astro.config.mjs`

Each family is one entry in `fonts`. The `cssVariable` is how tokens refer
to it. **Put the body font first** — `BaseHead` loads every configured family
and preloads the first one's latin, upright file.

**Uploaded files** (local provider), split by `unicodeRange` the way Inter is:

```js
{
  name: "Söhne",
  cssVariable: "--font-sohne",
  provider: fontProviders.local(),
  fallbacks: ["Arial", "sans-serif"],
  options: {
    variants: [
      { weight: "400", style: "normal", src: ["./src/assets/fonts/sohne/sohne-regular.woff2"] },
      { weight: "600", style: "normal", src: ["./src/assets/fonts/sohne/sohne-semibold.woff2"] },
    ],
  },
},
```

**Hosted** (Google shown; `fontsource()`, `bunny()`, `fontshare()` take the
same fields; `adobe({ id: "kit-id" })` adds the kit; `npm()` for packages):

```js
{
  name: "Instrument Serif",
  cssVariable: "--font-instrument-serif",
  provider: fontProviders.google(),
  weights: [400],
  styles: ["normal", "italic"],
  subsets: ["latin"],
  fallbacks: ["Georgia", "serif"],
},
```

`fallbacks` matters: Astro builds a fallback face with the real font's
metrics from it, so text does not jump when the font arrives. Name a system
font of the same kind (serif for a serif).

Remove the family the new one replaces, and its files.

## 4. Point the tokens at it

```css
/* Typography — families */
--primary-family: var(--font-sohne, Arial, sans-serif);
--secondary-family: var(--font-instrument-serif, Georgia, serif);
```

`--primary-family` is the body font; `--secondary-family` is for headings
(`var(--primary-family)` when there is one family). Each text style picks one
in its `--*-font-family`. Weight tokens (`--primary-regular: 400` …) must
name weights the font actually has — remove the ones it lacks, add the ones
the design uses.

## 5. Measure the trim

Every text box is trimmed to cap height and baseline, as Figma's vertical
trim does. The amount depends on the font's metrics, so it is measured, not
copied:

```bash
node scripts/fonts.ts --url http://localhost:4321/style-guide --write
npm run tokens
```

It reads cap height, ascent and descent from the browser, writes
`--primary-trim-*` and — when headings use a different font —
`--secondary-trim-*`, pointing the heading styles at them. It refuses to
write if a family did not load (a wrong name or path): fix that first.

## 6. Check

`npm run check && npm run build` — a hosted family that does not exist
fails the build. Then `/style-guide` → Typography beside the designer's
specimen.

The designer uses the same family in Figma; `design/tokens/` carries the
family names in `font/family/*`.

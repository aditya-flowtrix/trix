---
name: trix-cms
description: >-
  Move a CMS into an Astro project — Webflow CMS, WordPress (posts, pages,
  custom post types, taxonomies, ACF, Yoast), Framer CMS, Wix, Squarespace,
  Ghost, Contentful, Sanity, Airtable, Notion, any CSV — as typed content
  collections with every image and file downloaded, or headless so editors
  keep their CMS. Use when a migration reaches its CMS, when someone asks to
  import, export, move, sync or convert blog posts, collections, products,
  team members or any CMS items into Astro, or wants to keep editing in
  Webflow or WordPress with an Astro front end.
---

# Moving a CMS into Trix

A CMS migration is finished when every published item is a page or an
entry on the new site, with the same content, the same URL (or a 301 to
its new one), and nothing loaded from the old platform. This skill gets
there with four commands and proves it with the last one.

```bash
node scripts/cms/import.ts <source> …      # read the CMS → .trix/cms/<source>.json (nothing changes yet)
node scripts/cms/write.ts --input …        # → src/content/, assets, schemas, redirects, pages
npx astro sync && npm run build
node scripts/cms/verify.ts --dist dist     # counts, schemas, no old URLs, a page per item
```

**The rule that outranks the rest: the CMS is the record, not the export
of a page.** Read items through the platform's API (or its full export),
never by scraping a template page — a list on a page shows one filter's
worth of items, the CMS has them all, drafts and references included.

## 0. Decide where the content lives

Ask the owner once, and write the answer in `PROJECT.md` → **CMS**:

|            | **Files** (default)                          | **Headless**                         |
| ---------- | -------------------------------------------- | ------------------------------------ |
| Content    | `src/content/<collection>/<slug>.md`, in git | stays in Webflow / WordPress         |
| Editors    | edit files (or a git-based editor, later)    | keep their CMS                       |
| Images     | downloaded, optimised at build               | on the CMS's CDN, optimised at build |
| Publishing | a commit                                     | a CMS publish + deploy hook          |
| Cost       | the CMS can be cancelled                     | the CMS plan stays                   |
| Command    | `write.ts`                                   | `write.ts --headless`                |

Both use the same importers and the same schemas, so a project can start
headless and move to files later (or back) without touching a page.

## 1. Inventory

From the platform, not the pages:

- **Every collection**, its fields and their types, its item count
  (published, drafts, archived).
- **Which collections have pages** (template pages: Webflow's
  `detail_<collection>.html` in the export, WordPress's permalinks) and
  their old URL prefix.
- **Every list on the site**: which collection, filters, sort, limit —
  these live in the Designer or theme, not in the API. Write each into
  `PROJECT.md`.
- **References between collections** — they decide the import order and
  the schemas.
- **Locales** — a multi-language CMS is one import per locale.

## 2. Import

Per platform — [Webflow](references/webflow.md),
[WordPress](references/wordpress.md), [Framer and CSV](references/framer-csv.md),
[anything else](references/other.md).

```bash
node scripts/cms/import.ts webflow --site <id>                 # WEBFLOW_TOKEN in the environment
node scripts/cms/import.ts webflow --json export.json          # saved from the Webflow MCP connector
node scripts/cms/import.ts wordpress --url https://example.com # WP_APP_PASSWORD (+ --user) adds drafts
node scripts/cms/import.ts csv --file blog.csv --collection blog --route /blog --refs "Author:authors"
node scripts/cms/import.ts json --file normalized.json         # any other CMS, in the common shape
```

Tokens and passwords come only from the environment, never arguments.
Drafts are left out unless `--drafts`; archived items always are.

**Read the table it prints.** Every field with its type; the body field;
every warning. Typical questions for the owner, all in one message:

- a field the inference typed wrongly (`--types "Video:video"`),
- a CSV column of slugs that is really a reference (`--refs`),
- references to a collection that is not being moved,
- drafts: leave out, or bring as `draft: true`.

## 3. Write

```bash
node scripts/cms/write.ts --input .trix/cms/webflow.json \
  --route blog=/blog,technology=/products \
  --scaffold --demote-headings --host old-domain.com
```

| Option                     | Does                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--route key=/prefix`      | the new URL prefix of each collection that has pages; an item whose old URL differs gets a 301 in `public/_redirects`, and rich-text links to it are rewritten to the new path           |
| `--scaffold`               | creates `src/pages/<prefix>/[slug].astro` (title, SEO, Article and breadcrumb data, image, body) for each routed collection that has none — a start, which the page design then replaces |
| `--demote-headings`        | in bodies that contain an `<h1>`, every heading moves down one: the page's title is its h1                                                                                               |
| `--host domain`            | also downloads files the rich text and link fields point at on the old site's own domain (PDFs, documents)                                                                               |
| `--only a,b`               | a subset of collections                                                                                                                                                                  |
| `--headless` (`--offline`) | no files: collections read the CMS at build through `cmsLoader` (or the saved export)                                                                                                    |

What it writes:

- One Markdown file per item. Fields are frontmatter (JSON values — exact,
  quotes and all); the main rich text is the body, kept as HTML on one line
  per block so Markdown never reinterprets a character.
- Image fields → `src/assets/cms/<collection>/` (Astro optimises them); files
  and images inside rich text → `public/cms/<collection>/`. Only the CMS's
  own hosts are downloaded, never a third party's.
- `src/content/collections.ts` — a zod schema per collection: references are
  `reference()`, options are enums, dates are dates, images are `image()`.
- `src/content.config.ts` — created, or told to include `cmsCollections`.
- Platform markup removed: Webflow's `w-` classes and `data-rt-*`,
  WordPress's block classes, Jetpack's image hints.

Run it again after the CMS changes (a content freeze before cutover):
items deleted in the CMS are removed, nothing it did not write is touched.
Collections written by earlier runs — another CSV, another source — stay
referenceable.

## 4. Pages

Each routed collection needs its `[slug].astro`; lists use
`getCollection()` with the filters and sorts recorded in step 1:

```astro
const posts = (await getCollection("blog", ({data}) => !data.draft)) .sort((a,
b) => +(b.data.date ?? 0) - +(a.data.date ?? 0)) .slice(0, 3);
```

References resolve with `getEntry(entry.data.author)` or
`getEntries(entry.data.topics)`. The body renders with
`const { Content } = await render(entry)` inside `<RichText>`. Structured
data comes from `@/utils/schema.ts` (`/trix-seo`).

## 5. Verify

```bash
npx astro sync && npm run build
node scripts/cms/verify.ts --dist dist --old-host old-domain.com
```

- every imported item has its file, every file its item;
- Astro accepts every file against its schema;
- nothing loads from the old CMS or site — no image or file left on its CDN,
  every local asset exists;
- every item of a routed collection has its page, with its title;
- links into the old domain are listed — point them at new pages or redirect.

Then `/trix-seo`'s parity check from the live old site to staging: every
old item URL answers, with its title and description.

## 6. Report

- **Collections** — each with its item count (source → written), route,
  and whether it is files or headless.
- **Decisions** — every answer from step 2 and the lists from step 1.
- **Redirects** — how many, and why (a route changed, a slug changed).
- **Still open** — fields left out, references to collections not moved,
  links into the old domain.

## Using this without Claude Code

Every step is a Node script; only the Webflow MCP export is an assistant
feature (with a token, `import.ts webflow --site` reads the API directly).

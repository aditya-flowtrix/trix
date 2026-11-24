# Into a new headless CMS

Webflow — or anything `import.ts` reads — into Sanity, EmDash, Storyblok,
Contentful, Payload, Strapi, Hygraph, ButterCMS, BCMS or any CMS with a write
API, with the Astro site reading it. Sanity is built in and the worked
example; every rule holds for the others, only the two ends change (§11).

**The import is the same; only the last step changes.** `import.ts` already
reads Webflow correctly: every collection, option names instead of option ids,
references across collections, drafts and archived items told apart,
pagination and rate limits handled. Its output, `.trix/cms/webflow.json` — the
common shape, `src/utils/cms/model.ts` — is the hand-off. The converter into
the new CMS reads that file, never Webflow, so it is reviewed before anything
is created and re-run without touching Webflow again.

```
import.ts ─▶ .trix/cms/webflow.json ─▶ convert.ts ─▶ the CMS's import file ─▶ its importer ─▶ staging
                (the common shape)                                                         ─▶ production
Astro build ◀── cmsLoader: the CMS back into the common shape ◀── production
```

Every CMS is two adapters around the common shape: a **converter** into the
CMS's import format, and a **reader** back out of its API. The reader gives
the site the same entries files mode and every other source give, so pages,
lists, `getEntry()` and `<RichText>` never change with the CMS. For Sanity
both exist:

| Step      | Sanity                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| Convert   | `node scripts/cms/convert.ts sanity` → `sanity.ndjson` and the Studio schema |
| Import    | Sanity's own CLI: `sanity datasets import`                                   |
| Check     | `convert.ts sanity --check`: the dataset against the source, item by item    |
| Read      | `cmsLoader({ source: "sanity" })`, written by `write.ts --headless --sanity` |
| Rich text | Portable Text both ways — `html-to-portable-text.ts`, `portable-text.ts`     |

## 1. Decide, and write it in `PROJECT.md`

Ask the owner in one message, record each answer under **Migration → CMS**:

- **Which CMS, which plan, whose account.** The account and its tokens belong
  to the owner. Record the project and dataset (space, environment) names.
  Sanity is built in; any other CMS costs its two adapters first (§11).
  EmDash lives inside the Astro site and makes it server-rendered — a
  different site, not only a different CMS.
- **What editors change.** Collections always. Navigation, footer and site
  settings: a settings document, or code. Static pages: code by default, or a
  page builder (§4).
- **Model changes** — the list from §2, each one approved.
- **Drafts** — leave out (default), or bring them across as drafts.
- **Locales** — one Webflow read per locale (`cmsLocaleId`). Choose the new
  CMS's localisation model first (Sanity: a document per locale, or a field
  per locale), then import into it.
- **The content freeze** — the date Webflow stops being edited. Before it,
  Webflow is the record and the import runs as often as needed; after it, the
  new CMS is the record (§10).
- **Where the Studio lives** (Sanity) — a `studio/` folder with its own
  `package.json`, deployed with `sanity deploy`, so the site's dependencies
  stay the site's.

## 2. Review the model before copying it

Webflow's CMS forces workarounds. Files mode keeps them, because a 1:1 copy is
what makes parity exact. A new CMS is where editors will work for years: fix
them here. Read the table `import.ts` prints, flag each pattern, propose the
change, and make only the ones the owner approves.

| In Webflow                                                                  | In the new CMS                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A collection with no page of its own, used by one parent (FAQ items, steps) | an array of objects inside the parent                                                        |
| Numbered fields — `step-1-title`, `step-2-title`                            | an array                                                                                     |
| A list in one text field — `a \| b \| c`                                    | an array of strings                                                                          |
| Rich text holding structure (a table, a quote with its author, a CTA)       | a custom block type in the rich text                                                         |
| Copies of one value — `name`, `name-short`, `nav-label`                     | the one field, derived in the query; a second field only where editors write a different one |
| Several switches that are one state — `featured`, `hidden`, `new`           | one option field; switches only for states that combine                                      |
| A collection that is only a list of names, with no page and no other fields | an option field — a reference if it has content or a page                                    |
| A stored path — `url: /tags/design` beside `slug: design`                   | dropped, built from the slug                                                                 |
| The same SEO fields on every collection                                     | one shared `seo` object                                                                      |

The converter makes every change, one line each, so a re-run makes it again.
A slug that changes is a redirect (§8).

## 3. IDs, references and keys

- **Every document's ID comes from the source item's id**:
  `<type>-<webflow item id>`, like `post-6650c2a1f0e1b2c3d4e5f607`. The same
  item gets the same ID on every run, so a re-run updates instead of
  duplicating, and every reference is known before anything is written — no id
  map, no second lookup. Never random UUIDs.
- **References** in the common shape are the target item's slug; the converter
  turns each into the target's ID through that collection's items.
- **Singletons get fixed IDs** — `siteSettings`, `navigation-main`.
- **Sanity: no dots in IDs.** IDs are up to 128 of `a-zA-Z0-9._-`, and a dot
  makes a document private: `settings.global` is invisible to a build without
  a token, even on a public dataset. Drafts are the one dot on purpose:
  `drafts.post-…`.
- **Circular references** (related posts) need references written weak, then
  made strong once every document exists. `sanity datasets import` does both
  itself; a script on the write API writes `_weak: true` in a first pass and
  removes it in a second.
- **Every array item has a `_key`** (Sanity), unique in its array and the same
  on every run: the referenced ID, the asset URL, the slug — never the index,
  never random. The API does not add them, and Studio cannot edit an array
  without them.

## 4. Pages, navigation and settings

**Static pages stay in code by default** — Astro pages built from the
project's Trix sections. Most marketing pages change a few times a year; a
page builder is a second design system to keep in step with the first.

When editors must change pages themselves:

- **A page builder whose section types are the site's Trix sections** — one
  schema object per section component, its fields the component's props. Not
  Webflow's components: they are what the migration replaced. A page is
  `title`, `slug`, `seo`, `sections[]`; its template renders each section's
  `_type` with its component.
- **A page with a layout of its own** (pricing, contact) is one singleton,
  holding only the fields that layout reads.
- **Their content** comes from Webflow's page content API (`get_page_content`,
  or `GET /v2/pages/{page_id}/dom`): text, images, and component instances
  with their `propertyOverrides`, merged over the component's defaults —
  `trix-migrate`'s Webflow reference joins the three calls. Map each component
  to a section type; nav, footer and other chrome map to nothing.
- **Navigation and footer**, if editors change them: a `navigation` document
  per menu — items of a label, an internal reference or an external URL, and
  children. Webflow's CMS-driven dropdowns are empty in the export; read them
  from their collection.
- **Site settings**: name, default description, default social image, social
  links. Never analytics ids, API keys or third-party tokens — those are
  environment variables and `/trix-consent`, or a CMS publish can break
  tracking.

**SEO of collection pages.** Webflow binds a template page's title and
description to fields in the Designer (page settings, or the Pages API's `seo`
and `openGraph` on the page whose `collectionId` is the collection). Do what
Webflow did: leave the item's `seo` empty and derive it in the Astro template
from the same fields, with `seo` as an editor's override. Copy a value into
`seo` only where the item had its own.

## 5. Assets

- **Every image and file goes into the new CMS's asset store.** Webflow's CDN
  belongs to the Webflow site; nothing guarantees it after the site is
  unpublished or the plan lapses. Look in image fields, file fields and inside
  rich text, on every Webflow host — `cdn.prod.website-files.com`,
  `uploads-ssl.webflow.com`, `assets-global.website-files.com`,
  `assets.website-files.com` — and the old site's own documents (PDFs linked
  from rich text).
- **Alt text comes too**: the image field's `alt` and each `<img alt>` in rich
  text.
- **Sanity**: in the import file an image is
  `{ "_type": "image", "_sanityAsset": "image@<url>", "alt": "…" }` and a file
  `{ "_type": "file", "_sanityAsset": "file@<url>" }`. The importer downloads
  each once, de-duplicates by content and uploads. Through the client instead,
  `client.assets.upload(type, buffer, { filename, source: { name: "webflow", id: url } })`
  keeps the origin of every asset.

## 6. Rich text

Convert to the CMS's own format **once, at import** — never at render.

- **Sample first.** Read the bodies of the richest collection and list every
  pattern in them; write one rule per pattern before converting the rest.
- **A pattern without a rule is lost, silently.** With no rule, a Webflow
  image figure is dropped and its caption becomes a paragraph, an embed
  disappears, and a heading style the schema does not list becomes a plain
  paragraph. Nothing warns.
- **Rules run on the raw HTML** in `.trix/cms/webflow.json` — they need
  Webflow's `data-rt-type` and `w-embed` markers. Then `stripPlatformMarkup()`
  (`src/utils/cms/model.ts`) cleans what they keep, as files mode does.
- **Portable Text** (Sanity, EmDash): `htmlToBlocks()` in
  `scripts/cms/html-to-portable-text.ts` has a rule for every pattern below,
  built on `@portabletext/html` with jsdom (not `@sanity/block-tools`: renamed
  to `@portabletext/block-tools`, the old package gets no updates). Its
  `BLOCK_CONTENT` is the block content the generated Studio schema allows; a
  style or mark added to one is added to the other. A new pattern Webflow
  bodies hold is a new rule there, with a check in `tests/cms.ts`.
- **HTML** (ButterCMS WYSIWYG fields, WordPress): the body as it is, after
  `stripPlatformMarkup()`.
- **Anything else** (Contentful Rich Text, Storyblok, Lexical, Strapi Blocks):
  that CMS's own converter from HTML, held to the same table and the same
  count.

| Webflow rich text                                               | Becomes                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `<figure data-rt-type="image">` with `<img>` and `<figcaption>` | an image block with alt and caption                                       |
| a bare `<img>`                                                  | an image block (Portable Text images are blocks, never inline)            |
| `<figure data-rt-type="video">` (an embedded iframe)            | an embed block holding the iframe                                         |
| `<div class="w-embed">`                                         | an embed block holding the HTML, its `<script>`s kept                     |
| `<pre><code class="language-x">`                                | a code block with its language                                            |
| `<table>`                                                       | an embed block holding the table (no table type until editors need one)   |
| `<a href>` to a migrated item, on any of the old site's hosts   | an internal link: a reference to that document's ID                       |
| external, `mailto:`, `tel:` and `#` links                       | links as they are                                                         |
| an `<h1>` inside a body                                         | an `h2`, and every heading below it one down — the page's title is its h1 |
| an empty paragraph (Webflow keeps a zero-width joiner)          | nothing                                                                   |

- **Internal links resolve in the same run**: the map from each item's
  `oldPath` to its document ID comes from the common shape itself. Links on
  the old domain count as internal only with `--host old-site.com`.
- **Counted, every run**: images, embeds and code blocks in each source body
  against the blocks after conversion. `convert.ts` prints both per type and
  exits 1, naming the item, when any is lost.
- **An embed block renders whatever HTML is in it.** Allow it only for the
  editors who need it, or remove the type once no document uses it.

## 7. Import

- **Staging first** — a `staging` dataset (space, environment). Production is
  written only after §8 passes, by running the same import into it: the IDs
  make it identical.
- **Two tokens, both from the environment.** One that writes, for the
  migration only (Sanity's CLI reads `SANITY_IMPORT_TOKEN`), revoked at
  cutover; one that reads, for the build (`SANITY_READ_TOKEN`) — none if the
  dataset is public. Never committed, never an argument.
- **Webhooks off while importing.** Every document written fires them — one
  deploy per document.
- **Small first**: one collection, 10–20 items, checked in Studio beside the
  live page. Then everything.

**Sanity.** Convert, with the old domain so links to it become internal ones,
and the schema written straight into the Studio:

```bash
node scripts/cms/convert.ts sanity --input .trix/cms/webflow.json --host old-site.com --schema studio/schemaTypes/migrated.ts
```

It prints documents, assets and the rich-text count per type, every warning,
and exits 1 if rich text lost anything. Add `migratedTypes` from the schema
file to the Studio's `schema.types`; edit the types there afterwards as any
Studio schema — the converter only writes it again when it runs again.

`.trix/cms/sanity.ndjson` holds a document per line:

```json
{"_id":"post-6650c2a1f0e1b2c3d4e5f607","_type":"post","title":"Hello","slug":{"_type":"slug","current":"hello"},"publishedAt":"2025-01-01T00:00:00Z","author":{"_type":"reference","_ref":"author-6650c2b7aa01b2c3d4e5f608"},"tags":[{"_type":"reference","_ref":"tag-6650c2c9bb02b2c3d4e5f609","_key":"tag-6650c2c9bb02b2c3d4e5f609"}],"cover":{"_type":"image","_sanityAsset":"image@https://cdn.prod.website-files.com/…/cover.jpg","alt":"…"},"body":[…]}
```

| Common shape (`model.ts`)                  | Sanity                                                              |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `title`, `slug`                            | `title`, `slug: { _type: "slug", current }`                         |
| `text`, `email`, `phone`, `color`, `video` | string (`url` for links and videos)                                 |
| `richtext`, the body                       | Portable Text (§6)                                                  |
| `image`, `images`                          | `image` with `_sanityAsset` and `alt`; an array of them, each keyed |
| `file`                                     | `file` with `_sanityAsset`                                          |
| `number`, `boolean`, `date`                | number, boolean, ISO datetime                                       |
| `option`                                   | string with `options.list`                                          |
| `reference`, `references`                  | `{ _type: "reference", _ref }`; an array of them, `_key` = `_ref`   |
| `published`, `seo`                         | `publishedAt`, the shared `seo` object                              |
| a field that only repeats the item's SEO   | left out — the `seo` object holds it                                |
| `draft: true` (if drafts are kept)         | `_id: "drafts.<id>"`                                                |
| a reference to a draft                     | weak, with `_strengthenOnPublish` — strong once it is published     |

Each `_type` is the `name` of a type in the Studio schema. The API does not
check documents against that schema, so check the file first, from the
Studio's folder — a document that breaks a rule imports fine and then cannot
be published once an editor touches it. The one error it reports by design is
a published document referring to a draft (`Referenced document must be
published`): the converter's warnings name each, and it clears when the
draft is published.

```bash
npx sanity@latest documents validate --file ../.trix/cms/sanity.ndjson --level error   # in studio/
npx sanity@latest datasets import .trix/cms/sanity.ndjson -p <project id> -d staging --replace
```

`--replace` makes a re-run update every document. The importer uploads the
assets and writes references weak, then strong; a reference to a document that
is not there fails the import — fix the converter, never weaken the
reference. `--allow-failing-assets` only for an image known to be broken,
named in the report.

**Other CMSs** use their own bulk import where one exists, otherwise their
write API within its rate limits — same IDs, same order (assets, documents,
references), same checks. §11 has each one's import and rich text.

## 8. Verify — in the CMS, then on the site

In the CMS, after every import — staging, then production:

```bash
node scripts/cms/convert.ts sanity --input .trix/cms/webflow.json --check <project id>/staging
```

It reads the dataset back as the build does (published documents, through
`fetchSanity`) and compares it with the source, item by item, in
`.trix/cms/sanity-check.md`. It fails on an item missing, or one of a migrated
type that is not in the source (deleted in Webflow since an earlier run, §10);
a title or SEO title, description or image that differs; a field that had a
value and has none — an asset that failed to upload, a reference that did not
resolve; a rich-text image that did not arrive; any URL left on the old CMS.
Fields the converter leaves out on purpose (SEO-only ones) are not counted
as lost.

What it does not read, check by hand (Sanity's GROQ in Studio's Vision tool,
or `npx sanity@latest documents query` — the CLI commands here take
`-p <project id>` outside `studio/`):

- **Documents without a slug** — site settings, navigation, page-builder
  pages. Export the dataset without its assets and search all of it for the
  old CMS; the asset documents are left out, since they record where each
  file came from:

  ```bash
  npx sanity@latest datasets export staging .trix/cms/staging.tar.gz --no-assets
  tar -xzOf .trix/cms/staging.tar.gz | grep -v '"_type":"sanity\.' | grep -cE 'website-files\.com|webflow\.(com|io)'   # 0
  ```

- **The build can read what it needs.** On a public dataset, run `--check`
  with no `SANITY_READ_TOKEN` set; then each singleton, as the build will:
  `npx sanity@latest documents query '*[_id == "siteSettings"][0]._id' -d staging --anonymous`.
- **Studio**: 10–20 items per collection beside their live pages —
  references show titles, images and captions render, internal links open the
  right document, embeds hold their HTML.

On the site, after `npm run build`:

```bash
node scripts/seo/parity.ts --old https://old-domain.com --new https://staging.example.com
```

Every old URL answers, with its title and description. A collection whose
route changes gets one rule in `public/_redirects` (`/posts/* /blog/:splat 301`);
a slug that changed gets its own line.

## 9. The Astro side

The site reads the CMS at build through `cmsLoader`, which turns its
documents back into the common shape: the entries files mode writes, with the
body as HTML. Pages, lists, `getEntry()`, `render(entry)` and `<RichText>` are
exactly as they are in files mode, and moving between files and the CMS never
touches a page.

```bash
node scripts/cms/write.ts --input .trix/cms/webflow.json --headless --sanity <project id>/production --route posts=/blog
```

writes, per collection, into `src/content/collections.ts`:

```ts
loader: cmsLoader({
  source: "sanity",
  projectId: "<project id>",
  dataset: "production",
  routes: { posts: "/blog", authors: "/authors" },
  collection: "posts",
}),
```

- **What it reads**: every published document with a slug, through the HTTP
  API, `perspective=published`. A slug is its string, a reference its
  target's slug (so `reference("authors")` works), an image `{ url, alt }` on
  Sanity's CDN, Portable Text HTML. An internal link becomes the target's
  route and slug — `routes` says each type's prefix.
- **A private dataset**: `SANITY_READ_TOKEN` in the build's environment, a
  viewer token. None for a public dataset.
- **Images** stay on Sanity's CDN: `--sanity` adds `cdn.sanity.io` to
  `image.domains` in `astro.config.mjs`, so Astro optimises them.
- **Publishing**: a webhook in the CMS on create, update and delete of the
  routed types — published documents only, which is Sanity's default — calls
  the host's deploy hook. Record both in `PROJECT.md`.
- **Preview of drafts** needs a server-rendered preview deployment (Sanity's
  Presentation tool with `@sanity/astro`); a static build shows published
  content only. Agree it with the owner as its own piece of work.
- **Redirects, sitemap, robots**: unchanged — `public/_redirects` and
  `@astrojs/sitemap`, `/trix-seo`.

## 10. Cutover

1. Until the content freeze, Webflow is the record: re-run import →
   converter → importer whenever it changes. Every step is idempotent.
2. At the freeze: the last run, into production. Items deleted in Webflow
   since the previous run are deleted in the CMS too — the documents whose ID
   has a migrated type's prefix and no item in the source. List them, confirm,
   then delete.
3. From then on the new CMS is the record. **Never re-import after editors
   start**: `--replace` overwrites their work. A fix is a patch to the
   documents concerned.
4. Revoke the write token. Turn the webhooks on.
5. `/trix-seo`'s launch checklist: redirects, DNS, Search Console, the 404
   watch. Keep the Webflow site published on its `webflow.io` address for two
   weeks after DNS moves, as the reference for anything that looks wrong; then
   cancel the plan.

## 11. Another CMS

Every CMS is the same two adapters around the common shape, each about the
size of Sanity's:

- **A converter**, `scripts/cms/to-<cms>.ts`: the common shape into the
  CMS's import file, by §3–§6 — IDs from the source IDs, every asset by URL,
  references resolved in the same run, rich text converted and counted. A
  target in `scripts/cms/convert.ts`. It runs only during the migration, so
  it lives in `scripts/`, and the libraries it needs (jsdom, a rich-text
  converter) are dev dependencies.
- **A reader**, `fetch<Cms>()` in `src/utils/cms/<cms>.ts`: its API back into
  the common shape. A `source` in `cmsLoader`, an option in
  `write.ts --headless`. It runs in every build, so it is `src/` code: fetch,
  and no library but one that renders the CMS's rich text, named in
  `scripts/conventions.ts`'s list of what Trix uses.
- **The check**: the reader's output against the source through
  `compareCms()` (`scripts/cms/compare.ts`), as `convert.ts sanity --check`
  does — every CMS gets §8's comparison for free once it has a reader.
- **Tests** in `tests/cms.ts`: the fixture through the converter, then back
  through the reader by a simulated import, equal to what files mode writes
  and passing the check.

Until a CMS has its adapters, the steps still hold: a converter written in the
project to the same rules, and the CMS's own Astro loader or SDK for the
pages. Confirm each one's import and API against its current docs:

| CMS        | Import with                                               | Rich text                        | The site reads it with                       |
| ---------- | --------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| Sanity     | `convert.ts sanity`, then `sanity datasets import`        | Portable Text — built in         | `cmsLoader({ source: "sanity" })` — built in |
| EmDash     | `emdash seed` (local), `emdash content create` (deployed) | Portable Text — `htmlToBlocks()` | itself, in the same project (below)          |
| Contentful | `contentful space import` (its export JSON)               | Contentful Rich Text JSON        | the Content Delivery API                     |
| Storyblok  | the Management API                                        | Storyblok rich text JSON         | the Content Delivery API                     |
| Payload    | the Local API or REST                                     | Lexical (its HTML converters)    | REST, or the Local API                       |
| Strapi     | the REST API or the Document Service                      | Blocks JSON, or Markdown         | the REST API                                 |
| ButterCMS  | the Write API (enabled per account)                       | HTML in WYSIWYG fields, as it is | the Read API                                 |
| BCMS       | the hosted service's API or MCP server                    | its own JSON — check its docs    | its API                                      |

"BetterCMS" is not a current product: the name usually means ButterCMS or
BCMS (thebcms.com). BCMS's open-source edition is no longer maintained — the
hosted service is the product.

### EmDash

Astro itself has no CMS. EmDash is Cloudflare's, built on Astro (Astro's team
joined Cloudflare in January 2026), open source. It is not headless in the
same way: it is an Astro integration inside the site, its admin at
`/_emdash/admin`, its content in D1 and R2 on Cloudflare (SQLite, libSQL or
Postgres on Node).

- **The site becomes server-rendered** — `output: "server"`, a request per
  page view instead of a build per publish. Record it in `PROJECT.md` as the
  owner's decision; it is the main cost.
- **Content types** are made in the admin or a seed file, not in code;
  `npx emdash types` writes their TypeScript types.
- **Rich text** is Portable Text: `htmlToBlocks()` converts the bodies, the
  same rules and count as for Sanity. Map its image blocks to EmDash's image
  value.
- **Import**: locally, a seed file run by `npx emdash seed`, whose `$media`
  entries fetch each image by URL; into a deployed site,
  `npx emdash content create <collection> --file item.json` per item, with
  `EMDASH_URL` and `EMDASH_TOKEN` in the environment (`--draft` for drafts).
- **No loader**: pages read with `getEmDashCollection()` and
  `getEmDashEntry()` from `"emdash"`, so every page that lists or shows CMS
  content changes from `getCollection()`. The redirects, the SEO parity check
  and §8's counts are unchanged.

## If you are following Sanity's course

Sanity's [Migrating from Webflow to Sanity](https://www.sanity.io/learn/course/migrating-content-from-webflow-to-sanity)
is a good map. Where it and this reference differ, this reference wins:

| The course                                        | Here                                           | Why                                                          |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| new scripts read Webflow                          | `import.ts`                                    | it already reads options, references, drafts, pages of items |
| `@sanity/block-tools` and rules per project       | `convert.ts sanity`                            | renamed, no updates; the converter has a rule per pattern    |
| a GROQ query per page                             | `cmsLoader({ source: "sanity" })`              | pages stay as they are in files mode                         |
| `uuid()` IDs on the large-import path             | `<type>-<webflow id>` on every path            | a re-run must update, not duplicate                          |
| `settings.global`, `navigationMenu.main-nav`      | `siteSettings`, `navigation-main`              | a dot makes a document private                               |
| a hand-written two-pass import with `id-map.json` | deterministic IDs and `sanity datasets import` | the importer uploads assets and strengthens references       |
| reference arrays without `_key`                   | a stable `_key` on every array item            | Studio cannot edit an array without them                     |
| every page a page-builder document                | pages in code unless editors must change them  | a page builder is a second design system                     |
| Next.js, `vercel.json`, `next-sitemap`            | Astro, `public/_redirects`, `@astrojs/sitemap` | Trix's stack                                                 |

# Webflow CMS

## Reading it

Three ways, all giving the same result:

1. **Data API v2 with a site token** — Site settings → Apps & integrations →
   API access → generate a token with CMS read access.

   ```bash
   WEBFLOW_TOKEN=… node scripts/cms/import.ts webflow --site <site id> [--drafts] \
     [--locale fr-FR] [--seo-from https://www.old-site.com]
   ```

   Published items come from `/items/live`; `--drafts` reads the staged items
   instead (drafts and changes not yet published). Rate limits are retried.

2. **The Webflow MCP connector** (no token needed in the project). For each
   collection: `get_collection_list` (the site id), `get_collection_details`
   (fields), `list_collection_items` (100 per call, `offset` for more — read
   until `pagination.total`). Save them as one file, the details of each
   collection with its items:

   ```json
   { "site": "<site id>", "collections": [{ "id": "…", "displayName": "…", "slug": "blog",
     "fields": [ …from get_collection_details… ], "items": [ …every item… ] }] }
   ```

   then `node scripts/cms/import.ts webflow --json that-file.json`. Export
   every collection another one refers to, or its references stay ids.

3. **The CSV export** of each collection (CMS → collection → Export) — no
   references to ids, but readable without any access:
   `import.ts csv --file blog.csv --collection blog --route /blog --refs "Author:authors"`.
   Webflow's system columns (Collection ID, Item ID, Draft, Archived,
   Published On…) are read and dropped.

## What maps to what

| Webflow field                                        | Trix                                           |
| ---------------------------------------------------- | ---------------------------------------------- |
| Plain text, Link, Email, Phone, Color, Video link    | string                                         |
| Rich text (the first, or the one named body/content) | the file's body                                |
| Other rich text                                      | an HTML string field                           |
| Image / Multi-image                                  | `image()` (local, optimised) with its alt text |
| File                                                 | a path in `public/cms/`                        |
| Number, Switch, Date/time                            | number, boolean, date                          |
| Option                                               | an enum of the option names (not their ids)    |
| Reference / Multi-reference                          | `reference()` by slug                          |
| Name, Slug                                           | `title`, the file name                         |
| Archived                                             | left out                                       |
| Draft, or never published                            | left out (or `draft: true` with `--drafts`)    |

Template pages are `/<collection slug>/<item slug>`: give `--route` the same
prefix to keep every URL, or a new one and the redirects are written.

## What the API does not hold

- **Collection list settings** — filters, sorting, limits, "show items
  from" — live in the Designer. Read each list there (or from the
  connector's element tools) and record it in `PROJECT.md`.
- **SEO settings of template pages** — the title, description and Open
  Graph image bound to fields in the Designer; the Pages API does not say
  which field. Fields named like `seo-title`, `meta-description`, `og-image`
  are picked up as `seo` anyway. For the rest, add
  `--seo-from https://www.old-site.com`: it reads three items' old pages,
  finds the field each one's title, description and `og:image` came from,
  and fills every item the same way. A title that is the item's name plus
  the site's (`{title} | Acme`) stores nothing — the layout makes it. When
  the pages do not agree (a template of two fields, a description typed by
  hand on some items), it says so and leaves that one to map by hand.
  Parity (`/trix-seo`) checks the result page by page.
- **Localization** — `--site` reads the primary locale. Each other CMS locale
  is one more run: `import.ts webflow --site <id> --locale fr-FR` (its tag,
  subdirectory or CMS locale id; the error lists the site's locales). It
  writes `.trix/cms/webflow-fr-fr.json`, whose collections are their own —
  `blog-fr-fr` beside `blog`, routed under the locale's subdirectory
  (`/fr-fr/blog`), references pointing inside the locale — so `write.ts`
  puts them beside the primary's files and keeps every locale's redirects.
  A locale saved as JSON: `--json fr.json --locale fr-FR`. Then each
  locale's page reads its own collection (`src/pages/fr-fr/blog/[slug].astro`
  → `getCollection("blogFrFr")`); `--scaffold` gives it `lang="fr-FR"`.
  Every locale's copy of an item has the same `cmsId`, so each page names
  its other languages for `hreflang` — both ways, or search engines ignore
  it:

  ```ts
  // src/pages/fr-fr/blog/[slug].astro, in the frontmatter
  const en = (await getCollection("blog")).find(
    (e) => e.data.cmsId === entry.data.cmsId,
  );
  // then <Layout lang="fr-FR" alternates={en && { "en-US": `/blog/${en.id}` }}>,
  // and the mirror in src/pages/blog/[slug].astro
  ```

- **Ecommerce** products and **Users/Memberships** are separate APIs; agree
  the approach before moving them.

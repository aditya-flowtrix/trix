# Webflow CMS

## Reading it

Three ways, all giving the same result:

1. **Data API v2 with a site token** — Site settings → Apps & integrations →
   API access → generate a token with CMS read access.

   ```bash
   WEBFLOW_TOKEN=… node scripts/cms/import.ts webflow --site <site id> [--drafts]
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
- **SEO settings of template pages** — the title and description bound to
  fields in the Designer. Fields named like `seo-title`, `meta-description`,
  `og-image` are picked up as `seo`; anything else, map by hand.
- **Localization** — each CMS locale is its own read (`cmsLocaleId`), and
  its own set of files.
- **Ecommerce** products and **Users/Memberships** are separate APIs; agree
  the approach before moving them.

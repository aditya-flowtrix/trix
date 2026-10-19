# Any other platform → Trix

Wix, Squarespace, Shopify content pages, Duda, Carrd, a hand-built static
site, a site whose source nobody has. The method is the same everywhere
because it depends only on what the browser renders.

## The method

1. **Inventory** — `inventory.ts --url`. If the platform has no sitemap,
   the crawl finds pages from links; add orphan pages by hand.
2. **Style guide** — `/trix-style-guide` from measurement alone. Expect a
   longer ask list: these platforms rarely have a token system, so most of
   the work is consolidation, with the owner's yes.
3. **Content** — whatever the platform exports:
   - **Wix** — blog: Settings → Export (limited); CMS collections: CMS →
     collection → ⋯ → Export to CSV. Static pages: rebuilt from the rendered
     page; text copied from the inventory.
   - **Squarespace** — Settings → Import & Export → Export (WordPress WXR:
     blog posts and pages; read it with `references/wordpress.md`'s content
     steps). Products and events do not export; rebuild or scope out.
   - **Shopify** — e-commerce stays on Shopify (headless via the Storefront
     API, or scoped out). Content pages and blog: Admin API
     (`/admin/api/<version>/pages.json`, `blogs/<id>/articles.json`).
   - **Static HTML** — the files are the content; treat like a code export
     (`--dir`).
4. **Assets** — every image and font downloaded from the platform's CDN
   (`static.wixstatic.com`, `images.squarespace-cdn.com`, `cdn.shopify.com`)
   at original resolution, images filed by page (`TRIX.md` → Assets).
   Nothing hotlinked survives the cutover.
5. **Redirects** — the platform's URL rules (Wix: SEO → URL redirect manager;
   Squarespace: Settings → URL mappings, which is plain text — copy it whole).
   Platform URL shapes (`/blank-1`, `/s/…`, `?format=json`) usually need
   redirects to clean Trix routes.
6. **Rebuild** with Trix components (main `SKILL.md`, phases 3–5).

## Hashed or generated markup

Platform markup (`comp-kz1x0y2`, `sqs-block-*`, deeply nested `div` soup) is
not ported. Each section is rebuilt from:

- its measured styles (`design.ts` with `--pages` on that page),
- its content (inventory headings, links, images, forms),
- its screenshot at desktop and phone.

Name each component for what it is (`HeroHome`, `PricingTable`), never for the
platform's identifier.

## Clean when

- No platform class prefix, CDN URL, tracking script or runtime remains.
- Every old URL resolves directly or by redirect.
- `verify.ts` and `compare-pages.mjs` both pass.

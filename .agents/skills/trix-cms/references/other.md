# Any other CMS

Squarespace, Wix, Ghost, Contentful, Sanity, Strapi, Storyblok, Payload,
Prismic, Shopify, a database: if it exports CSV, use the CSV importer
(`references/framer-csv.md`). Otherwise read it through its API and write
the common shape the other importers produce — then `import.ts json` and
everything after it is the same.

```json
{
  "source": "ghost:https://example.com",
  "warnings": [],
  "collections": [
    {
      "key": "posts",
      "folder": "posts",
      "label": "Posts",
      "source": "ghost:posts",
      "route": "/blog",
      "bodyField": "html",
      "fields": [
        {
          "key": "excerpt",
          "label": "Excerpt",
          "source": "custom_excerpt",
          "type": "text"
        },
        {
          "key": "cover",
          "label": "Feature image",
          "source": "feature_image",
          "type": "image"
        },
        {
          "key": "tags",
          "label": "Tags",
          "source": "tags",
          "type": "references",
          "collection": "tags"
        }
      ],
      "items": [
        {
          "id": "…",
          "slug": "hello",
          "title": "Hello",
          "draft": false,
          "published": "2025-01-01T00:00:00Z",
          "updated": "2025-01-02T00:00:00Z",
          "oldPath": "/hello/",
          "seo": { "title": "…", "description": "…" },
          "body": "<p>…</p>",
          "data": {
            "excerpt": "…",
            "cover": { "url": "https://…/a.jpg", "alt": "…" },
            "tags": ["news"]
          }
        }
      ]
    }
  ]
}
```

The types are those in `src/utils/cms/model.ts` (`FieldType`). Values:
images `{ url, alt }`, references the target item's slug, dates ISO
strings, rich text HTML. Keys are camelCase identifiers.

Where to start per platform:

| Platform                  | Read with                                                    |
| ------------------------- | ------------------------------------------------------------ |
| Ghost                     | Admin → Settings → Labs → Export (JSON), or the Content API  |
| Contentful                | Content Delivery API, or `contentful space export`           |
| Sanity                    | GROQ through the HTTP API, or `sanity dataset export`        |
| Strapi, Payload, Directus | their REST API                                               |
| Squarespace               | Settings → Export (WordPress WXR) for blogs; products by CSV |
| Wix                       | CMS → collection → Export (CSV)                              |
| Shopify                   | products CSV, or the Storefront API                          |

Write the converter as a small script beside the project's other tooling,
record it in `PROJECT.md`, and keep it until cutover — the content freeze
runs it once more.

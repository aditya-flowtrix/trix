# Framer, and anything that exports CSV

Framer CMS exports one CSV per collection (CMS → collection → ⋯ → Export
CSV). So do Webflow, Wix, Airtable, Notion databases and every spreadsheet.

```bash
node scripts/cms/import.ts csv --file authors.csv --collection authors
node scripts/cms/import.ts csv --file posts.csv --collection posts --route /blog \
  --refs "Author:authors,Categories:categories" --types "Video:video"
node scripts/cms/write.ts --input .trix/cms/csv-authors.json
node scripts/cms/write.ts --input .trix/cms/csv-posts.json --route posts=/blog --scaffold
```

Write the collections others refer to first; references across runs are
kept.

**Types** are read from the values: true/false, numbers, dates, colors,
image URLs (a `;`-separated list is a multi-image), file URLs, links,
emails, and HTML (rich text). What the values cannot say, you say:
`--types "Column:type"` (text, richtext, image, images, file, link, email,
phone, number, boolean, date, color, option, video) and `--refs
"Column:collection"` for a column of slugs that names items of another
collection (`;`-separated for many).

**Columns**: the slug from `Slug` (or `--slug`), the title from `Name` or
`Title` (or `--title`), the body from the rich text column named like
body/content (or `--body`). Framer's images on `framerusercontent.com`
are downloaded.

If an export has no draft column, check it for items that are not live on
the site, and remove them from the CSV or add a `Draft` column set to
`true` for them.

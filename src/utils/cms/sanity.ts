/**
 * Sanity → the common shape (model.ts), for `cmsLoader({ source: "sanity" })`:
 * the site reads the documents scripts/cms/convert.ts wrote, at build, in the
 * shape files and every other source give — so pages do not change with the
 * CMS. The other direction, for the migration, is scripts/cms/to-sanity.ts.
 *
 * It reads documents generically: a slug is its string, a reference its
 * target's slug, an image `{ url, alt }` on Sanity's CDN, Portable Text HTML.
 * Field names are the common shape's keys, as the converter wrote them.
 */

import type { CmsExport, Collection, Item } from "./model.ts";
import { isPortableText, portableTextToHtml } from "./portable-text.ts";

export interface SanityDoc {
  _id: string;
  _type: string;
  [field: string]: unknown;
}

// Sanity's own type names, and the ones the converter defines.
const RESERVED = new Set([
  "array",
  "block",
  "blockContent",
  "boolean",
  "code",
  "crossDatasetReference",
  "date",
  "datetime",
  "document",
  "email",
  "embed",
  "file",
  "geopoint",
  "image",
  "internalLink",
  "link",
  "number",
  "object",
  "reference",
  "seo",
  "slug",
  "span",
  "string",
  "text",
  "url",
]);

/** A collection's document type: its key, unless Sanity already uses the name. */
export const sanityType = (key: string) =>
  RESERVED.has(key) ? `${key}Item` : key;

/** A field's name: Sanity keeps a leading underscore for its own fields. */
export const sanityField = (key: string) =>
  key.startsWith("_") ? `field${key}` : key;
const fieldKey = (name: string) =>
  name.startsWith("field_") ? name.slice(5) : name;

/** `<type>-<source id>`: the same on every run. Never a dot — that makes it private. */
export const sanityId = (type: string, sourceId: string) =>
  `${type}-${sourceId}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/^-+/, "")
    .slice(0, 128);

/** The fields every converted document has, besides the collection's own. */
export const FIXED_FIELDS = [
  "title",
  "slug",
  "publishedAt",
  "body",
  "seo",
  "oldPath",
] as const;

/** An asset reference's URL on Sanity's CDN. */
export function sanityAssetUrl(
  ref: string,
  projectId: string,
  dataset: string,
): string | undefined {
  const image = /^image-([a-zA-Z0-9]+)-(\d+x\d+)-(\w+)$/.exec(ref);
  if (image)
    return `https://cdn.sanity.io/images/${projectId}/${dataset}/${image[1]}-${image[2]}.${image[3]}`;
  const file = /^file-([a-zA-Z0-9]+)-(\w+)$/.exec(ref);
  if (file)
    return `https://cdn.sanity.io/files/${projectId}/${dataset}/${file[1]}.${file[2]}`;
  return undefined;
}

export interface SanityOptions {
  projectId: string;
  dataset: string;
  /** Each document type's URL prefix on the new site, for internal links. */
  routes?: Record<string, string>;
}

export function fromSanity(docs: SanityDoc[], opts: SanityOptions): CmsExport {
  const byId = new Map(docs.map((d) => [d._id, d]));
  const slugOf = (id: string) =>
    (byId.get(id)?.slug as { current?: string } | undefined)?.current;
  const assetUrl = (v: Record<string, unknown>) =>
    sanityAssetUrl(
      String((v.asset as { _ref?: string } | undefined)?._ref ?? ""),
      opts.projectId,
      opts.dataset,
    );
  const pathOf = (id: string) => {
    const d = byId.get(id);
    const slug = slugOf(id);
    if (!d || !slug) return undefined;
    const route = opts.routes?.[d._type];
    if (route !== undefined) return `${route.replace(/\/$/, "")}/${slug}`;
    return typeof d.oldPath === "string" ? d.oldPath : undefined;
  };
  const html = (blocks: unknown) =>
    portableTextToHtml(blocks as never, {
      image: (v) =>
        assetUrl(v) ?? (typeof v.url === "string" ? v.url : undefined),
      link: (v) =>
        pathOf(String((v.reference as { _ref?: string } | undefined)?._ref)),
    });
  const plain = (v: unknown): unknown => {
    if (v === null || v === undefined) return undefined;
    if (isPortableText(v)) return html(v);
    if (Array.isArray(v)) return v.map(plain).filter((x) => x !== undefined);
    if (typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    switch (o._type) {
      case "slug":
        return o.current;
      case "reference":
        return slugOf(String(o._ref));
      case "image": {
        const url = assetUrl(o);
        return url ? { url, alt: o.alt ?? "" } : undefined;
      }
      case "file":
        return assetUrl(o);
    }
    return Object.fromEntries(
      Object.entries(o)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, x]) => [k, plain(x)]),
    );
  };
  const fixed = new Set<string>(FIXED_FIELDS);

  const collections = new Map<string, Collection>();
  for (const d of docs) {
    const slug = slugOf(d._id);
    if (!slug) continue;
    let c = collections.get(d._type);
    if (!c)
      collections.set(
        d._type,
        (c = {
          key: d._type,
          folder: d._type,
          label: d._type,
          source: `sanity:${d._type}`,
          route: opts.routes?.[d._type],
          fields: [],
          items: [],
        }),
      );
    const seo = (d.seo ?? {}) as Record<string, unknown>;
    const seoImage = seo.image ? plain(seo.image) : undefined;
    const item: Item = {
      id: d._id,
      slug,
      title: String(d.title ?? slug),
      draft: false,
      published: typeof d.publishedAt === "string" ? d.publishedAt : undefined,
      updated: typeof d._updatedAt === "string" ? d._updatedAt : undefined,
      oldPath: typeof d.oldPath === "string" ? d.oldPath : undefined,
      seo:
        seo.title || seo.description || seoImage
          ? {
              title: (seo.title as string) || undefined,
              description: (seo.description as string) || undefined,
              image: (seoImage as { url?: string } | undefined)?.url,
            }
          : undefined,
      body: isPortableText(d.body) ? html(d.body) : undefined,
      data: Object.fromEntries(
        Object.entries(d)
          .filter(([k]) => !k.startsWith("_") && !fixed.has(k))
          .map(([k, v]) => [fieldKey(k), plain(v)])
          .filter(([, v]) => v !== undefined),
      ),
    };
    c.items.push(item);
  }
  return {
    source: `sanity:${opts.projectId}/${opts.dataset}`,
    collections: [...collections.values()],
    warnings: [],
  };
}

/** Every published document with a slug, through the HTTP API, at build. */
export async function fetchSanity(
  opts: SanityOptions & { token?: string },
): Promise<CmsExport> {
  if (
    !/^[a-z0-9]+$/.test(opts.projectId) ||
    !/^[a-z0-9_-]+$/.test(opts.dataset)
  )
    throw new Error(
      `Sanity: "${opts.projectId}" / "${opts.dataset}" is not a project id and dataset`,
    );
  // ponytail: one query for every type, so references resolve without a
  // second; split it per type if a dataset outgrows one response.
  const query = "*[defined(slug.current)]";
  const r = await fetch(
    `https://${opts.projectId}.api.sanity.io/v2025-02-19/data/query/${opts.dataset}` +
      `?perspective=published&query=${encodeURIComponent(query)}`,
    opts.token ? { headers: { authorization: `Bearer ${opts.token}` } } : {},
  );
  if (!r.ok)
    throw new Error(
      `Sanity ${opts.projectId}/${opts.dataset}: ${r.status} ${await r.text()}`,
    );
  const { result } = (await r.json()) as { result: SanityDoc[] };
  return fromSanity(result, opts);
}

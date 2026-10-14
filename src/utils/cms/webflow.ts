/**
 * Webflow CMS → the common shape (model.ts). Reads the Data API v2 with a
 * site token, or the same JSON saved from the Webflow MCP connector or the
 * API by hand: `{ collections: [{ ...collection details, items: [...] }] }`.
 */

import {
  camel,
  type CmsExport,
  type Collection,
  type Field,
  type FieldType,
  type Item,
} from "./model.ts";

interface WfField {
  id?: string;
  slug: string;
  displayName: string;
  type: string;
  isRequired?: boolean;
  validations?: {
    options?: { id: string; name: string }[];
    collectionId?: string;
  } | null;
}
interface WfItem {
  id: string;
  isDraft?: boolean;
  isArchived?: boolean;
  lastPublished?: string | null;
  lastUpdated?: string;
  createdOn?: string;
  fieldData: Record<string, unknown>;
}
export interface WebflowSite {
  site?: string;
  collections: {
    id: string;
    displayName: string;
    singularName?: string;
    slug: string;
    fields: WfField[];
    items: WfItem[];
  }[];
}

const TYPES: Record<string, FieldType> = {
  PlainText: "text",
  RichText: "richtext",
  Image: "image",
  MultiImage: "images",
  VideoLink: "video",
  Video: "video",
  Link: "link",
  Email: "email",
  Phone: "phone",
  Number: "number",
  DateTime: "date",
  Switch: "boolean",
  Color: "color",
  Option: "option",
  File: "file",
  Reference: "reference",
  MultiReference: "references",
};

/** Fetches every collection, its fields and its items through the Data API v2. */
export async function fetchWebflow(opts: {
  token: string;
  site: string;
  /** Include drafts (the staged items), not only what is published. */
  drafts?: boolean;
}): Promise<WebflowSite> {
  const api = async (path: string): Promise<Record<string, unknown>> => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`https://api.webflow.com/v2${path}`, {
        headers: {
          authorization: `Bearer ${opts.token}`,
          accept: "application/json",
        },
      });
      if (r.status === 429 && attempt < 5) {
        const wait = Number(r.headers.get("retry-after") ?? 60);
        await new Promise((res) => setTimeout(res, wait * 1000));
        continue;
      }
      if (!r.ok)
        throw new Error(`Webflow ${path}: ${r.status} ${await r.text()}`);
      return (await r.json()) as Record<string, unknown>;
    }
  };
  const list = (await api(`/sites/${opts.site}/collections`)) as {
    collections: { id: string }[];
  };
  const collections: WebflowSite["collections"] = [];
  for (const { id } of list.collections) {
    const details = (await api(
      `/collections/${id}`,
    )) as unknown as WebflowSite["collections"][number];
    const items: WfItem[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = (await api(
        `/collections/${id}/items${opts.drafts ? "" : "/live"}?limit=100&offset=${offset}`,
      )) as { items: WfItem[]; pagination: { total: number } };
      items.push(...page.items);
      if (items.length >= page.pagination.total || !page.items.length) break;
    }
    collections.push({ ...details, items });
  }
  return { site: opts.site, collections };
}

const SEO = {
  title: /^(seo|meta)[-_ ]?title$/i,
  description: /^(seo|meta)[-_ ]?description$|^meta$/i,
  image: /^(og|social|seo|meta|open[-_ ]?graph)[-_ ]?image$/i,
};

export function normalizeWebflow(site: WebflowSite): CmsExport {
  const warnings: string[] = [];
  const byId = new Map(site.collections.map((c) => [c.id, c]));
  // Every item's slug by its id, across the site, for references.
  const slugOf = new Map<string, string>();
  for (const c of site.collections)
    for (const i of c.items) slugOf.set(i.id, String(i.fieldData.slug));

  const collections: Collection[] = site.collections.map((c) => {
    const fields: Field[] = c.fields
      .filter((f) => f.slug !== "name" && f.slug !== "slug")
      .flatMap((f) => {
        const type = TYPES[f.type];
        if (!type) {
          warnings.push(
            `${c.slug}.${f.slug}: field type ${f.type} is not supported; left out`,
          );
          return [];
        }
        const target = f.validations?.collectionId
          ? byId.get(f.validations.collectionId)
          : undefined;
        if ((type === "reference" || type === "references") && !target)
          warnings.push(
            `${c.slug}.${f.slug}: refers to a collection that was not exported; kept as ids`,
          );
        return [
          {
            key: camel(f.slug),
            label: f.displayName,
            source: f.slug,
            type:
              (type === "reference" || type === "references") && !target
                ? "text"
                : type,
            required: !!f.isRequired,
            options: f.validations?.options?.map((o) => o.name),
            collection: target ? camel(target.slug) : undefined,
          } satisfies Field,
        ];
      });
    const optionName = new Map(
      c.fields.flatMap(
        (f) =>
          f.validations?.options?.map((o) => [o.id, o.name] as const) ?? [],
      ),
    );
    const body =
      fields.find(
        (f) =>
          f.type === "richtext" && /^(post-?)?(body|content)$/.test(f.source),
      ) ?? fields.find((f) => f.type === "richtext");

    const items: Item[] = c.items
      .filter((i) => !i.isArchived)
      .map((i) => {
        const fd = i.fieldData;
        const data: Record<string, unknown> = {};
        for (const f of fields) {
          const v = fd[f.source];
          if (v === null || v === undefined || v === "") continue;
          switch (f.type) {
            case "image":
              data[f.key] = {
                url: (v as { url: string }).url,
                alt: (v as { alt?: string }).alt ?? "",
              };
              break;
            case "images":
              data[f.key] = (v as { url: string; alt?: string }[]).map((x) => ({
                url: x.url,
                alt: x.alt ?? "",
              }));
              break;
            case "file":
              data[f.key] = (v as { url: string }).url;
              break;
            case "video":
              data[f.key] =
                typeof v === "string" ? v : (v as { url: string }).url;
              break;
            case "option":
              data[f.key] = optionName.get(String(v)) ?? String(v);
              break;
            case "reference": {
              const s = slugOf.get(String(v));
              if (s) data[f.key] = s;
              else
                warnings.push(
                  `${c.slug}/${fd.slug}.${f.source}: refers to an item that does not exist`,
                );
              break;
            }
            case "references":
              data[f.key] = (v as string[]).flatMap((id) => {
                const s = slugOf.get(id);
                if (!s)
                  warnings.push(
                    `${c.slug}/${fd.slug}.${f.source}: refers to an item that does not exist`,
                  );
                return s ? [s] : [];
              });
              break;
            default:
              data[f.key] = v;
          }
        }
        const seo = Object.fromEntries(
          (Object.keys(SEO) as (keyof typeof SEO)[]).flatMap((k) => {
            const f = fields.find(
              (x) => SEO[k].test(x.source) || SEO[k].test(x.label),
            );
            const v = f && data[f.key];
            if (!v) return [];
            return [
              [
                k,
                typeof v === "object" ? (v as { url: string }).url : String(v),
              ],
            ];
          }),
        );
        const bodyHtml = body
          ? (data[body.key] as string | undefined)
          : undefined;
        if (body) delete data[body.key];
        return {
          id: i.id,
          slug: String(fd.slug),
          title: String(fd.name),
          // Not live: a draft, or staged but never published.
          draft: !!i.isDraft || i.lastPublished === null,
          // Webflow has no first-publish date: creation is the closest.
          published: i.createdOn ?? i.lastPublished ?? undefined,
          updated: [i.lastUpdated, i.lastPublished]
            .filter((d): d is string => !!d)
            .sort()
            .at(-1),
          oldPath: `/${c.slug}/${fd.slug}`,
          seo: Object.keys(seo).length ? seo : undefined,
          body: bodyHtml,
          data,
        };
      });
    return {
      key: camel(c.slug),
      folder: c.slug,
      label: c.displayName,
      source: `webflow:${c.id}`,
      route: `/${c.slug}`,
      bodyField: body?.key,
      fields: fields.filter((f) => f !== body),
      items,
    };
  });
  return {
    source: `webflow${site.site ? `:${site.site}` : ""}`,
    collections,
    warnings,
  };
}

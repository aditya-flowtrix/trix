/**
 * WordPress → the common shape (model.ts), through the REST API every
 * WordPress site has at /wp-json/: posts, pages, custom post types,
 * categories, tags and custom taxonomies, featured images, authors, ACF
 * fields (when the site exposes them), and Yoast's SEO title, description and
 * image. An application password adds drafts and private content.
 */

import {
  camel,
  decodeEntities,
  slugify,
  textOf,
  type CmsExport,
  type Collection,
  type Field,
  type FieldType,
  type Item,
} from "./model.ts";

/** Internal types that are not content. */
const SKIP = new Set([
  "attachment",
  "nav_menu_item",
  "wp_block",
  "wp_template",
  "wp_template_part",
  "wp_navigation",
  "wp_global_styles",
  "wp_font_family",
  "wp_font_face",
  "nav_menu",
  "wp_pattern_category",
  "post_format",
  "menu",
]);

interface WpType {
  slug: string;
  name: string;
  rest_base: string;
  taxonomies?: string[];
}
type WpPost = Record<string, unknown> & {
  id: number;
  slug: string;
  link: string;
  status?: string;
  date_gmt?: string;
  modified_gmt?: string;
  title?: { rendered: string };
  content?: { rendered: string };
  excerpt?: { rendered: string };
  acf?: Record<string, unknown> | unknown[];
  yoast_head_json?: {
    title?: string;
    description?: string;
    og_image?: { url: string }[];
  };
  _embedded?: {
    author?: { name?: string }[];
    "wp:featuredmedia"?: { source_url?: string; alt_text?: string }[];
  };
};

export async function fetchWordPress(opts: {
  url: string;
  /** Application password user and password, for drafts and private content. */
  user?: string;
  password?: string;
  /** Post types by slug (default: every public content type). */
  types?: string[];
  /** Items per type, for a trial run. */
  limit?: number;
}): Promise<CmsExport> {
  const base = opts.url.replace(/\/+$/, "");
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.user && opts.password)
    headers.authorization = `Basic ${btoa(`${opts.user}:${opts.password}`)}`;
  const get = async (path: string) => {
    const r = await fetch(`${base}/wp-json${path}`, { headers });
    if (!r.ok) throw new Error(`WordPress ${path}: ${r.status}`);
    return {
      json: (await r.json()) as unknown,
      pages: Number(r.headers.get("x-wp-totalpages") ?? 1),
    };
  };
  // `limit` trims content types only: taxonomies are always whole, or the
  // posts' references to their terms would point at nothing.
  const all = async (restBase: string, query = "", limit = opts.limit) => {
    const out: WpPost[] = [];
    for (let page = 1; ; page++) {
      const per = Math.min(100, limit || 100);
      const { json, pages } = await get(
        `/wp/v2/${restBase}?per_page=${per}&page=${page}${query}`,
      );
      out.push(...(json as WpPost[]));
      if (page >= pages || (limit && out.length >= limit)) break;
    }
    return limit ? out.slice(0, limit) : out;
  };

  const warnings: string[] = [];
  const types = Object.values(
    (await get("/wp/v2/types")).json as Record<string, WpType>,
  ).filter(
    (t) =>
      t.rest_base &&
      !SKIP.has(t.slug) &&
      (!opts.types || opts.types.includes(t.slug)),
  );
  const taxonomies = Object.values(
    (await get("/wp/v2/taxonomies")).json as Record<string, WpType>,
  ).filter(
    (t) =>
      t.rest_base &&
      !SKIP.has(t.slug) &&
      types.some((p) => p.taxonomies?.includes(t.slug)),
  );

  const collections: Collection[] = [];
  // Taxonomies first: posts refer to their terms.
  const termSlug = new Map<string, Map<number, string>>();
  for (const tax of taxonomies) {
    const terms = await all(tax.rest_base, "", 0);
    termSlug.set(tax.rest_base, new Map(terms.map((t) => [t.id, t.slug])));
    collections.push({
      key: camel(tax.rest_base),
      folder: tax.rest_base,
      label: decodeEntities(tax.name),
      source: `wordpress:taxonomy:${tax.slug}`,
      fields: [
        {
          key: "description",
          label: "Description",
          source: "description",
          type: "text",
        },
        { key: "count", label: "Count", source: "count", type: "number" },
      ],
      items: terms.map((t) => ({
        id: String(t.id),
        slug: t.slug,
        title: decodeEntities(String(t.name)),
        draft: false,
        oldPath: new URL(t.link).pathname,
        data: {
          ...(t.description
            ? { description: decodeEntities(String(t.description)) }
            : {}),
          count: t.count,
        },
      })),
    });
  }

  for (const type of types) {
    const query = `&_embed=author,wp:featuredmedia${headers.authorization ? "&status=any" : ""}`;
    let posts: WpPost[];
    try {
      posts = await all(type.rest_base, query);
    } catch (e) {
      // A private type (form entries, a plugin's records) needs a login.
      if (/: 40[13]$/.test(String(e instanceof Error ? e.message : e))) {
        warnings.push(
          `${type.slug}: needs authentication — skipped (pass a user and WP_APP_PASSWORD to read it)`,
        );
        continue;
      }
      throw e;
    }
    const fields: Field[] = [
      { key: "excerpt", label: "Excerpt", source: "excerpt", type: "text" },
      {
        key: "featuredImage",
        label: "Featured image",
        source: "featured_media",
        type: "image",
      },
      { key: "author", label: "Author", source: "author", type: "text" },
    ];
    for (const tax of taxonomies.filter((t) =>
      type.taxonomies?.includes(t.slug),
    ))
      fields.push({
        key: camel(tax.rest_base),
        label: tax.name,
        source: tax.rest_base,
        type: "references",
        collection: camel(tax.rest_base),
      });
    // ACF: one field per key the posts carry, typed by what the values are.
    const acfKeys = new Map<string, FieldType>();
    for (const p of posts)
      if (p.acf && !Array.isArray(p.acf))
        for (const [k, v] of Object.entries(p.acf)) {
          if (v === null || v === "" || v === false) continue;
          const t: FieldType =
            typeof v === "number"
              ? "number"
              : typeof v === "boolean"
                ? "boolean"
                : typeof v === "object" && v && "url" in v
                  ? "image"
                  : typeof v === "string" && /<\/?[a-z][^>]*>/i.test(v)
                    ? "richtext"
                    : typeof v === "string"
                      ? "text"
                      : "text";
          if (typeof v === "object" && !(v && "url" in v))
            warnings.push(
              `${type.slug}.acf.${k}: a ${Array.isArray(v) ? "list" : "group"} field — stored as JSON text; map it by hand`,
            );
          acfKeys.set(k, acfKeys.get(k) === "richtext" ? "richtext" : t);
        }
    for (const [k, t] of acfKeys)
      fields.push({ key: camel(k), label: k, source: `acf.${k}`, type: t });

    const seen = new Map<string, number>();
    const items: Item[] = posts.map((p) => {
      const data: Record<string, unknown> = {};
      const excerpt = p.excerpt ? textOf(p.excerpt.rendered) : "";
      if (excerpt) data.excerpt = excerpt;
      const media = p._embedded?.["wp:featuredmedia"]?.[0];
      if (media?.source_url)
        data.featuredImage = {
          url: media.source_url,
          alt: media.alt_text ?? "",
        };
      const author = p._embedded?.author?.[0]?.name;
      if (author) data.author = author;
      for (const f of fields.filter((x) => x.type === "references")) {
        const ids = p[f.source];
        if (Array.isArray(ids))
          data[f.key] = ids.flatMap((id) => {
            const s = termSlug.get(f.source)?.get(id as number);
            return s ? [s] : [];
          });
      }
      if (p.acf && !Array.isArray(p.acf))
        for (const [k, v] of Object.entries(p.acf)) {
          if (v === null || v === "" || v === false) continue;
          const f = fields.find((x) => x.source === `acf.${k}`)!;
          data[f.key] =
            f.type === "image"
              ? {
                  url: (v as { url: string }).url,
                  alt: (v as { alt?: string }).alt ?? "",
                }
              : typeof v === "object"
                ? JSON.stringify(v)
                : v;
        }
      // Child pages can share a slug under different parents: keep files apart.
      let slug = p.slug || slugify(textOf(p.title?.rendered ?? String(p.id)));
      const n = (seen.get(slug) ?? 0) + 1;
      seen.set(slug, n);
      if (n > 1) {
        warnings.push(
          `${type.slug}/${slug}: slug used ${n} times — saved as ${slug}-${n}`,
        );
        slug = `${slug}-${n}`;
      }
      const y = p.yoast_head_json;
      return {
        id: String(p.id),
        slug,
        title: decodeEntities(p.title?.rendered ?? slug),
        draft: !!p.status && p.status !== "publish",
        published: p.date_gmt ? `${p.date_gmt}Z` : undefined,
        updated: p.modified_gmt ? `${p.modified_gmt}Z` : undefined,
        oldPath: new URL(p.link).pathname,
        seo: y
          ? {
              title: y.title ? decodeEntities(y.title) : undefined,
              description: y.description
                ? decodeEntities(y.description)
                : undefined,
              image: y.og_image?.[0]?.url,
            }
          : undefined,
        body: p.content?.rendered || undefined,
        data,
      };
    });
    collections.push({
      key: camel(type.rest_base),
      folder: type.rest_base,
      label: decodeEntities(type.name),
      source: `wordpress:${type.slug}`,
      bodyField: "content",
      // Only what some item uses: a site with no featured images gets no field.
      fields: fields.filter((f) =>
        items.some((i) => i.data[f.key] !== undefined),
      ),
      items,
    });
  }
  return { source: `wordpress:${base}`, collections, warnings };
}

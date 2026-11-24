/**
 * The common shape (model.ts) → Sanity: the documents for
 * `sanity datasets import`, and the Studio schema they need. Used by
 * `scripts/cms/convert.ts sanity`; the build reads them back with sanity.ts.
 *
 *   _id        <type>-<source id> — a re-run replaces, never duplicates
 *   _type      the collection's key (sanityType)
 *   title, slug, publishedAt, body, seo, oldPath, then the collection's fields
 *   images     { _type: "image", _sanityAsset: "image@<url>", alt } — the
 *              importer downloads and uploads each once
 *   references { _type: "reference", _ref: <target's _id> } — the importer
 *              writes them weak, then strong
 *   arrays     every item keyed, the same key on every run
 *   rich text  Portable Text (html-to-portable-text.ts)
 */

import { createHash } from "node:crypto";
import {
  BLOCK_CONTENT,
  countBlocks,
  countPatterns,
  htmlToBlocks,
  type Block,
} from "./html-to-portable-text.ts";
import type {
  CmsExport,
  Collection,
  Field,
} from "../../src/utils/cms/model.ts";
import {
  sanityField,
  sanityId,
  sanityType,
  type SanityDoc,
} from "../../src/utils/cms/sanity.ts";

export interface ToSanityOptions {
  /** The old site's own domains: rich-text links to them become internal links. */
  hosts?: string[];
}

export interface ToSanityResult {
  docs: SanityDoc[];
  warnings: string[];
  /** Rich text whose images, embeds or code blocks did not all come across. */
  lost: string[];
  /** Per document type: documents, assets, and rich-text patterns in → out. */
  counts: Record<
    string,
    { docs: number; assets: number; patternsIn: number; blocksOut: number }
  >;
}

const http = (u: unknown): u is string =>
  typeof u === "string" && /^https?:\/\//i.test(u);
const keyOf = (s: string) =>
  createHash("sha1").update(s).digest("hex").slice(0, 12);

/** Unique `_key`s from stable seeds: the second copy of a seed gets `-2`. */
function keyed<T extends object>(
  items: [string, T][],
): (T & { _key: string })[] {
  const seen = new Map<string, number>();
  return items.map(([seed, item]) => {
    const n = (seen.get(seed) ?? 0) + 1;
    seen.set(seed, n);
    return { ...item, _key: n > 1 ? `${seed}-${n}` : seed };
  });
}

/**
 * Fields that only fed the item's SEO (a meta-description beside
 * seo.description): in Sanity they are the seo object, not a second copy.
 */
export function seoOnlyFields(c: Collection): Set<string> {
  return new Set(
    c.fields
      .filter((f) => {
        const set = c.items.filter((i) => i.data[f.key] != null);
        return (
          set.length > 0 &&
          set.every((i) => {
            const v = i.data[f.key];
            const url = (v as { url?: string })?.url ?? v;
            return [i.seo?.title, i.seo?.description, i.seo?.image].includes(
              url as string,
            );
          })
        );
      })
      .map((f) => f.key),
  );
}

export function toSanity(
  exp: CmsExport,
  opts: ToSanityOptions = {},
): ToSanityResult {
  const docs: SanityDoc[] = [];
  const warnings: string[] = [];
  const lost: string[] = [];
  const counts: ToSanityResult["counts"] = {};
  const typeOf = new Map(
    exp.collections.map((c) => [c.key, sanityType(c.key)]),
  );

  // Every item's document id, by collection and slug, and by its old URL.
  const idOf = new Map<string, Map<string, string>>();
  const byPath = new Map<string, string>();
  const drafts = new Set<string>();
  const typeById = new Map<string, string>();
  for (const c of exp.collections) {
    const ids = new Map<string, string>();
    for (const i of c.items) {
      const id = sanityId(typeOf.get(c.key)!, i.id);
      ids.set(i.slug, id);
      typeById.set(id, typeOf.get(c.key)!);
      if (i.draft) drafts.add(id);
      if (i.oldPath) byPath.set(i.oldPath.replace(/(.)\/$/, "$1"), id);
    }
    idOf.set(c.key, ids);
  }
  // A reference to an item that is only a draft cannot be strong yet: Sanity
  // makes it strong when the draft is published. Until then the Studio's
  // validator reports it, so each one is named.
  const draftRefs = new Set<string>();
  const ref = (id: string, type: string) => {
    if (!drafts.has(id)) return { _type: "reference", _ref: id };
    draftRefs.add(id);
    return {
      _type: "reference",
      _ref: id,
      _weak: true,
      _strengthenOnPublish: { type },
    };
  };
  const hosts = new Set(opts.hosts?.map((h) => h.trim().replace(/^www\./, "")));
  const internal = (href: string) => {
    try {
      const u = new URL(href, "https://old.invalid");
      const host = u.hostname.replace(/^www\./, "");
      const own =
        host === "old.invalid" ||
        host.endsWith(".webflow.io") ||
        hosts.has(host);
      const id = own && byPath.get(u.pathname.replace(/(.)\/$/, "$1"));
      return id
        ? { _type: "internalLink", reference: ref(id, typeById.get(id)!) }
        : undefined;
    } catch {
      return undefined;
    }
  };

  for (const c of exp.collections) {
    const _type = typeOf.get(c.key)!;
    const count = (counts[_type] = {
      docs: 0,
      assets: 0,
      patternsIn: 0,
      blocksOut: 0,
    });
    const image = (v: unknown, where: string) => {
      const x = v as { url?: string; alt?: string };
      if (!http(x?.url)) {
        warnings.push(`${where}: image "${x?.url}" is not a URL; left out`);
        return undefined;
      }
      count.assets++;
      return {
        _type: "image",
        _sanityAsset: `image@${x.url}`,
        ...(x.alt ? { alt: x.alt } : {}),
      };
    };
    const richText = (html: string, where: string) => {
      const blocks = htmlToBlocks(html, { link: internal }).flatMap(
        (b): Block[] => {
          if (b._type === "embed" && /<script\b/i.test(String(b.html)))
            warnings.push(
              `${where}: an embed runs a script — hold it until consent (/trix-consent)`,
            );
          if (b._type !== "image") return [b];
          const { url, alt, caption, ...rest } = b as Block & {
            url?: string;
            alt?: string;
            caption?: string;
          };
          if (!http(url)) {
            warnings.push(`${where}: image "${url}" is not a URL; left out`);
            return [];
          }
          count.assets++;
          return [
            {
              ...rest,
              _sanityAsset: `image@${url}`,
              ...(alt ? { alt } : {}),
              ...(caption ? { caption } : {}),
            },
          ];
        },
      );
      const into = countPatterns(html);
      const out = countBlocks(blocks);
      count.patternsIn += into.images + into.embeds + into.code;
      count.blocksOut += out.images + out.embeds + out.code;
      for (const k of ["images", "embeds", "code"] as const)
        if (into[k] !== out[k])
          lost.push(
            `${where}: ${into[k]} ${k} in the HTML, ${out[k]} converted`,
          );
      return blocks;
    };
    const reference = (f: Field, slug: unknown, where: string) => {
      const id = f.collection && idOf.get(f.collection)?.get(String(slug));
      if (!id)
        warnings.push(`${where}: refers to "${slug}", which is not imported`);
      return id ? ref(id, typeOf.get(f.collection!)!) : undefined;
    };
    const seoOnly = seoOnlyFields(c);
    const value = (f: Field, v: unknown, where: string): unknown => {
      switch (f.type) {
        case "richtext":
          return richText(String(v), where);
        case "image":
          return image(v, where);
        case "images":
          return keyed(
            (v as { url?: string }[]).flatMap((x) => {
              const img = image(x, where);
              return img
                ? [[keyOf(String(x.url)), img] as [string, object]]
                : [];
            }),
          );
        case "file":
          if (!http(v)) {
            warnings.push(`${where}: file "${v}" is not a URL; left out`);
            return undefined;
          }
          count.assets++;
          return { _type: "file", _sanityAsset: `file@${v}` };
        case "reference":
          return reference(f, v, where);
        case "references":
          return keyed(
            (v as unknown[]).flatMap((s) => {
              const ref = reference(f, s, where);
              return ref ? [[ref._ref, ref] as [string, object]] : [];
            }),
          );
        default:
          return v;
      }
    };

    for (const i of c.items) {
      const where = `${c.folder}/${i.slug}`;
      const doc: SanityDoc = {
        _id: `${i.draft ? "drafts." : ""}${sanityId(_type, i.id)}`,
        _type,
        title: i.title,
        slug: { _type: "slug", current: i.slug },
      };
      if (i.published) doc.publishedAt = i.published;
      if (i.body) doc.body = richText(i.body, `${where}.body`);
      for (const f of c.fields) {
        const v = i.data[f.key];
        if (v === null || v === undefined || v === "" || seoOnly.has(f.key))
          continue;
        const out = value(f, v, `${where}.${f.key}`);
        if (out !== undefined && !(Array.isArray(out) && !out.length))
          doc[sanityField(f.key)] = out;
      }
      const seoImage =
        i.seo?.image && image({ url: i.seo.image }, `${where}.seo`);
      if (i.seo?.title || i.seo?.description || seoImage)
        doc.seo = {
          _type: "seo",
          ...(i.seo?.title ? { title: i.seo.title } : {}),
          ...(i.seo?.description ? { description: i.seo.description } : {}),
          ...(seoImage ? { image: seoImage } : {}),
        };
      if (i.oldPath) doc.oldPath = i.oldPath;
      count.docs++;
      docs.push(doc);
    }
  }
  for (const id of draftRefs)
    warnings.push(
      `${id} is a draft other documents refer to: those references stay weak, and \`documents validate\` reports them, until it is published`,
    );
  return { docs, warnings, lost, counts };
}

/* ---------------- the Studio schema ---------------- */

const j = JSON.stringify;
const title = (s: string) =>
  s
    .replace(/^[a-z]/, (c) => c.toUpperCase())
    .replace(/([a-z])([A-Z])/g, "$1 $2");

function fieldSource(
  c: Collection,
  f: Field,
  types: Map<string, string>,
): string {
  const name = sanityField(f.key);
  const required = f.required ? ", validation: (r) => r.required()" : "";
  const url =
    'validation: (r) => r.uri({ allowRelative: true, scheme: ["http", "https", "mailto", "tel"] })';
  const head = `name: ${j(name)}, title: ${j(f.label)}`;
  const to = f.collection && types.get(f.collection);
  switch (f.type) {
    case "text": {
      const long = c.items.some((i) => {
        const v = i.data[f.key];
        return typeof v === "string" && (v.includes("\n") || v.length > 120);
      });
      return `defineField({ ${head}, type: ${j(long ? "text" : "string")}${required} })`;
    }
    case "email":
      return `defineField({ ${head}, type: "string", validation: (r) => r.email()${f.required ? ".required()" : ""} })`;
    case "link":
    case "video":
      return `defineField({ ${head}, type: "url", ${url}${f.required ? ".required()" : ""} })`;
    case "richtext":
      return `defineField({ ${head}, type: "blockContent"${required} })`;
    case "image":
      return `defineField({ ${head}, type: "image", fields: [defineField({ name: "alt", type: "string" })]${required} })`;
    case "images":
      return `defineField({ ${head}, type: "array", of: [defineArrayMember({ type: "image", fields: [defineField({ name: "alt", type: "string" })] })]${required} })`;
    case "file":
      return `defineField({ ${head}, type: "file"${required} })`;
    case "number":
      return `defineField({ ${head}, type: "number"${required} })`;
    case "boolean":
      return `defineField({ ${head}, type: "boolean"${required} })`;
    case "date":
      return `defineField({ ${head}, type: "datetime"${required} })`;
    case "option":
      return `defineField({ ${head}, type: "string", options: { list: ${j(f.options ?? [])} }${required} })`;
    case "reference":
      return to
        ? `defineField({ ${head}, type: "reference", to: [{ type: ${j(to)} }]${required} })`
        : `defineField({ ${head}, type: "string"${required} })`;
    case "references":
      return to
        ? `defineField({ ${head}, type: "array", of: [defineArrayMember({ type: "reference", to: [{ type: ${j(to)} }] })]${required} })`
        : `defineField({ ${head}, type: "array", of: [defineArrayMember({ type: "string" })]${required} })`;
    default:
      return `defineField({ ${head}, type: "string"${required} })`;
  }
}

/** The Studio schema for the documents toSanity writes, as TypeScript source. */
export function sanitySchema(exp: CmsExport): string {
  const types = new Map(exp.collections.map((c) => [c.key, sanityType(c.key)]));
  const options = (values: readonly string[], titles: Record<string, string>) =>
    `[${values.map((v) => `{ title: ${j(titles[v] ?? title(v))}, value: ${j(v)} }`).join(", ")}]`;
  const docs = exp.collections.map((c) => {
    const fields = [
      'defineField({ name: "title", type: "string", validation: (r) => r.required() })',
      'defineField({ name: "slug", type: "slug", options: { source: "title", maxLength: 96 }, validation: (r) => r.required() })',
      'defineField({ name: "publishedAt", title: "Published", type: "datetime" })',
      ...c.fields
        .filter((f) => !seoOnlyFields(c).has(f.key))
        .map((f) => fieldSource(c, f, types)),
      ...(c.items.some((i) => i.body) || c.bodyField
        ? ['defineField({ name: "body", type: "blockContent" })']
        : []),
      'defineField({ name: "seo", title: "SEO", type: "seo" })',
      'defineField({ name: "oldPath", title: "Old URL", type: "string", readOnly: true, description: "Where this was on the old site. Its redirect and the SEO parity check read it." })',
    ];
    return `  defineType({
    name: ${j(types.get(c.key))},
    title: ${j(c.label)},
    type: "document",
    fields: [
      ${fields.join(",\n      ")},
    ],
  })`;
  });
  return `// Generated by scripts/cms/convert.ts sanity: the Studio schema of the
// migrated content. Add it to sanity.config.ts — schema: { types: migratedTypes }
// — then change it in the Studio's own code: the converter does not read it back.
import { defineArrayMember, defineField, defineType } from "sanity";

const seo = defineType({
  name: "seo",
  title: "SEO",
  type: "object",
  fields: [
    defineField({ name: "title", type: "string" }),
    defineField({ name: "description", type: "text", rows: 3 }),
    defineField({ name: "image", title: "Social image", type: "image" }),
  ],
});

const blockContent = defineType({
  name: "blockContent",
  title: "Rich text",
  type: "array",
  of: [
    defineArrayMember({
      type: "block",
      styles: ${options(BLOCK_CONTENT.styles, { normal: "Normal", h2: "Heading 2", h3: "Heading 3", h4: "Heading 4", h5: "Heading 5", h6: "Heading 6", blockquote: "Quote" })},
      lists: ${options(BLOCK_CONTENT.lists, { bullet: "Bullets", number: "Numbers" })},
      marks: {
        decorators: ${options(BLOCK_CONTENT.decorators, { em: "Emphasis", "strike-through": "Strike" })},
        annotations: [
          {
            name: "link",
            title: "Link",
            type: "object",
            fields: [
              defineField({
                name: "href",
                type: "url",
                validation: (r) =>
                  r.uri({ allowRelative: true, scheme: ["http", "https", "mailto", "tel"] }),
              }),
            ],
          },
          {
            name: "internalLink",
            title: "Internal link",
            type: "object",
            fields: [
              defineField({
                name: "reference",
                type: "reference",
                to: ${j([...types.values()].map((type) => ({ type })))},
              }),
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      type: "image",
      fields: [
        defineField({ name: "alt", type: "string" }),
        defineField({ name: "caption", type: "string" }),
      ],
    }),
    // Raw HTML, rendered as it is: give it only to editors who need it.
    defineArrayMember({
      name: "embed",
      title: "Embed",
      type: "object",
      fields: [defineField({ name: "html", title: "HTML", type: "text" })],
    }),
    defineArrayMember({
      name: "code",
      title: "Code",
      type: "object",
      fields: [
        defineField({ name: "code", type: "text" }),
        defineField({ name: "language", type: "string" }),
      ],
    }),
  ],
});

export const migratedTypes = [
  seo,
  blockContent,
${docs.join(",\n")},
];
`;
}

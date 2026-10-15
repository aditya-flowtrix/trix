/**
 * The one shape every CMS is turned into — Webflow, WordPress, Framer, a CSV,
 * anything — before it becomes files in `src/content/` (scripts/cms/write.ts)
 * or a live collection (`cmsLoader`). Importers only ever produce this; the
 * writer and the loader only ever read it.
 */

export type FieldType =
  | "text"
  | "richtext"
  | "image"
  | "images"
  | "file"
  | "link"
  | "email"
  | "phone"
  | "number"
  | "boolean"
  | "date"
  | "color"
  | "option"
  | "reference"
  | "references"
  | "video";

export interface Field {
  /** Key in the content files: camelCase, a valid identifier. */
  key: string;
  /** The source's own name for it, kept for the report. */
  label: string;
  /** The source's field id or slug, kept for the report. */
  source: string;
  type: FieldType;
  required?: boolean;
  /** `option`: the allowed values. */
  options?: string[];
  /** `reference` / `references`: the target collection's key. */
  collection?: string;
}

export interface Asset {
  url: string;
  alt?: string;
}

export interface Item {
  /** The source's id, for references and the report. */
  id: string;
  slug: string;
  title: string;
  draft: boolean;
  published?: string;
  updated?: string;
  /** The item's URL on the old site, for redirects and parity. */
  oldPath?: string;
  seo?: { title?: string; description?: string; image?: string };
  /** The main rich text, which becomes the file's body. */
  body?: string;
  /** Every other field, keyed by `Field.key`. */
  data: Record<string, unknown>;
}

export interface Collection {
  /** Collection key in Astro (camelCase). */
  key: string;
  /** Folder under src/content/ (kebab-case, usually the old URL prefix). */
  folder: string;
  label: string;
  /** Where the source came from, like `webflow:69bc…`. */
  source: string;
  /** The old site's URL prefix for this collection's pages, if it had any. */
  route?: string;
  /** The field that became the body. */
  bodyField?: string;
  fields: Field[];
  items: Item[];
}

export interface CmsExport {
  source: string;
  collections: Collection[];
  warnings: string[];
}

/** `sorting-order` → `sortingOrder`; `3d-model` → `_3dModel`. */
export function camel(name: string): string {
  const out = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) =>
      c ? c.toUpperCase() : "",
    );
  return /^[0-9]/.test(out) ? `_${out}` : out || "field";
}

/** A URL-safe slug: lowercase, dashes, nothing else. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};
/** Decodes HTML entities in plain text (WordPress titles arrive encoded). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#")
      return String.fromCodePoint(
        e[1].toLowerCase() === "x"
          ? parseInt(e.slice(2), 16)
          : Number(e.slice(1)),
      );
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Plain text from a little HTML (an excerpt). */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rich text without the platform it came from: Webflow's `w-` classes and
 * `data-rt-*` attributes, WordPress's block and image-id classes. Used for
 * files and for the live loader alike, so both render the same HTML.
 */
export function stripPlatformMarkup(html: string): string {
  return html
    .replace(/\s(?:data-rt-[\w-]+|data-w-id|data-wf-[\w-]+)="[^"]*"/g, "")
    .replace(/\sid="w-node-[^"]*"/g, "")
    .replace(/\sclass="([^"]*)"/g, (_, cls: string) => {
      const kept = cls
        .split(/\s+/)
        .filter((c) => c && !/^(w-|wp-image-\d+|wp-block-)/.test(c));
      return kept.length ? ` class="${kept.join(" ")}"` : "";
    });
}

/**
 * The zod schema for a collection, written as source for
 * src/content/collections.ts. Files keep images local (`image()` optimises
 * them); a live loader keeps remote URLs (`remote: true`).
 */
export function schemaSource(c: Collection, remote = false): string {
  const image = remote
    ? 'z.object({ src: z.string(), alt: z.string().default("") })'
    : 'z.object({ src: image(), alt: z.string().default("") })';
  const type = (f: Field): string => {
    switch (f.type) {
      case "richtext":
      case "text":
      case "link":
      case "email":
      case "phone":
      case "color":
      case "video":
      case "file":
        return "z.string()";
      case "number":
        return "z.number()";
      case "boolean":
        return "z.boolean()";
      case "date":
        return "z.coerce.date()";
      case "image":
        return image;
      case "images":
        return `z.array(${image})`;
      case "option":
        return f.options?.length
          ? `z.enum(${JSON.stringify(f.options)})`
          : "z.string()";
      case "reference":
        return f.collection
          ? `reference(${JSON.stringify(f.collection)})`
          : "z.string()";
      case "references":
        return f.collection
          ? `z.array(reference(${JSON.stringify(f.collection)}))`
          : "z.array(z.string())";
    }
  };
  const lines = [
    "title: z.string()",
    "draft: z.boolean().default(false)",
    "published: z.coerce.date().optional()",
    "updated: z.coerce.date().optional()",
    "oldPath: z.string().optional()",
    "seo: z.object({ title: z.string().optional(), description: z.string().optional(), image: z.string().optional() }).optional()",
    ...c.fields.map((f) => {
      const t = type(f);
      const tail =
        f.type === "references" || f.type === "images"
          ? ".default([])"
          : f.required
            ? ""
            : ".optional()";
      return `${JSON.stringify(f.key)}: ${t}${tail}`;
    }),
  ];
  return `z.object({\n      ${lines.join(",\n      ")},\n    })`;
}

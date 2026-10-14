/**
 * A CSV → the common shape (model.ts): Framer's CMS export, Webflow's CSV
 * export, Wix, Airtable, Notion, a spreadsheet. One file is one collection.
 * Column types are read from the values; `types` and `refs` settle what the
 * values cannot say (a column of slugs that refer to another collection).
 */

import {
  camel,
  slugify,
  type Collection,
  type Field,
  type FieldType,
} from "./model.ts";

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const IMAGE = /\.(jpe?g|png|webp|avif|gif|svg)(\?.*)?$/i;
const IMAGE_HOSTS =
  /(website-files\.com|framerusercontent\.com|wixstatic\.com|squarespace-cdn\.com|images\.ctfassets\.net|cdn\.sanity\.io)/i;
const FILE =
  /\.(pdf|docx?|xlsx?|pptx?|zip|txt|glb|gltf|mp3|mp4|mov|csv)(\?.*)?$/i;
const URL_RE = /^https?:\/\/\S+$/i;
const HTML =
  /<\/?(p|h[1-6]|ul|ol|li|strong|em|b|i|a|br|img|figure|blockquote|div|span)\b/i;
const DATE =
  /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$|^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} /;

/** What a column holds, from every non-empty value in it. */
export function inferType(values: string[]): FieldType {
  const v = values.map((x) => x.trim()).filter(Boolean);
  if (!v.length) return "text";
  const every = (re: RegExp) => v.every((x) => re.test(x));
  const parts = v.flatMap((x) => x.split(/\s*;\s*/));
  if (every(/^(true|false)$/i)) return "boolean";
  if (every(/^-?\d+(\.\d+)?$/)) return "number";
  if (every(/^#[0-9a-f]{3,8}$/i)) return "color";
  if (v.every((x) => DATE.test(x) && !Number.isNaN(Date.parse(x))))
    return "date";
  if (
    parts.every((x) => URL_RE.test(x) && (IMAGE.test(x) || IMAGE_HOSTS.test(x)))
  )
    return v.some((x) => x.includes(";")) ? "images" : "image";
  if (every(URL_RE) && every(FILE)) return "file";
  if (every(URL_RE)) return "link";
  if (every(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i)) return "email";
  if (v.some((x) => HTML.test(x))) return "richtext";
  return "text";
}

/** Columns every Webflow CSV carries that are not fields. */
const WEBFLOW_SYSTEM =
  /^(collection id|locale id|item id|created on|updated on|published on|archived|draft)$/i;

export function csvCollection(
  text: string,
  opts: {
    /** Collection key (folder name). */
    collection: string;
    label?: string;
    /** Column with the slug; otherwise "Slug", otherwise slugified title. */
    slug?: string;
    /** Column with the title; otherwise "Name" or "Title" or the first column. */
    title?: string;
    /** The rich text column that becomes the body. */
    body?: string;
    /** Column → type, where the values cannot say. */
    types?: Record<string, FieldType>;
    /** Column → the collection its slugs refer to. */
    refs?: Record<string, string>;
    /** The old URL prefix of this collection's pages, if it had any. */
    route?: string;
  },
): Collection {
  const [header, ...rows] = parseCsv(text);
  const col = (name?: string) =>
    name === undefined
      ? -1
      : header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const slugCol = col(opts.slug ?? "slug");
  const titleCol =
    [opts.title, "name", "title"].map(col).find((i) => i >= 0) ?? 0;
  const draftCol = col("draft");
  const archivedCol = col("archived");
  const publishedCol = col("published on");
  const updatedCol = col("updated on");
  const skip = new Set([slugCol, titleCol]);

  const fields: Field[] = header.flatMap((h, i) => {
    if (skip.has(i) || WEBFLOW_SYSTEM.test(h.trim())) return [];
    const ref = opts.refs?.[h];
    const values = rows.map((r) => r[i] ?? "");
    const type: FieldType = ref
      ? values.some((x) => x.includes(";"))
        ? "references"
        : "reference"
      : (opts.types?.[h] ?? inferType(values));
    return [
      {
        key: camel(h),
        label: h,
        source: h,
        type,
        collection: ref && camel(ref),
      },
    ];
  });
  const body =
    fields.find((f) => f.source === opts.body) ??
    fields.find(
      (f) => f.type === "richtext" && /body|content|post/i.test(f.source),
    ) ??
    fields.find((f) => f.type === "richtext");

  const items = rows
    .filter((r) => archivedCol < 0 || !/^true$/i.test(r[archivedCol]))
    .map((r, n) => {
      const title = (r[titleCol] ?? "").trim();
      const slug =
        (slugCol >= 0 ? r[slugCol] : "")?.trim() ||
        slugify(title) ||
        `item-${n + 1}`;
      const data: Record<string, unknown> = {};
      for (const f of fields) {
        const raw = (r[header.indexOf(f.source)] ?? "").trim();
        if (!raw) continue;
        const list = raw.split(/\s*;\s*/).filter(Boolean);
        data[f.key] =
          f.type === "number"
            ? Number(raw)
            : f.type === "boolean"
              ? /^true$/i.test(raw)
              : f.type === "date"
                ? new Date(raw).toISOString()
                : f.type === "image"
                  ? { url: raw, alt: "" }
                  : f.type === "images"
                    ? list.map((url) => ({ url, alt: "" }))
                    : f.type === "references"
                      ? list.map(slugify)
                      : f.type === "reference"
                        ? slugify(raw)
                        : raw;
      }
      const bodyHtml = body
        ? (data[body.key] as string | undefined)
        : undefined;
      if (body) delete data[body.key];
      return {
        id: slug,
        slug,
        title,
        draft: draftCol >= 0 && /^true$/i.test(r[draftCol]),
        published:
          publishedCol >= 0 && r[publishedCol]
            ? new Date(r[publishedCol]).toISOString()
            : undefined,
        updated:
          updatedCol >= 0 && r[updatedCol]
            ? new Date(r[updatedCol]).toISOString()
            : undefined,
        oldPath: opts.route ? `${opts.route}/${slug}` : undefined,
        body: bodyHtml,
        data,
      };
    });
  return {
    key: camel(opts.collection),
    folder: opts.collection,
    label: opts.label ?? opts.collection,
    source: `csv:${opts.collection}`,
    route: opts.route,
    bodyField: body?.key,
    fields: fields.filter((f) => f !== body),
    items,
  };
}

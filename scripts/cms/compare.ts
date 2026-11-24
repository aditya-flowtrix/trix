/**
 * A new CMS against the import it was filled from: what its reader gives back
 * (fetchSanity, or any CMS's) after its importer ran, compared with
 * .trix/cms/<source>.json. Run on staging after every import, and on
 * production before the old CMS goes — `convert.ts <cms> --check`.
 *
 *   every published item is there, and nothing else of its type
 *   its title and SEO are the same
 *   every field that had a value has one, unless the converter leaves it out
 *   every image in its rich text arrived (an asset that failed to upload
 *     renders nothing)
 *   nothing loads from the old CMS
 */

import type { CmsExport, Collection, Item } from "../../src/utils/cms/model.ts";

/** Image and file hosts of the CMSs Trix imports from. */
export const CMS_HOST =
  /https?:\/\/[^\s"')\\]*(website-files\.com|webflow\.com|framerusercontent\.com|wixstatic\.com|squarespace-cdn\.com|ctfassets\.net|sanity\.io|i\d\.wp\.com|\/wp-content\/uploads\/)[^\s"')\\]*/gi;

export interface CmsCheck {
  ok: boolean;
  what: string;
  /** What failed, the first few. */
  detail: string;
}

export interface CompareOptions {
  /** The new CMS's collection for a source collection's key. */
  type: (key: string) => string;
  /** The new CMS's own asset host, which CMS_HOST also matches. */
  ownHost?: string;
  /** Fields the converter leaves out on purpose, per source collection. */
  omitted?: (c: Collection) => Set<string>;
}

export function compareCms(
  source: CmsExport,
  target: CmsExport,
  opts: CompareOptions,
): CmsCheck[] {
  const checks: CmsCheck[] = [];
  const add = (what: string, bad: string[]) =>
    checks.push({
      ok: bad.length === 0,
      what,
      detail:
        bad.slice(0, 5).join(", ") +
        (bad.length > 5 ? `, and ${bad.length - 5} more` : ""),
    });
  const filled = (v: unknown) =>
    v !== undefined &&
    v !== null &&
    v !== "" &&
    !(Array.isArray(v) && v.length === 0);
  const images = (i: Item) =>
    JSON.stringify([i.body ?? "", i.data]).match(/<img\b/g)?.length ?? 0;
  // A published item's reference to a draft is not read back: not a loss.
  const drafts = new Map(
    source.collections.map((c) => [
      c.key,
      new Set(c.items.filter((i) => i.draft).map((i) => i.slug)),
    ]),
  );

  for (const c of source.collections) {
    const type = opts.type(c.key);
    const items = c.items.filter((i) => !i.draft);
    const there = new Map(
      target.collections
        .find((x) => x.key === type)
        ?.items.map((i) => [i.slug, i]),
    );
    const slugs = new Set(items.map((i) => i.slug));
    add(`${c.key}: ${items.length} published, ${there.size} in ${type}`, [
      ...items
        .filter((i) => !there.has(i.slug))
        .map((i) => `${i.slug} missing`),
      ...[...there.keys()]
        .filter((s) => !slugs.has(s))
        .map((s) => `${s} not in the source`),
    ]);

    const pairs = items.flatMap((i) => {
      const t = there.get(i.slug);
      return t ? [[i, t] as const] : [];
    });
    add(
      `${c.key}: titles and SEO match`,
      pairs
        .filter(
          ([a, b]) =>
            a.title !== b.title ||
            (a.seo?.title ?? "") !== (b.seo?.title ?? "") ||
            (a.seo?.description ?? "") !== (b.seo?.description ?? "") ||
            !a.seo?.image !== !b.seo?.image,
        )
        .map(([a]) => a.slug),
    );

    const value = (key: string, v: unknown) => {
      const f = c.fields.find((x) => x.key === key);
      const skip = f?.collection && drafts.get(f.collection);
      if (!skip) return v;
      return Array.isArray(v)
        ? v.filter((s) => !skip.has(String(s)))
        : skip.has(String(v))
          ? undefined
          : v;
    };
    const omitted = opts.omitted?.(c) ?? new Set<string>();
    add(
      `${c.key}: every field with a value has it in ${type}`,
      pairs.flatMap(([a, b]) =>
        Object.keys(a.data)
          .filter(
            (k) =>
              !omitted.has(k) &&
              filled(value(k, a.data[k])) &&
              !filled(b.data[k]),
          )
          .map((k) => `${a.slug}.${k}`),
      ),
    );
    add(
      `${c.key}: every image in rich text arrived`,
      pairs
        .filter(([a, b]) => images(a) !== images(b))
        .map(([a, b]) => `${a.slug} (${images(a)} → ${images(b)})`),
    );
  }

  const old = [...JSON.stringify(target).matchAll(CMS_HOST)]
    .map((m) => m[0])
    .filter((u) => !opts.ownHost || !u.includes(opts.ownHost));
  add("nothing loads from the old CMS", [...new Set(old)]);
  return checks;
}

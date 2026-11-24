/**
 * A CMS template page's SEO, read back from the live site. Webflow binds a
 * collection page's title and description to fields in the page settings
 * ("{Name} | Blog", "{Summary}"), and the API does not say which — so this
 * opens a few published items' old pages, finds the field each title and
 * description was made from, and fills every item's `seo` the same way.
 * Works for any CMS whose items carry `oldPath`.
 *
 *   import.ts webflow --site <id> --seo-from https://www.old-site.com
 *
 * A template that is the item's title plus the site's name needs nothing:
 * the layout adds the name. Anything the pages do not agree on is left as
 * it was, with a warning, for the owner to map by hand.
 */

import { JSDOM } from "jsdom";
import type { CmsExport, Collection, Item } from "../../src/utils/cms/model.ts";

/** Items per collection whose pages are read: they must all agree. */
const SAMPLE = 3;

type Page = { title: string; description: string; image: string };

async function readPage(url: string): Promise<Page | undefined> {
  const r = await fetch(url, { redirect: "follow" }).catch(() => undefined);
  if (!r?.ok) return undefined;
  const doc = new JSDOM(await r.text()).window.document;
  const meta = (sel: string) =>
    doc.querySelector(sel)?.getAttribute("content")?.trim() ?? "";
  return {
    title: doc.querySelector("title")?.textContent?.trim() ?? "",
    description: meta('meta[name="description"]'),
    image: meta('meta[property="og:image"]'),
  };
}

/** The item's text values a template can be made from, longest first. */
function values(item: Item): [string, string][] {
  return (
    [
      ["title", item.title],
      ...Object.entries(item.data).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    ] as [string, string][]
  )
    .filter(([, v]) => v.trim().length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
}

/**
 * `"Hello | Acme Blog"` with title "Hello" → `"{title} | Acme Blog"`. One
 * field per template; text in it that no field explains stays as written.
 */
// ponytail: one field per template; "{title} by {author}" stays a warning.
function template(text: string, item: Item): string | undefined {
  if (!text) return undefined;
  const hit = values(item).find(([, v]) => text.includes(v.trim()));
  return hit ? text.replace(hit[1].trim(), `{${hit[0]}}`) : undefined;
}

const fill = (t: string, item: Item) =>
  t.replace(/\{(\w+)\}/, (_, k: string) =>
    String(k === "title" ? item.title : (item.data[k] ?? "")),
  );

/** A trailing " | Site name": the layout adds the site's own. */
const SITE_SUFFIX = /\s+[|–—-]\s+[^{}|–—]+$/;

export async function seoFromPages(
  data: CmsExport,
  origin: string,
): Promise<string[]> {
  const notes: string[] = [];
  const base = origin.replace(/\/$/, "");
  for (const c of data.collections) {
    const sample = c.items
      .filter((i) => i.oldPath && !i.draft)
      .slice(0, SAMPLE);
    if (!sample.length) continue;
    const pages = await Promise.all(
      sample.map((i) => readPage(`${base}${i.oldPath}`)),
    );
    if (pages.some((p) => !p)) {
      notes.push(
        `${c.folder}: ${sample
          .filter((_, n) => !pages[n])
          .map((i) => `${base}${i.oldPath}`)
          .join(", ")} did not answer — SEO left as imported`,
      );
      continue;
    }
    const agreed = (pick: (p: Page) => string) => {
      const found = sample.map((i, n) => template(pick(pages[n]!), i));
      return found[0] && found.every((t) => t === found[0])
        ? found[0]
        : undefined;
    };
    const title = agreed((p) => p.title);
    const description = agreed((p) => p.description);
    // og:image is an image field when every sampled page shows that field's file.
    const imageField = c.fields.find(
      (f) =>
        f.type === "image" &&
        sample.every((i, n) => {
          const url = (i.data[f.key] as { url?: string } | undefined)?.url;
          return !!url && pages[n]!.image.endsWith(url.split("/").pop()!);
        }),
    );
    apply(c, { title, description, image: imageField?.key }, notes);
    for (const [what, t, p] of [
      ["title", title, (x: Page) => x.title],
      ["description", description, (x: Page) => x.description],
    ] as const)
      if (!t && pages.some((x) => p(x!)))
        notes.push(
          `${c.folder}: the old pages' ${what}s do not come from one field — map them by hand`,
        );
  }
  return notes;
}

function apply(
  c: Collection,
  found: { title?: string; description?: string; image?: string },
  notes: string[],
) {
  // The layout adds " | <site name>", and "{title}" is its default: what is
  // left after both is the only title worth storing.
  const core = found.title?.replace(SITE_SUFFIX, "");
  const title = core && core !== "{title}" ? core : undefined;
  let filled = 0;
  for (const i of c.items) {
    const seo = { ...i.seo };
    if (title && !seo.title) seo.title = fill(title, i);
    if (found.description && !seo.description) {
      const d = fill(found.description, i);
      if (d.trim()) seo.description = d;
    }
    if (found.image && !seo.image) {
      const url = (i.data[found.image] as { url?: string } | undefined)?.url;
      if (url) seo.image = url;
    }
    if (Object.keys(seo).length > Object.keys(i.seo ?? {}).length) filled++;
    if (Object.keys(seo).length) i.seo = seo;
  }
  if (found.title || found.description || found.image)
    notes.push(
      `${c.folder}: SEO from the template page — title ${found.title ? `"${found.title}"` : "not bound"}, description ${found.description ? `"${found.description}"` : "not bound"}, image ${found.image ? `{${found.image}}` : "not bound"}; ${filled} item(s) filled`,
    );
}

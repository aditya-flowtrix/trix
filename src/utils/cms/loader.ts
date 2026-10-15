/**
 * Headless: a content collection that reads the CMS at build time instead of
 * from files, so editors keep working in Webflow or WordPress and every
 * publish rebuilds the site (a deploy hook). Same importers, same shape, same
 * rich-text cleanup as the files scripts/cms/write.ts writes — so a project
 * can start headless and move to files, or back, without touching a page.
 *
 *   // src/content/collections.ts (write.ts --headless generates this)
 *   export const blog = defineCollection({
 *     loader: cmsLoader({ source: "webflow", site: "69bc…", collection: "blog" }),
 *     schema: z.object({ … }),
 *   });
 *
 * Secrets come from the environment at build: WEBFLOW_TOKEN, and for
 * WordPress drafts WP_APP_PASSWORD. Images stay on the CMS's CDN; add its
 * host to `image.domains` in astro.config.mjs to have Astro optimise them.
 */

import { readFileSync } from "node:fs";
import type { Loader } from "astro/loaders";
import { stripPlatformMarkup, type CmsExport } from "./model.ts";
import { fetchWebflow, normalizeWebflow } from "./webflow.ts";
import { fetchWordPress } from "./wordpress.ts";

export type CmsSource =
  | { source: "webflow"; site: string }
  | {
      source: "wordpress";
      url: string;
      user?: string;
      /** Post types to read, and how many of each — for a large site in development. */
      types?: string[];
      limit?: number;
    }
  /** An export saved by scripts/cms/import.ts — offline builds and tests. */
  | { source: "json"; file: string };

// One fetch per source per build, however many collections read it: a
// Webflow site's references span collections, so they are fetched together.
const fetches = new Map<string, Promise<CmsExport>>();
function fetchSource(src: CmsSource): Promise<CmsExport> {
  const key = JSON.stringify(src);
  if (!fetches.has(key))
    fetches.set(
      key,
      (async () => {
        switch (src.source) {
          case "webflow": {
            const token = process.env.WEBFLOW_TOKEN;
            if (!token)
              throw new Error(
                "cmsLoader: set WEBFLOW_TOKEN to read Webflow at build time",
              );
            return normalizeWebflow(
              await fetchWebflow({ token, site: src.site }),
            );
          }
          case "wordpress":
            return fetchWordPress({
              url: src.url,
              user: src.user,
              password: process.env.WP_APP_PASSWORD,
              types: src.types,
              limit: src.limit,
            });
          case "json":
            return JSON.parse(readFileSync(src.file, "utf8")) as CmsExport;
        }
      })(),
    );
  return fetches.get(key)!;
}

/** Image fields as `{ src, alt }`, the shape the files use too. */
function forSchema(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const one = (x: unknown) =>
      x && typeof x === "object" && "url" in x
        ? {
            src: (x as { url: string }).url,
            alt: (x as { alt?: string }).alt ?? "",
          }
        : x;
    out[k] = Array.isArray(v) ? v.map(one) : one(v);
  }
  return out;
}

export function cmsLoader(opts: CmsSource & { collection: string }): Loader {
  return {
    name: `trix-cms-${opts.source}`,
    async load({ store, parseData, generateDigest, logger }) {
      // Without the collection name: every collection shares one fetch.
      const { collection: _, ...source } = opts;
      const all = await fetchSource(source as CmsSource);
      const c = all.collections.find(
        (x) => x.key === opts.collection || x.folder === opts.collection,
      );
      if (!c)
        throw new Error(
          `cmsLoader: no collection "${opts.collection}" in ${all.source} (has ${all.collections.map((x) => x.folder).join(", ")})`,
        );
      store.clear();
      for (const item of c.items) {
        if (item.draft) continue;
        const raw = {
          title: item.title,
          published: item.published,
          updated: item.updated,
          oldPath: item.oldPath,
          seo: item.seo,
          ...forSchema(item.data),
        };
        const body = item.body ? stripPlatformMarkup(item.body) : undefined;
        store.set({
          id: item.slug,
          data: await parseData({ id: item.slug, data: raw }),
          digest: generateDigest({ raw, body: body ?? "" }),
          rendered: body ? { html: body } : undefined,
        });
      }
      logger.info(
        `${c.folder}: ${c.items.filter((i) => !i.draft).length} items from ${all.source}`,
      );
    },
  };
}

#!/usr/bin/env node
/**
 * Step 0 of any migration: what is this site, and what is on it?
 *
 * Detects the platform and the CSS framework it was built with, lists every
 * page (sitemap first, then a same-origin crawl), and records each page's
 * metadata, headings, links, images, forms, embeds, scripts and fonts — the
 * content that has to survive the move.
 *
 * Usage
 *   node scripts/measure/inventory.ts --url https://example.com [--limit 300]
 *   node scripts/measure/inventory.ts --dir path/to/code-export
 *
 * Writes .trix/inventory.json and prints a summary.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { args, launch, open, output, pool, serve } from "./browser.ts";

const opts = args();
const limit = Number(opts.limit ?? 300);
let origin: string;
let start: string;
let close = () => {};
let fromDir: string[] | undefined;

if (typeof opts.dir === "string") {
  const { origin: o, server } = await serve(opts.dir);
  origin = o;
  start = `${o}/`;
  close = () => server.close();
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory()
        ? walk(p)
        : p.endsWith(".html")
          ? [p]
          : [];
    });
  fromDir = walk(opts.dir).map(
    (p) => `/${relative(opts.dir as string, p).replace(/index\.html$/, "")}`,
  );
} else if (typeof opts.url === "string") {
  start = opts.url;
  origin = new URL(opts.url).origin;
} else {
  console.error(
    "usage: inventory.ts --url <https://site> | --dir <export folder> [--limit 300]",
  );
  process.exit(1);
}

async function sitemap(): Promise<string[]> {
  const seen = new Set<string>();
  const read = async (url: string, depth = 0): Promise<void> => {
    if (depth > 2) return;
    try {
      const xml = await (await fetch(url)).text();
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(
        (m) => m[1],
      );
      for (const loc of locs) {
        if (/sitemap[^/]*\.xml$/i.test(loc)) await read(loc, depth + 1);
        else if (new URL(loc).origin === origin)
          seen.add(new URL(loc).pathname);
      }
    } catch {}
  };
  await read(`${origin}/sitemap.xml`);
  if (!seen.size) await read(`${origin}/sitemap_index.xml`);
  return [...seen];
}

const browser = await launch();
const page = await browser.newPage();
await open(page, start);

const platform = await page.evaluate(() => {
  const html = document.documentElement.outerHTML;
  const has = (s: string) => html.includes(s);
  const generator =
    document.querySelector<HTMLMetaElement>('meta[name="generator"]')
      ?.content ?? "";
  const classes = new Set(
    [...document.querySelectorAll("[class]")].flatMap((e) => [...e.classList]),
  );
  const anyClass = (re: RegExp) => [...classes].some((c) => re.test(c));
  const name =
    document.documentElement.dataset.wfSite || has("website-files.com")
      ? "webflow"
      : has("framerusercontent.com") ||
          /framer/i.test(generator) ||
          has("data-framer-name")
        ? "framer"
        : has("/wp-content/") ||
            has("/wp-json/") ||
            /wordpress/i.test(generator)
          ? "wordpress"
          : has("wixstatic.com") || has("wix.com")
            ? "wix"
            : has("squarespace.com") || has("static1.squarespace")
              ? "squarespace"
              : has("cdn.shopify.com")
                ? "shopify"
                : /astro/i.test(generator)
                  ? "astro"
                  : "unknown";
  const frameworks = [
    anyClass(/^u-(section|heading|text|container)$/) &&
      "a u- utility system (u- utilities, data-*-columns)",
    anyClass(/^cc-/) && "a cc- combo-class system (cc- combos, row/col grid)",
    anyClass(/^(padding-global|text-size-|heading-style-)/) &&
      "Finsweet Client-First",
    anyClass(/^relume/) && "Relume",
    anyClass(/^elementor-/) && "Elementor",
    anyClass(/^et_pb_/) && "Divi",
    anyClass(/^wp-block-/) && "Gutenberg blocks",
    anyClass(/^brxe-/) && "Bricks",
    anyClass(/^(oxy-|ct-section)/) && "Oxygen",
    has("gsap") && "GSAP",
    has("swiper") && "Swiper",
    has("lenis") && "Lenis",
    has("jquery") && "jQuery",
  ].filter(Boolean);
  return { name, generator, frameworks };
});

let paths = fromDir ?? (await sitemap());
const via = fromDir ? "export folder" : paths.length ? "sitemap" : "crawl";
if (!paths.length) {
  const queue = ["/"];
  const seen = new Set(queue);
  while (queue.length && seen.size < limit) {
    const path = queue.shift()!;
    try {
      await open(page, origin + path);
      const links = await page.evaluate(() =>
        [...document.querySelectorAll("a[href]")].map(
          (a) => (a as HTMLAnchorElement).href,
        ),
      );
      for (const href of links) {
        const u = new URL(href, origin);
        if (
          u.origin !== origin ||
          /\.(pdf|jpe?g|png|zip|webp|avif|svg)$/i.test(u.pathname)
        )
          continue;
        if (!seen.has(u.pathname)) {
          seen.add(u.pathname);
          queue.push(u.pathname);
        }
      }
    } catch {}
  }
  paths = [...seen];
}
paths = paths.slice(0, limit);

const pages = await pool(paths, 4, async (path) => {
  const p = await browser.newPage();
  try {
    await open(p, origin + path);
    return {
      path,
      ...(await p.evaluate(() => {
        const meta = (sel: string) =>
          document.querySelector<HTMLMetaElement>(sel)?.content ?? null;
        const text = (e: Element) =>
          (e.textContent ?? "").replace(/\s+/g, " ").trim();
        return {
          title: document.title,
          description: meta('meta[name="description"]'),
          canonical:
            document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
              ?.href ?? null,
          ogImage: meta('meta[property="og:image"]'),
          robots: meta('meta[name="robots"]'),
          headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
            (h) => `${h.tagName.toLowerCase()} ${text(h)}`,
          ),
          links: [
            ...new Set(
              [...document.querySelectorAll("a[href]")].map(
                (a) => (a as HTMLAnchorElement).href,
              ),
            ),
          ],
          images: [...document.querySelectorAll("img")].map((i) => ({
            src: i.currentSrc || i.src,
            alt: i.alt,
          })),
          forms: [...document.querySelectorAll("form")].map((f) => ({
            action: f.getAttribute("action"),
            fields: [...f.querySelectorAll("input,select,textarea")].map(
              (x) =>
                `${x.tagName.toLowerCase()}:${x.getAttribute("type") ?? ""}:${x.getAttribute("name") ?? ""}`,
            ),
          })),
          embeds: [
            ...document.querySelectorAll("iframe,video,model-viewer"),
          ].map((e) => e.getAttribute("src") ?? e.tagName.toLowerCase()),
          scripts: [...document.querySelectorAll("script[src]")].map(
            (s) => (s as HTMLScriptElement).src,
          ),
          jsonLd: document.querySelectorAll(
            'script[type="application/ld+json"]',
          ).length,
          fonts: [
            ...new Set(
              [...document.fonts]
                .filter((f) => f.status === "loaded")
                .map((f) => `${f.family} ${f.weight} ${f.style}`),
            ),
          ],
        };
      })),
    };
  } catch (error) {
    return { path, error: String(error) };
  } finally {
    await p.close();
  }
});

await browser.close();
close();

const hosts = (urls: string[]) =>
  [
    ...new Set(
      urls.map((u) => {
        try {
          return new URL(u).host;
        } catch {
          return "";
        }
      }),
    ),
  ].filter(Boolean);
const all = pages.flatMap((p) =>
  "images" in p ? p.images.map((i) => i.src) : [],
);
const result = {
  source: opts.dir ?? opts.url,
  origin,
  measuredAt: new Date().toISOString(),
  platform,
  pagesFoundVia: via,
  imageHosts: hosts(all),
  scriptHosts: hosts(pages.flatMap((p) => ("scripts" in p ? p.scripts : []))),
  fonts: [...new Set(pages.flatMap((p) => ("fonts" in p ? p.fonts : [])))],
  pages,
};
const file = output("inventory.json", JSON.stringify(result, null, 2));

console.log(
  `Platform     ${platform.name}${platform.generator ? ` (${platform.generator})` : ""}`,
);
console.log(
  `Built with   ${platform.frameworks.join(", ") || "no known framework"}`,
);
console.log(
  `Pages        ${pages.length} via ${via}${pages.length === limit ? ` (limit ${limit} reached)` : ""}`,
);
console.log(
  `Forms        ${pages.reduce((n, p) => n + ("forms" in p ? p.forms.length : 0), 0)}`,
);
console.log(`Image hosts  ${result.imageHosts.join(", ")}`);
console.log(`Script hosts ${result.scriptHosts.join(", ")}`);
console.log(`Fonts        ${result.fonts.join(" · ")}`);
const failed = pages.filter((p) => "error" in p);
if (failed.length)
  console.log(`Failed       ${failed.map((p) => p.path).join(", ")}`);
console.log(`\nWrote ${file}`);

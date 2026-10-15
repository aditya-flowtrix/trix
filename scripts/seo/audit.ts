#!/usr/bin/env node
/**
 * Audits a site's SEO page by page in a real browser — what search engines
 * read, not what the source says.
 *
 * Crawls from `/` and every sitemap URL, following internal links, and checks
 * each page: status, title, description, canonical, robots, one h1 and the
 * heading order, image alt text, `lang`, Open Graph, structured data that
 * parses, broken internal links, sitemap and robots.txt agreement, and layout
 * shift and largest paint at phone width (lab values — field data comes from
 * Search Console).
 *
 * Usage
 *   node scripts/seo/audit.ts --dir dist                 the built site
 *   node scripts/seo/audit.ts --url https://example.com  a live or staging site
 *   options: --max 500         pages to visit (default 500)
 *            --production      also fail on a placeholder SITE_URL and on
 *                              robots.txt blocking the site
 *
 * Writes .trix/seo-audit.md and .trix/seo-audit.json. Exit code 1 on errors.
 */

import { args, launch, output, serve } from "../measure/browser.ts";

const opts = args();
let origin: string;
let close = () => {};
if (typeof opts.dir === "string") {
  const s = await serve(opts.dir);
  origin = s.origin;
  close = () => s.server.close();
} else if (typeof opts.url === "string") {
  origin = new URL(opts.url).origin;
} else {
  console.error(
    "usage: audit.ts --dir dist | --url <site> [--max 500] [--production]",
  );
  process.exit(1);
}
const max = Number(opts.max ?? 500);

type Finding = { level: "error" | "warning"; page: string; issue: string };
const findings: Finding[] = [];
const error = (page: string, issue: string) =>
  findings.push({ level: "error", page, issue });
const warn = (page: string, issue: string) =>
  findings.push({ level: "warning", page, issue });

/** A site-relative path for any URL on this site or its canonical host. */
let siteHost: string | undefined;
const pathOf = (href: string, base = origin) => {
  try {
    const u = new URL(href, base);
    if (u.origin !== origin && u.host !== siteHost) return undefined;
    return (
      u.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "") || "/"
    );
  } catch {
    return undefined;
  }
};

const text = async (path: string) => {
  try {
    const r = await fetch(origin + path);
    return r.ok ? await r.text() : undefined;
  } catch {
    return undefined;
  }
};
const locs = (xml: string) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

// Sitemap and robots.txt
const robots = (await text("/robots.txt")) ?? "";
if (!robots) warn("/robots.txt", "missing");
const blocksAll = /^\s*disallow:\s*\/\s*$/im.test(robots);
if (blocksAll)
  (opts.production ? error : warn)(
    "/robots.txt",
    "disallows the whole site — right for staging, wrong in production",
  );
const sitemapUrls: string[] = [];
const queue = [
  ...[...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]),
  "/sitemap-index.xml",
  "/sitemap.xml",
];
const seenMaps = new Set<string>();
while (queue.length) {
  const map = queue.shift()!;
  const path = new URL(map, origin).pathname;
  if (seenMaps.has(path)) continue;
  seenMaps.add(path);
  const xml = await text(path);
  if (!xml) continue;
  for (const loc of locs(xml)) {
    if (!siteHost) siteHost = new URL(loc).host;
    if (/\.xml$/.test(loc)) queue.push(loc);
    else sitemapUrls.push(loc);
  }
}
if (!sitemapUrls.length) warn("/sitemap-index.xml", "no sitemap found");
if (opts.production && siteHost && /example\./.test(siteHost))
  error("src/consts.ts", `SITE_URL is still a placeholder (${siteHost})`);
const inSitemap = new Set(
  sitemapUrls.map((u) => pathOf(u)).filter(Boolean) as string[],
);

// Crawl
type Page = {
  path: string;
  status: number;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  lang: string;
  h1: number;
  headings: number[];
  imagesWithoutAlt: string[];
  og: Record<string, string>;
  schema: { types: string[]; invalid: number };
  links: string[];
  cls: number;
  lcp: number;
};
const pages = new Map<string, Page>();
const todo = ["/", ...inSitemap];
const linkedFrom = new Map<string, string>();
const browser = await launch();
const visit = async (page: import("playwright-core").Page, path: string) => {
  let status = 0;
  try {
    const response = await page.goto(origin + path, {
      waitUntil: "load",
      timeout: 30_000,
    });
    status = response?.status() ?? 0;
  } catch {
    // Chrome turns an empty error response into a failed navigation.
    status = await fetch(origin + path, { method: "HEAD" })
      .then((r) => r.status)
      .catch(() => 0);
  }
  if (status !== 200) {
    pages.set(path, { path, status } as Page);
    return;
  }
  // A late navigation (an error page settling) can reset the page: retry once.
  const collect = () =>
    page.evaluate(async () => {
      const q = (s: string) => document.querySelector(s);
      const meta = (s: string) => q(s)?.getAttribute("content") ?? "";
      let cls = 0;
      let lcp = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[])
          if (!e.hadRecentInput) cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      await new Promise((r) => setTimeout(r, 300));
      const types: string[] = [];
      let invalid = 0;
      for (const s of document.querySelectorAll(
        'script[type="application/ld+json"]',
      )) {
        try {
          const j = JSON.parse(s.textContent ?? "");
          for (const item of Array.isArray(j) ? j : [j]) {
            if (!item["@context"] || !item["@type"]) invalid++;
            else types.push(String(item["@type"]));
          }
        } catch {
          invalid++;
        }
      }
      return {
        title: document.title,
        description: meta('meta[name="description"]'),
        canonical: q('link[rel="canonical"]')?.getAttribute("href") ?? "",
        robots: meta('meta[name="robots"]'),
        lang: document.documentElement.lang,
        h1: document.querySelectorAll("h1").length,
        headings: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
          (h) => Number(h.tagName[1]),
        ),
        imagesWithoutAlt: [...document.querySelectorAll("img:not([alt])")].map(
          (i) =>
            (i as HTMLImageElement).currentSrc || i.getAttribute("src") || "",
        ),
        og: Object.fromEntries(
          ["og:title", "og:description", "og:image", "og:url"].map((p) => [
            p,
            meta(`meta[property="${p}"]`),
          ]),
        ),
        schema: { types, invalid },
        links: [...document.querySelectorAll("a[href]")].map(
          (a) => (a as HTMLAnchorElement).href,
        ),
        cls,
        lcp,
      };
    });
  const data = await collect().catch(async () => {
    await page.waitForLoadState("load");
    return collect();
  });
  const record: Page = { path, status, ...data };
  pages.set(path, record);
  for (const href of data.links) {
    const target = pathOf(href);
    if (!target || /\.(pdf|jpe?g|png|webp|avif|svg|zip|xml|txt)$/i.test(target))
      continue;
    // The first linking page in path order, so the report is the same
    // however the parallel visits finish.
    const from = linkedFrom.get(target);
    if (!from || path < from) linkedFrom.set(target, path);
    if (!pages.has(target)) todo.push(target);
  }
};
// Three pages at a time: a site of hundreds of pages is read in a third of
// the time, which is CI minutes in a private repository.
const claimed = new Set<string>();
let active = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    for (;;) {
      const path = todo.shift();
      if (path === undefined) {
        if (!active) break;
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      if (claimed.has(path) || claimed.size >= max) continue;
      claimed.add(path);
      active++;
      await visit(page, path).finally(() => active--);
    }
    await page.close();
  }),
);
// Path order, not finishing order, so two runs report alike.
const sorted = [...pages].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
pages.clear();
for (const [k, v] of sorted) pages.set(k, v);
await browser.close();
close();

// Judge
const indexable = [...pages.values()].filter(
  (p) => p.status === 200 && !/noindex/i.test(p.robots),
);
for (const p of pages.values()) {
  if (p.status !== 200) {
    error(
      p.path,
      `status ${p.status || "no response"}${linkedFrom.has(p.path) ? ` — linked from ${linkedFrom.get(p.path)}` : ""}${inSitemap.has(p.path) ? " — listed in the sitemap" : ""}`,
    );
    continue;
  }
  // Every page: what breaks for people and parsers.
  if (!p.lang) error(p.path, "<html> has no lang");
  for (const src of p.imagesWithoutAlt.slice(0, 5))
    error(p.path, `image without alt: ${src.split("/").pop()}`);
  if (p.schema.invalid)
    error(
      p.path,
      `${p.schema.invalid} structured data block(s) do not parse or lack @context/@type`,
    );
  if (p.cls > 0.1)
    warn(
      p.path,
      `layout shift ${p.cls.toFixed(3)} at 390px (good is 0.1 or less)`,
    );
  const noindex = /noindex/i.test(p.robots);
  if (noindex && inSitemap.has(p.path))
    error(p.path, "noindex, but listed in the sitemap");
  if (noindex) continue;
  // Indexable pages: what search reads.
  if (sitemapUrls.length && !inSitemap.has(p.path))
    warn(p.path, "indexable, but missing from the sitemap");
  if (!p.title) error(p.path, "no <title>");
  else if (p.title.length > 60)
    warn(p.path, `title is ${p.title.length} characters (over 60 is cut off)`);
  if (!p.description) error(p.path, "no meta description");
  else if (p.description.length < 70 || p.description.length > 160)
    warn(
      p.path,
      `description is ${p.description.length} characters (70–160 reads best)`,
    );
  if (!p.canonical) error(p.path, "no canonical link");
  else if (!/^https?:\/\//.test(p.canonical))
    error(p.path, `canonical is not absolute: ${p.canonical}`);
  else if (/(\.html|\/index)$/.test(new URL(p.canonical).pathname))
    error(
      p.path,
      `canonical is a file name, not the page's URL: ${p.canonical}`,
    );
  else if (pathOf(p.canonical) !== p.path)
    warn(p.path, `canonical points elsewhere: ${p.canonical}`);
  if (p.h1 === 0) error(p.path, "no h1");
  if (p.h1 > 1) warn(p.path, `${p.h1} h1 elements`);
  const skip = p.headings.findIndex(
    (h, i) => i > 0 && h > p.headings[i - 1] + 1,
  );
  if (skip > 0)
    warn(
      p.path,
      `heading level skips from h${p.headings[skip - 1]} to h${p.headings[skip]}`,
    );
  for (const [prop, value] of Object.entries(p.og))
    if (!value) warn(p.path, `no ${prop}`);
  if (p.lcp > 2500)
    warn(
      p.path,
      `largest paint ${Math.round(p.lcp)}ms at 390px (good is 2.5s or less)`,
    );
}
// Internal links should use the exact URL a page declares as canonical;
// any other form (a trailing slash, `.html`) costs a redirect on most hosts.
const linkForms = new Map<string, string>();
for (const p of pages.values())
  for (const href of p.links ?? []) {
    const target = pathOf(href);
    const canonical = target && pages.get(target)?.canonical;
    if (!canonical || !/^https?:/.test(canonical)) continue;
    const raw = new URL(href).pathname;
    const want = new URL(canonical).pathname;
    if (raw !== want && !linkForms.has(raw))
      linkForms.set(raw, `${want} (from ${p.path})`);
  }
for (const [raw, want] of linkForms)
  warn(
    raw,
    `linked as ${raw}, but the page's canonical is ${want} — a redirect on most hosts`,
  );

for (const field of ["title", "description"] as const) {
  const groups = Object.groupBy(indexable, (p) => p[field]);
  for (const [value, list] of Object.entries(groups))
    if (value && list && list.length > 1)
      warn(
        list.map((p) => p.path).join(", "),
        `same ${field} on ${list.length} pages: "${value.slice(0, 60)}"`,
      );
}

const errors = findings.filter((f) => f.level === "error");
const warnings = findings.filter((f) => f.level === "warning");
output(
  "seo-audit.json",
  JSON.stringify({ origin, pages: [...pages.values()], findings }, null, 2),
);
output(
  "seo-audit.md",
  [
    `# SEO audit — ${opts.dir ?? opts.url}`,
    "",
    `${pages.size} pages crawled (${indexable.length} indexable), ${sitemapUrls.length} sitemap URLs. ${errors.length} errors, ${warnings.length} warnings.`,
    "",
    "| Level | Page | Issue |",
    "| --- | --- | --- |",
    ...findings.map(
      (f) =>
        `| ${f.level} | \`${f.page}\` | ${f.issue.replace(/\|/g, "\\|")} |`,
    ),
    "",
    "## Pages",
    "",
    "| Page | Status | Title | Schema | CLS | LCP ms |",
    "| --- | --- | --- | --- | --- | --- |",
    ...[...pages.values()].map(
      (p) =>
        `| \`${p.path}\` | ${p.status} | ${(p.title ?? "").replace(/\|/g, "\\|")} | ${p.schema?.types.join(", ") ?? ""} | ${p.cls?.toFixed(3) ?? ""} | ${p.lcp ? Math.round(p.lcp) : ""} |`,
    ),
  ].join("\n"),
);
console.log(
  `${pages.size} pages · ${errors.length} errors · ${warnings.length} warnings — see .trix/seo-audit.md`,
);
for (const f of errors.slice(0, 20))
  console.log(`  error  ${f.page}  ${f.issue}`);
process.exit(errors.length ? 1 : 0);

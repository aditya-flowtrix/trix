#!/usr/bin/env node
/**
 * Proves a migration keeps its search standing: every URL the old site had
 * still answers on the new one — the same page, or a redirect to its
 * replacement — with its title, description, h1, indexability and structured
 * data carried across.
 *
 * Old URLs come from the old site's sitemap and a crawl from its home page.
 * Redirects are followed live, or read from a CSV (`old,new` per line — the
 * Webflow 301 export, or the project's own list) when the new site is a local
 * build that cannot serve them.
 *
 * Usage
 *   node scripts/seo/parity.ts --old https://old-site.com --new https://staging.example.com
 *   node scripts/seo/parity.ts --old-dir path/to/export --new-dir dist --redirects redirects.csv
 *   options: --max 1000   URLs to compare (default 1000)
 *
 * Writes .trix/seo-parity.md and .trix/seo-parity.json. Exit code 1 when a URL
 * is lost or stops being indexable.
 */

import { readFileSync } from "node:fs";
import type { Page } from "playwright-core";
import { args, launch, output, serve } from "../measure/browser.ts";

const opts = args();
const closers: (() => void)[] = [];
const originOf = async (url: unknown, dir: unknown) => {
  if (typeof dir === "string") {
    const s = await serve(dir);
    closers.push(() => s.server.close());
    return s.origin;
  }
  if (typeof url === "string") return new URL(url).origin;
  return undefined;
};
const oldOrigin = await originOf(opts.old, opts["old-dir"]);
const newOrigin = await originOf(opts.new, opts["new-dir"]);
if (!oldOrigin || !newOrigin) {
  console.error(
    "usage: parity.ts --old <url> | --old-dir <export>  --new <url> | --new-dir dist  [--redirects file.csv] [--max 1000]",
  );
  process.exit(1);
}
const max = Number(opts.max ?? 1000);

/** One form for every path: no .html, no index, no trailing slash. */
const norm = (path: string) =>
  ("/" + path.replace(/^\/+/, ""))
    .replace(/\/index(\.html)?$/, "/")
    .replace(/\.html$/, "")
    .replace(/(.)\/$/, "$1");

const redirects = new Map<string, string>();
if (typeof opts.redirects === "string")
  for (const line of readFileSync(opts.redirects, "utf8").split(/\r?\n/)) {
    const [from, to] = line
      .split(/[,\t]/)
      .map((c) => c?.trim().replace(/^"|"$/g, ""));
    if (!from?.startsWith("/") || !to) continue;
    redirects.set(
      norm(from),
      to.startsWith("http") ? norm(new URL(to).pathname) : norm(to),
    );
  }

type Seo = {
  status: number;
  final: string;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  noindex: boolean;
  schema: string[];
  links: string[];
};

async function read(page: Page, origin: string, path: string): Promise<Seo> {
  let status = 0;
  let final = path;
  try {
    const response = await page.goto(origin + path, {
      waitUntil: "load",
      timeout: 30_000,
    });
    status = response?.status() ?? 0;
    final = norm(new URL(page.url()).pathname);
    // A static redirect page (Astro's `redirects` in a static build).
    const refresh = await page
      .locator('meta[http-equiv="refresh"]')
      .getAttribute("content", { timeout: 500 })
      .catch(() => null);
    const to = refresh?.match(/url=(.+)$/i)?.[1];
    if (to)
      return {
        ...(await read(page, origin, new URL(to, origin + path).pathname)),
        status: 301,
      };
    // Followed a redirect: it counts only if it lands on a page that loads.
    if (status === 200 && response?.request().redirectedFrom()) status = 301;
  } catch {
    status = await fetch(origin + path, { method: "HEAD" })
      .then((r) => r.status)
      .catch(() => 0);
    return {
      status,
      final,
      title: "",
      description: "",
      h1: "",
      canonical: "",
      noindex: false,
      schema: [],
      links: [],
    };
  }
  const data = await page
    .evaluate(() => ({
      title: document.title.trim(),
      description:
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content")
          ?.trim() ?? "",
      h1:
        document
          .querySelector("h1")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
        "",
      noindex: /noindex/i.test(
        document
          .querySelector('meta[name="robots"]')
          ?.getAttribute("content") ?? "",
      ),
      schema: [
        ...document.querySelectorAll('script[type="application/ld+json"]'),
      ].flatMap((s) => {
        try {
          const j = JSON.parse(s.textContent ?? "");
          return (Array.isArray(j) ? j : (j["@graph"] ?? [j])).map(
            (x: { "@type"?: string }) => String(x["@type"]),
          );
        } catch {
          return [];
        }
      }),
      links: [...document.querySelectorAll("a[href]")].map(
        (a) => (a as HTMLAnchorElement).href,
      ),
    }))
    .catch(() => ({
      title: "",
      description: "",
      h1: "",
      canonical: "",
      noindex: false,
      schema: [],
      links: [],
    }));
  return { status, final, ...data };
}

// The old site's URLs: sitemap, then a crawl.
const sitemapPaths: string[] = [];
for (const map of ["/sitemap.xml", "/sitemap-index.xml"]) {
  const xml = await fetch(oldOrigin + map)
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  for (const loc of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const u = new URL(loc[1]);
    if (/\.xml$/.test(u.pathname)) {
      const inner = await fetch(oldOrigin + u.pathname)
        .then((r) => r.text())
        .catch(() => "");
      for (const l of inner.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g))
        sitemapPaths.push(norm(new URL(l[1]).pathname));
    } else sitemapPaths.push(norm(u.pathname));
  }
}

const browser = await launch();
const page = await browser.newPage();
const old = new Map<string, Seo>();
const queue = ["/", ...sitemapPaths];
while (queue.length && old.size < max) {
  const path = norm(queue.shift()!);
  if (old.has(path)) continue;
  const seo = await read(page, oldOrigin, path);
  old.set(path, seo);
  for (const href of seo.links) {
    const u = new URL(href);
    if (
      u.origin !== oldOrigin ||
      /\.(pdf|jpe?g|png|webp|svg|zip|xml|txt)$/i.test(u.pathname)
    )
      continue;
    if (!old.has(norm(u.pathname))) queue.push(u.pathname);
  }
}

type Row = {
  path: string;
  level: "lost" | "changed" | "same";
  to: string;
  notes: string[];
};
const rows: Row[] = [];
for (const [path, before] of old) {
  if (before.status !== 200 || before.noindex) continue; // only what search could rank
  let after = await read(page, newOrigin, path);
  let to = after.final;
  if (after.status === 404 && redirects.has(path)) {
    to = redirects.get(path)!;
    const target = await read(page, newOrigin, to);
    after = { ...target, status: target.status === 200 ? 301 : target.status };
  }
  const notes: string[] = [];
  let level: Row["level"] = "same";
  if (after.status !== 200 && after.status !== 301) {
    level = "lost";
    notes.push(
      to !== path
        ? `redirects to ${to}, which answers ${after.status || "nothing"}`
        : `answers ${after.status || "nothing"} and has no redirect`,
    );
  } else {
    if (after.noindex) {
      level = "lost";
      notes.push("now noindex");
    }
    const compare = (field: "title" | "description" | "h1") => {
      if (before[field] && before[field] !== after[field]) {
        if (level === "same") level = "changed";
        notes.push(
          `${field}: "${before[field].slice(0, 70)}" → "${after[field].slice(0, 70) || "(none)"}"`,
        );
      }
    };
    compare("title");
    compare("description");
    compare("h1");
    const lostTypes = before.schema.filter((t) => !after.schema.includes(t));
    if (lostTypes.length) {
      if (level === "same") level = "changed";
      notes.push(`structured data lost: ${[...new Set(lostTypes)].join(", ")}`);
    }
  }
  rows.push({ path, level, to: to === path ? "" : to, notes });
}
await browser.close();
closers.forEach((c) => c());

const order = { lost: 0, changed: 1, same: 2 };
rows.sort(
  (a, b) => order[a.level] - order[b.level] || a.path.localeCompare(b.path),
);
const count = (l: Row["level"]) => rows.filter((r) => r.level === l).length;
output("seo-parity.json", JSON.stringify(rows, null, 2));
output(
  "seo-parity.md",
  [
    `# SEO parity — ${opts.old ?? opts["old-dir"]} → ${opts.new ?? opts["new-dir"]}`,
    "",
    `${rows.length} indexable old URLs: ${count("same")} same, ${count("changed")} changed, ${count("lost")} lost.`,
    "",
    "**Lost** must be fixed before cutover: a redirect, the page, or the owner's decision to let it go. **Changed** is fine when the change was intended — check each one.",
    "",
    "| Result | Old URL | Now at | Notes |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.level} | \`${r.path}\` | ${r.to ? `\`${r.to}\`` : ""} | ${r.notes.join("<br>").replace(/\|/g, "\\|")} |`,
    ),
  ].join("\n"),
);
console.log(
  `${rows.length} old URLs · ${count("same")} same · ${count("changed")} changed · ${count("lost")} lost — see .trix/seo-parity.md`,
);
for (const r of rows.filter((x) => x.level === "lost").slice(0, 20))
  console.log(`  lost  ${r.path}  ${r.notes.join("; ")}`);
process.exit(count("lost") ? 1 : 0);

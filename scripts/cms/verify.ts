#!/usr/bin/env node
/**
 * Proves a CMS migration is complete — after scripts/cms/write.ts, before
 * the old CMS is switched off.
 *
 *   1. Every item the import read has its file, and every file its item.
 *   2. Astro accepts every file against its schema (astro sync).
 *   3. Nothing still loads from the old CMS: no image or file URL on its
 *      CDN, every local asset the content names exists.
 *   4. Links into the old site's own domain are listed — they break when it
 *      goes (--old-host example.com).
 *   5. With --dist: every item of a routed collection has its page, with its
 *      title.
 *
 * Usage
 *   node scripts/cms/verify.ts [--input .trix/cms/webflow.json] [--old-host example.com] [--dist dist]
 *
 * Writes .trix/cms/verify.md. Exit code 1 on any failure.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { args, output } from "../measure/browser.ts";
import type { CmsExport } from "../../src/utils/cms/model.ts";

const opts = args();
const str = (k: string) =>
  typeof opts[k] === "string" ? (opts[k] as string) : undefined;
const manifest = JSON.parse(
  readFileSync(".trix/cms/manifest.json", "utf8"),
) as {
  collections: Record<
    string,
    {
      folder: string;
      files: string[];
      items: number;
      route?: string;
      loader?: string;
    }
  >;
};
const inputs = str("input")
  ? [str("input")!]
  : readdirSync(".trix/cms")
      .filter((f) => f.endsWith(".json") && f !== "manifest.json")
      .map((f) => `.trix/cms/${f}`);
const imports = inputs.map(
  (f) => JSON.parse(readFileSync(f, "utf8")) as CmsExport,
);

const rows: string[] = [];
let failures = 0;
const check = (what: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  rows.push(
    `| ${ok ? "ok" : "FAIL"} | ${what} | ${detail.replace(/\|/g, "\\|")} |`,
  );
};
const notes: string[] = [];

// 1. Items ↔ files (a headless collection has none: its pages are checked)
for (const [key, c] of Object.entries(manifest.collections)) {
  if (c.loader) {
    check(`${key}: headless — read from the CMS at build`, true, c.loader);
    continue;
  }
  const source = imports
    .flatMap((i) => i.collections)
    .find((x) => x.key === key);
  const onDisk = existsSync(`src/content/${c.folder}`)
    ? readdirSync(`src/content/${c.folder}`).filter((f) => f.endsWith(".md"))
        .length
    : 0;
  const missing = c.files.filter((f) => !existsSync(f));
  const expected = source?.items.length ?? c.items;
  check(
    `${key}: ${expected} items, ${onDisk} files`,
    onDisk === expected && missing.length === 0,
    missing.length
      ? `missing: ${missing.slice(0, 3).join(", ")}`
      : onDisk > expected
        ? "files the import did not write"
        : "",
  );
}

// 2. Schemas
const sync = spawnSync("npx", ["astro", "sync"], { encoding: "utf8" });
const syncOut = `${sync.stdout}\n${sync.stderr}`;
check(
  "astro sync: every file matches its schema",
  sync.status === 0,
  sync.status === 0
    ? ""
    : syncOut
        .split("\n")
        .filter((l) => /error|invalid|expected/i.test(l))
        .slice(0, 4)
        .join(" · "),
);

// 3 + 4. What the content still points at
const CMS_HOST =
  /https?:\/\/[^\s"')]*(website-files\.com|webflow\.com|framerusercontent\.com|wixstatic\.com|squarespace-cdn\.com|ctfassets\.net|sanity\.io|i\d\.wp\.com|\/wp-content\/uploads\/)[^\s"')]*/gi;
// The old site's own hosts: --old-host, and a WordPress source's domain.
const oldHosts = new Set(
  [
    ...(str("old-host")?.split(",") ?? []),
    ...imports
      .filter((i) => i.source.startsWith("wordpress:"))
      .map((i) => new URL(i.source.slice("wordpress:".length)).hostname),
  ].map((h) => h.trim().replace(/^www\./, "")),
);
const FILE_EXT =
  /\.(jpe?g|png|webp|avif|gif|svg|pdf|docx?|xlsx?|pptx?|zip|txt|glb|mp3|mp4|webm|mov)$/i;
const remote = new Set<string>();
const oldLinks = new Set<string>();
const localMissing = new Set<string>();
for (const c of Object.values(manifest.collections))
  for (const file of c.files.filter(existsSync)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(CMS_HOST)) remote.add(m[0]);
    for (const m of text.matchAll(
      /https?:\/\/(?:www\.)?([^/\s"')\\]+)[^\s"')\\]*/g,
    )) {
      if (!oldHosts.has(m[1])) continue;
      // A file on the old site loads from it; a page link only points at it.
      if (FILE_EXT.test(new URL(m[0]).pathname)) remote.add(m[0]);
      else oldLinks.add(m[0]);
    }
    for (const m of text.matchAll(/"(\.\.\/\.\.\/assets\/cms\/[^"]+)"/g))
      if (!existsSync(posix.join(posix.dirname(file), m[1])))
        localMissing.add(m[1]);
    for (const m of text.matchAll(/(?:src|href)=\\?"(\/cms\/[^"\\]+)/g))
      if (!existsSync(`public${m[1]}`)) localMissing.add(m[1]);
    for (const m of text.matchAll(/^[\w"]+: "(\/cms\/[^"]+)"/gm))
      if (!existsSync(`public${m[1]}`)) localMissing.add(m[1]);
  }
check(
  "nothing loads from the old CMS or site",
  remote.size === 0,
  remote.size
    ? `${remote.size}: ${[...remote].slice(0, 3).join(" · ")} — write.ts --host <domain> downloads them`
    : "",
);
check(
  "every local image and file exists",
  localMissing.size === 0,
  [...localMissing].slice(0, 3).join(" · "),
);
if (oldLinks.size)
  notes.push(
    `${oldLinks.size} link(s) into ${[...oldHosts].join(", ")}, which stop working when the old site goes — point them at the new pages, or redirect them:\n  ${[...oldLinks].slice(0, 10).join("\n  ")}`,
  );

// 5. Pages
const dist = str("dist");
if (dist)
  for (const [key, c] of Object.entries(manifest.collections)) {
    if (!c.route) continue;
    const source = imports
      .flatMap((i) => i.collections)
      .find((x) => x.key === key);
    const missingPages: string[] = [];
    for (const item of source?.items ?? []) {
      if (item.draft) continue;
      const base = `${dist}${c.route.replace(/\/$/, "")}/${item.slug}`;
      const file = [`${base}.html`, `${base}/index.html`].find(existsSync);
      const title = item.title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      if (!file || !readFileSync(file, "utf8").includes(title))
        missingPages.push(item.slug);
    }
    check(
      `${key}: a page with its title for every item at ${c.route}/…`,
      missingPages.length === 0,
      missingPages.slice(0, 5).join(", "),
    );
  }

output(
  "cms/verify.md",
  [
    "# CMS verification",
    "",
    "| Result | Check | Detail |",
    "| --- | --- | --- |",
    ...rows,
    "",
    ...notes,
  ].join("\n"),
);
console.log(rows.join("\n"));
if (notes.length) console.log(`\n${notes.join("\n\n")}`);
console.log(
  failures
    ? `\n${failures} failure(s) — see .trix/cms/verify.md`
    : "\nAll checks pass.",
);
process.exit(failures ? 1 : 0);

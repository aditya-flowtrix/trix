#!/usr/bin/env node
/**
 * Reads a CMS into one reviewable file, .trix/cms/<source>.json — nothing in
 * the project changes yet. scripts/cms/write.ts turns it into content.
 *
 * Usage
 *   node scripts/cms/import.ts webflow --site <site id>                (WEBFLOW_TOKEN in the environment)
 *   node scripts/cms/import.ts webflow --json export.json              (saved from the Webflow MCP or API)
 *   node scripts/cms/import.ts wordpress --url https://example.com [--types post,page] [--limit 20]
 *                                         [--user name]                (WP_APP_PASSWORD in the environment: drafts too)
 *   node scripts/cms/import.ts csv --file blog.csv --collection blog [--route /blog]
 *                                   [--slug Slug] [--title Name] [--body Content]
 *                                   [--refs "Categories:blog-categories,Author:authors"]
 *                                   [--types "Summary:text,Video:video"]
 *   node scripts/cms/import.ts json --file normalized.json             (any other CMS, already in the common shape)
 *
 *   --drafts   include unpublished items (they are written with `draft: true`)
 *
 * Tokens and passwords come only from the environment, never from arguments,
 * so they stay out of shell history.
 */

import { readFileSync } from "node:fs";
import { args, output } from "../measure/browser.ts";
import type { CmsExport, FieldType } from "../../src/utils/cms/model.ts";
import {
  fetchWebflow,
  normalizeWebflow,
  type WebflowSite,
} from "../../src/utils/cms/webflow.ts";
import { fetchWordPress } from "../../src/utils/cms/wordpress.ts";
import { csvCollection } from "../../src/utils/cms/csv.ts";

const source = process.argv[2];
const opts = args();
const str = (k: string) =>
  typeof opts[k] === "string" ? (opts[k] as string) : undefined;
const pairs = (k: string) =>
  Object.fromEntries(
    (str(k) ?? "")
      .split(",")
      .filter(Boolean)
      .map((p) => {
        const i = p.lastIndexOf(":");
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      }),
  );

let data: CmsExport;
let name: string;
switch (source) {
  case "webflow": {
    let site: WebflowSite;
    if (str("json")) site = JSON.parse(readFileSync(str("json")!, "utf8"));
    else {
      const token = process.env.WEBFLOW_TOKEN;
      if (!token || !str("site")) {
        console.error(
          "webflow: set WEBFLOW_TOKEN and pass --site <site id>, or pass --json <file>",
        );
        process.exit(1);
      }
      site = await fetchWebflow({
        token,
        site: str("site")!,
        drafts: !!opts.drafts,
      });
    }
    data = normalizeWebflow(site);
    name = "webflow";
    break;
  }
  case "wordpress": {
    if (!str("url")) {
      console.error("wordpress: pass --url https://example.com");
      process.exit(1);
    }
    data = await fetchWordPress({
      url: str("url")!,
      user: str("user"),
      password: process.env.WP_APP_PASSWORD,
      types: str("types")?.split(","),
      limit: str("limit") ? Number(str("limit")) : undefined,
    });
    name = "wordpress";
    break;
  }
  case "csv": {
    if (!str("file") || !str("collection")) {
      console.error("csv: pass --file <export.csv> --collection <name>");
      process.exit(1);
    }
    const c = csvCollection(readFileSync(str("file")!, "utf8"), {
      collection: str("collection")!,
      slug: str("slug"),
      title: str("title"),
      body: str("body"),
      route: str("route"),
      refs: pairs("refs"),
      types: pairs("types") as Record<string, FieldType>,
    });
    data = { source: `csv:${str("file")}`, collections: [c], warnings: [] };
    name = `csv-${str("collection")}`;
    break;
  }
  case "json": {
    data = JSON.parse(readFileSync(str("file")!, "utf8"));
    name = "json";
    break;
  }
  default:
    console.error(
      "usage: import.ts webflow|wordpress|csv|json … (see the header of this file)",
    );
    process.exit(1);
}

if (!opts.drafts)
  for (const c of data.collections) {
    const drafts = c.items.filter((i) => i.draft).length;
    if (drafts)
      data.warnings.push(
        `${c.folder}: ${drafts} unpublished item(s) left out (--drafts keeps them)`,
      );
    c.items = c.items.filter((i) => !i.draft);
  }

const file = output(`cms/${name}.json`, JSON.stringify(data, null, 2));
console.log(`${data.source}\n`);
console.log("| Collection | Items | Body | Fields |");
console.log("| --- | --- | --- | --- |");
for (const c of data.collections)
  console.log(
    `| ${c.folder} | ${c.items.length} | ${c.bodyField ?? "—"} | ${c.fields.map((f) => `${f.key}:${f.type}${f.collection ? `→${f.collection}` : ""}`).join(", ")} |`,
  );
if (data.warnings.length)
  console.log(`\nWarnings:\n  ${data.warnings.join("\n  ")}`);
console.log(
  `\nWrote ${file}. Review it, then: node scripts/cms/write.ts --input ${file}`,
);

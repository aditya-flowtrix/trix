#!/usr/bin/env node
/**
 * Converts an imported CMS (.trix/cms/<source>.json, from scripts/cms/import.ts)
 * into a new headless CMS's own import format. It reads only that file, never
 * the old platform, so it runs again whenever the old CMS changes, until the
 * content freeze. Nothing is sent anywhere: the CMS's own importer does that.
 *
 *   sanity   .trix/cms/sanity.ndjson      a document per line, for `sanity datasets import`
 *            .trix/cms/sanity-schema.ts   the Studio schema those documents need
 *
 * After the import, --check reads the dataset back and compares it with the
 * input: every published item, its title and SEO, every field, every image,
 * nothing left on the old CMS (scripts/cms/compare.ts). Writes nothing but
 * .trix/cms/sanity-check.md.
 *
 * Usage
 *   node scripts/cms/convert.ts sanity --input .trix/cms/webflow.json
 *     --host old-site.com                 rich-text links to this domain become internal links too
 *     --schema studio/schemaTypes/migrated.ts   where to write the Studio schema
 *   node scripts/cms/convert.ts sanity --input .trix/cms/webflow.json --check <project id>/<dataset>
 *                                         (SANITY_READ_TOKEN for a private dataset)
 *
 * Exit code 1 when rich text lost an image, embed or code block on the way,
 * or when --check finds anything missing.
 * The steps around it: .agents/skills/trix-cms/references/headless-cms.md
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { args, output } from "../measure/browser.ts";
import type { CmsExport } from "../../src/utils/cms/model.ts";
import { compareCms } from "./compare.ts";
import { fetchSanity, sanityType } from "../../src/utils/cms/sanity.ts";
import { sanitySchema, seoOnlyFields, toSanity } from "./to-sanity.ts";

const target = process.argv[2];
const opts = args();
const str = (k: string) =>
  typeof opts[k] === "string" ? (opts[k] as string) : undefined;

if (target !== "sanity" || !str("input")) {
  console.error(
    "usage: convert.ts sanity --input .trix/cms/<source>.json [--host old-site.com] [--schema path.ts] [--check <project id>/<dataset>]",
  );
  process.exit(1);
}

const data: CmsExport = JSON.parse(readFileSync(str("input")!, "utf8"));

const check = str("check");
if (check) {
  const [projectId, dataset = ""] = check.split("/");
  const checks = compareCms(
    data,
    await fetchSanity({
      projectId,
      dataset,
      token: process.env.SANITY_READ_TOKEN,
    }),
    { type: sanityType, ownHost: "cdn.sanity.io", omitted: seoOnlyFields },
  );
  const rows = checks.map(
    (c) =>
      `| ${c.ok ? "ok" : c.warn ? "warn" : "FAIL"} | ${c.what} | ${c.detail.replace(/\|/g, "\\|")} |`,
  );
  const failures = checks.filter((c) => !c.ok && !c.warn).length;
  const gaps = checks.filter((c) => !c.ok && c.warn).length;
  output(
    "cms/sanity-check.md",
    [
      `# ${data.source} → Sanity ${check}`,
      "",
      "| Result | Check | Detail |",
      "| --- | --- | --- |",
      ...rows,
    ].join("\n"),
  );
  console.log(rows.join("\n"));
  console.log(
    (failures
      ? `\n${failures} failure(s) — see .trix/cms/sanity-check.md`
      : "\nAll checks pass.") +
      (gaps
        ? `\n${gaps} warning(s): content the source lacked too. Fill it in the CMS before launch — editors, or Sanity's Content Agent on staging.`
        : ""),
  );
  process.exit(failures ? 1 : 0);
}
const { docs, warnings, lost, counts } = toSanity(data, {
  hosts: str("host")?.split(","),
});

const file = output(
  "cms/sanity.ndjson",
  docs.map((d) => JSON.stringify(d)).join("\n") + "\n",
);
const schemaPath = str("schema") ?? ".trix/cms/sanity-schema.ts";
mkdirSync(dirname(schemaPath), { recursive: true });
writeFileSync(schemaPath, sanitySchema(data));

console.log(`${data.source} → Sanity\n`);
console.log(
  "| Type | Documents | Assets | Rich text: images, embeds, code in → out |",
);
console.log("| --- | --- | --- | --- |");
for (const [type, c] of Object.entries(counts))
  console.log(
    `| ${type} | ${c.docs} | ${c.assets} | ${c.patternsIn} → ${c.blocksOut} |`,
  );
if (warnings.length) console.log(`\nWarnings:\n  ${warnings.join("\n  ")}`);
if (lost.length) console.log(`\nLost in rich text:\n  ${lost.join("\n  ")}`);
console.log(`
Wrote ${file} and ${schemaPath}. Next, with the schema in the Studio:
  npx sanity@latest documents validate --file <path to ${file}> --level error   (in the Studio's folder)
  npx sanity@latest datasets import ${file} -p <project id> -d staging --replace   (SANITY_IMPORT_TOKEN in the environment, webhooks off)
  node scripts/cms/convert.ts sanity --input ${str("input")} --check <project id>/staging`);
if (lost.length) process.exit(1);

#!/usr/bin/env node
/**
 * Measures a built page section by section, to compare with the design frame.
 *
 * Lists each top-level block — the nav, every child of <main>, the footer —
 * with its top and height, and whether the page scrolls sideways. Given the
 * design's heights in the same order (`get_metadata`'s top-level frames, or
 * read off the file), it prints the difference and flags any section off by
 * more than the tolerance. `--shots` saves one screenshot per section.
 *
 * Usage
 *   node scripts/measure/sections.ts --url http://localhost:4321/
 *   node scripts/measure/sections.ts --url http://localhost:4321/ --widths 1440,375 \
 *     --expect 970,162,800 --tolerance 16 --shots
 *
 * Exit code 1 when a section is off by more than the tolerance at the first
 * width, or any width scrolls sideways. Writes .trix/sections.md (and
 * .trix/sections/<width>-<n>.png with --shots).
 */

import { args, launch, open, output } from "./browser.ts";

const opts = args();
if (typeof opts.url !== "string") {
  console.error(
    "usage: sections.ts --url <page> [--widths 1440,375] [--expect h1,h2,…] [--tolerance 16] [--shots]",
  );
  process.exit(1);
}
const widths = String(opts.widths ?? "1440,375")
  .split(",")
  .map(Number);
const expect =
  typeof opts.expect === "string" ? opts.expect.split(",").map(Number) : [];
const tolerance = Number(opts.tolerance ?? 16);

const browser = await launch();
const page = await browser.newPage();
const rows: string[] = [];
let failures = 0;

for (const [w, width] of widths.entries()) {
  await open(page, opts.url, width);
  const blocks = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "body > header, body > nav, main > *, body > footer",
      ),
    ].map((el) => {
      const box = el.getBoundingClientRect();
      return {
        name: `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")}`,
        top: Math.round(box.top + scrollY),
        height: Math.round(box.height),
      };
    }),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  );
  if (overflow > 0) failures++;

  rows.push(
    `## ${width}px${overflow > 0 ? ` — scrolls sideways by ${overflow}px` : ""}`,
    "",
    "| # | Block | Top | Height | Design | Δ |",
    "| - | ----- | --- | ------ | ------ | - |",
  );
  for (const [i, block] of blocks.entries()) {
    // Design heights are for the measured frame: compare at the first width only.
    const design = w === 0 ? expect[i] : undefined;
    const delta = design === undefined ? undefined : block.height - design;
    const off = delta !== undefined && Math.abs(delta) > tolerance;
    if (off) failures++;
    rows.push(
      `| ${i} | \`${block.name}\` | ${block.top} | ${block.height} | ${design ?? ""} | ${delta === undefined ? "" : `${delta > 0 ? "+" : ""}${delta}${off ? " ✗" : ""}`} |`,
    );
    if (opts.shots) {
      const el = (
        await page.$$("body > header, body > nav, main > *, body > footer")
      )[i];
      await el?.screenshot({
        path: output(`sections/${width}-${i}.png`, ""),
      });
    }
  }
  rows.push("");
}

await browser.close();
const path = output(
  "sections.md",
  `# Sections — ${opts.url}\n\n${rows.join("\n")}`,
);
console.log(rows.join("\n"));
console.log(`\nWrote ${path}${failures ? ` — ${failures} problem(s)` : ""}`);
process.exit(failures ? 1 : 0);

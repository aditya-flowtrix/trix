#!/usr/bin/env node
/**
 * `/trix-import-figma`'s converter on a new project's Figma variables export:
 * Desktop and Mobile modes paired, a Mobile 0 read as "not drawn", type rows
 * matched by name in --fresh, Figma labels turned into token names, and a
 * palette name Figma can't hold flagged.
 *
 * Usage
 *   npm run test:import-figma
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const convert = (...args: string[]) =>
  execFileSync(
    "node",
    [".agents/skills/trix-import-figma/convert.mjs", ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );

const dir = mkdtempSync(join(tmpdir(), "trix-figma-"));
const write = (file: string, json: object) =>
  writeFileSync(join(dir, file), JSON.stringify(json));
const sizes = (n: (px: number) => number) => ({
  "font-size": {
    $type: "number",
    xxl: { $value: n(120) },
    xl: { $value: n(62) },
    xs: { $value: n(12) },
  },
});
write(
  "Desktop.tokens.json",
  sizes((px) => px),
);
write("Mobile.tokens.json", {
  ...sizes(() => 0),
  "font-size": { ...sizes(() => 0)["font-size"], xxl: { $value: 64 } },
});
write("Color.tokens.json", {
  color: {
    $type: "color",
    plum: { "Plum-400 (Violet)": { $value: "#735385" } },
    grey: {
      "grey-10": { $value: "#FAFAFA" },
      Grey: { $value: "#272727" },
    },
  },
});

// The export → the inventory: Mobile 64 is a min, Mobile 0 is no min at all.
const inventory = JSON.parse(convert("--from-figma", dir));
const xxl = inventory.type.find((t: any) => t.name === "font-size/xxl");
const xl = inventory.type.find((t: any) => t.name === "font-size/xl");
assert.equal(xxl.mobilePx, 64);
assert.equal(xl.sizePx, 62);
assert.equal(xl.mobilePx, undefined);
assert.equal(inventory.color.length, 3);

// A new project: rows named h1 and eyebrow replace those styles by name.
const tokens = ["display", "h1", "eyebrow"];
inventory.type.forEach((t: any, i: number) => (t.token = tokens[i]));
const design = join(dir, "design.json");
writeFileSync(design, JSON.stringify(inventory));
const out = convert("--json", design, "--fresh");

assert.match(out, /\/\* Text style — display \*\/\n {2}--display-min: 64;/);
assert.match(out, /--h1-max: 62;/);
assert.match(
  out,
  /--h1-min: \d+ — no mobile value; [\d.]+ × 62, the ratio of --h1/,
);
assert.match(out, /\/\* Text style — eyebrow \*\//); // eyebrow is a text style
assert.match(out, /--plum-400: #735385;/); // label → kebab, (aside) dropped
assert.match(out, /--grey sits beside --grey-/); // Figma can't hold both
assert.doesNotMatch(out, /--h1-min: 0;/);

console.log("Figma import OK.");

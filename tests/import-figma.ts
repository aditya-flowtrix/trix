#!/usr/bin/env node
/**
 * `/trix-import-figma`'s converter on a new project's Figma variables export:
 * Desktop and Mobile modes paired, a Mobile 0 read as "not drawn", type rows
 * matched by name in --fresh, Figma labels turned into token names, and a
 * palette name Figma can't hold flagged. Then the pattern finder on a frame's
 * metadata: what probably moves is found, what doesn't is left alone.
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

// What moves: a logo row, a slider past the edge, a before/after handle, a
// hidden state — and the page's side rules and a plain grid, which are not.
const logos = Array.from(
  { length: 8 },
  (_, i) =>
    `<rounded-rectangle id="3:${i + 1}" name="logo" x="${80 + i * 150}" y="0" width="100" height="40" />`,
).join("");
const meta = join(dir, "meta.xml");
writeFileSync(
  meta,
  `Currently selected nodes:
- 1:1: Home

<frame id="1:1" name="Home" x="500" y="300" width="1440" height="3000">
  <line id="2:1" name="Line" x="64" y="0" width="0" height="3000" />
  <line id="2:2" name="Line" x="1376" y="0" width="0" height="3000" />
  <frame id="3:0" name="Frame 9" x="64" y="200" width="1312" height="40">${logos}</frame>
  <frame id="4:0" name="Frame 10" x="104" y="400" width="1232" height="800">
    <frame id="4:1" name="left" x="0" y="0" width="616" height="800" />
    <frame id="4:2" name="Frame" x="606" y="0" width="20" height="800">
      <vector id="4:3" name="Vector" x="10" y="0" width="0" height="800" />
      <frame id="4:4" name="Button" x="-15" y="375" width="50" height="50" />
    </frame>
  </frame>
  <frame id="5:0" name="Frame 11" x="104" y="1300" width="1232" height="400">
    <frame id="5:1" name="Frame 12" x="0" y="0" width="390" height="400" />
    <frame id="5:2" name="Frame 13" x="420" y="0" width="390" height="400" />
    <frame id="5:3" name="Frame 14" x="840" y="0" width="390" height="400" />
  </frame>
  <frame id="6:0" name="Frame 15" x="104" y="1800" width="1232" height="500">
    <frame id="6:1" name="Frame 16" x="1100" y="0" width="48" height="48" />
    <frame id="6:2" name="Frame 17" x="1160" y="0" width="48" height="48" />
    <frame id="6:3" name="Frame 18" x="0" y="80" width="1232" height="400">
      <frame id="6:4" name="card" x="0" y="0" width="830" height="400" />
      <frame id="6:5" name="card" x="850" y="0" width="830" height="400" />
    </frame>
  </frame>
  <frame id="7:0" name="Frame 19" x="104" y="2400" width="600" height="200">
    <frame id="7:1" name="Frame 20" x="0" y="0" width="600" height="200"><text id="7:2" name="a" x="0" y="0" width="10" height="10" /></frame>
    <frame id="7:3" name="Frame 21" x="0" y="0" width="600" height="200" hidden="true"><text id="7:4" name="b" x="0" y="0" width="10" height="10" /></frame>
  </frame>
</frame>`,
);
const found = JSON.parse(
  execFileSync(
    "node",
    [".agents/skills/trix-import-figma/patterns.mjs", "--xml", meta, "--json"],
    { encoding: "utf8" },
  ),
);
assert.deepEqual(Object.fromEntries(found.map((f: any) => [f.id, f.kind])), {
  "3:0": "marquee",
  "4:2": "compare",
  "6:3": "slider",
  "7:1": "state",
});
assert.match(found.find((f: any) => f.id === "6:3").evidence[1], /48px square/);

console.log("Figma import OK.");

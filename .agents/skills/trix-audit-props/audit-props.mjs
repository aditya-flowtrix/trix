#!/usr/bin/env node
/**
 * Checks that the component API reads as one API.
 *
 * Two things drift once a library has more than a few components: the order
 * props are declared in, and the words used to describe the same prop twice.
 * Neither breaks a build, both are felt every time someone types `<` and reads
 * the autocomplete.
 *
 * Nothing here is rewritten — the fixes are judgement calls about wording and
 * intent. This reports, and the skill decides.
 *
 * Usage: node audit-props.mjs [src/components] [--json]
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { readComponent as readProps } from "../../../scripts/props.ts";

const root =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : "src/components";
const asJson = process.argv.includes("--json");

const RENDER_DOC = "Set to `false` to omit the component.";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(full) === ".astro") out.push(full);
  }
  return out;
}

/** Props in declaration order, each with the doc comment above it. */
function readComponent(file) {
  return { file: relative(root, file), ...readProps(file) };
}

const components = walk(root)
  .map(readComponent)
  .filter((c) => c.props.length);

/* ---------- 1. render, the one prop every component shares ---------- */
const renderIssues = [];
const renderAdvisories = [];
for (const c of components) {
  const i = c.props.findIndex((p) => p.name === "render");
  if (i === -1) renderIssues.push([c.file, "no render prop"]);
  else if (i !== 0 && !c.multiBlock)
    renderIssues.push([c.file, `render is #${i + 1}, not first`]);
  else if (i !== 0)
    renderAdvisories.push([
      c.file,
      `render is #${i + 1} in file order — props span several type aliases, so read it by hand`,
    ]);
  else if (c.props[0].doc !== RENDER_DOC)
    renderIssues.push([
      c.file,
      `render's wording differs: "${c.props[0].doc ?? "(none)"}"`,
    ]);
}

/* ---------- 2. relative order of props that co-occur ----------
   For every pair of prop names appearing together in two or more components,
   the order should be the same everywhere. Where it is not, the majority is
   the convention and the rest are the drift. */
const pairOrder = new Map();
/* A discriminated union writes its branches in the order the variants demand:
   the discriminant leads each branch, and shared props sit in a base type.
   There is no single declaration order to compare, so these are listed for a
   hand read instead of being reported as drift. */
const unionComponents = components
  .filter((c) => c.multiBlock)
  .map((c) => c.file);
for (const c of components) {
  if (c.multiBlock) continue;
  const names = c.props.map((p) => p.name);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [names[i], names[j]];
      if (a === "render" || b === "render") continue; // covered by its own check
      const key = [a, b].sort().join("|");
      const forward = key.split("|")[0] === a;
      const entry = pairOrder.get(key) ?? { forward: [], backward: [] };
      entry[forward ? "forward" : "backward"].push(c.file);
      pairOrder.set(key, entry);
    }
  }
}
const orderConflicts = [];
for (const [key, { forward, backward }] of pairOrder) {
  if (!forward.length || !backward.length) continue;
  /* One against one is not a convention, it is a coin toss. */
  if (Math.max(forward.length, backward.length) < 2) continue;
  if (forward.length === backward.length) continue;
  const [a, b] = key.split("|");
  const majorityFirst = forward.length >= backward.length ? a : b;
  const minority = forward.length >= backward.length ? backward : forward;
  const majority = forward.length >= backward.length ? forward : backward;
  orderConflicts.push({
    pair: [a, b],
    convention: `${majorityFirst} before ${majorityFirst === a ? b : a}`,
    majority: majority.length,
    offenders: minority,
  });
}
orderConflicts.sort(
  (x, y) => y.majority - x.majority || y.offenders.length - x.offenders.length,
);

/* ---------- 3. how docs are written ----------
   The prose differs by necessity. The shape should not: selectable props
   describe the decision without duplicating their values, scalar defaults use
   a sentence, and numbers state their range. */
const optionLists = [];
const numberNoRange = [];

for (const c of components) {
  for (const p of c.props) {
    if (!p.doc) continue;
    const hasBullets = /- `/.test(p.doc);
    if (hasBullets) optionLists.push(`${c.file}:${p.name}`);
    if (
      /^number$/.test(p.type.replace(/\s/g, "")) &&
      !/@(min|max|int)\b/.test(p.doc)
    ) {
      numberNoRange.push(`${c.file}:${p.name}`);
    }
  }
}

const styleFindings = [];
const plainWithInline = [];
for (const c of components) {
  for (const p of c.props) {
    if (!p.doc) continue;
    const hasBullets = /- `/.test(p.doc);
    if (!hasBullets && /\(default\)/.test(p.doc))
      plainWithInline.push(`${c.file}:${p.name}`);
  }
}
if (optionLists.length) {
  styleFindings.push({
    what: "tooltip duplicates selectable prop values",
    detail: "describe the decision only; keep values in the type definition",
    where: optionLists,
  });
}
if (plainWithInline.length) {
  styleFindings.push({
    what: "single-value prop marked `(default)`",
    detail: 'with no options to mark, say "Defaults to `x`."',
    where: plainWithInline,
  });
}
if (numberNoRange.length) {
  styleFindings.push({
    what: "number prop with no @min/@max",
    detail: "Grid and Overlay state @min/@max/@int; these say nothing",
    where: numberNoRange,
  });
}

/* ---------- 4. undocumented props ---------- */
const undocumented = [];
for (const c of components) {
  const bare = c.props
    .filter((p) => !p.doc && p.name !== "class")
    .map((p) => p.name);
  if (bare.length) undocumented.push([c.file, bare]);
}

/* ---------- 5. destructuring that disagrees with declaration ---------- */
const destructureIssues = [];
for (const c of components) {
  if (c.multiBlock) continue; // branch order is not a style choice
  const declared = c.props.map((p) => p.name);
  const inBoth = c.destructured.filter((n) => declared.includes(n));
  const expected = declared.filter((n) => inBoth.includes(n));
  if (inBoth.join(",") !== expected.join(",")) {
    destructureIssues.push([
      c.file,
      `declared ${expected.join(", ")} · destructured ${inBoth.join(", ")}`,
    ]);
  }
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        renderIssues,
        orderConflicts,
        styleFindings,
        undocumented,
        destructureIssues,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const rule = "─".repeat(70);
console.log(`${components.length} components in ${root}\n${rule}`);

console.log("\nRENDER — the prop every component shares");
if (!renderIssues.length && !renderAdvisories.length)
  console.log("  consistent everywhere");
for (const [file, why] of renderIssues)
  console.log(`  ${file.padEnd(34)} ${why}`);
for (const [file, why] of renderAdvisories)
  console.log(`  note  ${file.padEnd(28)} ${why}`);

console.log("\nPROP ORDER — pairs declared in conflicting orders");
if (unionComponents.length) {
  console.log(`  (skipped, props span a union: ${unionComponents.join(", ")})`);
}
if (!orderConflicts.length) console.log("  no conflicts");
for (const c of orderConflicts) {
  console.log(
    `  ${c.convention.padEnd(30)} in ${c.majority} component(s); differs in:`,
  );
  for (const f of c.offenders) console.log(`      ${f}`);
}

console.log("\nDOC STYLE — prose differs by necessity, shape should not");
if (!styleFindings.length) console.log("  consistent");
for (const f of styleFindings) {
  console.log(`  ${f.what}`);
  console.log(`      ${f.detail}`);
  for (const w of f.where) console.log(`      ${w}`);
}

console.log("\nUNDOCUMENTED — props with no tooltip");
if (!undocumented.length) console.log("  every prop is documented");
for (const [file, names] of undocumented) {
  console.log(`  ${file.padEnd(34)} ${names.join(", ")}`);
}

console.log("\nDESTRUCTURING — order disagrees with the declaration");
if (!destructureIssues.length) console.log("  matches everywhere");
for (const [file, detail] of destructureIssues)
  console.log(`  ${file}\n      ${detail}`);

const total =
  renderIssues.length +
  orderConflicts.length +
  styleFindings.length +
  undocumented.length +
  destructureIssues.length;
console.log(
  `\n${rule}\n${total} finding(s)${renderAdvisories.length ? ` and ${renderAdvisories.length} note(s)` : ""}. None break a build; all are felt in autocomplete.`,
);
process.exit(total ? 1 : 0);

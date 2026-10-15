#!/usr/bin/env node
/**
 * Finds the parts of a Figma frame that probably move or respond — a
 * marquee, a slider, a before/after compare, an accordion, tabs, a second
 * state — from the frame's structure, and writes each as a question for the
 * user. A frame is a still picture: these are questions, not answers.
 *
 * Input: the XML `get_metadata` returns for the page frame, saved to a file.
 * Positions are read relative to that frame.
 *
 * Usage
 *   node .agents/skills/trix-import-figma/patterns.mjs --xml home.xml
 *   node .agents/skills/trix-import-figma/patterns.mjs --xml home.xml --json
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = flag("xml");
if (!file) {
  console.error("usage: patterns.mjs --xml <get_metadata output> [--json]");
  process.exit(1);
}

/* ---------- the tree ---------- */

function parse(xml) {
  const root = { children: [], ax: 0, ay: 0 };
  const stack = [root];
  for (const m of xml.matchAll(/<(\/?)([a-z][\w-]*)([^<>]*?)(\/?)>/g)) {
    const [, close, tag, attrs, self] = m;
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const a = Object.fromEntries(
      [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]),
    );
    const parent = stack.at(-1);
    const node = {
      tag,
      id: a.id ?? "",
      name: a.name ?? "",
      x: Number(a.x) || 0,
      y: Number(a.y) || 0,
      w: Number(a.width) || 0,
      h: Number(a.height) || 0,
      hidden: a.hidden === "true" || parent.hidden === true,
      children: [],
      parent,
    };
    // The page frame is the origin; everything inside is relative to it.
    const top = parent === root;
    node.ax = top ? 0 : parent.ax + node.x;
    node.ay = top ? 0 : parent.ay + node.y;
    parent.children.push(node);
    if (!self) stack.push(node);
  }
  return root.children[0];
}

const page = parse(readFileSync(file, "utf8"));
if (!page) {
  console.error(
    `${file}: no frame found — save get_metadata's output for the page frame.`,
  );
  process.exit(1);
}

const all = [];
(function walk(n) {
  for (const c of n.children) {
    all.push(c);
    walk(c);
  }
})(page);
const visible = all.filter((n) => !n.hidden);
const kids = (n) => n.children.filter((c) => !c.hidden);

const LINE = /^(line|vector)$/;
const IMAGE = /^(rounded-rectangle|rectangle|image|vector|ellipse|instance)$/;
const GENERIC =
  /^(frame|div|group|image|rectangle|ellipse|vector|line|layer|component|instance|text)?[\s\d:_-]*$/i;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const near = (a, b, d) => Math.abs(a - b) <= d;
const where = (n) => `y ${Math.round(n.ay)}–${Math.round(n.ay + n.h)}`;
const inSubtree = (n, root) => {
  for (let p = n; p; p = p.parent) if (p === root) return true;
  return false;
};
/** The section a node sits in: its highest ancestor under half the page tall, so a wrapper around everything is skipped. */
const section = (n) => {
  let band = n;
  for (let p = n.parent; p && p !== page; p = p.parent)
    if (p.h < page.h * 0.5) band = p;
  return band;
};

/* ---------- the patterns ---------- */

const findings = [];
const flagged = new Set();
const add = (node, finding) => {
  if (flagged.has(node.id)) return;
  flagged.add(node.id);
  findings.push({
    id: node.id,
    name: node.name,
    where: where(node),
    ...finding,
  });
};

/** Two same-size squares side by side in the node's band: arrow buttons. */
function arrows(node) {
  const band = section(node);
  const squares = visible.filter(
    (n) =>
      inSubtree(n, band) &&
      n.w >= 24 &&
      n.w <= 64 &&
      near(n.w, n.h, 2) &&
      !inSubtree(n, node),
  );
  for (const a of squares)
    for (const b of squares)
      if (
        a !== b &&
        a.parent === b.parent &&
        near(a.w, b.w, 1) &&
        near(a.ay, b.ay, 2) &&
        b.ax > a.ax &&
        b.ax - (a.ax + a.w) < 120
      )
        return a.w;
  return 0;
}

// Before/after compare: a long thin line with a small square handle on it.
for (const line of visible) {
  if (!(line.w <= 3 && line.h >= 150)) continue;
  const cx = line.ax + line.w / 2;
  if (cx < page.w * 0.15 || cx > page.w * 0.85) continue;
  const handle = visible.find(
    (n) =>
      n !== line &&
      n.w >= 24 &&
      n.w <= 96 &&
      near(n.w, n.h, 6) &&
      near(n.ax + n.w / 2, cx, 8) &&
      n.ay >= line.ay &&
      n.ay + n.h <= line.ay + line.h &&
      !inSubtree(line, n),
  );
  if (!handle) continue;
  const host = section(line);
  add(line.parent ?? line, {
    kind: "compare",
    component: "Compare",
    evidence: [
      `a ${Math.round(line.h)}px line at ${Math.round(((cx - host.ax) / host.w) * 100)}% of the width`,
      `a ${Math.round(handle.w)}px handle centred on it ("${handle.name}")`,
    ],
    question: `The line with a handle at ${where(line)} splits two pictures. Is it a before/after compare the visitor drags?`,
    options: ["Before/after compare", "Static image", "Something else"],
    suggested: "Before/after compare",
  });
}

// A row of five or more images across the width: a marquee or a still row.
for (const row of visible) {
  const items = kids(row).filter((c) => !(LINE.test(c.tag) && c.w <= 3));
  if (items.length < 5) continue;
  const mid = median(items.map((c) => c.y + c.h / 2));
  const tol = Math.max(12, median(items.map((c) => c.h)) * 0.3);
  if (!items.every((c) => near(c.y + c.h / 2, mid, tol))) continue;
  const sorted = [...items].sort((a, b) => a.x - b.x);
  if (sorted.some((c, i) => i && c.x < sorted[i - 1].x + sorted[i - 1].w - 2))
    continue;
  const images = items.filter(
    (c) =>
      IMAGE.test(c.tag) || /logo|image|img|brand|client|partner/i.test(c.name),
  );
  if (images.length < items.length * 0.6) continue;
  const left = sorted[0].x;
  const right = sorted.at(-1).x + sorted.at(-1).w;
  const spread = right - left;
  if (spread < page.w * 0.5) continue;
  const overflow = left < -4 || right > row.w + 4;
  const sizes = sorted.map((c) => `${Math.round(c.w)}x${Math.round(c.h)}`);
  const half = Math.floor(sizes.length / 2);
  const repeats =
    sizes.length >= 6 &&
    sizes.slice(0, half).join() === sizes.slice(half, half * 2).join();
  add(row, {
    kind: "marquee",
    component: "Marquee",
    evidence: [
      `${items.length} images in one row across ${Math.round((spread / row.w) * 100)}% of the width (${Math.round(spread)} of ${Math.round(row.w)}px)`,
      ...(overflow ? ["the row runs past the frame's edge"] : []),
      ...(repeats
        ? ["the row repeats itself — drawn for a seamless loop"]
        : []),
    ],
    question: `Does the row of ${items.length} images at ${where(row)} scroll on its own (a marquee), or stay still?`,
    options: ["Marquee", "Static row", "Slider"],
    suggested: overflow || repeats ? "Marquee" : null,
  });
}

// Blocks of one size in a row that runs past the frame: a slider.
for (const row of visible) {
  if (row === page) continue;
  const blocks = kids(row).filter((c) => c.w >= 120 && c.h >= 80);
  if (blocks.length < 2) continue;
  const w = median(blocks.map((c) => c.w));
  const h = median(blocks.map((c) => c.h));
  const same = blocks.filter(
    (c) => near(c.w, w, w * 0.15) && near(c.h, h, h * 0.15),
  );
  if (same.length < 2 || !same.every((c) => near(c.y, same[0].y, 10))) continue;
  const right = Math.max(...same.map((c) => c.x + c.w));
  const left = Math.min(...same.map((c) => c.x));
  if (!(right > row.w + 4 || left < -4)) continue;
  const square = arrows(row);
  add(row, {
    kind: "slider",
    component: "Slider",
    evidence: [
      `${same.length} blocks ${Math.round(w)}×${Math.round(h)}px run to ${Math.round(right)}px in a ${Math.round(row.w)}px frame`,
      ...(square ? [`two ${square}px square buttons beside it — arrows`] : []),
    ],
    question: `The ${same.length} blocks at ${where(row)} run past the frame's edge${square ? ", with two square buttons" : ""}. Is it a slider?`,
    options: ["Slider", "Static grid", "Marquee"],
    suggested: "Slider",
  });
}

// Rows stacked with an icon at the end of each: an accordion.
for (const list of visible) {
  const rows = kids(list).filter((c) => c.h > 0 && c.h <= 160);
  if (rows.length < 3) continue;
  if (!rows.every((c) => near(c.x, rows[0].x, 2) && near(c.w, rows[0].w, 2)))
    continue;
  const iconAtEnd = (r) =>
    visible.some(
      (n) =>
        inSubtree(n, r) &&
        n !== r &&
        n.w >= 12 &&
        n.w <= 32 &&
        near(n.w, n.h, 2) &&
        r.ax + r.w - (n.ax + n.w) <= 48,
    );
  if (!rows.every(iconAtEnd)) continue;
  const tallest = Math.max(...rows.map((r) => r.h));
  const open = rows.filter((r) => r.h > median(rows.map((x) => x.h)) * 1.5);
  add(list, {
    kind: "accordion",
    component: "Accordion",
    evidence: [
      `${rows.length} rows of one width stacked, each ending in an icon`,
      ...(open.length
        ? [`${open.length} drawn open (${Math.round(tallest)}px tall)`]
        : []),
    ],
    question: `The ${rows.length} rows at ${where(list)} each end in an icon. Do they open and close (an accordion)?`,
    options: ["Accordion", "Static list", "Links"],
    suggested: "Accordion",
  });
}

// Three or more small dots evenly in a row: a slider's or tabs' position.
for (const holder of visible) {
  const dots = kids(holder).filter(
    (c) => c.w >= 4 && c.w <= 16 && near(c.w, c.h, 2),
  );
  if (dots.length < 3 || !dots.every((d) => near(d.y, dots[0].y, 2))) continue;
  const xs = dots.map((d) => d.x).sort((a, b) => a - b);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  if (!gaps.every((g) => g <= 40 && near(g, gaps[0], 4))) continue;
  add(holder, {
    kind: "pagination",
    component: "Slider",
    evidence: [
      `${dots.length} dots of ${Math.round(dots[0].w)}px, evenly spaced`,
    ],
    question: `The ${dots.length} dots at ${where(holder)} — do they page a slider, switch tabs, or only decorate?`,
    options: ["Slider", "Tabs", "Decoration"],
    suggested: null,
  });
}

// Two versions drawn in one place, one hidden: a hover, a tab, a toggle.
for (const shown of visible) {
  if (!shown.children.length || !/^(frame|instance|component)$/.test(shown.tag))
    continue;
  const twin = shown.parent.children.find(
    (c) =>
      c !== shown &&
      c.hidden &&
      c.children.length &&
      c.tag === shown.tag &&
      near(c.w, shown.w, 2) &&
      near(c.h, shown.h, 2) &&
      near(c.x, shown.x, 4) &&
      near(c.y, shown.y, 4),
  );
  if (!twin) continue;
  add(shown, {
    kind: "state",
    component: null,
    evidence: [`"${twin.name}" (hidden) sits exactly under "${shown.name}"`],
    question: `Two versions of the block at ${where(shown)} are drawn in the same place, one hidden. What is the hidden one?`,
    options: [
      "Hover or active state",
      "Tab or toggle panel",
      "Unused — ignore it",
    ],
    suggested: null,
  });
}

// What the designer named a layer.
const NAMED = [
  [/marquee|ticker|logo[\s-]?(strip|wall|bar|row|band)/i, "marquee", "Marquee"],
  [/slider|carousel|swiper|slideshow/i, "slider", "Slider"],
  [/\b(compare|comparison|before|after)\b/i, "compare", "Compare"],
  [/\btabs?\b/i, "tabs", "Tabs"],
  [/accordion|faq|collapse/i, "accordion", "Accordion"],
  [/modal|popup|pop-up|dialog|lightbox/i, "modal", "Modal"],
  [/dropdown|mega[\s-]?menu/i, "dropdown", "Dropdown"],
  [/video|player/i, "video", "Video"],
  [/sticky/i, "sticky", null],
];
for (const n of visible) {
  if (
    GENERIC.test(n.name) ||
    !/^(frame|instance|component|section|group)$/.test(n.tag)
  )
    continue;
  const hit = NAMED.find(([re]) => re.test(n.name));
  if (!hit) continue;
  const [, kind, component] = hit;
  add(n, {
    kind,
    component,
    evidence: [`the layer is named "${n.name}"`],
    question: `The layer "${n.name}" at ${where(n)} is named like a ${kind}. Is it one?`,
    options: [`Yes — ${kind}`, "No — static", "Something else"],
    suggested: `Yes — ${kind}`,
  });
}

/* ---------- report ---------- */

findings.sort(
  (a, b) => Number(a.where.split(/[ –]/)[1]) - Number(b.where.split(/[ –]/)[1]),
);

if (args.includes("--json")) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  console.log(
    `trix-import-figma patterns · ${page.name} · ${findings.length} to ask about\n`,
  );
  findings.forEach((f, i) => {
    console.log(
      `${i + 1}. ${f.kind}${f.component ? ` → ${f.component}` : ""}   ${f.id} "${f.name}" · ${f.where}`,
    );
    for (const e of f.evidence) console.log(`   - ${e}`);
    console.log(`   Ask: ${f.question}`);
    console.log(
      `   Options: ${f.options.map((o) => (o === f.suggested ? `${o} (suggested)` : o)).join(" · ")}\n`,
    );
  });
  if (!findings.length)
    console.log(
      "Nothing looks like it moves. Still ask: a frame cannot show motion.",
    );
}

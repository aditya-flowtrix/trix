#!/usr/bin/env node
/**
 * Turns .trix/design.json (what the site renders) into a proposed Trix
 * tokens.css, with the evidence for every value and a list of decisions that
 * need a human.
 *
 *   - Fluid range: inferred from where the measured series stop growing.
 *   - Type: clusters of identical computed style, assigned to Trix text-style
 *     slots by role and size. Names are a proposal; values are measured.
 *   - Spacing, section space, radius: measured min/max pairs, deduplicated.
 *   - Color: clustered in OKLab, split into neutral and hue ramps.
 *   - Breakpoints: from the stylesheet's own media queries.
 *
 * Nothing measured is rounded beyond 0.5px, and nothing is invented: a slot
 * the site does not use keeps the Trix default and is listed as such.
 *
 * Usage: node scripts/measure/propose.ts [--in .trix/design.json]
 * Writes .trix/tokens.proposed.css and .trix/proposal.md.
 */

import { readFileSync } from "node:fs";
import { args, output } from "./browser.ts";
import {
  parseTokens,
  parseColor,
  toHex,
  type Rgba,
} from "../../src/utils/tokens.ts";

const opts = args();
const design = JSON.parse(
  readFileSync(String(opts.in ?? ".trix/design.json"), "utf8"),
);
const W: number[] = design.widths;
const ask: string[] = [];
const notes: string[] = [];

/* ---------------- series ---------------- */

type Fit = {
  kind: "fixed" | "fluid" | "stepped";
  min: number;
  max: number;
  vmin?: number;
  vmax?: number;
};

/** A clamp(min, a + b·w, max) through the samples, or "stepped" if it is not one. */
function fit(values: number[]): Fit {
  const first = values[0];
  const last = values.at(-1)!;
  if (values.every((v) => Math.abs(v - first) < 0.05))
    return { kind: "fixed", min: first, max: first };
  const monotone =
    values.every((v, i) => i === 0 || v >= values[i - 1] - 0.5) ||
    values.every((v, i) => i === 0 || v <= values[i - 1] + 0.5);
  const inner = values
    .map((v, i) => [W[i], v])
    .filter(([, v]) => Math.abs(v - first) > 0.05 && Math.abs(v - last) > 0.05);
  if (!monotone || inner.length < 2)
    return { kind: "stepped", min: first, max: last };
  const [[w1, v1], [w2, v2]] = [inner[0], inner.at(-1)!];
  const b = (v2 - v1) / (w2 - w1);
  const a = v1 - b * w1;
  const linear = inner.every(([w, v]) => Math.abs(a + b * w - v) < 0.75);
  if (!linear) return { kind: "stepped", min: first, max: last };
  return {
    kind: "fluid",
    min: first,
    max: last,
    vmin: Math.round((first - a) / b),
    vmax: Math.round((last - a) / b),
  };
}

const fits = [
  ...design.type.map((t: { sizes: number[] }) => t.sizes),
  ...design.spacing.map((s: { values: number[] }) => s.values),
]
  .map(fit)
  .filter((f) => f.kind === "fluid");
const mode = (xs: number[]) => {
  const counts = new Map<number, number>();
  for (const x of xs.map((v) => Math.round(v / 8) * 8))
    counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const viewportMin = Math.max(320, mode(fits.map((f) => f.vmin!)) ?? 320);
const viewportMax = mode(fits.map((f) => f.vmax!)) ?? 1440;
notes.push(
  `Fluid range ${viewportMin}–${viewportMax}px, from ${fits.length} fluid series (most common start and end of growth).`,
);
if (viewportMax !== 1440)
  notes.push(
    `The site stops scaling at ${viewportMax}px, not Trix's default 1440px — keep \`--viewport-max: ${viewportMax}\` so every value matches.`,
  );

/** Value at the ends of the project's fluid range. */
const at = (values: number[], width: number) => {
  const i = W.findIndex((w) => w >= width);
  if (i <= 0) return values[0];
  const [w0, w1, v0, v1] = [W[i - 1], W[i], values[i - 1], values[i]];
  return Math.round((v0 + ((v1 - v0) * (width - w0)) / (w1 - w0)) * 2) / 2;
};
const pair = (values: number[]) => ({
  min: at(values, viewportMin),
  max: at(values, viewportMax),
  kind: fit(values).kind,
});

/* ---------------- type ---------------- */

type TypeCluster = {
  family: string;
  weight: string;
  transform: string;
  sizes: number[];
  lineHeight: number;
  letterSpacingEm: number;
  count: number;
  tags: string[];
  samples: string[];
  classes: string[];
};
const types: TypeCluster[] = design.type.filter(
  (t: TypeCluster) => t.count >= 1,
);
const desktop = (t: TypeCluster) => at(t.sizes, viewportMax);
const isHeadingTag = (t: TypeCluster) => t.tags.some((g) => /^h[1-6]$/.test(g));

const bodyTag = (t: TypeCluster) =>
  t.tags.some((g) => ["p", "li", "div", "span", "a", "td"].includes(g));
const body =
  [...types]
    .filter(
      (t) =>
        bodyTag(t) &&
        t.transform === "none" &&
        desktop(t) >= 13 &&
        desktop(t) <= 20 &&
        Number(t.weight) <= 500,
    )
    .sort((a, b) => b.count - a.count)[0] ?? types[0];
const bodySize = desktop(body);

const eyebrow = types
  .filter(
    (t) =>
      t.transform === "uppercase" &&
      t.letterSpacingEm >= 0.04 &&
      desktop(t) <= bodySize,
  )
  .sort((a, b) => b.count - a.count)[0];

const distinct = (list: TypeCluster[]) => {
  const out: TypeCluster[] = [];
  for (const t of list.sort(
    (a, b) => desktop(b) - desktop(a) || b.count - a.count,
  )) {
    if (
      !out.some(
        (o) => Math.abs(desktop(o) - desktop(t)) < 1.5 && o.weight === t.weight,
      )
    )
      out.push(t);
  }
  return out;
};
const headings = distinct(
  types.filter(
    (t) =>
      t !== eyebrow &&
      desktop(t) > bodySize + 2 &&
      (isHeadingTag(t) ||
        Number(t.weight) >= 600 ||
        desktop(t) >= bodySize * 1.5),
  ),
);
const larger = distinct(
  types.filter(
    (t) =>
      !headings.includes(t) &&
      t !== body &&
      t !== eyebrow &&
      desktop(t) > bodySize &&
      t.transform === "none",
  ),
);
const smaller = distinct(
  types.filter(
    (t) =>
      t !== body &&
      t !== eyebrow &&
      desktop(t) < bodySize &&
      t.transform === "none",
  ),
);

const slots: [string, TypeCluster | undefined][] = [];
const headingSlots =
  headings.length >= 7
    ? ["display", "h1", "h2", "h3", "h4", "h5", "h6"]
    : ["h1", "h2", "h3", "h4", "h5", "h6"];
headings
  .slice(0, headingSlots.length)
  .forEach((t, i) => slots.push([headingSlots[i], t]));
if (headings.length > headingSlots.length) {
  ask.push(
    `${headings.length} distinct heading sizes measured; ${headingSlots.length} slots exist. Extra: ${headings
      .slice(headingSlots.length)
      .map((t) => `${desktop(t)}px "${t.samples[0]}"`)
      .join(", ")} — consolidate, or add a text style?`,
  );
}
larger
  .slice(0, 2)
  .reverse()
  .forEach((t, i) => slots.push([["text-large", "text-xlarge"][i], t]));
slots.push(["text-main", body]);
smaller
  .slice(0, 2)
  .forEach((t, i) => slots.push([["text-small", "text-xsmall"][i], t]));
if (eyebrow) slots.push(["eyebrow", eyebrow]);
for (const t of [...larger.slice(2), ...smaller.slice(2)]) {
  ask.push(
    `Unassigned text style ${pair(t.sizes).min}→${pair(t.sizes).max}px weight ${t.weight} "${t.samples[0]}" (×${t.count}) — snap to the nearest style, or add one?`,
  );
}
notes.push(
  `Heading slots are assigned by size. Check the level each one belongs to — a 112px stat counter is not necessarily h1.`,
);

const families = [...new Set(types.map((t) => t.family))];
const primaryFamily = body.family;
const headingFamily = headings[0]?.family ?? primaryFamily;
const weightNames: Record<string, string> = {
  "100": "thin",
  "200": "extralight",
  "300": "light",
  "400": "regular",
  "500": "medium",
  "600": "semibold",
  "700": "bold",
  "800": "extrabold",
  "900": "black",
};
const weights = [
  ...new Set(slots.flatMap(([, t]) => (t ? [t.weight] : []))),
].sort();

const lhValues = [
  ...new Set(slots.flatMap(([, t]) => (t ? [t.lineHeight] : []))),
].sort((a, b) => a - b);
const lhNames = [
  "xsmall",
  "small",
  "medium",
  "large",
  "xlarge",
  "huge",
  "xhuge",
].slice(0, lhValues.length);
const lsValues = [
  ...new Set(slots.flatMap(([, t]) => (t ? [t.letterSpacingEm] : []))),
].sort((a, b) => a - b);
const lsNames = (() => {
  const neg = lsValues.filter((v) => v < 0);
  const pos = lsValues.filter((v) => v > 0);
  const negNames = ["tightest", "tighter", "tight"].slice(-neg.length);
  const posNames = ["wide", "wider", "widest"].slice(0, pos.length);
  return [
    ...negNames,
    ...(lsValues.includes(0) ? ["normal"] : []),
    ...posNames,
  ];
})();
const lhName = (v: number) => lhNames[lhValues.indexOf(v)];
const lsName = (v: number) => lsNames[lsValues.indexOf(v)];

/* ---------------- spacing, sections, radius ---------------- */

const pairs = (
  list: { values: number[]; count: number }[],
  minCount: number,
) => {
  const out: { min: number; max: number; count: number; kind: string }[] = [];
  for (const s of list) {
    if (s.count < minCount) continue;
    const p = pair(s.values);
    if (p.kind === "stepped" || p.max <= 0) continue;
    const near = out.find(
      (o) => Math.abs(o.min - p.min) <= 1 && Math.abs(o.max - p.max) <= 1,
    );
    if (near) near.count += s.count;
    else out.push({ ...p, count: s.count });
  }
  return out.sort((a, b) => a.max - b.max || a.min - b.min);
};
let spaces = pairs(
  design.spacing.filter(
    (s: { values: number[] }) => Math.max(...s.values) < 160,
  ),
  2,
);
if (spaces.length > 20) {
  const keep = new Set(
    [...spaces].sort((a, b) => b.count - a.count).slice(0, 20),
  );
  ask.push(
    `${spaces.length} distinct spacing pairs measured; kept the 20 most used. Snap or keep: ${spaces
      .filter((s) => !keep.has(s))
      .map((s) => `${s.min}→${s.max}`)
      .join(", ")}`,
  );
  spaces = spaces.filter((s) => keep.has(s));
}
const stepped = design.spacing.filter(
  (s: { values: number[]; count: number }) =>
    s.count >= 3 && fit(s.values).kind === "stepped",
);
if (stepped.length)
  notes.push(
    `${stepped.length} spacing series change at breakpoints instead of scaling (e.g. ${stepped[0].values.join("/")}). They belong in component media queries, not the scale.`,
  );

const sectionNames = ["xsmall", "small", "medium", "large", "xlarge", "huge"];
const sections = pairs(
  [
    ...design.sectionPadding,
    ...design.spacing.filter(
      (s: { props: string[]; values: number[] }) =>
        s.props.includes("spacer") && Math.max(...s.values) >= 48,
    ),
  ],
  1,
).filter((s) => s.max >= 48);
if (sections.length > sectionNames.length)
  ask.push(
    `${sections.length} section paddings measured; ${sectionNames.length} names exist. Consolidate?`,
  );
const radii = pairs(design.radius, 1);
const radiusNames = ["xsmall", "small", "medium", "large", "xlarge", "huge"];

/* ---------------- color ---------------- */

const lin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
function oklab([r, g, b]: Rgba) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bv = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, Bv), h: (Math.atan2(Bv, A) * 180) / Math.PI };
}
type Swatch = {
  hex: string;
  rgba: Rgba;
  count: number;
  uses: Set<string>;
  L: number;
  C: number;
  h: number;
};
const swatches: Swatch[] = [];
const translucent: string[] = [];
for (const use of ["text", "background", "border"] as const) {
  for (const { color, count } of design.colors[use]) {
    const rgba = parseColor(color);
    if (!rgba) continue;
    if (rgba[3] < 1) {
      translucent.push(`${color} (${use} ×${count})`);
      continue;
    }
    const lab = oklab(rgba);
    const near = swatches.find(
      (s) =>
        Math.hypot(s.L - lab.L, s.C - lab.C) < 0.015 &&
        Math.abs(s.h - lab.h) < 12,
    );
    if (near) {
      near.count += count;
      near.uses.add(use);
    } else
      swatches.push({
        hex: toHex(rgba),
        rgba,
        count,
        uses: new Set([use]),
        ...lab,
      });
  }
}
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
// Ramps: white and black stand alone; neutrals together; chromatic colors
// grouped by hue (within 25°), most used hue first → brand, then accent-N.
const ramps: { name: string; list: Swatch[] }[] = [];
for (const s of [...swatches].sort((a, b) => b.count - a.count)) {
  if (s.hex === "#ffffff" || s.hex === "#000000") {
    ramps.push({ name: s.hex === "#ffffff" ? "white" : "black", list: [s] });
    continue;
  }
  const neutral = s.C < 0.02;
  const ramp = ramps.find((r) =>
    neutral
      ? r.name === "neutral"
      : r.name !== "neutral" &&
        r.name !== "white" &&
        r.name !== "black" &&
        Math.abs(((r.list[0].h - s.h + 540) % 360) - 180) < 25,
  );
  if (ramp) ramp.list.push(s);
  else ramps.push({ name: neutral ? "neutral" : `hue`, list: [s] });
}
let hueIndex = 0;
for (const r of ramps)
  if (r.name === "hue")
    r.name = hueIndex++ === 0 ? "brand" : `accent-${hueIndex - 1}`;
const hues = ramps.filter(
  (r) => r.name === "brand" || r.name.startsWith("accent"),
);
const palette: [string, string][] = [];
for (const { name, list } of ramps) {
  if (name === "white" || name === "black") {
    palette.push([name, list[0].hex]);
    continue;
  }
  const sorted = [...list].sort((a, b) => b.L - a.L);
  if (sorted.length > STEPS.length) {
    ask.push(
      `The ${name} ramp has ${sorted.length} distinct colors, more than the 11 steps — which are the same color drawn twice?`,
    );
  }
  // Ideal step from lightness, then forced strictly increasing and within range.
  const idx = sorted.map((s) =>
    Math.min(10, Math.max(0, Math.round((0.98 - s.L) / 0.085))),
  );
  for (let i = 1; i < idx.length; i++)
    idx[i] = Math.max(idx[i], idx[i - 1] + 1);
  for (let i = idx.length - 1; i >= 0; i--)
    idx[i] = Math.min(idx[i], i + 1 < idx.length ? idx[i + 1] - 1 : 10);
  sorted.forEach((s, i) =>
    palette.push([`${name}-${STEPS[Math.max(0, idx[i])]}`, s.hex]),
  );
}
if (translucent.length)
  ask.push(
    `Translucent colors measured — each is usually an existing swatch mixed with transparent (\`color-mix(in lab, var(--x) N%, transparent)\`), not a new swatch: ${translucent.slice(0, 8).join(", ")}`,
  );
if (hues.length > 2)
  ask.push(
    `${hues.length} hue families measured (${hues.map((r) => `${r.name}: ${r.list.map((s) => s.hex).join(" ")}`).join(" · ")}). Keep each, or are some one-off image or illustration colors?`,
  );
const byUse = (use: string) =>
  [...swatches]
    .filter((s) => s.uses.has(use))
    .sort((a, b) => b.count - a.count);
const swatchName = (hex: string) => palette.find(([, h]) => h === hex)?.[0];

/* ---------------- breakpoints, layout ---------------- */

const bps = new Map<number, number>();
for (const { query, count } of design.media) {
  for (const m of query.matchAll(
    /(min|max)-width:\s*([\d.]+)(px|rem|em)|width\s*([<>]=?)\s*([\d.]+)(px|rem|em)/g,
  )) {
    const raw = Number(m[2] ?? m[5]) * ((m[3] ?? m[6]) === "px" ? 1 : 16);
    const isMax = m[1] === "max" || m[4]?.startsWith("<");
    const minWidth = Math.round(isMax ? (m[4] === "<" ? raw : raw + 1) : raw);
    bps.set(minWidth, (bps.get(minWidth) ?? 0) + count);
  }
}
const breakpoints = [...bps.entries()]
  .filter(([w]) => w > 320 && w < 1920)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .sort((a, b) => a[0] - b[0]);
if (bps.size > 3)
  ask.push(
    `Media queries at ${[...bps.keys()].sort((a, b) => a - b).join(", ")}px; the three most used become small/medium/large. The rest: keep in their component, or move to a breakpoint?`,
  );
const maxWidth = design.maxWidths.find((m: { px: number }) => m.px >= 900);

/* ---------------- write ---------------- */

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const lines: Record<string, string[]> = {};
const group = (name: string, ls: string[]) => (lines[name] = ls);
group(
  "Color — palette",
  palette.map(([n, h]) => `  --${n}: ${h};`),
);
group("Typography — families", [
  `  --primary-family: "${primaryFamily}", Arial, sans-serif;`,
  `  --secondary-family: ${headingFamily === primaryFamily ? "var(--primary-family)" : `"${headingFamily}", Arial, sans-serif`};`,
]);
group(
  "Typography — weights",
  weights.map((w) => `  --primary-${weightNames[w] ?? w}: ${w};`),
);
group(
  "Typography — line height",
  lhValues.map((v, i) => `  --line-height-${lhNames[i]}: ${v};`),
);
group(
  "Typography — letter spacing",
  lsValues.map((v, i) => `  --letter-spacing-${lsNames[i]}: ${v}em;`),
);
for (const [slot, t] of slots) {
  if (!t) continue;
  const p = pair(t.sizes);
  group(`Text style — ${slot}`, [
    `  --${slot}-min: ${fmt(p.min)};`,
    `  --${slot}-max: ${fmt(p.max)};`,
    `  --${slot}-font-family: var(--${t.family === primaryFamily ? "primary" : "secondary"}-family);`,
    `  --${slot}-font-weight: var(--primary-${weightNames[t.weight] ?? t.weight});`,
    `  --${slot}-line-height: var(--line-height-${lhName(t.lineHeight)});`,
    `  --${slot}-letter-spacing: var(--letter-spacing-${lsName(t.letterSpacingEm)});`,
    `  --${slot}-text-transform: ${t.transform};`,
    `  --${slot}-text-wrap: ${/^(display|h\d|eyebrow)$/.test(slot) ? "balance" : "pretty"};`,
    `  --${slot}-margin-top: 0rem;`,
    `  --${slot}-margin-bottom: 0rem;`,
    `  --${slot}-trim-top: var(--primary-trim-top);`,
    `  --${slot}-trim-bottom: var(--primary-trim-bottom);`,
  ]);
}
group(
  "Spacing — scale",
  spaces.flatMap((s, i) => [
    `  --space-${i + 1}-min: ${fmt(s.min)};`,
    `  --space-${i + 1}-max: ${fmt(s.max)};`,
  ]),
);
if (sections.length)
  group(
    "Spacing — section",
    sections
      .slice(0, sectionNames.length)
      .flatMap((s, i) => [
        `  --section-space-${sectionNames[i]}-min: ${fmt(s.min)};`,
        `  --section-space-${sectionNames[i]}-max: ${fmt(s.max)};`,
      ]),
  );
if (radii.length)
  group("Radius", [
    ...radii
      .filter((r) => r.max < 999)
      .slice(0, radiusNames.length)
      .flatMap((r, i) =>
        r.min === r.max
          ? [`  --radius-${radiusNames[i]}: ${fmt(r.max / 16)}rem;`]
          : [
              `  --radius-${radiusNames[i]}-min: ${fmt(r.min)};`,
              `  --radius-${radiusNames[i]}-max: ${fmt(r.max)};`,
            ],
      ),
    `  --radius-round: 100vw;`,
  ]);
group("Layout — fluid range (px)", [
  `  --viewport-min: ${viewportMin};`,
  `  --viewport-max: ${viewportMax};`,
]);
if (breakpoints.length)
  group(
    "Layout — breakpoints (media queries use these values literally)",
    breakpoints.map(
      ([w], i) =>
        `  --breakpoint-${["small", "medium", "large"][i]}: ${fmt(w / 16)}rem;`,
    ),
  );

const current = readFileSync("src/styles/tokens.css", "utf8");
const tokens = parseTokens(current);
const order = [...new Set(tokens.map((t) => t.group))];
for (const name of Object.keys(lines))
  if (!order.includes(name))
    order.splice(
      order.findIndex((g) => g.startsWith("Spacing")),
      0,
      name,
    );
const kept: string[] = [];
const body2 = order
  .map((g) => {
    if (lines[g]) return `  /* ${g} */\n${lines[g].join("\n")}`;
    if (/^Text style — /.test(g)) {
      kept.push(g.slice(13));
      return `  /* ${g} — not measured on the source; Trix default kept */\n${tokens
        .filter((t) => t.group === g)
        .map((t) => `  --${t.name}: ${t.value};`)
        .join("\n")}`;
    }
    return `  /* ${g} */\n${tokens
      .filter((t) => t.group === g)
      .map((t) => `  --${t.name}: ${t.value};`)
      .join("\n")}`;
  })
  .join("\n\n");
const proposed = `/* Proposed by scripts/measure/propose.ts from ${design.source}. Review .trix/proposal.md before copying into src/styles/tokens.css. */\n\n:root {\n${body2}\n}\n`;
output("tokens.proposed.css", proposed);

const theme = [
  `- background: ${byUse("background")[0]?.hex ?? "?"} (${swatchName(byUse("background")[0]?.hex ?? "") ?? ""}, most used background)`,
  `- text: ${byUse("text")[0]?.hex ?? "?"} (${swatchName(byUse("text")[0]?.hex ?? "") ?? ""}, most used text color)`,
  ...byUse("background")
    .slice(1, 4)
    .map((s) => `- other surface: ${s.hex} (${swatchName(s.hex)}) ×${s.count}`),
];
const report = [
  `# Token proposal — ${design.source}`,
  "",
  "Every value below was measured in a browser. Names are proposals.",
  "",
  "## Notes",
  "",
  ...notes.map((n) => `- ${n}`),
  "",
  "## Ask before writing",
  "",
  ...(ask.length ? ask.map((a) => `- [ ] ${a}`) : ["- nothing"]),
  "",
  "## Text styles",
  "",
  "| Slot | Mobile → Desktop | Weight | Line height | Letter spacing | Transform | Evidence |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...slots.map(([slot, t]) =>
    t
      ? `| ${slot} | ${pair(t.sizes).min} → ${pair(t.sizes).max}px (${pair(t.sizes).kind}) | ${t.weight} | ${t.lineHeight} | ${t.letterSpacingEm}em | ${t.transform} | ×${t.count} ${t.tags.join("/")} "${t.samples[0]}" |`
      : `| ${slot} | — | | | | | |`,
  ),
  "",
  kept.length ? `Not measured (Trix defaults kept): ${kept.join(", ")}.` : "",
  "",
  `Families: ${families.join(", ")} → primary "${primaryFamily}"${headingFamily !== primaryFamily ? `, secondary "${headingFamily}"` : ""}.`,
  "",
  "## Spacing",
  "",
  ...spaces.map(
    (s, i) =>
      `- space-${i + 1}: ${s.min} → ${s.max}px (${s.kind}, ×${s.count})`,
  ),
  "",
  "## Section space",
  "",
  ...sections.map(
    (s, i) =>
      `- ${sectionNames[i] ?? "?"}: ${s.min} → ${s.max}px (×${s.count})`,
  ),
  "",
  "## Radius",
  "",
  ...radii.map(
    (r, i) =>
      `- ${r.max >= 999 ? "round" : radiusNames[i]}: ${r.min} → ${r.max}px (×${r.count})`,
  ),
  "",
  "## Palette",
  "",
  ...palette.map(
    ([n, h]) =>
      `- \`--${n}: ${h}\` — ${[...(swatches.find((s) => s.hex === h)?.uses ?? [])].join(", ")} ×${swatches.find((s) => s.hex === h)?.count ?? 0}`,
  ),
  "",
  "## Theme starting point (light)",
  "",
  ...theme,
  "",
  "## Breakpoints",
  "",
  ...breakpoints.map(
    ([w, n], i) =>
      `- ${["small", "medium", "large"][i]}: ${w}px = ${w / 16}rem (×${n} rules)`,
  ),
  "",
  maxWidth ? `Container max width: ${maxWidth.px}px (×${maxWidth.count}).` : "",
  "",
  Object.keys(design.variables).length
    ? `## The site's own variables\n\n${Object.keys(design.variables).length} custom properties on :root. Where the source has named variables (Webflow Variables, Framer tokens, theme.json), prefer their structure and verify their values against the measurements above.`
    : "",
].join("\n");
output(
  "proposal.json",
  JSON.stringify(
    {
      source: design.source,
      widths: W,
      viewport: { min: viewportMin, max: viewportMax },
      text: Object.fromEntries(
        slots
          .filter(([, t]) => t)
          .map(([slot, t]) => [
            slot,
            {
              sizes: t!.sizes,
              lineHeight: t!.lineHeight,
              letterSpacingEm: t!.letterSpacingEm,
              weight: t!.weight,
              transform: t!.transform,
              sample: t!.samples[0],
            },
          ]),
      ),
      spaces: spaces.map((s, i) => ({
        token: `space-${i + 1}`,
        min: s.min,
        max: s.max,
      })),
    },
    null,
    2,
  ),
);
output("proposal.md", report);
console.log(report.split("## Text styles")[0]);
console.log("Wrote .trix/tokens.proposed.css and .trix/proposal.md");

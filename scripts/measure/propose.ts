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

import { readFileSync, readdirSync } from "node:fs";
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

/**
 * One cluster per size: a slot is a size, so the most used cluster at it
 * takes the slot. The same size at another weight is not a bigger or smaller
 * style — it is listed for the owner (a weight utility, or its own style).
 */
const weightVariants: TypeCluster[] = [];
const distinct = (list: TypeCluster[]) => {
  const out: TypeCluster[] = [];
  for (const t of list.sort(
    (a, b) => desktop(b) - desktop(a) || b.count - a.count,
  )) {
    const same = out.find((o) => Math.abs(desktop(o) - desktop(t)) < 1.5);
    if (!same) out.push(t);
    else if (same.weight !== t.weight && !weightVariants.includes(t))
      weightVariants.push(t);
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
for (const t of weightVariants)
  ask.push(
    `${pair(t.sizes).min}→${pair(t.sizes).max}px also appears at weight ${t.weight} "${t.samples[0]}" (×${t.count}) — the same style with a weight utility, or a style of its own?`,
  );
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
const current = readFileSync("src/styles/tokens.css", "utf8");
const tokens = parseTokens(current);

/** Existing Trix scale entries (`--line-height-*`), sorted by value. */
const scale = (prefix: string) =>
  tokens
    .filter((t) => t.name.startsWith(prefix))
    .map(
      (t) =>
        [t.name.slice(prefix.length), parseFloat(t.value)] as [string, number],
    )
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => a[1] - b[1]);

/**
 * Puts measured values onto the scale's existing names — in order, nearest
 * value first — so every component and kept style that reads a name still
 * resolves. A value with no name left gets one and goes on the ask list.
 */
function assign(
  values: number[],
  names: [string, number][],
  label: string,
  overflow: string[] = [],
): Map<number, string> {
  const v = [...values].sort((a, b) => a - b);
  const [n, m] = [v.length, names.length];
  const out = new Map<number, string>();
  const fit = Math.min(n, m);
  // f[i][j]: cheapest way to give the first i values increasing names among the first j.
  const f = Array.from({ length: fit + 1 }, () =>
    new Array(m + 1).fill(Infinity),
  );
  for (let j = 0; j <= m; j++) f[0][j] = 0;
  for (let i = 1; i <= fit; i++)
    for (let j = i; j <= m; j++)
      f[i][j] = Math.min(
        f[i][j - 1],
        f[i - 1][j - 1] + Math.abs(v[i - 1] - names[j - 1][1]),
      );
  for (let i = fit, j = m; i > 0; j--) {
    if (f[i][j] !== f[i][j - 1]) {
      out.set(v[i - 1], names[j - 1][0]);
      i--;
    }
  }
  for (const extra of v.slice(fit)) {
    const name =
      overflow.shift() ?? `${names.at(-1)?.[0] ?? label}-${out.size + 1}`;
    out.set(extra, name);
    ask.push(
      `${label}: ${n} values measured, ${m} names exist — ${extra} was named \`${name}\`. Rename it, or consolidate with a neighbour?`,
    );
  }
  return out;
}

const measuredWeights = [
  ...new Set(slots.flatMap(([, t]) => (t ? [t.weight] : []))),
];
const defaultWeights = tokens
  .filter((t) =>
    /^primary-(thin|extralight|light|regular|medium|semibold|bold|extrabold|black)$/.test(
      t.name,
    ),
  )
  .map((t) => String(Number(t.value)));
const weights = [...new Set([...measuredWeights, ...defaultWeights])].sort();

const lineHeights = scale("line-height-");
const lhMap = assign(
  [...new Set(slots.flatMap(([, t]) => (t ? [t.lineHeight] : [])))],
  lineHeights,
  "line-height",
);
const letterSpacings = scale("letter-spacing-");
const lsMap = assign(
  [...new Set(slots.flatMap(([, t]) => (t ? [t.letterSpacingEm] : [])))],
  letterSpacings,
  "letter-spacing",
);
const lhName = (v: number) => lhMap.get(v)!;
const lsName = (v: number) => lsMap.get(v)!;
const scaleLines = (
  prefix: string,
  defaults: [string, number][],
  map: Map<number, string>,
  unit: string,
) => {
  const measured = new Map([...map].map(([value, name]) => [name, value]));
  const names = [...new Set([...defaults.map(([n]) => n), ...measured.keys()])];
  return names
    .map(
      (n) =>
        [n, measured.get(n) ?? defaults.find(([d]) => d === n)![1]] as [
          string,
          number,
        ],
    )
    .sort((a, b) => a[1] - b[1])
    .map(
      ([n, value]) =>
        `  --${prefix}${n}: ${value}${unit};${measured.has(n) ? "" : " /* Trix default, not measured */"}`,
    );
};

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

const sections = (() => {
  const all = pairs(
    [
      ...design.sectionPadding,
      ...design.spacing.filter(
        (s: { props: string[]; values: number[] }) =>
          s.props.includes("spacer") && Math.max(...s.values) >= 48,
      ),
    ],
    1,
  ).filter((s) => s.max >= 48);
  // One pair per desktop value: the most used.
  return [
    ...new Map(
      all.sort((a, b) => a.count - b.count).map((s) => [s.max, s]),
    ).values(),
  ].sort((a, b) => a.max - b.max);
})();
const sectionDefaults = scale("section-space-").length
  ? tokens
      .filter(
        (t) =>
          /^section-space-.+-max$/.test(t.name) && !t.name.includes("overlap"),
      )
      .map((t) => [t.name.slice(14, -4), Number(t.value)] as [string, number])
      .sort((a, b) => a[1] - b[1])
  : [];
const sectionMap = assign(
  sections.map((s) => s.max),
  sectionDefaults,
  "section space",
  ["huge", "xhuge", "xxhuge"],
);
const sectionName = (s: { max: number }) => sectionMap.get(s.max)!;

const radii = pairs(design.radius, 1).filter((r) => r.max < 999);
const radiusDefaults = tokens
  .filter((t) => /^radius-[a-z]+$/.test(t.name) && t.name !== "radius-round")
  .map(
    (t) =>
      [
        t.name.slice(7),
        (parseFloat(t.value) || 0) * (t.value.endsWith("rem") ? 16 : 1),
      ] as [string, number],
  )
  .sort((a, b) => a[1] - b[1]);
const radiusMap = assign(
  [...new Set(radii.map((r) => r.max))],
  radiusDefaults,
  "radius",
  ["xlarge", "huge", "xhuge"],
);
const radiusName = (r: { max: number }) => radiusMap.get(r.max)!;

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

/* ---------------- layout grid ---------------- */

type GridMeasure = {
  margin: (number | null)[];
  content: (number | null)[];
  gutter: (number | null)[];
  columns: number;
  onTwelve: number;
  offGrid: { width: string; count: number }[];
  equalRows: { columns: number; count: number }[];
};
const grid: GridMeasure | undefined = design.grid;
const gridNotes: string[] = [];
/**
 * Min and max of a fluid token through measured points: the straight line
 * between the first and last point inside the fluid range, read at its ends.
 * Undefined unless the points in between sit on that line.
 */
function line(points: [number, number][]) {
  const inside = points.filter(([w]) => w <= viewportMax);
  if (inside.length < 2) return undefined;
  const [[w1, v1], [w2, v2]] = [inside[0], inside.at(-1)!];
  const b = (v2 - v1) / (w2 - w1);
  const value = (w: number) => Math.round((v1 + b * (w - w1)) * 2) / 2;
  if (inside.some(([w, v]) => Math.abs(v1 + b * (w - w1) - v) > 0.75))
    return undefined;
  return {
    min: value(viewportMin),
    max: value(viewportMax),
    extrapolated: w1 > viewportMin || w2 < viewportMax,
  };
}
let siteMargin: ReturnType<typeof line>;
let siteGutter: ReturnType<typeof line>;
let contentMax: number | undefined;
const tablet = breakpoints[1]?.[0] ?? 768;
if (grid) {
  const n = W.length;
  const [c1, c2] = [grid.content[n - 2], grid.content[n - 1]];
  if (c1 !== null && c2 !== null && Math.abs(c1 - c2) < 1) contentMax = c2;
  siteMargin = line(
    W.flatMap((w, i) =>
      grid.margin[i] !== null &&
      (contentMax === undefined || grid.content[i]! < contentMax - 1)
        ? [[w, grid.margin[i]!] as [number, number]]
        : [],
    ),
  );
  // Layout rows stack on phones, so the gutter is read from tablet up.
  siteGutter = line(
    W.flatMap((w, i) =>
      w >= tablet && grid.gutter[i] !== null
        ? [[w, grid.gutter[i]!] as [number, number]]
        : [],
    ),
  );
  gridNotes.push(
    `Margin ${grid.margin.map((m) => m ?? "—").join(" / ")} · content ${grid.content.map((m) => m ?? "—").join(" / ")} · gutter ${grid.gutter.map((m) => m ?? "—").join(" / ")} (px at ${W.join(", ")}).`,
    siteMargin
      ? `Site margin ${siteMargin.min} → ${siteMargin.max}px${siteMargin.extrapolated ? " (extrapolated past the measured widths)" : ""}.`
      : "Site margin does not scale on a straight line — it changes at breakpoints; Trix default kept.",
    siteGutter
      ? `Site gutter ${siteGutter.min} → ${siteGutter.max}px, from rows of columns at ${tablet}px and up${siteGutter.extrapolated ? " (the phone value is extrapolated — columns stack there)" : ""}.`
      : "No consistent gutter between columns; Trix default kept.",
    contentMax
      ? `Content stops growing at ${contentMax}px — \`--max-width-main\`.`
      : "Content never stops growing — the source has no maximum width.",
  );
  if (grid.equalRows.length)
    gridNotes.push(
      `Equal-column lists (→ \`<Grid>\`): ${grid.equalRows.map((e) => `${e.columns} columns ×${e.count}`).join(", ")}.`,
    );
  if (grid.columns) {
    gridNotes.push(
      `${grid.onTwelve} of ${grid.columns} columns in unequal layouts sit on 12 columns at 1440px.`,
    );
    if (grid.onTwelve / grid.columns < 0.9)
      ask.push(
        `Columns off the 12-column grid at 1440px: ${grid.offGrid.map((o) => `${o.width} ×${o.count}`).join(", ")}. Snap each to the nearest span (a visible change), or keep its width in that component?`,
      );
  }
}

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
  scaleLines("line-height-", lineHeights, lhMap, ""),
);
group(
  "Typography — letter spacing",
  scaleLines("letter-spacing-", letterSpacings, lsMap, "em"),
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
group("Spacing — section", [
  ...sectionDefaults
    .map(([name]) => name)
    .concat(
      [...sectionMap.values()].filter(
        (n) => !sectionDefaults.some(([d]) => d === n),
      ),
    )
    .flatMap((name) => {
      const s = sections.find((x) => sectionName(x) === name);
      if (s)
        return [
          `  --section-space-${name}-min: ${fmt(s.min)};`,
          `  --section-space-${name}-max: ${fmt(s.max)};`,
        ];
      return tokens
        .filter(
          (t) =>
            t.name === `section-space-${name}-min` ||
            t.name === `section-space-${name}-max`,
        )
        .map(
          (t) => `  --${t.name}: ${t.value}; /* Trix default, not measured */`,
        );
    }),
  ...tokens
    .filter((t) => t.name.startsWith("section-space-nav-overlap"))
    .map(
      (t) =>
        `  --${t.name}: ${t.value}; /* nav height + first section's top padding — set if the nav overlaps */`,
    ),
]);
group("Radius", [
  ...radiusDefaults
    .map(([name]) => name)
    .concat(
      [...radiusMap.values()].filter(
        (n) => !radiusDefaults.some(([d]) => d === n),
      ),
    )
    .flatMap((name) => {
      const r = radii.find((x) => radiusName(x) === name);
      if (!r)
        return tokens
          .filter((t) => t.name === `radius-${name}`)
          .map(
            (t) =>
              `  --${t.name}: ${t.value}; /* Trix default, not measured */`,
          );
      return r.min === r.max
        ? [`  --radius-${name}: ${fmt(r.max / 16)}rem;`]
        : [
            `  --radius-${name}-min: ${fmt(r.min)};`,
            `  --radius-${name}-max: ${fmt(r.max)};`,
          ];
    }),
  `  --radius-round: 100vw;`,
]);
if (grid) {
  const measured: Record<string, string | undefined> = {
    "site-margin-min": siteMargin && fmt(siteMargin.min),
    "site-margin-max": siteMargin && fmt(siteMargin.max),
    "site-gutter-min": siteGutter && fmt(siteGutter.min),
    "site-gutter-max": siteGutter && fmt(siteGutter.max),
    "max-width-main": contentMax
      ? contentMax === viewportMax
        ? "calc(var(--viewport-max) / 16 * 1rem)"
        : `${fmt(contentMax / 16)}rem`
      : "none",
  };
  const structural = /^(site-width|grid-columns|max-width-full)$/;
  group(
    "Layout — site",
    tokens
      .filter((t) => t.group === "Layout — site")
      .map((t) =>
        measured[t.name] !== undefined
          ? `  --${t.name}: ${measured[t.name]};`
          : `  --${t.name}: ${t.value};${structural.test(t.name) ? "" : " /* Trix default, not measured */"}`,
      ),
  );
}
// Leading trim: reproduce a source that never trims (most sites) exactly;
// a source that does keeps the trim measured from the font (fonts.ts).
const trimGroup = tokens.find((t) => t.name === "primary-trim-top")?.group;
if (design.trim && trimGroup) {
  const { untrimmed, trimmed } = design.trim as {
    untrimmed: number;
    trimmed: number;
  };
  if (untrimmed > trimmed) {
    group(
      trimGroup,
      tokens
        .filter((t) => t.group === trimGroup)
        .map(
          (t) => `  --${t.name}: 0.5lh; /* the source does not trim text */`,
        ),
    );
    notes.push(
      `The source does not trim text boxes (${untrimmed} one-line blocks are exactly one line tall, ${trimmed} trimmed): trim set to 0.5lh, which turns it off.`,
    );
  } else
    notes.push(
      `The source trims text boxes (${trimmed} of ${untrimmed + trimmed} one-line blocks): keep Trix's trim, measured from the font with \`node scripts/fonts.ts --write\`.`,
    );
}
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
// Anything the framework still reads (components, themes.css, kept styles)
// must stay defined: carry the Trix default and say so, never leave a hole.
const sourceRefs = readdirSync("src", { recursive: true, withFileTypes: true })
  .filter(
    (d) =>
      d.isFile() &&
      /\.(css|astro)$/.test(d.name) &&
      !`${d.parentPath}/${d.name}`.includes("generated") &&
      d.name !== "tokens.css",
  )
  .map((d) => readFileSync(`${d.parentPath}/${d.name}`, "utf8"))
  .join("\n");
const carried: string[] = [];
let proposedBody = body2;
for (let round = 0; round < 5; round++) {
  const defined = new Set(
    parseTokens(`:root {${proposedBody}}`).map((t) => t.name),
  );
  for (const name of [...defined])
    if (name.endsWith("-min") && defined.has(`${name.slice(0, -4)}-max`))
      defined.add(name.slice(0, -4));
  const refs = new Set(
    [...`${sourceRefs}\n${proposedBody}`.matchAll(/var\(--([\w-]+)/g)].map(
      (m) => m[1],
    ),
  );
  const missing = [...refs].filter(
    (r) => !defined.has(r) && !r.startsWith("_") && !r.startsWith("font-"),
  );
  const add = missing.flatMap((r) => {
    const own = tokens.filter(
      (t) => t.name === r || t.name === `${r}-min` || t.name === `${r}-max`,
    );
    return own.length ? own : [];
  });
  if (!add.length) break;
  carried.push(...add.map((t) => t.name));
  proposedBody += `\n\n  /* Kept from Trix defaults — still referenced, not measured on the source */\n${add.map((t) => `  --${t.name}: ${t.value};`).join("\n")}`;
}
if (carried.length)
  notes.push(
    `Kept ${carried.length} Trix default token(s) the framework still references (${carried.join(", ")}). Replace them with the source's values or remap their users.`,
  );

// Framework components reference spacing steps by number; move each Trix
// default step to the proposed step with the nearest values.
const defaultSpaces = tokens
  .filter((t) => /^space-\d+-min$/.test(t.name))
  .map((t) => ({
    step: Number(t.name.split("-")[1]),
    min: Number(t.value),
    max: Number(
      tokens.find((x) => x.name === `space-${t.name.split("-")[1]}-max`)?.value,
    ),
  }));
const remap = defaultSpaces.map((d) => {
  let best = 0;
  spaces.forEach((s, i) => {
    if (
      Math.abs(s.min - d.min) + Math.abs(s.max - d.max) <
      Math.abs(spaces[best].min - d.min) + Math.abs(spaces[best].max - d.max)
    )
      best = i;
  });
  return {
    from: d.step,
    to: best + 1,
    delta:
      Math.abs(spaces[best].min - d.min) + Math.abs(spaces[best].max - d.max),
  };
});
if (spaces.length && remap.some((r) => r.from !== r.to)) {
  output(
    "remap-components.sed",
    [
      ...remap.map((r) => `s/var(--space-${r.from})/var(--space-${r.to}__)/g`),
      "s/__)/)/g",
    ].join("\n") + "\n",
  );
  notes.push(
    `Framework components reference Trix's default spacing steps. \`.trix/remap-components.sed\` moves each to the nearest proposed step (${remap.map((r) => `${r.from}→${r.to}${r.delta ? ` ±${r.delta}px` : ""}`).join(", ")}). Apply it to src/components and src/styles/patterns.css, then review the ± ones.`,
  );
}

const proposed = `/* Proposed by scripts/measure/propose.ts from ${design.source}. Review .trix/proposal.md before copying into src/styles/tokens.css. */\n\n:root {\n${proposedBody}\n}\n`;
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
    (s) => `- ${sectionName(s)}: ${s.min} → ${s.max}px (×${s.count})`,
  ),
  "",
  "## Radius",
  "",
  ...radii.map(
    (r) => `- ${radiusName(r)}: ${r.min} → ${r.max}px (×${r.count})`,
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
  ...(gridNotes.length
    ? ["## Layout grid", "", ...gridNotes.map((n) => `- ${n}`)]
    : []),
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
      trim: design.trim,
      grid: grid && {
        margin: grid.margin,
        content: grid.content,
        gutter: grid.gutter,
        gutterFrom: tablet,
      },
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

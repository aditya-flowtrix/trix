#!/usr/bin/env node
/**
 * Measures a site's design system from what the browser actually renders —
 * whatever platform built it, and whether or not it ever had a style guide.
 *
 * Every visible element is measured at seven viewport widths, so a value is
 * known as a series (320 → 1920), which is exactly what a fluid token is.
 * Nothing is read from class or variable names.
 *
 * Usage
 *   node scripts/measure/design.ts --url https://example.com [--pages /,/about]
 *   node scripts/measure/design.ts --dir path/to/export [--pages /index.html]
 *   node scripts/measure/design.ts --url https://example.com --sample 8
 *       (pages from .trix/inventory.json: the homepage, then the most varied)
 *
 * Writes .trix/design.json (series + frequencies) and .trix/design.md.
 */

import { existsSync, readFileSync } from "node:fs";
import { WIDTHS, args, launch, open, output, pool, serve } from "./browser.ts";

const opts = args();
let origin: string;
let close = () => {};
if (typeof opts.dir === "string") {
  const s = await serve(opts.dir);
  origin = s.origin;
  close = () => s.server.close();
} else if (typeof opts.url === "string") {
  origin = new URL(opts.url).origin;
} else {
  console.error(
    "usage: design.ts --url <site> | --dir <export> [--pages /,/about] [--sample 8]",
  );
  process.exit(1);
}

let paths: string[] =
  typeof opts.pages === "string" ? opts.pages.split(",") : [];
if (!paths.length && existsSync(".trix/inventory.json")) {
  const inv = JSON.parse(readFileSync(".trix/inventory.json", "utf8"));
  const ranked = [...inv.pages]
    .filter((p: { headings?: string[] }) => p.headings)
    .sort(
      (a: { headings: string[] }, b: { headings: string[] }) =>
        b.headings.length - a.headings.length,
    );
  const home = inv.pages.find(
    (p: { path: string }) => p.path === "/" || p.path === "/index.html",
  );
  paths = [
    ...new Set([
      home?.path ?? "/",
      ...ranked.map((p: { path: string }) => p.path),
    ]),
  ].slice(0, Number(opts.sample ?? 8));
}
if (!paths.length) paths = ["/"];

type Raw = {
  text: {
    i: number;
    /** Stable across widths and runs: the element's path, and its text. */
    id: string;
    tag: string;
    cls: string;
    chars: number;
    sample: string;
    family: string;
    size: number;
    weight: string;
    lh: number;
    ls: number;
    transform: string;
    color: string;
    /** Box height ÷ line height, for a block of one line: 1 untrimmed. */
    boxRatio?: number;
  }[];
  box: {
    i: number;
    /** Stable across widths and runs: the element's path, and its text. */
    id: string;
    tag: string;
    cls: string;
    area: number;
    section: boolean;
    spacer: number;
    pt: number;
    pr: number;
    pb: number;
    pl: number;
    mt: number;
    mb: number;
    rg: number;
    cg: number;
    radius: number;
    bg: string;
    border: string;
    bw: number;
    maxw: number;
  }[];
  vars: Record<string, string>;
  media: string[];
  /** Site margin candidates: content-edge px → characters of text inside. */
  margins: Record<string, number>;
  /** Flex and grid rows with columns side by side. */
  rows: { gap: number; width: number; widths: number[] }[];
};

function measure(): Raw {
  const all = [...document.querySelectorAll("body *")];
  const index = new Map(all.map((e, i) => [e, i]));
  // An element's place among its own siblings, up to <body>. A script that
  // adds or moves elements elsewhere (a slider cloning slides) cannot shift
  // it, unlike its position in the whole page.
  const pathOf = (e: Element) => {
    const parts: string[] = [];
    for (
      let n: Element | null = e;
      n && n !== document.body;
      n = n.parentElement
    ) {
      const same = n.parentElement
        ? [...n.parentElement.children].filter((c) => c.tagName === n!.tagName)
        : [n];
      parts.push(
        `${n.tagName.toLowerCase()}${same.length > 1 ? same.indexOf(n) : ""}`,
      );
    }
    return parts.reverse().join(">");
  };
  const px = (v: string) => (v.endsWith("px") ? parseFloat(v) : 0);
  const visible = (e: Element, cs: CSSStyleDeclaration) =>
    cs.display !== "none" &&
    cs.visibility !== "hidden" &&
    e.getClientRects().length > 0;
  const text: Raw["text"] = [];
  const box: Raw["box"] = [];
  const skip = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "svg",
    "path",
    "IFRAME",
  ]);
  for (const e of all) {
    if (skip.has(e.tagName)) continue;
    const cs = getComputedStyle(e);
    if (!visible(e, cs)) continue;
    const own = [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (own.length > 1) {
      const size = parseFloat(cs.fontSize);
      text.push({
        i: index.get(e)!,
        id: `${pathOf(e)}|${own.slice(0, 60)}`,
        tag: e.tagName.toLowerCase(),
        cls: (e.getAttribute("class") ?? "").slice(0, 80),
        chars: own.length,
        sample: own.slice(0, 60),
        family: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        size,
        weight: cs.fontWeight,
        lh:
          cs.lineHeight === "normal"
            ? +(size * 1.2).toFixed(2)
            : px(cs.lineHeight),
        ls: cs.letterSpacing === "normal" ? 0 : px(cs.letterSpacing),
        transform: cs.textTransform,
        color: cs.color,
        // Leading trim: a one-line block's box is exactly one line tall
        // unless the site trims it toward cap height and baseline.
        boxRatio: (() => {
          if (cs.display === "inline" || e.children.length) return undefined;
          const range = document.createRange();
          range.selectNodeContents(e);
          const lines = new Set(
            [...range.getClientRects()].map((r) => Math.round(r.top)),
          );
          const lh =
            cs.lineHeight === "normal" ? size * 1.2 : px(cs.lineHeight);
          const h =
            e.getBoundingClientRect().height -
            px(cs.paddingTop) -
            px(cs.paddingBottom) -
            px(cs.borderTopWidth) -
            px(cs.borderBottomWidth);
          return lines.size === 1 && lh > 0
            ? Math.round((h / lh) * 100) / 100
            : undefined;
        })(),
      });
    }
    const rect = e.getBoundingClientRect();
    const b = {
      i: index.get(e)!,
      id: pathOf(e),
      tag: e.tagName.toLowerCase(),
      cls: (e.getAttribute("class") ?? "").slice(0, 80),
      area: Math.round((rect.width * rect.height) / 1000),
      section:
        rect.width >= innerWidth * 0.95 &&
        (e.tagName === "SECTION" ||
          e.parentElement === document.body ||
          e.parentElement?.tagName === "MAIN"),
      spacer:
        !e.children.length &&
        !(e.textContent ?? "").trim() &&
        !/^(IMG|VIDEO|CANVAS|INPUT|SELECT|TEXTAREA|BUTTON|HR|BR)$/.test(
          e.tagName,
        ) &&
        cs.backgroundImage === "none" &&
        /rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) &&
        rect.height > 0 &&
        rect.height <= 240
          ? +rect.height.toFixed(2)
          : 0,
      pt: px(cs.paddingTop),
      pr: px(cs.paddingRight),
      pb: px(cs.paddingBottom),
      pl: px(cs.paddingLeft),
      mt: px(cs.marginTop),
      mb: px(cs.marginBottom),
      rg: /flex|grid/.test(cs.display) ? px(cs.rowGap) : 0,
      cg: /flex|grid/.test(cs.display) ? px(cs.columnGap) : 0,
      radius: px(cs.borderTopLeftRadius),
      bg: cs.backgroundColor,
      border: px(cs.borderTopWidth) > 0 ? cs.borderTopColor : "",
      bw: px(cs.borderTopWidth),
      maxw: cs.maxWidth === "none" ? 0 : px(cs.maxWidth),
    };
    if (
      b.spacer ||
      b.pt ||
      b.pr ||
      b.pb ||
      b.pl ||
      b.mt ||
      b.mb ||
      b.rg ||
      b.cg ||
      b.radius ||
      b.bw ||
      b.maxw ||
      !/rgba\(0, 0, 0, 0\)|transparent/.test(b.bg)
    )
      box.push(b);
  }
  const vars: Record<string, string> = {};
  const media = new Set<string>();
  const root = getComputedStyle(document.documentElement);
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r instanceof CSSMediaRule) media.add(r.conditionText);
      if ("cssRules" in r && (r as CSSGroupingRule).cssRules)
        walk((r as CSSGroupingRule).cssRules);
      if (
        r instanceof CSSStyleRule &&
        /(^|,)\s*(:root|html)\s*(,|$)/.test(r.selectorText)
      ) {
        for (const p of r.style)
          if (p.startsWith("--")) vars[p] = root.getPropertyValue(p).trim();
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {}
  }
  // Layout grid. Each text element credits its characters to its innermost
  // wide (at least half the page), horizontally symmetric ancestor; that
  // block's content edge is the site margin, and where the content stops
  // growing is the maximum width.
  const vw = document.documentElement.clientWidth;
  const edges = new Map<Element, number | null>();
  const edgeOf = (e: Element): number | null => {
    if (edges.has(e)) return edges.get(e)!;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const left = r.left + px(cs.paddingLeft) + px(cs.borderLeftWidth);
    const right =
      vw - (r.right - px(cs.paddingRight) - px(cs.borderRightWidth));
    const v =
      r.width >= vw / 2 &&
      left > 0.5 &&
      Math.abs(left - right) < 1 &&
      // Rows with negative margins (Bootstrap, Mast) reach past the container.
      px(cs.marginLeft) >= 0 &&
      px(cs.marginRight) >= 0
        ? Math.round(left * 100) / 100
        : null;
    edges.set(e, v);
    return v;
  };
  const margins: Record<string, number> = {};
  for (const t of text) {
    let e: Element | null = all[t.i];
    while (e && e !== document.body && edgeOf(e) === null) e = e.parentElement;
    if (e && e !== document.body) {
      const m = String(edgeOf(e));
      margins[m] = (margins[m] ?? 0) + t.chars;
    }
  }
  // Rows: two or more children side by side, evenly spaced, filling the row.
  // The space between them is the gutter; columns that touch use padding
  // gutters (Bootstrap, Mast), where the gutter is their inner padding.
  const rows: Raw["rows"] = [];
  for (const e of all) {
    if (skip.has(e.tagName)) continue;
    const cs = getComputedStyle(e);
    if (!/flex|grid/.test(cs.display) || /space-/.test(cs.justifyContent))
      continue;
    // Navigation is chrome, repeated on every page; its rows are not the grid.
    if (e.closest("nav, header")) continue;
    const kids = [...e.children].filter((k) => {
      const b = k.getBoundingClientRect();
      return (
        b.width > 0 &&
        b.height > 0 &&
        !/absolute|fixed/.test(getComputedStyle(k).position)
      );
    });
    if (kids.length < 2) continue;
    const top = kids[0].getBoundingClientRect().top;
    const line = kids
      .filter((k) => Math.abs(k.getBoundingClientRect().top - top) < 1)
      .sort(
        (a, b) =>
          a.getBoundingClientRect().left - b.getBoundingClientRect().left,
      );
    if (line.length < 2) continue;
    const boxes = line.map((k) => k.getBoundingClientRect());
    const gaps = boxes.slice(1).map((b, i) => b.left - boxes[i].right);
    if (gaps.some((g) => g < -0.5 || Math.abs(g - gaps[0]) > 1)) continue;
    const r = e.getBoundingClientRect();
    let gap = gaps[0];
    let width = r.width - px(cs.paddingLeft) - px(cs.paddingRight);
    let widths = boxes.map((b) => b.width);
    if (gap < 0.5) {
      const a = getComputedStyle(line[0]);
      const b = getComputedStyle(line[1]);
      gap = px(a.paddingRight) + px(b.paddingLeft);
      if (gap < 0.5) continue;
      width -= gap;
      widths = widths.map((w) => w - gap);
    }
    const filled =
      widths.reduce((x, y) => x + y, 0) + gap * (widths.length - 1);
    if (width < vw / 2 || filled < width * 0.85) continue;
    rows.push({ gap: Math.round(gap * 100) / 100, width, widths });
  }
  return { text, box, vars, media: [...media], margins, rows };
}

const browser = await launch();
const perPage = await pool(paths, 2, async (path) => {
  const page = await browser.newPage();
  const runs: Raw[] = [];
  try {
    for (const width of WIDTHS) {
      await open(page, origin + path, width);
      runs.push(await page.evaluate(measure));
    }
  } catch (error) {
    console.error(`${path}: ${error}`);
  } finally {
    await page.close();
  }
  return { path, runs };
});
await browser.close();
close();

/* ---------------- aggregate ---------------- */

const r = (n: number) => Math.round(n * 100) / 100;
const series = (values: number[]) => values.map(r).join("/");
const bump = (
  map: Map<string, { count: number; [k: string]: unknown }>,
  key: string,
  extra: Record<string, unknown> = {},
  weight = 1,
) => {
  const hit = map.get(key) ?? { count: 0, ...extra };
  hit.count += weight;
  map.set(key, hit);
  return hit;
};

const type = new Map<
  string,
  {
    count: number;
    tags: Set<string>;
    samples: string[];
    classes: Set<string>;
    colors: Set<string>;
    pages: Set<string>;
  }
>();
const spacing = new Map<string, { count: number; props: Set<string> }>();
const sections = new Map<string, { count: number }>();
const radius = new Map<string, { count: number }>();
const maxWidths = new Map<string, { count: number }>();
const colors = {
  text: new Map<string, { count: number }>(),
  background: new Map<string, { count: number }>(),
  border: new Map<string, { count: number }>(),
};
const media = new Map<string, { count: number }>();
const vars: Record<string, string[]> = {};
const marginsAt = WIDTHS.map(() => new Map<string, { count: number }>());
const rowsAt: Raw["rows"][] = WIDTHS.map(() => []);

for (const { path, runs } of perPage) {
  if (runs.length !== WIDTHS.length) continue;
  const [first] = runs;
  const at = (w: number) => runs[WIDTHS.indexOf(w)];
  const desktop = at(1440);
  const textBy = runs.map((run) => new Map(run.text.map((t) => [t.id, t])));
  for (const t of desktop.text) {
    const across = textBy.map((m) => m.get(t.id));
    if (across.some((x) => !x)) continue;
    const key = [
      t.family,
      t.weight,
      t.transform,
      series(across.map((x) => x!.size)),
      (t.lh / t.size).toFixed(2),
      (t.ls / t.size).toFixed(3),
    ].join("|");
    const hit = type.get(key) ?? {
      count: 0,
      tags: new Set(),
      samples: [],
      classes: new Set(),
      colors: new Set(),
      pages: new Set(),
    };
    hit.count++;
    hit.tags.add(t.tag);
    if (hit.samples.length < 3 && !hit.samples.includes(t.sample))
      hit.samples.push(t.sample);
    if (t.cls) hit.classes.add(t.cls.split(" ").slice(0, 2).join(" "));
    hit.colors.add(t.color);
    hit.pages.add(path);
    type.set(key, hit);
    bump(colors.text, t.color, {}, t.chars);
  }
  const boxBy = runs.map((run) => new Map(run.box.map((b) => [b.id, b])));
  for (const b of desktop.box) {
    const across = boxBy.map((m) => m.get(b.id));
    if (across.some((x) => !x)) continue;
    for (const prop of [
      "spacer",
      "pt",
      "pr",
      "pb",
      "pl",
      "mt",
      "mb",
      "rg",
      "cg",
    ] as const) {
      const values = across.map((x) => x![prop]);
      if (values.every((v) => v === 0) || values.some((v) => v < 0)) continue;
      const hit = bump(spacing, series(values), {
        props: new Set<string>(),
      }) as { count: number; props: Set<string> };
      hit.props.add(prop);
    }
    if (b.section)
      for (const prop of ["pt", "pb"] as const) {
        const values = across.map((x) => x![prop]);
        if (values.some((v) => v > 0)) bump(sections, series(values));
      }
    if (b.radius) bump(radius, series(across.map((x) => x!.radius)));
    if (b.maxw) bump(maxWidths, String(r(b.maxw)));
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b.bg))
      bump(colors.background, b.bg, {}, Math.max(1, b.area));
    if (b.border) bump(colors.border, b.border);
  }
  runs.forEach((run, i) => {
    for (const [m, chars] of Object.entries(run.margins))
      bump(marginsAt[i], m, {}, chars);
    rowsAt[i].push(...run.rows);
  });
  for (const m of first.media) bump(media, m);
  for (const [k, v] of Object.entries(desktop.vars)) (vars[k] ??= []).push(v);
}

const sorted = <T extends { count: number }>(map: Map<string, T>) =>
  [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, v]) => ({ key, ...v }));

const top = (map: Map<string, { count: number }>) => sorted(map)[0]?.key;
const margin = marginsAt.map((m) => {
  const k = top(m);
  return k === undefined ? null : Number(k);
});
const gutter = rowsAt.map((rows) => {
  const counts = new Map<string, { count: number }>();
  for (const row of rows) bump(counts, String(Math.round(row.gap * 10) / 10));
  const k = top(counts);
  return k === undefined ? null : Number(k);
});
// At desktop: rows of equal columns are lists (Trix's Grid, any count);
// rows of unequal columns are layouts, and should sit on 12 columns.
const desktopRows = rowsAt[WIDTHS.indexOf(1440)];
const equalRows = new Map<string, { count: number }>();
let onTwelve = 0;
let columns = 0;
const offGrid = new Map<string, { count: number }>();
for (const row of desktopRows) {
  if (row.widths.every((w) => Math.abs(w - row.widths[0]) < 1)) {
    bump(equalRows, String(row.widths.length));
    continue;
  }
  // A row may use its own gap (a second grid system) or the site gutter
  // with a wider gap that is really an offset — on 12 if either fits.
  const site = gutter[WIDTHS.indexOf(1440)] ?? row.gap;
  const fits = (w: number, g: number) => {
    const k = (w + g) / ((row.width - 11 * g) / 12 + g);
    return Math.abs(k - Math.round(k)) < 0.08 && Math.round(k) >= 1;
  };
  for (const w of row.widths) {
    columns++;
    if (fits(w, row.gap) || fits(w, site)) onTwelve++;
    else bump(offGrid, `${Math.round((w / row.width) * 1000) / 10}%`);
  }
}

// Leading trim, from one-line text blocks at desktop.
let untrimmed = 0;
let trimmed = 0;
for (const { runs } of perPage) {
  const desktop = runs[WIDTHS.indexOf(1440)];
  for (const t of desktop?.text ?? []) {
    if (t.boxRatio === undefined) continue;
    if (Math.abs(t.boxRatio - 1) < 0.03) untrimmed++;
    else if (t.boxRatio < 0.9) trimmed++;
  }
}

const result = {
  source: opts.dir ?? opts.url,
  widths: WIDTHS,
  pages: paths,
  type: sorted(type).map((t) => {
    const [family, weight, transform, sizes, lineHeight, letterSpacing] =
      t.key.split("|");
    return {
      family,
      weight,
      transform,
      sizes: sizes.split("/").map(Number),
      lineHeight: Number(lineHeight),
      letterSpacingEm: Number(letterSpacing),
      count: t.count,
      tags: [...t.tags],
      samples: t.samples,
      classes: [...t.classes].slice(0, 5),
      colors: [...t.colors],
      pages: t.pages.size,
    };
  }),
  spacing: sorted(spacing).map((s) => ({
    values: s.key.split("/").map(Number),
    count: s.count,
    props: [...s.props],
  })),
  sectionPadding: sorted(sections).map((s) => ({
    values: s.key.split("/").map(Number),
    count: s.count,
  })),
  radius: sorted(radius).map((s) => ({
    values: s.key.split("/").map(Number),
    count: s.count,
  })),
  maxWidths: sorted(maxWidths).map((s) => ({
    px: Number(s.key),
    count: s.count,
  })),
  colors: {
    text: sorted(colors.text).map((c) => ({ color: c.key, count: c.count })),
    background: sorted(colors.background).map((c) => ({
      color: c.key,
      count: c.count,
    })),
    border: sorted(colors.border).map((c) => ({
      color: c.key,
      count: c.count,
    })),
  },
  media: sorted(media).map((m) => ({ query: m.key, count: m.count })),
  trim: { untrimmed, trimmed },
  grid: {
    margin,
    content: margin.map((m, i) => (m === null ? null : r(WIDTHS[i] - m * 2))),
    gutter,
    rows: desktopRows.length,
    equalRows: sorted(equalRows).map((e) => ({
      columns: Number(e.key),
      count: e.count,
    })),
    columns,
    onTwelve,
    offGrid: sorted(offGrid).map((o) => ({ width: o.key, count: o.count })),
  },
  variables: Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, v[0]]),
  ),
};

const file = output("design.json", JSON.stringify(result, null, 2));
const md = [
  `# Design measurement — ${result.source}`,
  "",
  `Pages: ${paths.join(", ")} · widths: ${WIDTHS.join(", ")}px`,
  "",
  "## Type (by element count)",
  "",
  `| Sizes ${WIDTHS.join("/")} | Family | Weight | LH | LS em | Transform | Count | Tags | Sample |`,
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...result.type
    .slice(0, 40)
    .map(
      (t) =>
        `| ${t.sizes.join("/")} | ${t.family} | ${t.weight} | ${t.lineHeight} | ${t.letterSpacingEm} | ${t.transform} | ${t.count} | ${t.tags.join(" ")} | ${t.samples[0]?.replace(/\|/g, "")} |`,
    ),
  "",
  "## Spacing series (px at each width)",
  "",
  ...result.spacing
    .slice(0, 40)
    .map(
      (s) => `- ${s.values.join(" / ")} ×${s.count} (${s.props.join(", ")})`,
    ),
  "",
  "## Section padding",
  "",
  ...result.sectionPadding
    .slice(0, 12)
    .map((s) => `- ${s.values.join(" / ")} ×${s.count}`),
  "",
  "## Radius",
  "",
  ...result.radius
    .slice(0, 12)
    .map((s) => `- ${s.values.join(" / ")} ×${s.count}`),
  "",
  "## Colors",
  "",
  ...(["text", "background", "border"] as const).flatMap((k) => [
    `**${k}**: ${result.colors[k]
      .slice(0, 12)
      .map((c) => `${c.color} ×${c.count}`)
      .join(" · ")}`,
    "",
  ]),
  "## Leading trim",
  "",
  `${untrimmed} one-line text blocks are exactly one line tall; ${trimmed} are trimmed toward cap height and baseline.`,
  "",
  "## Layout grid",
  "",
  `| Width | ${WIDTHS.join(" | ")} |`,
  `| --- | ${WIDTHS.map(() => "---").join(" | ")} |`,
  `| Margin | ${result.grid.margin.map((m) => m ?? "—").join(" | ")} |`,
  `| Content | ${result.grid.content.map((m) => m ?? "—").join(" | ")} |`,
  `| Gutter | ${result.grid.gutter.map((m) => m ?? "—").join(" | ")} |`,
  "",
  `Equal-column rows (lists — Trix's Grid): ${result.grid.equalRows.map((e) => `${e.columns} columns ×${e.count}`).join(", ") || "none"}.`,
  "",
  result.grid.columns
    ? `Unequal-column layouts: ${result.grid.onTwelve} of ${result.grid.columns} columns sit on 12 columns at 1440px.${result.grid.offGrid.length ? ` Off the grid: ${result.grid.offGrid.map((o) => `${o.width} ×${o.count}`).join(", ")}.` : ""}`
    : "No unequal-column layouts found.",
  "",
  "## Media queries",
  "",
  ...result.media.map((m) => `- \`${m.query}\` ×${m.count}`),
  "",
  `## Root variables (${Object.keys(result.variables).length})`,
  "",
  ...Object.entries(result.variables)
    .slice(0, 80)
    .map(([k, v]) => `- \`${k}: ${v}\``),
].join("\n");
output("design.md", md);
console.log(
  `Measured ${paths.length} page(s) at ${WIDTHS.length} widths: ${result.type.length} type styles, ${result.spacing.length} spacing series, ${result.colors.text.length + result.colors.background.length} colors, ${result.media.length} media queries.`,
);
console.log(`Wrote ${file} and .trix/design.md`);

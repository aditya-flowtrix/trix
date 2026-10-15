#!/usr/bin/env node
/**
 * Checks the conventions in TRIX.md that a reviewer would otherwise have to
 * catch by eye. Runs in `npm run check` and CI.
 *
 *   1. Media queries use the breakpoint tokens, nothing else.
 *   2. Every `var(--token)` refers to a token that exists somewhere.
 *   3. Lengths are not written in px (1px hairlines in visually-hidden
 *      patterns excepted).
 *   4. Every theme's text roles meet WCAG AA contrast against what they sit
 *      on — 4.5:1, or 3:1 for the heading accent, which is only used in
 *      headings (large text).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildModel,
  resolveColor,
  toPx,
  type Rgba,
} from "../src/utils/tokens.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? files(p)
      : /\.(css|astro|ts)$/.test(p)
        ? [p]
        : [];
  });

const sources = files(join(root, "src")).map((p) => ({
  path: relative(root, p),
  text: readFileSync(p, "utf8"),
}));
const read = (p: string) => readFileSync(join(root, p), "utf8");
const model = buildModel(
  read("src/styles/tokens.css"),
  read("src/styles/themes.css"),
);
const problems: string[] = [];
const lineOf = (text: string, index: number) =>
  text.slice(0, index).split("\n").length;

// 1. Breakpoints
const allowed = new Set(model.breakpoints.map((b) => toPx(b.value)));
for (const { path, text } of sources) {
  for (const m of text.matchAll(
    /@media[^{]*?\(\s*(?:width\s*[<>]=?|min-width:|max-width:)\s*([\d.]+(?:rem|em|px))/g,
  )) {
    if (!allowed.has(toPx(m[1]))) {
      problems.push(
        `${path}:${lineOf(text, m.index)}  media query at ${m[1]} — use a breakpoint token (${model.breakpoints.map((b) => b.value).join(", ")})`,
      );
    }
  }
}

// 2. Undefined tokens
const defined = new Set<string>();
for (const { text } of sources) {
  for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  for (const m of text.matchAll(/cssVariable\s*=\s*"(--[\w-]+)"/g))
    defined.add(m[1]);
}
for (const m of read("astro.config.mjs").matchAll(
  /cssVariable:\s*"(--[\w-]+)"/g,
))
  defined.add(m[1]);
for (const { path, text } of sources) {
  if (!/\.(css|astro)$/.test(path)) continue;
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
    const hasFallback = m[2] === ",";
    if (!defined.has(m[1]) && !hasFallback && !m[1].startsWith("--_")) {
      problems.push(
        `${path}:${lineOf(text, m.index)}  ${m[1]} is not defined anywhere`,
      );
    }
  }
}

// 3. px lengths
for (const { path, text } of sources) {
  if (!/\.(css|astro)$/.test(path) || path.includes("generated")) continue;
  // Comments may mention px (a WCAG target size, a design note): skip them.
  const css = (
    path.endsWith(".astro")
      ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
          .map((m) => m[1])
          .join("\n")
      : text
  ).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/(?<![\w-])(\d*\.?\d+)px\b/g)) {
    if (m[1] === "1" || m[1] === "0") continue;
    problems.push(
      `${path}  ${m[0]} — use rem (or em for text-relative lengths)`,
    );
  }
}

// 4. Contrast
const channel = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = ([r, g, b]: Rgba) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
/** A translucent color as it renders over an opaque one. */
const over = (top: Rgba, under: Rgba): Rgba => [
  ...([0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])) as [
    number,
    number,
    number,
  ]),
  1,
];
const ratio = (a: Rgba, b: Rgba) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// Page text, plus every role pair a theme defines: `--X-text…` on
// `--X-background…` (button, button-2, tag, and any a project adds).
const roles = new Set(model.themes.flatMap((t) => [...t.tokens.keys()]));
const pairs: [text: string, surface: string, min: number][] = [
  ["text", "background", 4.5],
  ["text-2", "background", 4.5],
  ["link-text", "background", 4.5],
  ["heading-accent", "background", 3],
  ...[...roles].flatMap((name): [string, string, number][] => {
    const m = name.match(/^(.+)-text(-.+)?$/);
    const surface = m && `${m[1]}-background${m[2] ?? ""}`;
    return surface && roles.has(surface) ? [[name, surface, 4.5]] : [];
  }),
];
// An owner can keep a failing pair on purpose (a migration that must match
// its source): `--text-2: …; /* contrast: accepted — why */` on that line,
// in that theme. It is reported, not failed.
const themesCss = read("src/styles/themes.css");
const accepted = (selector: string, token: string) => {
  // The block this theme's selector list starts — not a later mention of
  // it, like `.theme-brand .theme-invert` inside another theme's list.
  const head = new RegExp(
    `(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[,{]`,
    "m",
  ).exec(themesCss);
  if (!head) return false;
  const start = themesCss.indexOf("{", head.index);
  const block = themesCss.slice(start, themesCss.indexOf("}", start));
  return new RegExp(`--${token}:[^;]*;[ \\t]*/\\*[^*]*contrast: accepted`).test(
    block,
  );
};
const notes: string[] = [];
for (const theme of model.themes) {
  const scope = [theme.tokens, model.byName];
  const page = resolveColor("var(--background)", scope);
  if (!page) continue;
  for (const [text, surface, min] of pairs) {
    const fg = resolveColor(`var(--${text})`, scope);
    const bg = resolveColor(`var(--${surface})`, scope);
    if (!fg || !bg) continue;
    const base = over(bg, over(page, [1, 1, 1, 1]));
    const r = ratio(over(fg, base), base);
    if (r >= min) continue;
    const line = `theme-${theme.name}: --${text} on --${surface} is ${r.toFixed(2)}:1, needs ${min}:1`;
    if (accepted(theme.selectors[0], text))
      notes.push(`${line} (accepted in themes.css)`);
    else problems.push(`src/styles/themes.css  ${line}`);
  }
}

if (notes.length)
  console.log(`Contrast kept below AA on purpose:\n  ${notes.join("\n  ")}`);
if (problems.length) {
  console.error(
    `Convention problems (${problems.length}):\n  ${problems.join("\n  ")}`,
  );
  process.exit(1);
}
console.log("Conventions OK.");

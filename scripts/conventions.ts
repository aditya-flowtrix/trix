#!/usr/bin/env node
/**
 * Checks the conventions in TRIX.md that a reviewer would otherwise have to
 * catch by eye. Runs in `npm run check` and CI.
 *
 *   1. Media queries use the breakpoint tokens, nothing else.
 *   2. Every `var(--token)` refers to a token that exists somewhere.
 *   3. Lengths are not written in px (1px hairlines in visually-hidden
 *      patterns excepted).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModel, toPx } from "../src/utils/tokens.ts";

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
  const css = path.endsWith(".astro")
    ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
        .map((m) => m[1])
        .join("\n")
    : text.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/(?<![\w-])(\d*\.?\d+)px\b/g)) {
    if (m[1] === "1" || m[1] === "0") continue;
    problems.push(
      `${path}  ${m[0]} — use rem (or em for text-relative lengths)`,
    );
  }
}

if (problems.length) {
  console.error(
    `Convention problems (${problems.length}):\n  ${problems.join("\n  ")}`,
  );
  process.exit(1);
}
console.log("Conventions OK.");

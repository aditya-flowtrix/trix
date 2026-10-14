#!/usr/bin/env node
/**
 * Measures each font family's leading trim in a real browser, from the
 * metrics the browser actually lays text out with. Every text style trims its
 * box to cap height and baseline (base.css); the right amount depends on the
 * font, so a new font needs new values — never copy them from another font.
 *
 *   trim-top    = cap height − (ascent − descent) / 2
 *   trim-bottom = (ascent − descent) / 2          (in em)
 *
 * Usage
 *   node scripts/fonts.ts --url http://localhost:4321/style-guide
 *   node scripts/fonts.ts --url http://localhost:4321/style-guide --write
 *
 * Measures every `--*-family` token. `--write` sets `--primary-trim-*` in
 * src/styles/tokens.css and, when the secondary family is a different font,
 * adds `--secondary-trim-*` and points the text styles set in it at them.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { args, launch } from "./measure/browser.ts";

const opts = args();
if (typeof opts.url !== "string") {
  console.error("usage: fonts.ts --url <a page of this project> [--write]");
  process.exit(1);
}
const file = "src/styles/tokens.css";
let css = readFileSync(file, "utf8");
const families = [...css.matchAll(/--(\w+)-family\s*:/g)].map((m) => m[1]);

const browser = await launch();
const page = await browser.newPage();
await page.goto(opts.url, { waitUntil: "load" });
const measured = await page.evaluate(async (names: string[]) => {
  const out: Record<
    string,
    {
      font: string;
      loaded: boolean;
      cap: number;
      ascent: number;
      descent: number;
    }
  > = {};
  for (const name of names) {
    const probe = document.createElement("span");
    probe.style.fontFamily = `var(--${name}-family)`;
    document.body.append(probe);
    const stack = getComputedStyle(probe).fontFamily;
    probe.remove();
    const font = stack
      .split(",")[0]
      .trim()
      .replace(/^["']|["']$/g, "");
    await document.fonts.load(`400 100px ${stack}`);
    const loaded = [...document.fonts].some(
      (f) =>
        f.family.replace(/^["']|["']$/g, "") === font && f.status === "loaded",
    );
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `400 1000px ${stack}`;
    const m = ctx.measureText("H");
    out[name] = {
      font,
      loaded,
      cap: m.actualBoundingBoxAscent / 1000,
      ascent: m.fontBoundingBoxAscent / 1000,
      descent: m.fontBoundingBoxDescent / 1000,
    };
  }
  return out;
}, families);
await browser.close();

const em = (n: number) => `${Math.round(n * 1000) / 1000}em`;
const trims = Object.fromEntries(
  Object.entries(measured).map(([name, m]) => {
    const half = (m.ascent - m.descent) / 2;
    return [name, { ...m, top: em(m.cap - half), bottom: em(half) }];
  }),
);

console.log(
  "| Family token | Font | Loaded | Cap height | trim-top | trim-bottom |",
);
console.log("| --- | --- | --- | --- | --- | --- |");
for (const [name, t] of Object.entries(trims))
  console.log(
    `| --${name}-family | ${t.font} | ${t.loaded ? "yes" : "NO — measured a fallback"} | ${em(t.cap)} | ${t.top} | ${t.bottom} |`,
  );
const unloaded = Object.values(trims).filter((t) => !t.loaded);
if (unloaded.length) {
  console.error(
    `\n${unloaded.map((t) => t.font).join(", ")} did not load — check astro.config.mjs \`fonts\` and the family tokens before writing.`,
  );
  process.exit(1);
}

if (opts.write) {
  const set = (token: string, value: string) => {
    const re = new RegExp(`(--${token}:\\s*)[^;]+;`);
    if (re.test(css)) css = css.replace(re, `$1${value};`);
    else
      // After the last family trim token, so the group stays in order.
      css = css.replace(
        /(--(?:primary|secondary)-trim-[a-z]+:[^;]+;)(?![\s\S]*--(?:primary|secondary)-trim-[a-z]+:)/,
        `$1\n  --${token}: ${value};`,
      );
  };
  const { primary, secondary } = trims;
  set("primary-trim-top", primary.top);
  set("primary-trim-bottom", primary.bottom);
  if (secondary && secondary.font !== primary.font) {
    set("secondary-trim-top", secondary.top);
    set("secondary-trim-bottom", secondary.bottom);
    // Text styles set in the secondary family trim by its metrics.
    for (const m of css.matchAll(
      /--([\w-]+)-font-family:\s*var\(--secondary-family\)/g,
    ))
      for (const side of ["top", "bottom"])
        css = css.replace(
          `--${m[1]}-trim-${side}: var(--primary-trim-${side});`,
          `--${m[1]}-trim-${side}: var(--secondary-trim-${side});`,
        );
  } else if (secondary && css.includes("--secondary-trim-top")) {
    // Back on one font: the secondary trims follow it.
    set("secondary-trim-top", primary.top);
    set("secondary-trim-bottom", primary.bottom);
  }
  writeFileSync(file, css);
  console.log(`\nWrote the trim tokens to ${file}. Run npm run tokens.`);
}

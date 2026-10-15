#!/usr/bin/env node
/**
 * Maps the source site's CSS variables (Webflow Variables, Framer tokens,
 * WordPress theme.json presets — anything declared on :root) to Trix tokens
 * by resolved value at four viewport widths.
 *
 * Each variable is resolved through a real property — `width` for lengths,
 * `color` for colors — so `clamp()`, `calc()` and `var()` chains are compared
 * as the pixels and colors they produce. The output includes a rename script
 * for CSS being moved into components.
 *
 * Usage
 *   node scripts/measure/variables.ts --source https://site.com/ --local http://localhost:4321/
 *   node scripts/measure/variables.ts --dir path/to/export --local http://localhost:4321/
 *
 * Writes .trix/variable-map.json, .trix/variable-map.md and .trix/rename-variables.sed.
 */

import { args, launch, open, output, serve } from "./browser.ts";

const opts = args();
let origin: string;
let close = () => {};
if (typeof opts.dir === "string") {
  const s = await serve(opts.dir);
  origin = s.origin;
  close = () => s.server.close();
} else if (typeof opts.source === "string") {
  origin = new URL(opts.source).origin;
} else {
  console.error(
    "usage: variables.ts --source <url> | --dir <export> --local <trix page url>",
  );
  process.exit(1);
}
if (typeof opts.local !== "string") {
  console.error("--local <url of a page in the Trix project> is required");
  process.exit(1);
}
const path =
  typeof opts.page === "string"
    ? opts.page
    : typeof opts.source === "string"
      ? new URL(opts.source).pathname
      : "/";

type Resolved = Record<
  string,
  {
    kind: "color" | "length" | "number" | "other";
    series: string[];
    raw: string;
  }
>;

async function resolveAll(widths: number[]): Promise<Resolved> {
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (
        r instanceof CSSStyleRule &&
        /(^|,)\s*(:root|html)\s*(,|$)/.test(r.selectorText)
      ) {
        for (const p of r.style) if (p.startsWith("--")) names.add(p);
      }
      if ("cssRules" in r && (r as CSSGroupingRule).cssRules)
        walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {}
  }
  const head = [
    ...document.head.querySelectorAll('style, link[rel="stylesheet"]'),
  ]
    .map((n) =>
      n instanceof HTMLLinkElement
        ? `<link rel="stylesheet" href="${n.href}">`
        : n.outerHTML,
    )
    .join("");
  const frames = await Promise.all(
    widths.map(
      (w) =>
        new Promise<HTMLIFrameElement>((res) => {
          const f = document.createElement("iframe");
          f.style.cssText = `position:absolute;left:-99999px;top:0;width:${w}px;height:800px;border:0`;
          f.srcdoc = `<!doctype html><html lang="en"><head>${head}</head><body></body></html>`;
          f.onload = () => setTimeout(() => res(f), 600);
          document.body.append(f);
        }),
    ),
  );
  const out: Resolved = {};
  const raw = getComputedStyle(document.documentElement);
  for (const name of names) {
    const value = raw.getPropertyValue(name).trim();
    const probe = (win: Window, prop: string) => {
      const d = win.document;
      const el = d.createElement("div");
      el.style.setProperty(prop, `var(${name})`);
      d.body.append(el);
      const v = win.getComputedStyle(el).getPropertyValue(prop);
      el.remove();
      return v;
    };
    const autoWidth = (win: Window) => win.document.body.clientWidth + "px";
    if (/^-?[\d.]+$/.test(value)) {
      out[name] = {
        kind: "number",
        series: frames.map(() => String(Number(value))),
        raw: value,
      };
      continue;
    }
    const asColor =
      CSS.supports("color", value) ||
      /^(#|rgb|hsl|lab|oklch|oklab|color\(|color-mix)/.test(value);
    if (asColor) {
      out[name] = {
        kind: "color",
        series: frames.map((f) => probe(f.contentWindow!, "color")),
        raw: value,
      };
      continue;
    }
    const series = frames.map((f) => probe(f.contentWindow!, "width"));
    const invalid =
      frames.some((f, i) => series[i] === autoWidth(f.contentWindow!)) ||
      !/\d/.test(value);
    out[name] = {
      kind: invalid ? "other" : "length",
      series: invalid ? [value] : series,
      raw: value,
    };
  }
  frames.forEach((f) => f.remove());
  return out;
}

const widths = [1440, 992, 768, 375];
const browser = await launch();
const page = await browser.newPage();
await open(page, origin + path);
const source = await page.evaluate(resolveAll, widths);
await open(page, opts.local);
const local = await page.evaluate(resolveAll, widths);
await browser.close();
close();

const key = (r: Resolved[string]) => `${r.kind}:${r.series.join("|")}`;
const byValue = new Map<string, string[]>();
for (const [name, r] of Object.entries(local)) {
  if (r.kind === "other" || r.series.some((s) => s === "auto" || s === ""))
    continue;
  byValue.set(key(r), [...(byValue.get(key(r)) ?? []), name]);
}

// Several tokens can share a value (16px is a space step, a radius and the
// gutter). Rank by kind first — spacing for spacing, a swatch for a palette
// color, a semantic token for a theme color — then by shared words.
const family = (n: string) =>
  /radius/.test(n)
    ? "radius"
    : /space|spacing|gap|gutter|margin|padding|section/.test(n)
      ? "space"
      : /font|size|line-height|letter|weight|heading|paragraph|display|eyebrow|text-style/.test(
            n,
          )
        ? "type"
        : /^--(white|black|neutral|brand|accent)|swatch|color---|palette|gr[ae]y|denim|blue|red|green/.test(
              n,
            )
          ? "palette"
          : "theme";
const words = (n: string) =>
  new Set(n.replace(/^--_?/, "").split(/[-_]+/).filter(Boolean));
const score = (source: string, token: string) => {
  const shared = [...words(token)].filter((w) => words(source).has(w)).length;
  return (
    (family(source) === family(token) ? 100 : 0) +
    shared * 10 -
    token.length / 100
  );
};
const rows = Object.entries(source)
  .filter(([, r]) => r.kind !== "other")
  .map(([name, r]) => {
    const matches = [...(byValue.get(key(r)) ?? [])].sort(
      (a, b) => score(name, b) - score(name, a),
    );
    return {
      source: name,
      kind: r.kind,
      value: r.series[0],
      mobile: r.series.at(-1),
      trix: matches,
      raw: r.raw,
    };
  });

output("variable-map.json", JSON.stringify(rows, null, 2));
const matched = rows.filter((r) => r.trix.length);
const esc = (s: string) => s.replace(/[\\/.*[\]^$]/g, "\\$&");
output(
  "rename-variables.sed",
  [...matched]
    .sort((a, b) => b.source.length - a.source.length)
    .map((r) => `s/var(${esc(r.source)})/var(${esc(r.trix[0])})/g`)
    .join("\n") + "\n",
);
output(
  "variable-map.md",
  [
    `# Variable map — ${opts.source ?? opts.dir} → ${opts.local}`,
    "",
    `${matched.length} of ${rows.length} source variables resolve to a Trix token with the same value at 1440, 992, 768 and 375px.`,
    "",
    "| Source variable | 1440 | 375 | Trix token(s) |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| \`${r.source}\` | ${r.value} | ${r.mobile} | ${r.trix.map((t) => `\`${t}\``).join(" ") || "—"} |`,
    ),
  ].join("\n"),
);
console.log(
  `${matched.length}/${rows.length} source variables matched by value.`,
);
console.log(
  "Wrote .trix/variable-map.md and .trix/rename-variables.sed (longest names first; apply to CSS being moved, then rebuild and compare).",
);

#!/usr/bin/env node
/**
 * Maps the source site's classes to Trix classes by what they do, not by
 * what they are called.
 *
 * Each class is applied to a bare element at four viewport widths, in the
 * source's stylesheets and then in the Trix project's, and the computed
 * properties that differ from an unclassed element are compared. Two classes
 * match only if they change the same properties to the same values at every
 * width. A class with the same name and a different effect is reported — on
 * a migrated site that is the dangerous case (`margin-bottom-2` in Lumos for
 * Webflow is not `margin-bottom-2` in a project with its own spacing scale).
 *
 * Usage
 *   node scripts/measure/classes.ts --source https://site.com/ --local http://localhost:4321/style-guide
 *   node scripts/measure/classes.ts --dir path/to/export --page /index.html --local http://localhost:4321/
 *   options: --prefix u-   only classes starting with this (default: all)
 *            --pages /a,/b  collect classes from several source pages
 *
 * Writes .trix/class-map.json and .trix/class-map.md.
 */

import { args, launch, open, output, serve } from "./browser.ts";

const opts = args();
let sourceOrigin: string;
let close = () => {};
if (typeof opts.dir === "string") {
  const s = await serve(opts.dir);
  sourceOrigin = s.origin;
  close = () => s.server.close();
} else if (typeof opts.source === "string") {
  sourceOrigin = new URL(opts.source).origin;
} else {
  console.error(
    "usage: classes.ts --source <url> | --dir <export> --local <trix page url> [--prefix u-] [--pages /a,/b]",
  );
  process.exit(1);
}
if (typeof opts.local !== "string") {
  console.error("--local <url of a page in the Trix project> is required");
  process.exit(1);
}
const pages =
  typeof opts.pages === "string"
    ? opts.pages.split(",")
    : [
        typeof opts.page === "string"
          ? opts.page
          : typeof opts.source === "string"
            ? new URL(opts.source).pathname
            : "/",
      ];
const prefix = typeof opts.prefix === "string" ? opts.prefix : "";

type Effects = Record<
  string,
  { rule: "own" | "compound-only" | "none"; fx: Record<string, string>[] }
>;

/** Runs in the page: measures each class's effect on a bare div, in iframes at fixed widths. */
async function effects({
  classes,
  widths,
}: {
  classes: string[] | null;
  widths: number[];
}): Promise<Effects> {
  const PROPS =
    "display position top right bottom left z-index width height min-width min-height max-width max-height margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left row-gap column-gap flex-grow flex-shrink flex-basis flex-direction flex-wrap align-items align-self justify-content justify-self order overflow-x overflow-y font-family font-size font-weight font-style line-height letter-spacing text-transform text-align text-wrap-mode text-wrap-style color background-color background-image border-top-width border-top-style border-top-color border-top-left-radius border-top-right-radius border-bottom-left-radius border-bottom-right-radius opacity pointer-events object-fit aspect-ratio -webkit-line-clamp visibility transform grid-column-start grid-column-end text-decoration-line".split(
      " ",
    );
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
  const own = new Set<string>();
  const anywhere = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        for (const s of r.selectorText.split(",").map((x) => x.trim())) {
          const m = s.match(/^\.([\w-]+)$/);
          if (m) own.add(m[1]);
          for (const c of s.match(/\.[\w-]+/g) ?? []) anywhere.add(c.slice(1));
        }
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
  const measure = (win: Window, cls: string) => {
    const d = win.document;
    const host = d.createElement("div");
    const base = d.createElement("div");
    const el = d.createElement("div");
    host.style.cssText =
      "position:relative;display:block;width:600px;height:400px";
    el.className = cls;
    host.append(base, el);
    d.body.append(host);
    const a = win.getComputedStyle(el);
    const b = win.getComputedStyle(base);
    const out: Record<string, string> = {};
    for (const p of PROPS) {
      const v = a.getPropertyValue(p);
      if (v !== b.getPropertyValue(p)) out[p] = v;
    }
    host.remove();
    return out;
  };
  const list = classes ?? [...own];
  const result: Effects = {};
  for (const c of list) {
    result[c] = {
      rule: own.has(c) ? "own" : anywhere.has(c) ? "compound-only" : "none",
      fx: frames.map((f) => measure(f.contentWindow!, c)),
    };
  }
  frames.forEach((f) => f.remove());
  return result;
}

const widths = [1440, 992, 768, 375];
const browser = await launch();
const page = await browser.newPage();

const used = new Map<string, number>();
for (const path of pages) {
  await open(page, sourceOrigin + path);
  const classes = await page.evaluate(() =>
    [...document.querySelectorAll("[class]")].flatMap((e) => [...e.classList]),
  );
  for (const c of classes)
    if (c.startsWith(prefix) && !/^w-/.test(c))
      used.set(c, (used.get(c) ?? 0) + 1);
}
const sourceFx = await page.evaluate(effects, {
  classes: [...used.keys()],
  widths,
});

await open(page, opts.local);
const localFx = await page.evaluate(effects, { classes: null, widths });
await browser.close();
close();

const key = (fx: Record<string, string>[]) =>
  JSON.stringify(
    fx.map((o) =>
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k]]),
    ),
  );
const empty = (fx: Record<string, string>[]) =>
  fx.every((o) => !Object.keys(o).length);
const byEffect = new Map<string, string[]>();
for (const [c, v] of Object.entries(localFx)) {
  if (empty(v.fx)) continue;
  byEffect.set(key(v.fx), [...(byEffect.get(key(v.fx)) ?? []), c]);
}

type Row = {
  source: string;
  uses: number;
  status: string;
  trix: string[];
  note?: string;
};
const rows: Row[] = [...used.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([c, uses]) => {
    const s = sourceFx[c];
    const bare = c.replace(/^u-/, "");
    const same = localFx[c] ?? localFx[bare];
    const sameName = localFx[c] ? c : localFx[bare] ? bare : undefined;
    if (s.rule === "none")
      return {
        source: c,
        uses,
        status: "dead",
        trix: [],
        note: "no CSS rule in the source — drop it",
      };
    if (empty(s.fx)) {
      return {
        source: c,
        uses,
        status: "contextual",
        trix: sameName ? [sameName] : [],
        note:
          s.rule === "compound-only"
            ? "only styled in combination with other classes"
            : "no visible effect on a bare element — check in context",
      };
    }
    const matches = byEffect.get(key(s.fx)) ?? [];
    if (sameName && same && key(same.fx) === key(s.fx))
      return { source: c, uses, status: "same", trix: [sameName] };
    if (matches.length) {
      return {
        source: c,
        uses,
        status: sameName ? "renamed (same name differs!)" : "renamed",
        trix: matches,
        note: sameName
          ? `\`${sameName}\` exists but does something else`
          : undefined,
      };
    }
    return {
      source: c,
      uses,
      status: "no match",
      trix: [],
      note: `changes ${Object.keys(s.fx[0]).join(", ") || Object.keys(s.fx.find((o) => Object.keys(o).length) ?? {}).join(", ")}`,
    };
  });

output("class-map.json", JSON.stringify(rows, null, 2));
const counts = Object.groupBy(rows, (r) => r.status.split(" ")[0]);
const md = [
  `# Class map — ${opts.source ?? opts.dir} → ${opts.local}`,
  "",
  "Matched by computed effect at 1440, 992, 768 and 375px. `same` = same name, same effect. `renamed` = use the Trix class listed. `no match` = needs a token, a component, or a decision.",
  "",
  "| Source class | Uses | Status | Trix | Note |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map(
    (r) =>
      `| \`${r.source}\` | ${r.uses} | ${r.status} | ${r.trix.map((t) => `\`${t}\``).join(" ")} | ${r.note ?? ""} |`,
  ),
].join("\n");
output("class-map.md", md);
console.log(
  Object.entries(counts)
    .map(([k, v]) => `${k}: ${v?.length}`)
    .join(" · "),
);
const danger = rows.filter((r) => r.status.includes("differs"));
if (danger.length)
  console.log(
    `\nSame name, different effect — do not rename by name:\n${danger.map((r) => `  ${r.source} → ${r.trix.join(" / ")}`).join("\n")}`,
  );
console.log("\nWrote .trix/class-map.json and .trix/class-map.md");

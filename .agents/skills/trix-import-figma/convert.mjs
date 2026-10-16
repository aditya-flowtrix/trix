#!/usr/bin/env node
/**
 * Turns measurements taken off a Figma frame into Trix tokens.
 *
 * Figma cannot express three things this system relies on, so every value
 * arrives in a form that has to be converted back:
 *
 *   rem          Figma is px-only. Divide by 16.
 *   line-height  Figma has no unitless or % variables. Divide the line
 *                height by the font size.
 *   letter-      Figma is px or %, this system is em. px divided by the font
 *   spacing      size, or % divided by 100 — both give em.
 *   color-mix    Figma has no mixing, so designers restate the same hex at
 *                a lower opacity. Alpha becomes the mix percentage.
 *
 * A desktop frame is measured at 1440px, which is --viewport-max, so a value
 * read off that frame is the token's MAX. The mobile frame's value is the MIN.
 * A mobile value of 0, or none, means the designer never drew it: the min is
 * then derived from the ratio of the token it replaces (or the one closest in
 * size) and reported as a GUESS.
 *
 * Two jobs:
 *   a change    the design adjusts this site: each value is matched to the
 *               token it is closest to, and snapped within 2px.
 *   --fresh     a new project: the design's type scale and palette REPLACE
 *               Trix's. Type rows are matched by name (H1 → h1), never by
 *               size, and print as whole Text style groups; the colours are
 *               the palette, printed as ramps.
 *
 * Reports only. Placing tokens in the right group of tokens.css is a judgement
 * call about what a value means, so it stays with whoever is reading the design.
 *
 * Usage
 *   node convert.mjs --from-figma <export folder or .tokens.json files> > design.json
 *   node convert.mjs --json design.json [--fresh] [--css path/to/tokens.css]
 *   node convert.mjs --px 30
 *   node convert.mjs --lh 50/42
 *   node convert.mjs --color "#FFFFFF@60"
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

/* Moves independently of the framework: a skill fix does not need a release,
   and a release does not invalidate the skill. */
const SKILL_VERSION = "1.2.0";
/* A pin, not a mirror: the release this skill was last checked against.
   Deriving it from package.json would make it always equal to the running
   version, and the mismatch note would never fire. */
const TESTED_AGAINST = "0.5.0";

const ROOT_PX = 16;
const SNAP_PX = 2; // ±2px counts as drift, not a decision
const SNAP_LH = 0.05;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
const fresh = has("fresh");

/* Figma names are labels ("H1 display", "r_12", "Plum-400 (Violet)"); a
   token name is kebab-case, from the last segment of a Figma path, without
   the designer's (aside). */
const kebab = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const tokenName = (item, prefix = "") => {
  const label = String(item.name)
    .split("/")
    .at(-1)
    .replace(/\(.*?\)/g, "");
  const base = kebab(item.token ?? label);
  return base.startsWith(prefix) ? base : `${prefix}${base}`;
};
/* A mobile value of 0 (a Figma mode nobody filled in) or none is not drawn. */
const drawn = (v) => typeof v === "number" && v > 0;

const cssPath = flag("css") ?? "src/styles/tokens.css";

/* ---------- read what the system already has ---------- */

function readTokens(css) {
  const num = (re) => {
    const out = {};
    for (const m of css.matchAll(re)) out[m[1]] = Number(m[2]);
    return out;
  };
  const mins = num(/--([a-z0-9-]+)-min:\s*([\d.]+)/g);
  const maxes = num(/--([a-z0-9-]+)-max:\s*([\d.]+)/g);

  const scale = {};
  for (const name of Object.keys(maxes)) {
    if (mins[name] === undefined) continue;
    if (name.startsWith("viewport")) continue;
    scale[name] = { min: mins[name], max: maxes[name] };
  }

  const lineHeights = {};
  for (const m of css.matchAll(/--line-height-([a-z]+):\s*([\d.]+)/g)) {
    lineHeights[`--line-height-${m[1]}`] = Number(m[2]);
  }

  const letterSpacing = {};
  for (const m of css.matchAll(/--letter-spacing-([a-z]+):\s*(-?[\d.]+)em/g)) {
    letterSpacing[`--letter-spacing-${m[1]}`] = Number(m[2]);
  }

  const radii = {};
  for (const m of css.matchAll(/--radius-([a-z]+):\s*([\d.]+)rem/g)) {
    radii[`--radius-${m[1]}`] = Number(m[2]);
  }

  const weights = {};
  for (const m of css.matchAll(
    /--primary-(thin|extralight|light|regular|medium|semibold|bold|extrabold|black):\s*(\d+)/g,
  )) {
    weights[`--primary-${m[1]}`] = Number(m[2]);
  }

  /* Every hex-valued token, so un-numbered swatches (--plum-dark) count too. */
  const swatches = {};
  for (const m of css.matchAll(
    /--([a-z][a-z0-9-]*):\s*(#[0-9a-fA-F]{3,8})\b/g,
  )) {
    swatches[`--${m[1]}`] = m[2].toLowerCase();
  }

  /* Swatches that some theme uses as --text. A muted version of one of these
     is nearly always currentcolor in this system, not a fixed colour. */
  const textSwatches = new Set();
  for (const m of css.matchAll(/--text:\s*var\((--[a-z0-9-]+)\)/g))
    textSwatches.add(m[1]);

  /* Text styles are the `Text style — name` groups, as the generator reads them. */
  const textStyles = new Set(
    [...css.matchAll(/\/\*\s*Text style\s*[—–-]\s*([\w-]+)\s*\*\//g)].map(
      (m) => m[1],
    ),
  );

  return {
    scale,
    textStyles,
    lineHeights,
    letterSpacing,
    radii,
    weights,
    swatches,
    textSwatches,
  };
}

/* ---------- conversions ---------- */

const toRem = (px) => +(px / ROOT_PX).toFixed(4);
const unitless = (lhPx, sizePx) => +(lhPx / sizePx).toFixed(3);

/* On a tie, prefer the general scale over layout-specific tokens: 30px should
   land on --space-5, not --site-gutter, even though both are 32 at desktop. */
const rank = (name) =>
  name.startsWith("space") ? 0 : name.startsWith("section-space") ? 1 : 2;

function nearest(px, scale, kindFilter) {
  let best = null;
  for (const [name, v] of Object.entries(scale)) {
    if (kindFilter && !kindFilter(name)) continue;
    const delta = Math.abs(v.max - px);
    const better =
      !best ||
      delta < best.delta ||
      (delta === best.delta && rank(name) < rank(best.name));
    if (better) best = { name, delta, ...v };
  }
  return best;
}

const isSpace = (n) =>
  n.startsWith("space") ||
  n.startsWith("section-space") ||
  n.startsWith("site-");
const isType = (n) => tokens.textStyles.has(n);

/** Mobile end of a token: the token it replaces, or the one closest in size. */
function deriveMin(maxPx, scale, kindFilter, replaces) {
  const ref = scale[replaces]
    ? { name: replaces, ...scale[replaces] }
    : nearest(maxPx, scale, kindFilter);
  if (!ref) return { min: maxPx, ref: null, ratio: 1 };
  const ratio = ref.min / ref.max;
  return {
    min: Math.round(maxPx * ratio),
    ref: ref.name,
    ratio: +ratio.toFixed(3),
  };
}

function nearestValue(value, table) {
  let best = null;
  for (const [name, v] of Object.entries(table)) {
    const delta = Math.abs(v - value);
    if (!best || delta < best.delta) best = { name, value: v, delta };
  }
  return best;
}

/* Figma names weights, CSS numbers them. */
const WEIGHT_NAMES = {
  thin: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
  heavy: 900,
};

function nearestLineHeight(value, lineHeights) {
  let best = null;
  for (const [name, v] of Object.entries(lineHeights)) {
    const delta = Math.abs(v - value);
    if (!best || delta < best.delta) best = { name, value: v, delta };
  }
  return best;
}

const hexToRgb = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

function nearestSwatch(hex, swatches) {
  const [r, g, b] = hexToRgb(hex);
  let best = null;
  for (const [name, value] of Object.entries(swatches)) {
    const [r2, g2, b2] = hexToRgb(value);
    const d = Math.hypot(r - r2, g - g2, b - b2);
    if (!best || d < best.d) best = { name, value, d: +d.toFixed(1) };
  }
  return best;
}

/* WCAG 2.1 relative luminance and contrast. Flagged, never blocking: a
   decorative label may fail on purpose, and that is the designer's call. */
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** Alpha is opacity over a background, so flatten before measuring. */
const composite = (fg, bg, alpha) =>
  fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]);

function contrastRatio(fgHex, bgHex, alpha = 1) {
  const bg = hexToRgb(bgHex);
  const fg = composite(hexToRgb(fgHex), bg, alpha);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
}

/** 24px, or 18.66px when bold, is "large text" and gets the lower bar. */
const contrastFloor = (sizePx, bold) =>
  sizePx >= 24 || (bold && sizePx >= 18.66) ? 3 : 4.5;

/** Alpha in Figma is a stand-in for a mix, so restate it as one. */
function toColorMix(hex, alphaPct, swatches) {
  const match = nearestSwatch(hex, swatches);
  const base =
    match && match.d === 0 ? `var(${match.name})` : hex.toLowerCase();
  if (alphaPct >= 100) return { css: base, match };
  return { css: `color-mix(in lab, ${base} ${alphaPct}%, transparent)`, match };
}

/* ---------- one-off lookups ---------- */

const themesPath = cssPath.replace(/tokens\.css$/, "themes.css");
const css =
  readFileSync(cssPath, "utf8") +
  (themesPath !== cssPath && existsSync(themesPath)
    ? readFileSync(themesPath, "utf8")
    : "");
const tokens = readTokens(css);

if (flag("px") !== undefined) {
  const px = Number(flag("px"));
  const near = nearest(px, tokens.scale, isSpace);
  console.log(`${px}px = ${toRem(px)}rem`);
  if (near) {
    const verdict =
      near.delta <= SNAP_PX
        ? `SNAP to --${near.name}`
        : `no token within ${SNAP_PX}px`;
    console.log(
      `nearest: --${near.name} (${near.min}→${near.max}), off by ${near.delta}px — ${verdict}`,
    );
  }
  process.exit(0);
}

if (flag("lh")) {
  const [lh, size] = flag("lh").split("/").map(Number);
  const value = unitless(lh, size);
  const near = nearestLineHeight(value, tokens.lineHeights);
  console.log(`${lh}px / ${size}px = ${value}`);
  if (near) {
    const verdict =
      near.delta <= SNAP_LH ? `SNAP to ${near.name}` : "no token close enough";
    console.log(
      `nearest: ${near.name} (${near.value}), off by ${near.delta.toFixed(3)} — ${verdict}`,
    );
  }
  process.exit(0);
}

if (flag("ls")) {
  /* --ls 2/64 (px over size) or --ls 3% */
  const raw = flag("ls");
  const em = raw.endsWith("%")
    ? +(Number(raw.slice(0, -1)) / 100).toFixed(4)
    : (() => {
        const [px, size] = raw.split("/").map(Number);
        return +(px / size).toFixed(4);
      })();
  const near = nearestValue(em, tokens.letterSpacing);
  console.log(`${raw} = ${em}em`);
  if (near) {
    const verdict =
      near.delta <= 0.005 ? `SNAP to ${near.name}` : "no token close enough";
    console.log(
      `nearest: ${near.name} (${near.value}em), off by ${near.delta.toFixed(4)} — ${verdict}`,
    );
  }
  process.exit(0);
}

if (flag("color")) {
  const [hex, pct] = flag("color").split("@");
  const alpha = pct === undefined ? 100 : Number(pct);
  const { css: out, match } = toColorMix(hex, alpha, tokens.swatches);
  console.log(out);
  if (match)
    console.log(
      `nearest swatch: ${match.name} (${match.value}), distance ${match.d}`,
    );
  process.exit(0);
}

/* ---------- a Figma variables export → the inventory ---------- */

/* Figma → Local variables → a collection → Export modes gives one DTCG file
   per mode (Desktop.tokens.json, Mobile.tokens.json, Light.tokens.json…).
   This turns a folder of them into the JSON that --json reads: a draft to
   check and name, not an answer — variables carry no text styles, so each
   type row still needs its line height, tracking and weight from the
   style guide. */
function fromFigma(paths) {
  const files = paths.flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((f) => f.endsWith(".json"))
          .map((f) => join(p, f))
      : [p],
  );
  const vars = new Map(); // "group/name" → { type, byMode }
  for (const file of files) {
    const mode = basename(file)
      .replace(/(\.tokens)?\.json$/, "")
      .split(".")
      .at(-1);
    const walk = (node, path, type) => {
      if (!node || typeof node !== "object") return;
      type = node.$type ?? type;
      if ("$value" in node) {
        const v = vars.get(path) ?? { type, byMode: {} };
        v.byMode[mode] = node.$value;
        vars.set(path, v);
        return;
      }
      for (const [k, child] of Object.entries(node))
        if (!k.startsWith("$")) walk(child, path ? `${path}/${k}` : k, type);
    };
    walk(JSON.parse(readFileSync(file, "utf8")), "", undefined);
  }
  const resolve = (value, mode, depth = 0) => {
    const ref = typeof value === "string" && value.match(/^\{(.+)\}$/)?.[1];
    if (!ref || depth > 10) return value;
    const target = vars.get(ref.replace(/\./g, "/"));
    if (!target) return value;
    const next = target.byMode[mode] ?? Object.values(target.byMode)[0];
    return resolve(next, mode, depth + 1);
  };
  const toPx = (v) =>
    typeof v === "number"
      ? v
      : typeof v === "string" && /^-?[\d.]+(px)?$/.test(v)
        ? parseFloat(v)
        : v && typeof v === "object" && "value" in v
          ? v.value * (v.unit === "rem" || v.unit === "em" ? ROOT_PX : 1)
          : undefined;
  const toHex = (v) => {
    if (typeof v === "string" && v.startsWith("#")) {
      const h = v.slice(1);
      return h.length === 8
        ? { hex: `#${h.slice(0, 6)}`, alpha: parseInt(h.slice(6), 16) / 255 }
        : { hex: v, alpha: 1 };
    }
    if (v && typeof v === "object") {
      const hex =
        v.hex ??
        `#${v.components
          .map((c) =>
            Math.round(c * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`;
      return { hex: hex.slice(0, 7), alpha: v.alpha ?? 1 };
    }
  };

  const out = { space: [], type: [], color: [], radius: [], weight: [] };
  const notes = [];
  for (const [path, { type, byMode }] of vars) {
    const modes = Object.keys(byMode);
    const mobile = modes.find((m) => /mobile|phone/i.test(m));
    const desktop =
      modes.find((m) => /desktop/i.test(m)) ??
      modes.find((m) => m !== mobile) ??
      mobile;
    const at = (m) => resolve(byMode[m], m);
    const p = path.toLowerCase();

    if (type === "color") {
      const values = modes.map((m) => toHex(at(m)));
      if (new Set(values.map((c) => `${c?.hex}@${c?.alpha}`)).size > 1) {
        notes.push(
          `THEMED  ${path}: ${modes.map((m, i) => `${m} ${values[i]?.hex}`).join(" · ")} — a theme role, map it onto themes.css by hand`,
        );
        continue;
      }
      const c = values[0];
      if (c)
        out.color.push({
          name: path,
          hex: c.hex,
          ...(c.alpha < 1 ? { alpha: +c.alpha.toFixed(2) } : {}),
        });
      continue;
    }
    // Text styles alias the same weights and families: list each once.
    if (/weight/.test(p)) {
      const value = at(desktop);
      if (!out.weight.some((w) => w.value === value))
        out.weight.push({ name: path, value });
      continue;
    }
    if (type === "fontFamily" || /famil|typeface/.test(p)) {
      const note = `FONT    ${[at(desktop)].flat().join(", ")} — see references/fonts.md`;
      if (!notes.includes(note)) notes.push(note);
      continue;
    }
    const px = toPx(at(desktop));
    if (px === undefined) {
      notes.push(`UNSORTED ${path}: ${JSON.stringify(at(desktop))}`);
      continue;
    }
    const mobilePx =
      mobile && mobile !== desktop ? toPx(at(mobile)) : undefined;
    const fluid = (list, entry) => {
      list.push(drawn(mobilePx) ? { ...entry, mobilePx } : entry);
      if (mobile && mobile !== desktop && !drawn(mobilePx))
        notes.push(
          `NO MOBILE ${path}: ${mobile} is ${mobilePx ?? "empty"} — not drawn; its min will be a guess`,
        );
    };
    if (/font-?size|font sizes|typescale|type-?scale|text-?size/.test(p))
      fluid(out.type, { name: path, sizePx: px });
    else if (/radius|corner|round/.test(p)) out.radius.push({ name: path, px });
    else if (/space|spacing|gap|padding|margin|gutter|inset/.test(p))
      fluid(out.space, { name: path, px });
    else
      notes.push(
        `UNSORTED ${path}: ${px}px — line heights and tracking need their text style's size; borders and anything else, by hand`,
      );
  }
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  return { inventory: out, notes };
}

const figmaPaths = (() => {
  const i = args.indexOf("--from-figma");
  if (i === -1) return undefined;
  return args.slice(i + 1).filter((a) => !a.startsWith("--"));
})();
if (figmaPaths) {
  if (!figmaPaths.length) {
    console.error("need --from-figma <export folder or .tokens.json files>");
    process.exit(1);
  }
  const { inventory, notes } = fromFigma(figmaPaths);
  console.log(JSON.stringify(inventory, null, 2));
  if (notes.length) console.error(notes.join("\n"));
  process.exit(0);
}

/* ---------- batch: the shape Claude fills in from the Figma file ---------- */

const jsonPath = flag("json");
if (!jsonPath) {
  console.error(
    "need --json <file>, --from-figma <export>, or one of --px / --lh / --color",
  );
  process.exit(1);
}

const design = JSON.parse(readFileSync(jsonPath, "utf8"));

const KNOWN = ["space", "type", "color", "letter", "radius", "weight"];
const unknown = Object.keys(design).filter((k) => !KNOWN.includes(k));
if (unknown.length) {
  console.error(
    `unknown key(s): ${unknown.join(", ")}. Expected any of: ${KNOWN.join(", ")}`,
  );
  process.exit(1);
}
if (!KNOWN.some((k) => (design[k] ?? []).length)) {
  console.error("nothing to convert — every list is empty or missing.");
  process.exit(1);
}
const rows = [];
const additions = [];
const questions = [];
const guesses = [];
const contrastRows = [];
const styleBlocks = [];

/** The min: the mobile frame's value if drawn, else a ratio — logged as a guess. */
function minFor(item, maxPx, kindFilter, token, replaces) {
  if (drawn(item.mobilePx)) return { min: item.mobilePx, note: "min measured" };
  const { min, ref, ratio } = deriveMin(
    maxPx,
    tokens.scale,
    kindFilter,
    replaces,
  );
  guesses.push(
    `--${token}-min: ${min} — no mobile value; ${ratio} × ${maxPx}, the ratio of --${ref}`,
  );
  return { min, note: `min ${min} GUESSED from --${ref} (${ratio})` };
}

for (const item of design.space ?? []) {
  const near = nearest(item.px, tokens.scale, isSpace);
  if (near && near.delta <= SNAP_PX) {
    rows.push([
      item.name,
      `${item.px}px`,
      `--${near.name}`,
      near.delta === 0 ? "exact" : `snapped, off by ${near.delta}px`,
    ]);
    if (drawn(item.mobilePx) && Math.abs(item.mobilePx - near.min) > SNAP_PX)
      questions.push(
        `--${near.name}-min is ${near.min}; the mobile frame says ${item.mobilePx}. Change it?`,
      );
  } else {
    const name = tokenName(item, "space-");
    const { min, note } = minFor(item, item.px, isSpace, name);
    additions.push({ name, min, max: item.px, fluid: true });
    rows.push([item.name, `${item.px}px`, `--${name}`, `NEW — ${note}`]);
    questions.push(
      `--${name}: ${item.px}px is ${near ? `${near.delta}px off --${near.name}` : "unmatched"}. New token, or consolidate?`,
    );
  }
}

/* Line height, tracking and weight of a type row, as tokens where one is close. */
function typeDetails(item) {
  const out = {};
  if (item.lineHeightPx || item.lineHeightPct) {
    const lh = item.lineHeightPx
      ? unitless(item.lineHeightPx, item.sizePx)
      : +(item.lineHeightPct / 100).toFixed(3);
    const near = nearestLineHeight(lh, tokens.lineHeights);
    out.lh = near && near.delta <= SNAP_LH ? `var(${near.name})` : String(lh);
    if (!near || near.delta > SNAP_LH)
      questions.push(
        `${item.name} line-height ${lh} has no token. Add one, or use ${near?.name}?`,
      );
  }
  if (item.letterPx !== undefined || item.letterPct !== undefined) {
    const em =
      item.letterPct !== undefined
        ? +(item.letterPct / 100).toFixed(4)
        : +(item.letterPx / item.sizePx).toFixed(4);
    const near = nearestValue(em, tokens.letterSpacing);
    out.ls = near && near.delta <= 0.005 ? `var(${near.name})` : `${em}em`;
  }
  if (item.weight !== undefined) {
    const num =
      typeof item.weight === "number"
        ? item.weight
        : WEIGHT_NAMES[
            String(item.weight)
              .toLowerCase()
              .replace(/[^a-z]/g, "")
          ];
    const near = num && nearestValue(num, tokens.weights);
    out.weight = near && near.delta === 0 ? `var(${near.name})` : String(num);
  }
  if (item.family) {
    const family = kebab(item.family);
    out.family = `var(--${family}-family)`;
    if (!new RegExp(`--${family}-family\\s*:`).test(css))
      questions.push(
        `Text styles are set in --${family}-family, which tokens.css doesn't have yet: add it under Typography — families (references/fonts.md in /trix-design-system).`,
      );
  }
  if (item.uppercase) out.transform = "uppercase";
  return out;
}

for (const item of design.type ?? []) {
  if (fresh) {
    // A new scale: the row is the style its name says, whatever its size.
    const name = tokenName(item);
    const old = tokens.scale[name];
    const { min, note } = minFor(item, item.sizePx, isType, name, name);
    rows.push([
      item.name,
      `${item.sizePx}px`,
      `--${name}`,
      `${old ? `replaces ${old.min}→${old.max}` : "NEW text style"}; ${note}`,
    ]);
    styleBlocks.push({
      name,
      isNew: !tokens.textStyles.has(name),
      min,
      max: item.sizePx,
      ...typeDetails(item),
    });
    continue;
  }
  const near = nearest(item.sizePx, tokens.scale, isType);
  const lh = item.lineHeightPx
    ? unitless(item.lineHeightPx, item.sizePx)
    : null;
  const lhNear = lh ? nearestLineHeight(lh, tokens.lineHeights) : null;
  const sizeNote =
    near && near.delta === 0
      ? "exact"
      : near && near.delta <= SNAP_PX
        ? `snapped, off by ${near.delta}px`
        : "NEW";
  const sizeToken =
    sizeNote === "NEW" ? `--${tokenName(item)}` : `--${near.name}`;
  rows.push([item.name, `${item.sizePx}px`, sizeToken, sizeNote]);
  if (lh) {
    const note =
      lhNear && lhNear.delta <= SNAP_LH
        ? `snapped to ${lhNear.name}`
        : `NEW — no line-height token within ${SNAP_LH}`;
    rows.push([
      `${item.name} line-height`,
      `${item.lineHeightPx}/${item.sizePx}`,
      String(lh),
      note,
    ]);
    if (!lhNear || lhNear.delta > SNAP_LH) {
      questions.push(
        `${item.name} line-height ${lh} has no token. Add one, or use ${lhNear?.name}?`,
      );
    }
  }
  if (sizeNote === "NEW") {
    const name = tokenName(item);
    const { min, note } = minFor(item, item.sizePx, isType, name);
    additions.push({ name, min, max: item.sizePx, fluid: true });
    rows[rows.length - (item.lineHeightPx ? 2 : 1)][3] = `NEW — ${note}`;
    questions.push(
      `${item.name} at ${item.sizePx}px is unmatched. New text style, or consolidate?`,
    );
  } else if (
    drawn(item.mobilePx) &&
    Math.abs(item.mobilePx - near.min) > SNAP_PX
  ) {
    questions.push(
      `--${near.name}-min is ${near.min}; the mobile frame says ${item.mobilePx}. Change it?`,
    );
  }
}

/* A new project's opaque colours are its palette: they replace Trix's
   swatches, so a faded one is matched against the design's own. */
const palette = [];
if (fresh) {
  const swatches = {};
  for (const c of design.color ?? []) {
    if ((c.alpha ?? 1) < 1) continue;
    const name = tokenName(c);
    swatches[`--${name}`] = c.hex.toLowerCase();
    palette.push([name, c.hex.toLowerCase()]);
  }
  if (palette.length) tokens.swatches = swatches;
  // `--grey` beside `--grey-10` is a value and a group in Figma: the
  // generator refuses it, so say so now.
  for (const [name] of palette)
    if (palette.some(([n]) => n.startsWith(`${name}-`)))
      questions.push(
        `--${name} sits beside --${name}-… — Figma can't hold both. Rename it (e.g. --${name}-base).`,
      );
}

for (const item of design.color ?? []) {
  const alpha = item.alpha === undefined ? 100 : Math.round(item.alpha * 100);
  const { css: value, match } = toColorMix(item.hex, alpha, tokens.swatches);
  const note =
    match && match.d === 0
      ? alpha < 100
        ? "opacity restated as a mix"
        : fresh
          ? "palette"
          : "exact swatch"
      : `NEW — nearest ${match?.name} is ${match?.d} away`;
  const asText =
    match &&
    match.d === 0 &&
    alpha < 100 &&
    tokens.textSwatches.has(match.name);
  rows.push([
    item.name,
    `${item.hex}${alpha < 100 ? ` @${alpha}%` : ""}`,
    asText ? `color-mix(in lab, currentcolor ${alpha}%, transparent)` : value,
    asText ? "muted text — currentcolor, so it follows the theme" : note,
  ]);
  if (item.on) {
    const ratio = contrastRatio(item.hex, item.on, item.alpha ?? 1);
    const floor = contrastFloor(item.sizePx ?? 16, item.bold);
    contrastRows.push([
      item.name,
      `${item.hex}${alpha < 100 ? ` @${alpha}%` : ""} on ${item.on}`,
      `${ratio}:1`,
      ratio >= floor ? `passes (needs ${floor})` : `FAILS — needs ${floor}:1`,
    ]);
  }

  if (!match || match.d !== 0) {
    additions.push({ name: tokenName(item), value, fluid: false });
    questions.push(
      `${item.name} ${item.hex} matches no swatch (nearest ${match?.name}). New color, or use the existing one?`,
    );
  }
}

for (const item of design.letter ?? []) {
  const em =
    item.pct !== undefined
      ? +(item.pct / 100).toFixed(4)
      : +(item.px / item.sizePx).toFixed(4);
  const near = nearestValue(em, tokens.letterSpacing);
  const from =
    item.pct !== undefined ? `${item.pct}%` : `${item.px}/${item.sizePx}`;
  if (near && near.delta <= 0.005) {
    rows.push([item.name, from, `${em}em`, `snapped to ${near.name}`]);
  } else {
    const name = tokenName(item, "letter-spacing-");
    additions.push({ name, value: `${em}em`, fluid: false });
    rows.push([
      item.name,
      from,
      `${em}em`,
      `NEW — nearest ${near?.name} is ${near?.delta.toFixed(4)} away`,
    ]);
    questions.push(
      `${item.name} letter-spacing ${em}em has no token. Add one, or use ${near?.name}?`,
    );
  }
}

for (const item of design.radius ?? []) {
  const rem = toRem(item.px);
  const near = nearestValue(rem, tokens.radii);
  const offPx = near ? Math.abs(near.value * ROOT_PX - item.px) : Infinity;
  if (near && offPx <= SNAP_PX) {
    rows.push([
      item.name,
      `${item.px}px`,
      near.name,
      offPx === 0 ? "exact" : `snapped, off by ${offPx}px`,
    ]);
  } else {
    const name = tokenName(item, "radius-");
    additions.push({ name, value: `${rem}rem`, fluid: false });
    rows.push([
      item.name,
      `${item.px}px`,
      `--${name}`,
      `NEW — nearest ${near?.name} is ${offPx}px away`,
    ]);
    questions.push(
      `${item.name} radius ${item.px}px has no token. Add one, or use ${near?.name}?`,
    );
  }
}

for (const item of design.weight ?? []) {
  const num =
    typeof item.value === "number"
      ? item.value
      : WEIGHT_NAMES[
          String(item.value)
            .toLowerCase()
            .replace(/[^a-z]/g, "")
        ];
  if (!num) {
    rows.push([item.name, String(item.value), "?", "UNKNOWN weight name"]);
    questions.push(`${item.name}: could not read the weight "${item.value}".`);
    continue;
  }
  const near = nearestValue(num, tokens.weights);
  if (near && near.delta === 0) {
    rows.push([item.name, String(item.value), near.name, `exact (${num})`]);
  } else {
    rows.push([
      item.name,
      String(item.value),
      String(num),
      `NEW — nearest ${near?.name} is ${near?.value}`,
    ]);
    questions.push(
      `${item.name} is weight ${num}; the system has ${Object.values(tokens.weights).join(", ")}. Add it, or use ${near?.name}?`,
    );
  }
}

/* ---------- report ---------- */

let trixVersion = "unknown";
try {
  trixVersion =
    JSON.parse(readFileSync("package.json", "utf8")).trix?.version ?? "unknown";
} catch {}
console.log(`trix-import-figma ${SKILL_VERSION}  ·  Trix ${trixVersion}`);
const feature = (v) => v.split(".").slice(0, 2).join(".");
if (
  trixVersion !== "unknown" &&
  feature(trixVersion) !== feature(TESTED_AGAINST)
) {
  console.log(
    `  note: written against Trix ${TESTED_AGAINST}; check tokens.css still matches (patch releases are fine).`,
  );
}
console.log("");

const widths = [0, 1, 2, 3].map((i) =>
  Math.max(...rows.map((r) => String(r[i]).length), 4),
);
const line = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join("  ");
console.log(line(["FROM", "FIGMA", "TRIX", "NOTE"]));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const r of rows) console.log(line(r));

if (contrastRows.length) {
  const cw = [0, 1, 2, 3].map((i) =>
    Math.max(...contrastRows.map((r) => String(r[i]).length), 4),
  );
  console.log(
    "\nCONTRAST (flagged here; `npm run check` enforces the theme pairs — keep a designer-approved one with `/* contrast: accepted — why */` on its line in themes.css):",
  );
  for (const r of contrastRows) {
    console.log("  " + r.map((c, i) => String(c).padEnd(cw[i])).join("  "));
  }
}

if (guesses.length) {
  console.log(
    "\nGUESSED (no mobile value — ask the designer; working unattended, write them and log each in PROJECT.md → Still open):",
  );
  for (const g of guesses) console.log(`  - ${g}`);
}

if (questions.length) {
  console.log("\nASK BEFORE WRITING:");
  for (const q of new Set(questions)) console.log(`  - ${q}`);
}

/* ---------- handoff ---------- */

if (additions.length) {
  console.log(
    "\nTO PLACE BY HAND in src/styles/tokens.css (group matters — put each beside its own kind; `npm run tokens` writes the clamp):",
  );
  for (const a of additions) {
    if (a.fluid) {
      console.log(`  --${a.name}-min: ${a.min};`);
      console.log(`  --${a.name}-max: ${a.max};`);
    } else {
      console.log(`  --${a.name}: ${a.value};`);
    }
  }
}

if (styleBlocks.length) {
  console.log(
    "\nTEXT STYLES (--fresh) — write each into tokens.css. An existing group keeps its other lines; a NEW one copies the rest (trim, margins, wrap) from the style beside it:",
  );
  for (const b of styleBlocks) {
    console.log(`\n  /* Text style — ${b.name} */${b.isNew ? "   NEW" : ""}`);
    console.log(`  --${b.name}-min: ${b.min};`);
    console.log(`  --${b.name}-max: ${b.max};`);
    if (b.family) console.log(`  --${b.name}-font-family: ${b.family};`);
    if (b.weight) console.log(`  --${b.name}-font-weight: ${b.weight};`);
    if (b.lh) console.log(`  --${b.name}-line-height: ${b.lh};`);
    if (b.ls) console.log(`  --${b.name}-letter-spacing: ${b.ls};`);
    if (b.transform)
      console.log(`  --${b.name}-text-transform: ${b.transform};`);
  }
  const written = new Set(styleBlocks.map((b) => b.name));
  const left = [...tokens.textStyles].filter((n) => !written.has(n));
  if (left.length)
    console.log(
      `\n  Trix styles the design doesn't define: ${left.join(", ")} — map a design row onto each (its "token"), or remove the group if nothing uses it.`,
    );
}

if (palette.length) {
  console.log(
    "\nPALETTE (--fresh) — replaces the Color — palette group in tokens.css; themes.css then points its roles at these:",
  );
  const ramp = (n) => n.replace(/-\d+$/, "");
  const step = (n) => Number(n.match(/-(\d+)$/)?.[1] ?? -1);
  const sorted = [...palette].sort(
    ([a], [b]) => ramp(a).localeCompare(ramp(b)) || step(a) - step(b),
  );
  let last = "";
  for (const [name, hex] of sorted) {
    if (ramp(name) !== last && last) console.log("");
    last = ramp(name);
    console.log(`  --${name}: ${hex};`);
  }
}

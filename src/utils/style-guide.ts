/**
 * The design system as the style guide shows it: the model read from the
 * token files at build, and the labels written under each sample. Shared by
 * the `StyleGuide*` section components, so no page carries a value.
 */
import tokensCss from "@/styles/tokens.css?raw";
import themesCss from "@/styles/themes.css?raw";
import astroConfig from "../../astro.config.mjs?raw";
import {
  buildModel,
  fluidAt,
  lengthPx,
  resolveColor,
  resolveVar,
  toHex,
  toPx,
  type Rgba,
} from "./tokens.ts";

export const model = buildModel(tokensCss, themesCss);

/** A token's value, its `var()`s resolved. */
export const value = (name: string) =>
  resolveVar(`var(--${name})`, model.byName);

export const px = (n?: number) =>
  n === undefined ? "" : `${Math.round(n * 10) / 10}px`;

/** A fluid token on a phone (320) and on a desktop (1440); one value if it doesn't change. */
export const sizes = (name: string) => {
  const [phone, desktop] = [320, 1440].map((w) => fluidAt(model, name, w));
  return phone === desktop
    ? [px(phone)]
    : [px(phone), px(desktop)].filter(Boolean);
};

/** A fluid token from 320 to 1440, or its one value. */
export const range = (name: string) => sizes(name).join(" → ");

/** A length in px, with the value it is written as when that is a plain
    length — `16px (1rem)`; a formula is left out. */
export const lengthLabel = (name: string) => {
  const raw = value(name);
  const n = toPx(raw) ?? lengthPx(model, name);
  if (n === undefined || raw.endsWith("px")) return raw;
  return /[(]/.test(raw) ? px(n) : `${px(n)} (${raw})`;
};

/** A color token as its resolved hex. */
export const hex = (name: string) =>
  toHex(resolveColor(`var(--${name})`, [model.byName]) ?? [0, 0, 0, 0]);

const luminance = ([r, g, b]: Rgba) => {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** The text color, black or white, that reads best on a color token. */
export const ink = (name: string): "black" | "white" => {
  const L = luminance(
    resolveColor(`var(--${name})`, [model.byName]) ?? [1, 1, 1, 1],
  );
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "black" : "white";
};

// ponytail: reads `name` beside `cssVariable` in astro.config.mjs's fonts.
// A config written another way falls back to the stack's first family.
const fontNames = new Map(
  [
    ...astroConfig.matchAll(
      /name:\s*["']([^"']+)["'],\s*cssVariable:\s*["'](--[\w-]+)["']/g,
    ),
  ].map(([, name, variable]) => [variable, name]),
);

/** A font role's family name — `primary` → "Inter". */
export const fontName = (role: string) => {
  let raw = model.byName.get(`${role}-family`) ?? "";
  for (let i = 0; i < 5 && /^var\(--[\w-]+-family\)$/.test(raw); i++)
    raw = model.byName.get(raw.slice(6, -1)) ?? "";
  const variable = raw.match(/var\((--[\w-]+)/)?.[1];
  return (
    (variable && fontNames.get(variable)) ||
    raw
      .replace(/^var\(--[\w-]+,\s*/, "")
      .split(",")[0]
      .replace(/["')]/g, "")
      .trim()
  );
};

/** Sample text: every project shows it, so it names no brand. */
export const sample = {
  heading: "Design once, ship everywhere",
  short: "Sphinx of black quartz, judge my vow",
  long: "A clear hierarchy lets a page be scanned in seconds and read for minutes. Headings name what follows, paragraphs keep to a comfortable measure, and the space between them shows what belongs together — so the reader notices the ideas, not the letters.",
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789",
};

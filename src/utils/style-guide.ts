/**
 * The design system as the style guide shows it: the model read from the
 * token files at build, and the labels written under each sample. Shared by
 * the `StyleGuide*` section components, so no page carries a value.
 */
import tokensCss from "@/styles/tokens.css?raw";
import themesCss from "@/styles/themes.css?raw";
import { buildModel, fluidAt, lengthPx, resolveVar, toPx } from "./tokens.ts";

export const model = buildModel(tokensCss, themesCss);

/** A token's value, its `var()`s resolved. */
export const value = (name: string) =>
  resolveVar(`var(--${name})`, model.byName);

export const px = (n?: number) =>
  n === undefined ? "" : `${Math.round(n * 10) / 10}px`;

/** A fluid token from 320 to 1440, or its one value. */
export const range = (name: string) => {
  const [a, b] = [fluidAt(model, name, 320), fluidAt(model, name, 1440)];
  return a === b ? px(a) : `${px(a)} → ${px(b)}`;
};

/** A length with its px beside it, when it is not already px. */
export const lengthLabel = (name: string) => {
  const raw = value(name);
  const n = toPx(raw) ?? lengthPx(model, name);
  return n === undefined || raw.endsWith("px") ? raw : `${raw} · ${px(n)}`;
};

export const lorem =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros dolor interdum nulla, ut commodo diam libero vitae erat.";

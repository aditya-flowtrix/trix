#!/usr/bin/env node
/**
 * Proves the rebuilt design system matches the source, value by value.
 *
 * Reads the measured source (.trix/proposal.json, from propose.ts) and
 * measures the same things in the Trix project at the same widths: each
 * `.text-style-*` class's size, line height, letter spacing and weight, and
 * each `--space-*` token, and the layout grid (content width, margin,
 * gutter). Anything off by more than 0.5px is a failure.
 *
 * Usage: node scripts/measure/verify.ts --local http://localhost:4321/style-guide
 * Exit code 1 when anything differs. Writes .trix/verify.md.
 */

import { readFileSync } from "node:fs";
import { args, launch, open, output } from "./browser.ts";

const opts = args();
if (typeof opts.local !== "string") {
  console.error("usage: verify.ts --local <url of a page in the Trix project>");
  process.exit(1);
}
const proposal = JSON.parse(readFileSync(".trix/proposal.json", "utf8"));
const widths: number[] = proposal.widths;
const browser = await launch();
const page = await browser.newPage();
const rows: string[] = [];
let failures = 0;
const close = (a: number, b: number) => Math.abs(a - b) <= 0.5;
const untrimmed =
  proposal.trim && proposal.trim.untrimmed > proposal.trim.trimmed;

for (const width of widths) {
  await open(page, opts.local, width);
  const local = await page.evaluate(
    ({ slots, spaces }) => {
      const probe = (cls: string) => {
        const el = document.createElement("p");
        el.className = cls;
        el.textContent = "Ag";
        document.body.append(el);
        const cs = getComputedStyle(el);
        const size = parseFloat(cs.fontSize);
        const out = {
          size,
          lineHeight: +(parseFloat(cs.lineHeight) / size).toFixed(2),
          letterSpacingEm:
            cs.letterSpacing === "normal"
              ? 0
              : +(parseFloat(cs.letterSpacing) / size).toFixed(3),
          weight: cs.fontWeight,
          transform: cs.textTransform,
          // One line, so an untrimmed box is exactly one line tall.
          boxRatio:
            Math.round(
              (el.getBoundingClientRect().height / parseFloat(cs.lineHeight)) *
                100,
            ) / 100,
        };
        el.remove();
        return out;
      };
      const length = (token: string) => {
        const el = document.createElement("div");
        el.style.width = `var(--${token})`;
        document.body.append(el);
        const v = parseFloat(getComputedStyle(el).width);
        el.remove();
        return v;
      };
      return {
        text: Object.fromEntries(
          slots.map((s: string) => [
            s,
            probe(`text-style-${s.replace(/^text-/, "")}`),
          ]),
        ),
        spaces: Object.fromEntries(spaces.map((t: string) => [t, length(t)])),
        // The container a Section renders: what the source's content edge is.
        container: (() => {
          const el = document.createElement("div");
          el.style.cssText =
            "width: var(--site-width); max-width: var(--max-width-main)";
          document.body.append(el);
          const v = parseFloat(getComputedStyle(el).width);
          el.remove();
          return v;
        })(),
        gutter: length("site-gutter"),
      };
    },
    {
      slots: Object.keys(proposal.text),
      spaces: proposal.spaces.map((s: { token: string }) => s.token),
    },
  );
  const i = widths.indexOf(width);
  for (const [slot, src] of Object.entries<{
    sizes: number[];
    lineHeight: number;
    letterSpacingEm: number;
    weight: string;
    transform: string;
  }>(proposal.text)) {
    const got = local.text[slot];
    const problems = [
      !close(got.size, src.sizes[i]) && `size ${got.size} ≠ ${src.sizes[i]}`,
      Math.abs(got.lineHeight - src.lineHeight) > 0.011 &&
        `line-height ${got.lineHeight} ≠ ${src.lineHeight}`,
      Math.abs(got.letterSpacingEm - src.letterSpacingEm) > 0.0015 &&
        `letter-spacing ${got.letterSpacingEm} ≠ ${src.letterSpacingEm}`,
      got.weight !== src.weight && `weight ${got.weight} ≠ ${src.weight}`,
      got.transform !== src.transform &&
        `transform ${got.transform} ≠ ${src.transform}`,
      // A source that never trims text: the rebuilt box must not trim either.
      untrimmed &&
        Math.abs(got.boxRatio - 1) > 0.03 &&
        `trimmed (box ${got.boxRatio} lines tall), the source is not`,
    ].filter(Boolean);
    if (problems.length) failures++;
    rows.push(
      `| ${width} | text-style-${slot.replace(/^text-/, "")} | ${problems.length ? `FAIL ${problems.join("; ")}` : "ok"} |`,
    );
  }
  for (const s of proposal.spaces as {
    token: string;
    min: number;
    max: number;
  }[]) {
    const expected =
      width <= proposal.viewport.min
        ? s.min
        : width >= proposal.viewport.max
          ? s.max
          : undefined;
    if (expected === undefined) continue;
    const got = local.spaces[s.token];
    const ok = close(got, expected);
    if (!ok) failures++;
    rows.push(
      `| ${width} | --${s.token} | ${ok ? "ok" : `FAIL ${got} ≠ ${expected}`} |`,
    );
  }
  // Layout grid: content width and margin at every width; the gutter from
  // tablet up, where the source's columns sit side by side.
  const grid = proposal.grid as
    | {
        margin: (number | null)[];
        content: (number | null)[];
        gutter: (number | null)[];
        gutterFrom: number;
      }
    | undefined;
  if (grid) {
    const checks: [string, number, number | null][] = [
      ["content width", local.container, grid.content[i]],
      ["site margin", (width - local.container) / 2, grid.margin[i]],
      [
        "site gutter",
        local.gutter,
        width >= grid.gutterFrom ? grid.gutter[i] : null,
      ],
    ];
    for (const [name, got, expected] of checks) {
      if (expected === null) continue;
      const ok = close(got, expected);
      if (!ok) failures++;
      rows.push(
        `| ${width} | ${name} | ${ok ? "ok" : `FAIL ${Math.round(got * 100) / 100} ≠ ${expected}`} |`,
      );
    }
  }
}
await browser.close();

output(
  "verify.md",
  [
    "# Verification",
    "",
    "| Width | Token | Result |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n"),
);
console.log(
  failures
    ? `${failures} difference(s) — see .trix/verify.md`
    : `All ${rows.length} checks identical.`,
);
process.exit(failures ? 1 : 0);

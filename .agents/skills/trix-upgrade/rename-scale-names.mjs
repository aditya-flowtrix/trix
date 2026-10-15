#!/usr/bin/env node
/**
 * Trix 0.2 → 0.3: the token scales take their 0.3 names. Values never
 * change — a site renamed by this looks exactly as it did.
 *
 *   --space-N (N ≥ 2)            → --space-(N-1), and gap-N, padding-*-N,
 *                                  margin-*-N, gap/rowGap/marginTop="N",
 *                                  <Spacer size="N"> with it
 *   --line-height-xsmall / small → --line-height-small / medium
 *   --letter-spacing-tighter     → --letter-spacing-tight
 *   --radius-medium              → --radius-main
 *
 * Three 0.2 tokens have no 0.3 name: --space-1 (4px), --line-height-medium
 * (1.2) and --letter-spacing-tight (-0.02em). Unused, they are removed. Used,
 * the script lists where and writes nothing: ask the owner whether to keep
 * the value as a token of the site's own or write it in place.
 *
 *   node .agents/skills/trix-upgrade/rename-scale-names.mjs           # report
 *   node .agents/skills/trix-upgrade/rename-scale-names.mjs --write
 *
 * One pass per name, so `small → medium` never then becomes `medium → …`.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const write = process.argv.includes("--write");
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return path === join("src", "styles", "generated") ? [] : files(path);
    return /\.(astro|css|ts|tsx|jsx|js|md|mdx)$/.test(name) ? [path] : [];
  });

const UTIL =
  "gap-row|gap|margin-block|margin-bottom|margin-top|padding-block|padding-bottom|padding-inline|padding-left|padding-right|padding-top|padding";
const TOKENS = join("src", "styles", "tokens.css");
// Run twice, it would shift every step again: only 0.2's names go through.
if (
  !/--(radius-medium|letter-spacing-tighter|line-height-xsmall)\b/.test(
    readFileSync(TOKENS, "utf8"),
  )
) {
  console.log("tokens.css already uses the 0.3 names — nothing to rename.");
  process.exit(0);
}
const used = [];
const changed = [];

for (const file of files("src")) {
  let s = readFileSync(file, "utf8");
  const before = s;
  if (file === TOKENS)
    s = s
      .replace(/^\s*--space-1-(min|max):[^;]+;\n/gm, "")
      .replace(/^\s*--line-height-medium:[^;]+;\n/m, "")
      .replace(/^\s*--letter-spacing-tight:[^;]+;\n/m, "");
  const step = (what) => (n) => {
    n = Number(n);
    if (n === 1) used.push(`${file}: ${what}-1 (4px in Trix 0.2)`);
    return n >= 2 ? n - 1 : n;
  };
  for (const old of ["line-height-medium", "letter-spacing-tight"])
    for (const m of s.matchAll(new RegExp(`--${old}\\b(?!-)`, "g")))
      used.push(`${file}: --${old} (no 0.3 name)`);
  s = s
    .replace(/--space-(\d+)(?!\d)/g, (m, n) => `--space-${step("--space")(n)}`)
    .replace(
      new RegExp(`(?<![\\w-])(${UTIL})-(\\d+)(?![\\w-])`, "g"),
      (m, p, n) => `${p}-${step(p)(n)}`,
    )
    .replace(
      /\b(gap|rowGap|marginTop)="(\d+)"/g,
      (m, p, n) => `${p}="${step(p)(n)}"`,
    )
    .replace(
      /(<Spacer\b[^>]*?\bsize=")(\d+)(")/g,
      (m, a, n, b) => a + step("Spacer size")(n) + b,
    )
    .replace(
      /line-height-(xsmall|small)\b/g,
      (m, n) => `line-height-${n === "xsmall" ? "small" : "medium"}`,
    )
    .replace(/letter-spacing-tighter\b/g, "letter-spacing-tight")
    .replace(/radius-medium\b/g, "radius-main");
  if (s !== before) changed.push([file, s]);
}

if (used.length) {
  console.log(
    `Nothing written. These use a 0.2 token with no 0.3 name — ask the owner:\n${used.join("\n")}`,
  );
  process.exit(1);
}
for (const [file, s] of changed) if (write) writeFileSync(file, s);
console.log(
  `${changed.length} files ${write ? "renamed" : "to rename (run with --write)"}. Then: npm run tokens && npm run check && npm run build.`,
);

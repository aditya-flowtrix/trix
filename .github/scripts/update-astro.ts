#!/usr/bin/env node
/**
 * Moves the framework to the newest Astro.
 *
 * Installs the latest Astro, its integrations and Wrangler; raises the Node
 * floor in package.json to the highest one they declare (never lowers it),
 * and carries it into the installer and the installation docs; then applies
 * npm audit's non-breaking fixes. Run by .github/workflows/update-astro.yml,
 * which checks the result and opens the pull request.
 *
 * Writes to $GITHUB_OUTPUT: summary, title, node, review (true when a
 * package moved to a new major, or a new minor below 1.0).
 *
 * Usage
 *   node .github/scripts/update-astro.ts
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const MANAGED = [
  "astro",
  "@astrojs/check",
  "@astrojs/sitemap",
  "@astrojs/mdx",
  "wrangler",
];
// Where the Node floor is written for people to read. CI reads package.json.
const FLOOR_MENTIONS = [
  "packages/create-trix-astro/package.json",
  "packages/create-trix-astro/README.md",
  "site/src/content/docs/start/installation.mdx",
];

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const npm = (...args: string[]) =>
  execFileSync("npm", args, { stdio: "inherit" });
const locked = (): Record<string, string> => {
  const lock = readJson("package-lock.json");
  return Object.fromEntries(
    MANAGED.map((name) => [
      name,
      lock.packages[`node_modules/${name}`]?.version,
    ]),
  );
};
const parse = (version: string) => version.split(".").map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
// ponytail: only the plain ">=x.y.z" form counts; any other range is left to
// `npm ci --engine-strict` in the workflow, which fails on a mismatch.
const floorOf = (range: string | undefined) =>
  /^>=\s*(\d+\.\d+\.\d+)$/.exec(range?.trim() ?? "")?.[1];

const before = locked();
const oldFloor = floorOf(readJson("package.json").engines?.node);
if (!oldFloor) throw new Error("package.json → engines.node must be >=x.y.z");

npm("install", ...MANAGED.map((name) => `${name}@latest`));

let floor = oldFloor;
for (const name of MANAGED) {
  const needs = floorOf(
    readJson(`node_modules/${name}/package.json`).engines?.node,
  );
  if (needs && newer(needs, floor)) floor = needs;
}
if (floor !== oldFloor) {
  const pkg = readJson("package.json");
  pkg.engines = { ...pkg.engines, node: `>=${floor}` };
  writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  for (const path of FLOOR_MENTIONS)
    writeFileSync(path, readFileSync(path, "utf8").replaceAll(oldFloor, floor));
  npm("install", "--package-lock-only");
}

try {
  npm("audit", "fix");
} catch {
  // What audit fix can't fix without a breaking change, CI's audit reports.
}

const after = locked();
const moved = MANAGED.filter((name) => before[name] !== after[name]);
const review = moved.some((name) => {
  const [oldMajor, oldMinor] = parse(before[name]);
  const [newMajor, newMinor] = parse(after[name]);
  return newMajor !== oldMajor || (oldMajor === 0 && newMinor !== oldMinor);
});
const changes = [
  ...moved.map((name) => `${name} ${before[name]} → ${after[name]}`),
  ...(floor !== oldFloor ? [`Node >=${oldFloor} → >=${floor}`] : []),
];
const outputs = {
  summary: changes.join(", ") || "npm audit fixes",
  title:
    after.astro !== before.astro
      ? `Update Astro to ${after.astro}`
      : moved.length
        ? `Update ${moved.join(", ")}`
        : "Apply npm audit fixes",
  node: floor,
  review: String(review),
};

console.log(outputs);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );

#!/usr/bin/env node
/**
 * `npm run check`'s "our own code" rule (scripts/conventions.ts, rule 5):
 * a component that imports a library, loads a script from another site or
 * keeps a Finsweet attribute fails it; the framework's own imports and a
 * package the owner allowed in `trix.allow` pass. Runs on a copy of src/.
 *
 * Usage
 *   npm run test:conventions
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "trix-conventions-"));
cpSync("src", join(root, "src"), { recursive: true });
mkdirSync(join(root, "scripts"));
cpSync("scripts/conventions.ts", join(root, "scripts/conventions.ts"));
for (const file of ["astro.config.mjs", "package.json"])
  cpSync(file, join(root, file));

const check = () => {
  const run = spawnSync("node", [join(root, "scripts/conventions.ts")], {
    encoding: "utf8",
  });
  return { ok: run.status === 0, out: run.stdout + run.stderr };
};

assert.ok(check().ok, "the framework passes as it is");

mkdirSync(join(root, "src/components/probe"));
writeFileSync(
  join(root, "src/components/probe/Probe.astro"),
  `---
import { mount } from "@/utils/mount.ts";
import type { HTMLAttributes } from "astro/types";
import Three from "three";
---
<div fs-list-element="list" data-note="fs-in-a-value-is-fine"></div>
<script src="https://cdn.jsdelivr.net/npm/@finsweet/attributes@2/attributes.js"></script>
<script is:inline src="//unpkg.com/lenis"></script>
<script src="/local.js"></script>
<script>
  import gsap from "gsap";
  import Swiper from "swiper/bundle";
  import "@c15t/core/runtime";
  import { navigate } from "astro:transitions/client";
  const ends = [["from", "greater-equal"]];
  const letters = Array.from("abc");
</script>
<style>
  @import "./local.css";
</style>
`,
);

let { ok, out } = check();
assert.ok(!ok, "a library, a remote script or a Finsweet attribute fails");
for (const found of [
  "imports three",
  "imports gsap",
  "imports swiper",
  "loads https://cdn.jsdelivr.net",
  "loads //unpkg.com/lenis",
  "fs-list-element is a Finsweet attribute",
])
  assert.match(out, new RegExp(found.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const fine of [
  "mount",
  "astro",
  "@c15t",
  "local.js",
  "local.css",
  "fs-in-a-value",
])
  assert.doesNotMatch(out, new RegExp(`(imports|loads) \\S*${fine}`));
assert.equal(out.match(/Probe\.astro/g)?.length, 6, "nothing else is reported");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
pkg.trix.allow = {
  three: "3D hero on /product — approved",
  "unpkg.com": "test: a service the owner chose, allowed by host",
};
writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
({ out } = check());
assert.doesNotMatch(out, /imports three/, "an allowed package passes");
assert.doesNotMatch(out, /loads \/\/unpkg\.com/, "an allowed host passes");
assert.match(out, /imports gsap/, "and only those");
assert.match(out, /loads https:\/\/cdn\.jsdelivr\.net/, "and only those");

console.log("The our-own-code rule holds: 5 cases pass.");

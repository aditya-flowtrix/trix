#!/usr/bin/env node
/**
 * Checks `npm create trix-astro`: the installer run on an archive of this
 * commit — what GitHub serves it — into a throwaway folder. The framework's
 * own parts stay out, the project is named and stamped, the skills arrive.
 *
 * Usage: node tests/create.ts
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "packages/create-trix-astro/bin/create-trix-astro.js");
const tmp = mkdtempSync(join(tmpdir(), "trix-create-"));
let passed = 0;
const it = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok  ${name}`);
};

try {
  // git archive honours .gitattributes export-ignore, as GitHub's tarballs do.
  const tarball = join(tmp, "trix.tar.gz");
  execFileSync(
    "git",
    [
      "archive",
      "--format=tar.gz",
      "--prefix=trix-main/",
      "-o",
      tarball,
      "HEAD",
    ],
    { cwd: root },
  );
  const env = {
    ...process.env,
    CREATE_TRIX_TARBALL: tarball,
    CREATE_TRIX_COMMIT: "abc123",
    NO_COLOR: "1",
  };
  const create = (dir: string) =>
    spawnSync("node", [cli, dir, "--no-install"], {
      cwd: tmp,
      env,
      encoding: "utf8",
    });
  const result = create("My Site");
  assert.equal(result.status, 0, result.stderr);
  const site = join(tmp, "My Site");
  const pkg = JSON.parse(readFileSync(join(site, "package.json"), "utf8"));

  it("the framework's own parts stay out", () => {
    for (const path of [
      "site",
      "packages",
      "tests/create.ts",
      "tests/consent.ts",
      ".github/dependabot.yml",
      ".github/workflows/dependabot-automerge.yml",
      ".gitattributes",
      ".claude/launch.json",
    ])
      assert.ok(!existsSync(join(site, path)), path);
  });
  it("the project is named after its folder and stamped with where it came from", () => {
    assert.equal(pkg.name, "my-site");
    assert.equal(pkg.version, "0.1.0");
    assert.equal(pkg.trix.commit, "abc123");
    assert.match(pkg.trix.created, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(pkg.trix.version && pkg.trix.basedOn);
    assert.equal(pkg.repository, undefined);
  });
  it("nothing points at what stayed behind", () => {
    assert.ok(
      !Object.keys(pkg.scripts).some((s) =>
        /^(docs:|test:(create|consent))/.test(s),
      ),
    );
    assert.equal(pkg.devDependencies["@astrojs/mdx"], undefined);
  });
  it("the framework's CI, which runs the same checks on the project's pushes", () => {
    assert.match(
      readFileSync(join(site, ".github/workflows/ci.yml"), "utf8"),
      /tests\/browsers\.ts/,
    );
  });
  it("a README of its own", () => {
    assert.match(
      readFileSync(join(site, "README.md"), "utf8"),
      /^# My Site\n\nBuilt with \[Trix\]/,
    );
  });
  it("a Cloudflare config of its own", () => {
    assert.match(
      readFileSync(join(site, "wrangler.jsonc"), "utf8"),
      /"name": "my-site"/,
    );
  });
  it("components, styles and skills arrive — the skill links included", () => {
    assert.ok(existsSync(join(site, "src/components/wrapper/Row.astro")));
    assert.ok(existsSync(join(site, "src/styles/tokens.css")));
    assert.ok(existsSync(join(site, ".claude/skills/trix-cms/SKILL.md")));
  });
  it("refuses a folder that isn't empty", () => {
    assert.equal(create("My Site").status, 1);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} installer checks pass.`);

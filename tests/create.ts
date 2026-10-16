#!/usr/bin/env node
/**
 * Checks `npm create trix-astro`: the installer run on an archive of this
 * commit — what GitHub serves it — into a throwaway folder, against a stand-in
 * for GitHub on localhost. It copies the latest release unless told otherwise,
 * the framework's own parts stay out, the project is named and stamped with
 * the commit it came from, the skills arrive.
 *
 * Usage: node tests/create.ts
 */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "packages/create-trix-astro/bin/create-trix-astro.js");
const tmp = mkdtempSync(join(tmpdir(), "trix-create-"));
let passed = 0;
const it = async (name: string, fn: () => unknown) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};

// git archive honours .gitattributes export-ignore, as GitHub's tarballs do,
// and names the commit in the archive's first header, as GitHub's do. An
// archive of the tree alone names none.
const archive = (treeish: string) =>
  execFileSync(
    "git",
    ["archive", "--format=tar.gz", "--prefix=trix-x/", treeish],
    {
      cwd: root,
    },
  );
const archives = { commit: archive("HEAD"), tree: archive("HEAD^{tree}") };
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();

// GitHub, as far as the installer reads it: the tags API and codeload.
const github = {
  tags: 200,
  archive: archives.commit,
  requests: [] as string[],
};
const server = createServer((req, res) => {
  github.requests.push(req.url!);
  if (req.url === "/repos/aditya-flowtrix/trix/tags?per_page=100") {
    res.writeHead(github.tags, { "content-type": "application/json" });
    res.end(
      github.tags === 200
        ? JSON.stringify(
            ["nightly", "v0.9.0", "v0.10.0-beta.1", "v0.10.0", "v0.2.0"].map(
              (name) => ({ name }),
            ),
          )
        : '{"message":"API rate limit exceeded"}',
    );
  } else if (req.url!.startsWith("/aditya-flowtrix/trix/tar.gz/")) {
    res.writeHead(200, { "content-type": "application/x-gzip" });
    res.end(github.archive);
  } else {
    res.writeHead(404).end();
  }
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** Runs the installer to the end; the server keeps answering meanwhile. */
const create = (dir: string, ...flags: string[]) => {
  github.requests = [];
  return new Promise<{ status: number | null; output: string }>((done) => {
    const child = spawn("node", [cli, dir, "--no-install", ...flags], {
      cwd: tmp,
      env: { ...process.env, CREATE_TRIX_GITHUB: origin, NO_COLOR: "1" },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (status) => done({ status, output }));
  });
};
const manifest = (dir: string) =>
  JSON.parse(readFileSync(join(tmp, dir, "package.json"), "utf8"));

try {
  const result = await create("My Site");
  assert.equal(result.status, 0, result.output);
  const site = join(tmp, "My Site");
  const pkg = manifest("My Site");

  await it("copies the latest release: the highest version tag, not a pre-release or a branch", () => {
    assert.ok(
      github.requests.includes("/aditya-flowtrix/trix/tar.gz/v0.10.0"),
      github.requests.join(" "),
    );
    assert.match(result.output, /v0\.10\.0/);
  });
  await it("the framework's own parts stay out", () => {
    for (const path of [
      "site",
      "packages",
      "tests/create.ts",
      "tests/consent.ts",
      "tests/components.ts",
      "tests/scratch.ts",
      "tests/fixtures",
      ".github/dependabot.yml",
      ".github/workflows/dependabot-automerge.yml",
      ".gitattributes",
      ".claude/launch.json",
    ])
      assert.ok(!existsSync(join(site, path)), path);
  });
  await it("the project is named after its folder and stamped with the commit it came from", () => {
    assert.equal(pkg.name, "my-site");
    assert.equal(pkg.version, "0.1.0");
    assert.equal(pkg.trix.commit, head);
    assert.match(pkg.trix.created, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(pkg.trix.version);
    assert.equal(pkg.repository, undefined);
  });
  await it("nothing points at what stayed behind", () => {
    assert.ok(
      !Object.keys(pkg.scripts).some((s) =>
        /^(docs:|test:(create|consent|components))/.test(s),
      ),
    );
    assert.equal(pkg.devDependencies["@astrojs/mdx"], undefined);
  });
  await it("the framework's CI, which runs the same checks on the project's pushes", () => {
    assert.match(
      readFileSync(join(site, ".github/workflows/ci.yml"), "utf8"),
      /tests\/browsers\.ts/,
    );
  });
  await it("a README of its own", () => {
    assert.match(
      readFileSync(join(site, "README.md"), "utf8"),
      /^# My Site\n\nBuilt with \[Trix\]/,
    );
  });
  await it("a Cloudflare config of its own", () => {
    assert.match(
      readFileSync(join(site, "wrangler.jsonc"), "utf8"),
      /"name": "my-site"/,
    );
  });
  await it("a Cloudflare config its pull requests can preview", () => {
    // `wrangler preview`, which Workers Builds runs for every branch but the
    // production one, refuses a config without a previews block.
    assert.match(
      readFileSync(join(site, "wrangler.jsonc"), "utf8"),
      /"previews": \{\}/,
    );
  });
  await it("components, styles and skills arrive — the skill links included", () => {
    assert.ok(existsSync(join(site, "src/components/wrapper/Row.astro")));
    assert.ok(existsSync(join(site, "src/styles/tokens.css")));
    assert.ok(existsSync(join(site, ".claude/skills/trix-cms/SKILL.md")));
  });
  await it("refuses a folder that isn't empty", async () => {
    assert.equal((await create("My Site")).status, 1);
  });

  await it("--ref copies the tag, branch or commit it names, without asking GitHub for tags", async () => {
    const pinned = await create("pinned", "--ref", "v0.9.0");
    assert.equal(pinned.status, 0, pinned.output);
    assert.deepEqual(github.requests, ["/aditya-flowtrix/trix/tar.gz/v0.9.0"]);
    const equals = await create("equals", "--ref=feature/nav");
    assert.equal(equals.status, 0, equals.output);
    assert.deepEqual(github.requests, [
      "/aditya-flowtrix/trix/tar.gz/feature/nav",
    ]);
  });
  await it("refuses a --ref that could reach outside the repository", async () => {
    const result = await create("outside", "--ref", "../../other/repo");
    assert.equal(result.status, 1, result.output);
    assert.deepEqual(github.requests, []);
  });
  await it("copies main, and says so, when GitHub won't name the latest release", async () => {
    github.tags = 403;
    const result = await create("limited");
    github.tags = 200;
    assert.equal(result.status, 0, result.output);
    assert.ok(
      github.requests.includes("/aditya-flowtrix/trix/tar.gz/main"),
      github.requests.join(" "),
    );
    assert.match(
      result.output,
      /latest Trix release[\s\S]*copies main[\s\S]*--ref/,
    );
    // The archive still names its commit, so the stamp holds.
    assert.equal(manifest("limited").trix.commit, head);
  });
  await it("says so when the download doesn't name its commit, and leaves the stamp out", async () => {
    github.archive = archives.tree;
    const result = await create("unstamped");
    github.archive = archives.commit;
    assert.equal(result.status, 0, result.output);
    assert.equal(manifest("unstamped").trix.commit, undefined);
    assert.match(result.output, /commit/i);
    assert.match(result.output, /trix\.commit/);
  });
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} installer checks pass.`);

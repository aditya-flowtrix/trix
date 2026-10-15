#!/usr/bin/env node
/**
 * Checks the trix-consent skill's templates, so they can't rot unseen:
 *
 *   - the consent-api Worker bundles for Cloudflare (a dry run, nothing is
 *     deployed) and its region rules pass c15t's own inspection
 *   - the site templates, in a scratch copy of the framework with a fake
 *     vendor and a gated embed, pass `npm run check` and the skill's verify.ts
 *
 * Installs the c15t version the templates pin into a temporary folder, never
 * into the framework, so it needs the network. Framework only: projects
 * don't get it.
 *
 * Usage: node tests/consent.ts
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const skill = join(root, ".agents/skills/trix-consent");
const templates = join(skill, "templates");
const api = JSON.parse(
  readFileSync(join(templates, "consent-api/package.json"), "utf8"),
);
const version: string = api.dependencies["@c15t/backend"];
const tmp = mkdtempSync(join(tmpdir(), "trix-consent-"));
let passed = 0;
const it = async (name: string, fn: () => unknown) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};
const run = (
  file: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) =>
  execFileSync(file, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

try {
  writeFileSync(join(tmp, "package.json"), '{ "private": true }\n');
  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
      ...Object.entries<string>(api.dependencies).map(([n, v]) => `${n}@${v}`),
      `@c15t/core@${version}`,
      `@c15t/integrations@${version}`,
    ],
    tmp,
  );

  await it("every c15t package is pinned to the same exact version", () => {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    for (const deps of [api.dependencies, api.devDependencies])
      for (const [name, pinned] of Object.entries<string>(deps))
        if (name.startsWith("@c15t/")) assert.equal(pinned, version, name);
  });

  await it("the database packages are the versions the backend pins", () => {
    const backend = JSON.parse(
      readFileSync(
        join(tmp, "node_modules/@c15t/backend/package.json"),
        "utf8",
      ),
    );
    for (const name of ["@effect/sql-pg", "effect"])
      assert.equal(
        api.dependencies[name],
        backend.peerDependencies?.[name] ?? backend.dependencies?.[name],
        name,
      );
  });

  cpSync(join(templates, "consent-api"), join(tmp, "consent-api"), {
    recursive: true,
  });

  await it("the region rules pass c15t's inspection", async () => {
    // settings.ts throws on import when c15t finds a problem with a rule.
    const { policyRules } = await import(
      pathToFileURL(join(tmp, "consent-api/src/settings.ts")).href
    );
    assert.deepEqual(
      policyRules.map((rule: { id: string }) => rule.id),
      ["europe_opt_in", "us_privacy_states_opt_out", "world_opt_in"],
    );
  });

  await it("the Worker bundles for Cloudflare, under 1 MB gzipped", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/wrangler/bin/wrangler.js"),
        "deploy",
        "--dry-run",
        "--outdir",
        join(tmp, "worker"),
      ],
      {
        cwd: join(tmp, "consent-api"),
        encoding: "utf8",
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      },
    );
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    const gzip = Number(/gzip: ([\d.]+) KiB/.exec(output)?.[1]);
    assert.ok(gzip > 0 && gzip < 1024, `${gzip} KiB gzipped`);
  });

  // A scratch copy of everything a project gets, with the templates in place,
  // a fake vendor script and a gated embed.
  const site = join(tmp, "site");
  // The files git sees, as they are now: never ignored local folders.
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(
      (f) => f && !/^(site|packages)\//.test(f) && existsSync(join(root, f)),
    );
  for (const file of files) {
    mkdirSync(dirname(join(site, file)), { recursive: true });
    // The skill links in .claude/skills stay links.
    if (lstatSync(join(root, file)).isSymbolicLink())
      symlinkSync(readlinkSync(join(root, file)), join(site, file));
    else cpSync(join(root, file), join(site, file));
  }
  // The framework's dependencies, linked one by one, plus c15t from tmp. Its
  // caches (.astro, .vite) stay out, so the framework's are left alone.
  mkdirSync(join(site, "node_modules"));
  for (const name of readdirSync(join(root, "node_modules")))
    if (!name.startsWith(".") || name === ".bin")
      symlinkSync(
        join(root, "node_modules", name),
        join(site, "node_modules", name),
      );
  symlinkSync(
    join(tmp, "node_modules/@c15t"),
    join(site, "node_modules/@c15t"),
  );

  const edit = (path: string, from: string, to: string) => {
    const file = join(site, path);
    const text = readFileSync(file, "utf8");
    assert.ok(text.includes(from), `${path} has ${from}`);
    writeFileSync(file, text.replace(from, to));
  };
  cpSync(join(templates, "consent.ts"), join(site, "src/consent.ts"));
  cpSync(
    join(templates, "ConsentBanner.astro"),
    join(site, "src/components/global/ConsentBanner.astro"),
  );
  edit(
    "src/consent.ts",
    "const scripts: Script[] = [];",
    'const scripts: Script[] = [{ id: "fake-vendor", src: "/fake-vendor.js", category: "measurement" }];',
  );
  edit(
    "src/layouts/BaseLayout.astro",
    'import Footer from "@/components/global/Footer.astro";',
    'import Footer from "@/components/global/Footer.astro";\nimport ConsentBanner from "@/components/global/ConsentBanner.astro";',
  );
  edit(
    "src/layouts/BaseLayout.astro",
    "<Footer />",
    "<Footer />\n    <ConsentBanner />",
  );
  edit(
    "src/components/global/Footer.astro",
    "</ul>",
    '  <li hidden data-consent-open>\n                <button type="button" class="footer_link" data-modal-open="consent-settings">Cookie settings</button>\n              </li>\n            </ul>',
  );
  edit(
    "src/pages/index.astro",
    "</Layout>",
    '  <iframe data-src="/fake-embed.html" data-category="marketing" title="Fake embed"></iframe>\n</Layout>',
  );
  writeFileSync(
    join(site, "public/fake-vendor.js"),
    "window.fakeVendor = true;\n",
  );
  writeFileSync(
    join(site, "public/fake-embed.html"),
    "<!doctype html><title>Fake embed</title><p>Embedded</p>\n",
  );
  const verify = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [join(skill, "verify.ts"), "--root", site, ...args],
      { cwd: root, encoding: "utf8" },
    );

  await it("the templates pass npm run check inside a project", () =>
    run("npm", ["run", "check"], site));

  await it("the templates pass verify.ts: gating, fairness, reach, focus, axe", () => {
    const result = verify(
      "--vendor",
      "fake-vendor.js",
      "--vendor",
      "fake-embed.html",
    );
    process.stdout.write(result.stdout.replace(/^/gm, "    "));
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  await it("verify.ts fails a site that loads a tracker outside c15t", () => {
    edit(
      "src/pages/index.astro",
      "</Layout>",
      '  <script is:inline src="https://ungated.example/tag.js"></script>\n</Layout>',
    );
    const result = verify("--vendor", "fake-vendor.js");
    assert.notEqual(
      result.status,
      0,
      "verify passed a site with an ungated tag",
    );
    assert.match(result.stdout, /ungated\.example/);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} consent template checks pass.`);

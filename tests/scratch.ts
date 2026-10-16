/**
 * A scratch copy of everything a project gets, for the framework-only tests
 * that build a site: the files git sees, as they are now (never ignored local
 * folders), without the docs site and the installer. The framework's
 * dependencies are linked in one by one, so a test can add its own beside
 * them; its caches (.astro, .vite) stay out, so the framework's are left alone.
 *
 * Returns `edit`, which replaces text in one of the copy's files and fails if
 * the text isn't there.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export function scratchProject(root: string, site: string) {
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
  mkdirSync(join(site, "node_modules"));
  for (const name of readdirSync(join(root, "node_modules")))
    if (!name.startsWith(".") || name === ".bin")
      symlinkSync(
        join(root, "node_modules", name),
        join(site, "node_modules", name),
      );
  const edit = (path: string, from: string, to: string) => {
    const file = join(site, path);
    const text = readFileSync(file, "utf8");
    assert.ok(text.includes(from), `${path} has ${from}`);
    writeFileSync(file, text.replace(from, to));
  };
  // Vite would follow the links out of the copy, and Astro takes a component
  // with styles from outside the project (ClientRouter) for one inside it.
  edit(
    "astro.config.mjs",
    'vite: { build: { cssTarget: "safari15.4" } }',
    'vite: { build: { cssTarget: "safari15.4" }, resolve: { preserveSymlinks: true } }',
  );
  return edit;
}

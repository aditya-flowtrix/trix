#!/usr/bin/env node
/**
 * npm create trix-astro@latest [directory]
 *
 * Copies the Trix framework into a new folder — its latest release, or the
 * tag, branch or commit `--ref` names — and makes it the project's own: named
 * after the folder, stamped with the Trix version and commit it started from
 * (what /trix-upgrade merges against), with a Cloudflare config of its own.
 * Then installs dependencies.
 */
import {
  cp,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { basename, dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { argv, cwd, env, exit, platform, stdin, stdout } from "node:process";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

const REPO = "aditya-flowtrix/trix";
// CREATE_TRIX_GITHUB stands in for both of GitHub's hosts, for testing.
const API = env.CREATE_TRIX_GITHUB ?? "https://api.github.com";
const CODELOAD = env.CREATE_TRIX_GITHUB ?? "https://codeload.github.com";
const TAGS = `${API}/repos/${REPO}/tags?per_page=100`;
const TARBALL = (ref) => `${CODELOAD}/${REPO}/tar.gz/${ref}`;
// A date the framework was tested against: it selects Workers runtime behaviour.
const COMPAT_DATE = "2026-08-13";
// The framework's own: its docs site and this installer. A site gets neither.
const WITHHELD = /^(site|packages)(\/|$)/;

const styled = stdout.isTTY && !env.NO_COLOR;
const style = (code) => (s) => (styled ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = style("2");
const bold = style("1");
const green = style("32");
const red = style("31");
const yellow = style("33");

function die(message) {
  console.error(`\n${red("Error:")} ${message}\n`);
  exit(1);
}

function warn(message) {
  console.error(`\n${yellow("Warning:")} ${message}\n`);
}

/** The package manager that ran this — npm, pnpm, yarn and bun all say so. */
function packageManager() {
  const name = (env.npm_config_user_agent ?? "").split("/")[0];
  return ["npm", "pnpm", "yarn", "bun"].includes(name) ? name : "npm";
}

function run(command, args, dir) {
  return new Promise((done) => {
    // Windows' package managers are .cmd shims, which need a shell.
    const child = spawn(command, args, {
      cwd: dir,
      stdio: "inherit",
      shell: platform === "win32",
    });
    child.on("close", (code) => done(code === 0));
    child.on("error", () => done(false));
  });
}

function requireNode(requirement) {
  const required = /^>=(\d+)\.(\d+)\.(\d+)$/
    .exec(requirement ?? "")
    ?.slice(1)
    .map(Number);
  if (!required) return;
  const current = process.versions.node.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (current[i] > required[i]) return;
    if (current[i] < required[i])
      die(
        `Trix needs Node ${required.join(".")} or newer; this is ${process.versions.node}.`,
      );
  }
}

/**
 * The files in a tar archive. GitHub prefixes every path with
 * `<repo>-<ref>/`, which is dropped so the archive unpacks into the target
 * itself. A pax header can carry a path too long for the ustar fields.
 */
function* readTar(buf) {
  let longPath = null;
  for (let off = 0; off + 512 <= buf.length;) {
    const header = buf.subarray(off, off + 512);
    if (header[0] === 0) break;
    const field = (start, len) =>
      header
        .subarray(start, start + len)
        .toString("utf8")
        .replace(/\0.*$/s, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = header[156] === 0 ? "0" : String.fromCharCode(header[156]);
    const prefix = field(345, 155);
    const start = off + 512;
    off = start + Math.ceil(size / 512) * 512;
    const data = buf.subarray(start, start + size);

    if (type === "x") {
      longPath =
        /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString("utf8"))?.[1] ?? null;
      continue;
    }
    if (type === "g") continue;
    const name = longPath ?? (prefix ? `${prefix}/` : "") + field(0, 100);
    longPath = null;
    const path = name.split("/").slice(1).join("/").replace(/\/$/, "");
    if (!path) continue;

    if (type === "5") yield { path, directory: true };
    else if (type === "2") yield { path, link: field(157, 100) };
    else if (type === "0") yield { path, data };
  }
}

/**
 * The commit an archive is of. GitHub names it in the archive's first
 * header, as `git archive` does; an archive of a tree alone names none.
 */
function archiveCommit(tar) {
  if (tar[156] !== "g".charCodeAt(0)) return null;
  const size = parseInt(tar.subarray(124, 136).toString("utf8").trim(), 8);
  const header = tar.subarray(512, 512 + size).toString("utf8");
  return /(?:^|\n)\d+ comment=([0-9a-f]{40})\n/.exec(header)?.[1] ?? null;
}

/** The highest vX.Y.Z tag — pre-releases and other tags aside — or null. */
async function latestRelease() {
  // ponytail: one page of 100 tags; page through them past that many releases.
  const res = await fetch(TAGS, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const versions = (await res.json())
    .map((tag) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag.name))
    .filter(Boolean)
    .map((match) => match.slice(1).map(Number));
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  return versions.length ? `v${versions[0].join(".")}` : null;
}

function usage() {
  console.log(
    [
      bold("Usage"),
      "  npm create trix-astro@latest [directory] [options]",
      "",
      bold("Options"),
      `  --ref <ref>    ${dim("copy this tag, branch or commit instead of the latest release")}`,
      `  --no-install   ${dim("copy the framework without installing dependencies")}`,
      `  -h, --help     ${dim("show this message")}`,
      `  -v, --version  ${dim("print the version")}`,
      "",
      dim("With npm, options go after --:"),
      dim("  npm create trix-astro@latest my-site -- --ref v0.4.0"),
      "",
    ].join("\n"),
  );
}

async function main() {
  const { values: options, positionals } = parseArgs({
    args: argv.slice(2),
    allowPositionals: true,
    options: {
      ref: { type: "string" },
      "no-install": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (options.version) {
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    return console.log(pkg.version);
  }
  console.log(
    `\n${bold("Trix")}  ${dim("A design-ready framework for Astro.")}\n`,
  );
  if (options.help) return usage();

  let target = positionals[0];
  if (!target && stdin.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    target = (await rl.question("Directory name: ")).trim();
    rl.close();
  }
  if (!target)
    die("A directory name is required: npm create trix-astro@latest my-site");
  const install = !options["no-install"];
  const dir = resolve(cwd(), target);
  if (existsSync(dir) && (await readdir(dir)).length > 0)
    die(`${target} already exists and is not empty.`);

  // The latest release unless --ref names another. A ref is a git ref name,
  // which never holds "..", so it can't reach outside the repository's URLs.
  let ref = options.ref;
  if (ref !== undefined && (!/^\w[\w./-]*$/.test(ref) || ref.includes("..")))
    die(`--ref takes a tag, branch or commit name: ${ref}`);
  if (ref === undefined) {
    try {
      ref = await latestRelease();
      if (!ref) warn("Trix has no release yet, so this copies main.");
    } catch (error) {
      warn(
        `Couldn't look up the latest Trix release (${error.message}), so this copies main, which may be ahead of it. To copy a release, run this again with --ref and one of https://github.com/${REPO}/tags.`,
      );
    }
    ref ??= "main";
  }

  stdout.write(dim(`Downloading Trix ${ref}… `));
  const res = await fetch(TARBALL(ref));
  if (!res.ok) die(`Could not download Trix ${ref} (HTTP ${res.status}).`);
  const tar = gunzipSync(Buffer.from(await res.arrayBuffer()));
  console.log(green("done"));

  // The commit the archive is of, which /trix-upgrade merges against: exact
  // even when the ref is a branch that has moved on since.
  const commit = archiveCommit(tar);
  const entries = [...readTar(tar)].filter((e) => !WITHHELD.test(e.path));
  const manifest = entries.find((e) => e.path === "package.json" && e.data);
  if (!manifest) die("The download has no package.json.");
  requireNode(JSON.parse(manifest.data.toString("utf8")).engines?.node);

  stdout.write(dim("Writing files… "));
  let count = 0;
  const links = [];
  for (const entry of entries) {
    const dest = join(dir, entry.path);
    // Nothing in an archive may write outside the target.
    if (dest !== dir && !dest.startsWith(dir + sep))
      die(`Unsafe path in the download: ${entry.path}`);
    if (entry.directory) {
      await mkdir(dest, { recursive: true });
    } else if (entry.link) {
      links.push({ dest, link: entry.link });
    } else {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, entry.data);
      count++;
    }
  }
  // Links last, once what they point at exists. The skill links in
  // .claude/skills are folders; where symlinks are refused (Windows without
  // developer mode), a copy works the same.
  for (const { dest, link } of links) {
    await mkdir(dirname(dest), { recursive: true });
    await symlink(link, dest).catch(() =>
      cp(resolve(dirname(dest), link), dest, { recursive: true }),
    );
    count++;
  }
  console.log(green(`${count} files`));

  // The project's own identity, and where it came from.
  const name = basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.name = name;
  pkg.version = "0.1.0";
  pkg.trix = {
    ...pkg.trix,
    ...(commit && { commit }),
    // Today where the project was made, not in UTC: YYYY-MM-DD.
    created: new Date().toLocaleDateString("en-CA"),
  };
  for (const key of ["description", "repository", "homepage", "bugs"])
    delete pkg[key];
  // The docs site, this installer and the framework-only tests stayed behind,
  // and so do their scripts.
  for (const script of Object.keys(pkg.scripts ?? {}))
    if (/^(docs:|test:(create|consent|components)$)/.test(script))
      delete pkg.scripts[script];
  delete pkg.devDependencies?.["@astrojs/mdx"]; // only the docs site used it
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // The framework's README describes the framework; the project gets its own.
  await writeFile(
    join(dir, "README.md"),
    `# ${basename(dir)}

Built with [Trix](https://github.com/aditya-flowtrix/trix) ${pkg.trix.version ?? ""} for Astro.

\`\`\`sh
npm run dev      # http://localhost:4321 — /style-guide and /components too
npm run check    # tokens, conventions, contrast, types
npm run build    # the site, in dist/
\`\`\`

Decisions, sources and open questions live in [PROJECT.md](PROJECT.md); how to
build pages and components here is in [TRIX.md](TRIX.md).
`,
  );

  // The framework's Cloudflare config names its own Worker; this one is the
  // project's, on a workers.dev address until a domain is added.
  await writeFile(
    join(dir, "wrangler.jsonc"),
    `{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "${name}",
  "compatibility_date": "${COMPAT_DATE}",

  // The built site. There is no \`main\`, so this deploys as an assets-only
  // Worker: Cloudflare serves the files and no script runs per request.
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
  },

  // Pull-request previews: Workers Builds runs \`wrangler preview\` for every
  // branch but the production one, and it refuses a config without this
  // block. Empty means a preview is built exactly like production.
  "previews": {},

  // Your domain, once it is in this Cloudflare account. Until then the site
  // is at https://${name}.<your-subdomain>.workers.dev.
  // "routes": [{ "pattern": "www.example.com", "custom_domain": true }],

  "observability": {
    "enabled": true,
  },
}
`,
  );

  if (!commit)
    warn(
      `The download doesn't say which commit it is, so the project isn't stamped with one, and /trix-upgrade would have to guess. Add it to package.json → trix.commit, from: git ls-remote https://github.com/${REPO} ${ref}`,
    );

  const pm = packageManager();
  let installed = false;
  if (install) {
    console.log(dim(`\nInstalling dependencies with ${pm}…\n`));
    installed = await run(pm, ["install"], dir);
    // The files are written either way; a failed install is the caller's to retry.
    if (!installed)
      console.log(red(`\n${pm} install failed. Run it yourself in ${target}.`));
  }

  console.log(
    [
      "",
      `${green("Ready.")} Next:`,
      "",
      `  ${bold(`cd ${target}`)}`,
      ...(installed ? [] : [`  ${bold(`${pm} install`)}`]),
      `  ${bold(`${pm} run dev`)}`,
      "",
      `Set the site's name and URL in ${bold("src/consts.ts")}, and record decisions in ${bold("PROJECT.md")}.`,
      `With an agent: ${bold("/trix-new-project")} sets the name, domain, fonts and brand.`,
      `Docs: ${bold("https://trix.flowtrix.workers.dev")}`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => die(err.message));

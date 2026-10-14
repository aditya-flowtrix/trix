#!/usr/bin/env node
/**
 * Checks the CMS importer: the normalisers on a fixture that has every
 * Webflow field type, drafts, archived items, references in both directions
 * and Webflow's own markup, plus CSV edge cases — then the whole pipeline
 * (import → write → astro sync) in a throwaway copy of the project, so a
 * generated schema that Astro rejects fails here, not on a client site.
 *
 * Usage: node tests/cms.ts         (no network: assets stay remote)
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  normalizeWebflow,
  type WebflowSite,
} from "../src/utils/cms/webflow.ts";
import { csvCollection, inferType, parseCsv } from "../src/utils/cms/csv.ts";
import { schemaSource, stripPlatformMarkup } from "../src/utils/cms/model.ts";

const root = resolve(import.meta.dirname, "..");
const fixture = join(root, "tests/fixtures/cms/webflow.json");
let passed = 0;
const it = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok  ${name}`);
};

/* ---------------- Webflow ---------------- */

const site = JSON.parse(readFileSync(fixture, "utf8")) as WebflowSite;
const wf = normalizeWebflow(site);
const posts = wf.collections.find((c) => c.key === "posts")!;
const field = (k: string) => posts.fields.find((f) => f.key === k);
const first = posts.items.find((i) => i.slug === "hello-welcome")!;

it("every Webflow field type maps", () => {
  assert.deepEqual(
    Object.fromEntries(posts.fields.map((f) => [f.key, f.type])),
    {
      pullQuote: "richtext",
      summary: "text",
      mainImage: "image",
      gallery: "images",
      featured: "boolean",
      readingTime: "number",
      date: "date",
      kind: "option",
      author: "reference",
      topics: "references",
      download: "file",
      sourceLink: "link",
      accent: "color",
      video: "video",
      metaDescription: "text",
      legacy: "text",
    },
  );
  assert.equal(posts.bodyField, "postBody");
});
it("archived items are dropped; drafts are kept and marked", () => {
  assert.deepEqual(
    posts.items.map((i) => [i.slug, i.draft]),
    [
      ["hello-welcome", false],
      ["second-post", false],
      ["draft-post", true],
    ],
  );
});
it("references become slugs, in both directions", () => {
  assert.equal(first.data.author, "ada");
  assert.deepEqual(first.data.topics, ["design", "code", "unreleased"]);
  const ada = wf.collections.find((c) => c.key === "authors")!.items[0];
  assert.deepEqual(ada.data.posts, ["hello-welcome", "second-post"]);
  assert.equal(field("author")!.collection, "authors");
});
it("a reference to a collection that was not exported is kept as text, with a warning", () => {
  assert.equal(first.data.legacy, "x9");
  assert.ok(wf.warnings.some((w) => w.includes("posts.legacy")));
});
it("options become their names; images keep alt text; files their URL", () => {
  assert.equal(first.data.kind, "Guide");
  assert.deepEqual(first.data.mainImage, {
    url: "https://cdn.prod.website-files.com/aa/cc_main.webp",
    alt: "Main",
  });
  assert.equal((first.data.gallery as { alt: string }[])[0].alt, "");
  assert.equal(
    first.data.download,
    "https://cdn.prod.website-files.com/aa/ff_guide.pdf",
  );
});
it("dates: created → published, the latest of updated and published → updated", () => {
  assert.equal(first.published, "2024-01-02T00:00:00.000Z");
  assert.equal(first.updated, "2024-02-01T00:00:00.000Z");
});
it("old URL, SEO description and body", () => {
  assert.equal(first.oldPath, "/posts/hello-welcome");
  assert.equal(first.seo?.description, "Meta for search.");
  assert.ok(first.body?.startsWith("<h1"));
  assert.equal(first.data.postBody, undefined);
});
it("Webflow markup is stripped from rich text", () => {
  const out = stripPlatformMarkup(first.body!);
  assert.ok(!/w-richtext|data-rt-/.test(out));
  assert.ok(
    out.includes(
      '<img src="https://cdn.prod.website-files.com/aa/bb_photo%20one.jpg" alt="A photo">',
    ),
  );
});
it("schemas: references, option values, optional fields", () => {
  const s = schemaSource(posts);
  assert.ok(s.includes('"author": reference("authors").optional()'));
  assert.ok(s.includes('"topics": z.array(reference("topics")).default([])'));
  assert.ok(s.includes('"kind": z.enum(["News","Guide"]).optional()'));
  assert.ok(
    s.includes(
      '"mainImage": z.object({ src: image(), alt: z.string().default("") }).optional()',
    ),
  );
  assert.ok(schemaSource(posts, true).includes("src: z.string()"));
});

/* ---------------- CSV ---------------- */

it("CSV: quotes, doubled quotes, commas and newlines inside a cell", () => {
  const rows = parseCsv('a,b\n"x, y","say ""hi""\nline two"\n');
  assert.deepEqual(rows, [
    ["a", "b"],
    ["x, y", 'say "hi"\nline two'],
  ]);
});
it("CSV: column types from their values", () => {
  assert.equal(inferType(["true", "false", ""]), "boolean");
  assert.equal(inferType(["1", "2.5"]), "number");
  assert.equal(inferType(["2024-01-01", "2024-02-03T10:00:00Z"]), "date");
  assert.equal(
    inferType(["https://framerusercontent.com/images/a.png"]),
    "image",
  );
  assert.equal(
    inferType(["https://x.com/a.jpg; https://x.com/b.jpg"]),
    "images",
  );
  assert.equal(inferType(["https://x.com/doc.pdf"]), "file");
  assert.equal(inferType(["<p>Hi</p>", "plain"]), "richtext");
  assert.equal(inferType(["#fff", "#001122"]), "color");
});
it("CSV: Webflow system columns, drafts, references, body", () => {
  const c = csvCollection(
    "Name,Slug,Collection ID,Item ID,Draft,Archived,Author,Content\nOne,one,c,i1,false,false,ada,<p>Body</p>\nTwo,two,c,i2,true,false,ada,<p>B</p>\nGone,gone,c,i3,false,true,ada,\n",
    { collection: "notes", refs: { Author: "authors" }, route: "/notes" },
  );
  assert.deepEqual(
    c.fields.map((f) => [f.key, f.type, f.collection]),
    [["author", "reference", "authors"]],
  );
  assert.deepEqual(
    c.items.map((i) => [i.slug, i.draft]),
    [
      ["one", false],
      ["two", true],
    ],
  );
  assert.equal(c.items[0].body, "<p>Body</p>");
  assert.equal(c.items[0].oldPath, "/notes/one");
});

/* ---------------- the pipeline, in a throwaway project ---------------- */

const tmp = mkdtempSync(join(tmpdir(), "trix-cms-"));
try {
  for (const p of [
    "src",
    "public",
    "scripts",
    "astro.config.mjs",
    "package.json",
    "tsconfig.json",
    ".prettierrc",
    ".prettierignore",
  ])
    if (existsSync(join(root, p)))
      cpSync(join(root, p), join(tmp, p), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(tmp, "node_modules"));
  const run = (args: string[]) =>
    execFileSync("node", args, {
      cwd: tmp,
      encoding: "utf8",
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    });
  run(["scripts/cms/import.ts", "webflow", "--json", fixture]);
  run([
    "scripts/cms/write.ts",
    "--input",
    ".trix/cms/webflow.json",
    "--no-assets",
    "--route",
    "posts=/blog",
    "--scaffold",
    "--demote-headings",
    "--host",
    "example.webflow.io",
  ]);

  it("write: one file per published item, nothing for drafts or archived", () => {
    assert.deepEqual(readdirSync(join(tmp, "src/content/posts")).sort(), [
      "hello-welcome.md",
      "second-post.md",
    ]);
  });
  const md = readFileSync(
    join(tmp, "src/content/posts/hello-welcome.md"),
    "utf8",
  );
  it("write: frontmatter is exact, unpublished references dropped", () => {
    assert.ok(md.startsWith('---\ntitle: "Hello & welcome"\n'));
    assert.ok(md.includes('topics: ["design","code"]'));
    assert.ok(md.includes('kind: "Guide"'));
  });
  it("write: body on one line per block, headings demoted, internal links moved", () => {
    const body = md.split("\n---\n")[1];
    assert.ok(
      body.startsWith('<h2>Hello</h2><p>Read <a href="/blog/second-post">'),
    );
    assert.ok(!body.includes("\n\n"));
    assert.ok(body.includes("<p>*not emphasis* _nor this_</p>"));
  });
  it("write: a body without tags is wrapped, so Markdown leaves it alone", () => {
    assert.ok(
      readFileSync(
        join(tmp, "src/content/posts/second-post.md"),
        "utf8",
      ).endsWith("<div>Plain text body</div>\n"),
    );
  });
  it("write: redirects for the moved collection, a page scaffold", () => {
    assert.ok(
      readFileSync(join(tmp, "public/_redirects"), "utf8").includes(
        "/posts/hello-welcome /blog/hello-welcome 301",
      ),
    );
    assert.ok(existsSync(join(tmp, "src/pages/blog/[slug].astro")));
  });
  it("astro sync accepts every generated schema and file", () => {
    rmSync(join(root, "node_modules/.astro"), { recursive: true, force: true });
    execFileSync("npx", ["astro", "sync"], { cwd: tmp, stdio: "pipe" });
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(join(root, "node_modules/.astro"), { recursive: true, force: true });
}

console.log(`\n${passed} CMS checks pass.`);

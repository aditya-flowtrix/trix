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
import { compareCms } from "../scripts/cms/compare.ts";
import {
  countBlocks,
  countPatterns,
  droppedStyling,
  htmlToBlocks,
} from "../scripts/cms/html-to-portable-text.ts";
import { portableTextToHtml } from "../src/utils/cms/portable-text.ts";
import {
  fromSanity,
  sanityType,
  type SanityDoc,
} from "../src/utils/cms/sanity.ts";
import {
  sanitySchema,
  seoOnlyFields,
  toSanity,
} from "../scripts/cms/to-sanity.ts";

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

/* ---------------- Sanity ---------------- */

const sanity = toSanity(wf, { hosts: ["example.com"] });
const doc = (id: string) => sanity.docs.find((d) => d._id === id)!;
const p1 = doc("posts-p1");

it("Sanity: ids from the source ids, the same on every run, a dot only for drafts", () => {
  assert.equal(JSON.stringify(toSanity(wf).docs), JSON.stringify(sanity.docs));
  for (const d of sanity.docs)
    assert.match(d._id, /^(drafts\.)?[a-zA-Z0-9_-]+$/, d._id);
  assert.ok(sanity.docs.some((d) => d._id.startsWith("drafts.")));
});
it("Sanity: every array item has a _key, unique in its array", () => {
  const walk = (v: unknown, at: string): void => {
    if (Array.isArray(v)) {
      const keys = v.map((x) => (x as { _key?: string })?._key);
      if (v.some((x) => x && typeof x === "object"))
        assert.ok(keys.every(Boolean), `${at}: an item without a _key`);
      assert.equal(new Set(keys).size, keys.length, `${at}: duplicate keys`);
      v.forEach((x, i) => walk(x, `${at}[${i}]`));
    } else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  for (const d of sanity.docs) walk(d, d._id);
});
it("Sanity: images and files are imported by URL, with their alt text", () => {
  assert.deepEqual(p1.mainImage, {
    _type: "image",
    _sanityAsset: "image@https://cdn.prod.website-files.com/aa/cc_main.webp",
    alt: "Main",
  });
  assert.equal(
    (p1.download as { _sanityAsset: string })._sanityAsset,
    "file@https://cdn.prod.website-files.com/aa/ff_guide.pdf",
  );
  const img = (p1.body as Record<string, unknown>[]).find(
    (b) => b._type === "image",
  )!;
  assert.equal(img.alt, "A photo");
  assert.ok(!("url" in img));
});
it("Sanity: references by id; one to a draft waits for its publish", () => {
  assert.deepEqual(p1.author, { _type: "reference", _ref: "authors-a1" });
  const topics = p1.topics as Record<string, unknown>[];
  assert.ok(topics.some((t) => t._ref === "topics-t1" && !t._weak));
  assert.ok(topics.some((t) => t._weak && t._strengthenOnPublish));
  const ids = new Set(sanity.docs.map((d) => d._id.replace(/^drafts\./, "")));
  for (const t of topics) assert.ok(ids.has(String(t._ref)));
  assert.ok(
    sanity.warnings.some((w) => w.startsWith("topics-t-draft is a draft")),
  );
});
it("Sanity: rich text keeps every pattern, links inside become references", () => {
  assert.deepEqual(sanity.lost, []);
  const body = p1.body as Record<string, unknown>[];
  assert.equal(body[0].style, "h2");
  assert.deepEqual(
    (body[1].markDefs as Record<string, unknown>[])[0].reference,
    { _type: "reference", _ref: "posts-p2" },
  );
});
it("Sanity: an SEO-only field is the seo object, not a copy beside it", () => {
  assert.equal(p1.metaDescription, undefined);
  assert.equal(
    (p1.seo as { description: string }).description,
    "Meta for search.",
  );
});
it("Sanity: the Studio schema defines every type the documents use", () => {
  const schema = sanitySchema(wf);
  for (const t of new Set(sanity.docs.map((d) => d._type)))
    assert.ok(schema.includes(`name: ${JSON.stringify(t)}`), t);
  for (const t of ['"blockContent"', '"embed"', '"code"', '"internalLink"'])
    assert.ok(schema.includes(`name: ${t}`), t);
  assert.ok(!schema.includes('name: "metaDescription"'));
});
// The import, simulated: published documents, assets on Sanity's CDN.
const imported = JSON.parse(
  JSON.stringify(sanity.docs.filter((d) => !d._id.startsWith("drafts."))),
  (_, v) =>
    v && typeof v === "object" && typeof v._sanityAsset === "string"
      ? (({ _sanityAsset, ...rest }) => ({
          ...rest,
          asset: {
            _ref: _sanityAsset.startsWith("image@")
              ? "image-abc123-100x80-jpg"
              : "file-def456-pdf",
          },
        }))(v)
      : v,
) as SanityDoc[];
const sanityOpts = { projectId: "p1x", dataset: "production" };
const back = fromSanity(imported, {
  ...sanityOpts,
  routes: { posts: "/blog" },
});
it("Sanity: read back at build, the site gets what files would give it", () => {
  const item = back.collections
    .find((c) => c.key === "posts")!
    .items.find((i) => i.slug === "hello-welcome")!;
  assert.equal(item.title, first.title);
  assert.equal(item.oldPath, "/posts/hello-welcome");
  assert.equal(item.data.author, first.data.author);
  assert.deepEqual(item.data.topics, ["design", "code"]);
  assert.equal(item.data.kind, "Guide");
  assert.deepEqual(item.data.mainImage, {
    url: "https://cdn.sanity.io/images/p1x/production/abc123-100x80.jpg",
    alt: "Main",
  });
  assert.equal(
    item.data.download,
    "https://cdn.sanity.io/files/p1x/production/def456.pdf",
  );
  assert.equal(item.seo?.description, "Meta for search.");
  assert.ok(
    item.body!.startsWith(
      '<h2>Hello</h2><p>Read <a href="/blog/second-post">the next one</a>.</p><figure><img src="https://cdn.sanity.io/images/p1x/production/abc123-100x80.jpg" alt="A photo">',
    ),
  );
  assert.equal(item.data.pullQuote, "<p>Quote <strong>here</strong></p>");
});
it("Sanity: a linked image keeps its link; styling with nowhere to go is named", () => {
  const cdn = "https://cdn.prod.website-files.com/x";
  const html =
    `<figure data-rt-type="image"><a href="https://example.com/a"><div><img src="${cdn}/a.jpg" alt="A"></div></a><figcaption>Cap</figcaption></figure>` +
    `<p>See <a href="/blog/b"><img src="${cdn}/b.jpg" alt="B"></a></p>` +
    `<div class="w-embed"><img src="${cdn}/c.gif"></div>`;
  const blocks = htmlToBlocks(html);
  assert.deepEqual(
    blocks
      .filter((b) => b._type === "image")
      .map((b) => [b.url, b.link, b.caption]),
    [
      [`${cdn}/a.jpg`, "https://example.com/a", "Cap"],
      [`${cdn}/b.jpg`, "/blog/b", ""],
    ],
  );
  assert.deepEqual(countPatterns(html), countBlocks(blocks));
  assert.deepEqual(countBlocks(blocks), {
    images: 2,
    links: 2,
    embeds: 1,
    code: 0,
  });
  assert.ok(
    portableTextToHtml(blocks as never, {
      image: (v) => String(v.url),
      link: () => undefined,
    }).includes(`<a href="https://example.com/a"><img src="${cdn}/a.jpg"`),
  );
  assert.deepEqual(
    droppedStyling(
      '<p class="lead w-richtext">Hi <span class="highlight">there</span> <em style="color: red">x</em></p>' +
        '<div class="w-embed"><span class="kept">e</span></div><pre><code class="language-js">x</code></pre>',
    ),
    ['<p class="lead">', '<span class="highlight">', "<em style>"],
  );
});
it("Sanity: --check passes a complete import, and names what one lost", () => {
  const compare = (docs: SanityDoc[]) =>
    compareCms(wf, fromSanity(docs, sanityOpts), {
      type: sanityType,
      ownHost: "cdn.sanity.io",
      omitted: seoOnlyFields,
    });
  const failed = (docs: SanityDoc[], warn = false) =>
    compare(docs)
      .filter((c) => !c.ok && !c.warn === !warn)
      .map((c) => `${c.what}: ${c.detail}`);
  assert.deepEqual(failed(imported), []);
  // What the source lacked too is a warning to fill before launch, not a loss.
  const gaps = failed(imported, true);
  assert.ok(
    gaps.includes("posts: every image has alt text: hello-welcome (1)"),
  );
  assert.ok(
    gaps.includes("posts: every item has an SEO description: second-post"),
  );

  // A document missing, an image field and a rich-text image whose uploads
  // failed, a title changed, a URL left on Webflow's CDN.
  const broken = structuredClone(imported).filter((d) => d._id !== "posts-p2");
  const p1 = broken.find((d) => d._id === "posts-p1")!;
  delete (p1.mainImage as Record<string, unknown>).asset;
  delete (p1.body as Record<string, unknown>[]).find(
    (b) => b._type === "image",
  )!.asset;
  p1.title = "Changed";
  (p1.seo as Record<string, unknown>).title =
    "https://cdn.prod.website-files.com/x/a.jpg";
  const bad = failed(broken).join("\n");
  assert.match(bad, /posts: 2 published, 1 in posts: second-post missing/);
  assert.match(bad, /titles and SEO match: hello-welcome/);
  assert.match(
    bad,
    /every field with a value has it in posts: hello-welcome\.mainImage/,
  );
  assert.match(
    bad,
    /every image in rich text arrived: hello-welcome \(\d+ → \d+\)/,
  );
  assert.match(
    bad,
    /nothing loads from the old CMS: https:\/\/cdn\.prod\.website-files\.com\/x\/a\.jpg/,
  );
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

  run([
    "scripts/cms/write.ts",
    "--input",
    ".trix/cms/webflow.json",
    "--headless",
    "--sanity",
    "p1x/production",
    "--route",
    "posts=/blog",
  ]);
  it("write --headless --sanity: the site reads Sanity, its images allowed", () => {
    const ts = readFileSync(join(tmp, "src/content/collections.ts"), "utf8");
    for (const line of [
      'source: "sanity"',
      'projectId: "p1x"',
      'dataset: "production"',
      'routes: { posts: "/blog", authors: "/authors", topics: "/topics" }',
      'collection: "posts"',
    ])
      assert.ok(ts.includes(line), line);
    assert.ok(
      readFileSync(join(tmp, "astro.config.mjs"), "utf8").includes(
        "cdn.sanity.io",
      ),
    );
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(join(root, "node_modules/.astro"), { recursive: true, force: true });
}

console.log(`\n${passed} CMS checks pass.`);

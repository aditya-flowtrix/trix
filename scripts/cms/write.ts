#!/usr/bin/env node
/**
 * Writes an imported CMS (.trix/cms/*.json, from scripts/cms/import.ts) into
 * the project as Astro content collections:
 *
 *   src/content/<collection>/<slug>.md     one file per item: fields as
 *                                          frontmatter, the main rich text as
 *                                          the body
 *   src/assets/cms/<collection>/           image fields — optimised at build
 *   public/cms/<collection>/               files, and images inside rich text
 *   src/content/collections.ts             the zod schema of every collection
 *   src/content.config.ts                  created, or given the CMS collections
 *   public/_redirects                      301s for items whose URL changed
 *   src/pages/<route>/[slug].astro         with --scaffold, where missing
 *
 * Every image and file is downloaded — nothing is left on the old CMS's CDN.
 * Run it again after the CMS changes (a content freeze): items that are gone
 * are removed, and nothing it did not write is touched.
 *
 * Usage
 *   node scripts/cms/write.ts --input .trix/cms/webflow.json
 *     --only blog,technology                 collections to write (default: all)
 *     --route blog=/blog,technology=/products   the new URL prefix of each collection with pages
 *     --scaffold                             create the [slug].astro page of each routed collection
 *     --demote-headings                      h1 → h2 … in rich text, when the page template has its own h1
 *     --host old-site.com                    also download files the rich text links to on these hosts
 *     --no-assets                            keep remote URLs (a trial run only)
 *     --headless                             no files: the collections read the CMS at build
 *                                            through cmsLoader (src/utils/cms/loader.ts)
 *     --offline                              with --headless: read the saved export, not the live CMS
 *
 * Image and file fields are always downloaded: the CMS holds them. Inside
 * rich text only files on the CMS's own hosts (Webflow, Framer, Wix,
 * Squarespace, Contentful, Sanity, WordPress uploads) and `--host` are —
 * never a third party's.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, posix } from "node:path";
import { args, output, pool } from "../measure/browser.ts";
import {
  schemaSource,
  slugify,
  stripPlatformMarkup,
  type CmsExport,
  type Collection,
  type Item,
} from "../../src/utils/cms/model.ts";

const opts = args();
const str = (k: string) =>
  typeof opts[k] === "string" ? (opts[k] as string) : undefined;
if (!str("input")) {
  console.error(
    "usage: write.ts --input .trix/cms/<source>.json [--only a,b] [--route a=/a] [--scaffold] [--no-assets]",
  );
  process.exit(1);
}
const data: CmsExport = JSON.parse(readFileSync(str("input")!, "utf8"));
const only = str("only")?.split(",");
const routes = Object.fromEntries(
  (str("route") ?? "")
    .split(",")
    .filter(Boolean)
    .map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
);
const headless = !!opts.headless;
const assets = !opts["no-assets"] && !headless;
const demote = !!opts["demote-headings"];
const bodiesWithH1 = new Map<string, number>();
const warnings = [...data.warnings];
const collections = data.collections.filter(
  (c) => !only || only.includes(c.folder) || only.includes(c.key),
);
const manifestPath = ".trix/cms/manifest.json";
type Manifest = {
  collections: Record<
    string,
    {
      folder: string;
      source: string;
      schema: string;
      files: string[];
      /** Headless: the loader expression, instead of the files' glob. */
      loader?: string;
      items: number;
      route?: string;
    }
  >;
  assets: Record<string, string>;
};
const manifest: Manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { collections: {}, assets: {} };

// Collections written by an earlier run (another CSV, another source) are
// here too: references to them stay references.
const earlier = Object.entries(manifest.collections).filter(
  ([key]) => !collections.some((c) => c.key === key),
);
const written = new Set([
  ...collections.map((c) => c.key),
  ...earlier.map(([k]) => k),
]);

/* ---------------- references to what is not here ---------------- */

const slugsOf = new Map([
  ...collections.map(
    (c) => [c.key, new Set(c.items.map((i) => i.slug))] as const,
  ),
  ...earlier.map(
    ([key, c]) =>
      [
        key,
        new Set(c.files.map((f) => f.split("/").pop()!.replace(/\.md$/, ""))),
      ] as const,
  ),
]);
for (const c of collections) {
  for (const f of c.fields) {
    if ((f.type !== "reference" && f.type !== "references") || !f.collection)
      continue;
    if (!written.has(f.collection)) {
      warnings.push(
        `${c.folder}.${f.key}: refers to ${f.collection}, which is not being written — kept as plain slugs`,
      );
      f.type = f.type === "reference" ? "text" : "references";
      if (f.type === "references") f.collection = undefined;
      continue;
    }
    const known = slugsOf.get(f.collection)!;
    for (const i of c.items) {
      const v = i.data[f.key];
      if (v === undefined) continue;
      const list = Array.isArray(v) ? (v as string[]) : [v as string];
      const kept = list.filter((s) => known.has(s));
      if (kept.length !== list.length)
        warnings.push(
          `${c.folder}/${i.slug}.${f.key}: ${list.length - kept.length} reference(s) to unpublished or missing items dropped`,
        );
      i.data[f.key] = Array.isArray(v) ? kept : kept[0];
      if (i.data[f.key] === undefined) delete i.data[f.key];
    }
  }
}

/* ---------------- assets ---------------- */

const IMAGE_EXT = /^\.(jpe?g|png|webp|avif|gif|svg|tiff?)$/i;
const FILE_EXT =
  /\.(jpe?g|png|webp|avif|gif|svg|tiff?|pdf|docx?|xlsx?|pptx?|zip|txt|glb|gltf|mp3|mp4|webm|mov|csv)(\?|#|$)/i;
const CMS_HOST =
  /(^|\.)(website-files\.com|webflow\.com|framerusercontent\.com|wixstatic\.com|squarespace-cdn\.com|ctfassets\.net|sanity\.io|i\d\.wp\.com)$/i;
const extraHosts = new Set(
  [
    ...(str("host")?.split(",") ?? []),
    ...(data.source.startsWith("wordpress:")
      ? [new URL(data.source.slice(10)).hostname]
      : []),
  ].map((h) => h.trim().replace(/^www\./, "")),
);
/** A file the old CMS holds — so it goes with the site. */
const ownFile = (url: string) => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return (
      (CMS_HOST.test(host) || extraHosts.has(host)) &&
      (FILE_EXT.test(u.pathname) || CMS_HOST.test(host))
    );
  } catch {
    return false;
  }
};
const downloads = new Map<string, string>(); // url → project path
const taken = new Map<string, string>(); // project path → url

function plan(url: string, folder: string, optimised: boolean): string {
  const known = downloads.get(url);
  if (known) return known;
  const u = new URL(url);
  let base = decodeURIComponent(u.pathname.split("/").pop() || "file")
    .replace(/^[0-9a-f]{24}_/, "") // Webflow's asset id prefix
    .replace(/-\d+x\d+(?=\.\w+$)/, ""); // WordPress size suffix
  const ext = extname(base).toLowerCase();
  base = `${slugify(base.slice(0, base.length - ext.length)) || "file"}${ext}`;
  const dir =
    optimised && IMAGE_EXT.test(ext)
      ? `src/assets/cms/${folder}`
      : `public/cms/${folder}`;
  let path = `${dir}/${base}`;
  for (let n = 2; taken.has(path) && taken.get(path) !== url; n++)
    path = `${dir}/${base.slice(0, base.length - ext.length)}-${n}${ext}`;
  taken.set(path, url);
  downloads.set(url, path);
  return path;
}

/** Project path → how a file in src/content/<folder>/ or a page refers to it. */
const refFrom = (folder: string, path: string) =>
  path.startsWith("public/")
    ? path.slice("public".length)
    : posix.relative(`src/content/${folder}`, path);

/** Rich text: rewrite asset URLs to local files, drop platform markup. */
// Every routed item's old path → its new one, for links inside rich text.
const newPathOf = new Map<string, string>();
for (const c of collections) {
  const route = routes[c.folder] ?? routes[c.key];
  if (route)
    for (const i of c.items)
      if (i.oldPath)
        newPathOf.set(
          i.oldPath.replace(/(.)\/$/, "$1"),
          `${route.replace(/\/$/, "")}/${i.slug}`,
        );
}
/** A link to one of the old site's own pages that moved → its new path. */
const movedLink = (url: string) => {
  try {
    const u = new URL(url, "https://old.invalid");
    const own =
      u.hostname === "old.invalid" ||
      extraHosts.has(u.hostname.replace(/^www\./, ""));
    const to = own && newPathOf.get(u.pathname.replace(/(.)\/$/, "$1"));
    return to ? `${to}${u.hash}` : undefined;
  } catch {
    return undefined;
  }
};

function cleanHtml(html: string, folder: string): string {
  let out = html.replace(/\shref="([^"]+)"/g, (m, url: string) => {
    const to = movedLink(url);
    return to ? ` href="${to}"` : m;
  });
  out = stripPlatformMarkup(out);
  if (assets)
    out = out
      .replace(/\b(src|href)="([^"]+)"/g, (m, attr: string, url: string) =>
        ownFile(url)
          ? `${attr}="${refFrom(folder, plan(url, folder, false))}"`
          : m,
      )
      // One local file per image: the old responsive set and its hints go.
      .replace(
        /\s(?:srcset|sizes|data-recalc-dims|data-lazy-[\w-]+)="[^"]*"/g,
        "",
      );
  if (/<h1\b/i.test(out))
    bodiesWithH1.set(folder, (bodiesWithH1.get(folder) ?? 0) + 1);
  // The page's own title is its h1: every heading in the body moves down one.
  // Only a body that has an h1 of its own: one that starts at h2 is right.
  if (demote && /<h1\b/i.test(out))
    out = out.replace(
      /<(\/?)h([1-6])\b/gi,
      (_, close: string, n: string) =>
        `<${close}h${Math.min(6, Number(n) + 1)}`,
    );
  // One line per block outside <pre>: no blank line can end the HTML block
  // early, so Markdown leaves every character as it is.
  const parts = out.split(/(<pre[\s\S]*?<\/pre>)/i);
  out = parts
    .map((p, i) =>
      i % 2 ? p : p.replace(/>\s+</g, "><").replace(/\s*\n\s*/g, " "),
    )
    .join("")
    .trim();
  return /^<(p|div|h[1-6]|ul|ol|figure|blockquote|table|section|article|pre|hr|details|dl)\b/i.test(
    out,
  )
    ? out
    : `<div>${out}</div>`;
}

/* ---------------- files ---------------- */

const write = (path: string, text: string | Uint8Array) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

/** How a headless collection reaches its CMS. */
function loaderFor(c: Collection): string {
  const [kind, ...rest] = data.source.split(":");
  const id = rest.join(":");
  const src = opts.offline
    ? { source: "json", file: str("input") }
    : kind === "webflow" && id
      ? { source: "webflow", site: id }
      : kind === "wordpress"
        ? {
            source: "wordpress",
            url: id,
            // The post types this import read, so the build reads the same.
            types: data.collections
              .filter((x) => /^wordpress:(?!taxonomy:)/.test(x.source))
              .map((x) => x.source.slice("wordpress:".length)),
          }
        : { source: "json", file: str("input") };
  return `cmsLoader(${JSON.stringify({ ...src, collection: c.folder })})`;
}

for (const c of headless ? [] : collections) {
  const files: string[] = [];
  const imageKeys = c.fields
    .filter((f) => f.type === "image" || f.type === "images")
    .map((f) => f.key);
  for (const item of c.items) {
    const data: Record<string, unknown> = {};
    for (const f of c.fields) {
      let v = item.data[f.key];
      if (v === undefined) continue;
      if (f.type === "richtext") v = cleanHtml(String(v), c.folder);
      if (assets && f.type === "file" && /^https?:\/\//.test(String(v)))
        v = refFrom(c.folder, plan(String(v), c.folder, false));
      // A link straight to a file the old site holds (a PDF) goes with it.
      if (
        assets &&
        f.type === "link" &&
        ownFile(String(v)) &&
        FILE_EXT.test(String(v))
      )
        v = refFrom(c.folder, plan(String(v), c.folder, false));
      if (imageKeys.includes(f.key)) {
        const one = (img: { url: string; alt?: string }) => {
          const path = assets ? plan(img.url, c.folder, true) : img.url;
          if (path.startsWith("public/"))
            warnings.push(
              `${c.folder}/${item.slug}.${f.key}: ${img.url} is not a format Astro can optimise — convert it, or the schema rejects it`,
            );
          return {
            src: assets ? refFrom(c.folder, path) : img.url,
            alt: img.alt ?? "",
          };
        };
        v = Array.isArray(v)
          ? v.map(one)
          : one(v as { url: string; alt?: string });
      }
      data[f.key] = v;
    }
    const seo = item.seo && { ...item.seo };
    if (seo?.image && assets && ownFile(seo.image))
      seo.image = refFrom(c.folder, plan(seo.image, c.folder, false));
    const front: Record<string, unknown> = {
      title: item.title,
      ...(item.draft ? { draft: true } : {}),
      ...(item.published ? { published: item.published } : {}),
      ...(item.updated ? { updated: item.updated } : {}),
      ...(item.oldPath ? { oldPath: item.oldPath } : {}),
      ...(seo && Object.values(seo).some(Boolean) ? { seo } : {}),
      ...data,
    };
    // JSON is valid YAML: every value survives exactly, quotes and all.
    const yaml = Object.entries(front)
      .map(
        ([k, v]) =>
          `${/^[A-Za-z_][\w]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(v)}`,
      )
      .join("\n");
    const file = `src/content/${c.folder}/${item.slug}.md`;
    write(
      file,
      `---\n${yaml}\n---\n${item.body ? `${cleanHtml(item.body, c.folder)}\n` : ""}`,
    );
    files.push(file);
  }
  // Items gone from the CMS since the last run: remove what this wrote.
  for (const old of manifest.collections[c.key]?.files ?? [])
    if (!files.includes(old) && existsSync(old)) rmSync(old);
  const schema = schemaSource(c, !assets);
  manifest.collections[c.key] = {
    folder: c.folder,
    source: c.source,
    schema,
    files,
    items: c.items.length,
    route: routes[c.folder] ?? routes[c.key],
  };
}

for (const c of headless ? collections : []) {
  // Moving to headless: the files an earlier run wrote go.
  for (const old of manifest.collections[c.key]?.files ?? [])
    if (existsSync(old)) rmSync(old);
  manifest.collections[c.key] = {
    folder: c.folder,
    source: c.source,
    schema: schemaSource(c, true),
    files: [],
    items: c.items.length,
    route: routes[c.folder] ?? routes[c.key],
    loader: loaderFor(c),
  };
}

/* ---------------- download ---------------- */

const failed: string[] = [];
await pool([...downloads], 6, async ([url, path]) => {
  if (existsSync(path) && manifest.assets[path] === url) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) throw new Error(`${r.status}`);
      write(path, Buffer.from(await r.arrayBuffer()));
      manifest.assets[path] = url;
      return;
    } catch (e) {
      if (attempt === 3)
        failed.push(`${url} → ${path}: ${e instanceof Error ? e.message : e}`);
    }
  }
});

/* ---------------- headless images ---------------- */

// Headless images stay on the CMS's CDN: Astro optimises a remote image only
// from a host it is told about.
if (headless) {
  const hosts = new Set<string>();
  for (const c of collections)
    for (const i of c.items)
      for (const v of Object.values(i.data))
        for (const x of Array.isArray(v) ? v : [v])
          if (x && typeof x === "object" && "url" in x)
            hosts.add(new URL((x as { url: string }).url).hostname);
  const config = "astro.config.mjs";
  const text = existsSync(config) ? readFileSync(config, "utf8") : "";
  const missing = [...hosts].filter((h) => !text.includes(JSON.stringify(h)));
  if (
    missing.length &&
    !/\n\s*image:/.test(text) &&
    text.includes("export default defineConfig({")
  )
    write(
      config,
      text.replace(
        "export default defineConfig({",
        `export default defineConfig({\n  // Remote images the CMS serves, optimised at build (scripts/cms/write.ts --headless).\n  image: { domains: ${JSON.stringify(missing)} },`,
      ),
    );
  else if (missing.length)
    warnings.push(
      `add ${missing.join(", ")} to image.domains in ${config}, so Astro optimises the CMS's images`,
    );
}

/* ---------------- schema and config ---------------- */

const all = Object.entries(manifest.collections);
const usesImage = all.some(([, c]) => c.schema.includes("image()"));
write(
  "src/content/collections.ts",
  `// Generated by scripts/cms/write.ts. Change the CMS (or the import) and
// run it again; a hand edit here is overwritten.
import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
${all.some(([, c]) => c.loader) ? 'import { cmsLoader } from "../utils/cms/loader.ts";\n' : ""}
${all
  .map(
    ([key, c]) => `export const ${key} = defineCollection({
  loader: ${c.loader ?? `glob({ pattern: "*.md", base: "./src/content/${c.folder}" })`},
  schema: (${usesImage && c.schema.includes("image()") ? "{ image }" : ""}) =>
    ${c.schema},
});`,
  )
  .join("\n\n")}

export const cmsCollections = { ${all.map(([k]) => k).join(", ")} };
`,
);
// Formatted like the rest of the code, so CI's format check stays green.
const prettier = await import("prettier").catch(() => undefined);
if (prettier) {
  const path = "src/content/collections.ts";
  const options = (await prettier.resolveConfig(path)) ?? {};
  write(
    path,
    await prettier.format(readFileSync(path, "utf8"), {
      ...options,
      filepath: path,
    }),
  );
}
const configPath = "src/content.config.ts";
if (!existsSync(configPath))
  write(
    configPath,
    `import { cmsCollections } from "./content/collections.ts";

export const collections = { ...cmsCollections };
`,
  );
else if (!readFileSync(configPath, "utf8").includes("cmsCollections"))
  warnings.push(
    `${configPath} exists: add \`...cmsCollections\` (from "./content/collections.ts") to its \`collections\``,
  );

/* ---------------- redirects ---------------- */

const redirectLines: string[] = [];
for (const [key, c] of all) {
  if (!c.route) continue;
  const source = data.collections.find((x) => x.key === key);
  for (const i of source?.items ?? []) {
    const to = `${c.route.replace(/\/$/, "")}/${i.slug}`;
    const from = i.oldPath?.replace(/(.)\/$/, "$1");
    if (from && from !== to) redirectLines.push(`${from} ${to} 301`);
  }
}
const redirectsPath = "public/_redirects";
const existing = existsSync(redirectsPath)
  ? readFileSync(redirectsPath, "utf8")
  : "";
const block = redirectLines.length
  ? `# trix-cms:start — items whose URL changed (scripts/cms/write.ts)\n${redirectLines.join("\n")}\n# trix-cms:end\n`
  : "";
write(
  redirectsPath,
  existing.replace(/# trix-cms:start[\s\S]*?# trix-cms:end\n?/, "").trimEnd() +
    (block ? `\n\n${block}` : "\n"),
);

/* ---------------- page scaffold ---------------- */

const scaffolded: string[] = [];
if (opts.scaffold)
  for (const [key, c] of all) {
    if (!c.route) continue;
    const page = `src/pages${c.route.replace(/\/$/, "")}/[slug].astro`;
    if (existsSync(page)) continue;
    const source = data.collections.find((x) => x.key === key) as
      Collection | undefined;
    const image = source?.fields.find((f) => f.type === "image");
    const summary = source?.fields.find(
      (f) =>
        f.type === "text" && /summary|excerpt|description|intro/i.test(f.key),
    );
    const at = (k: string) =>
      `entry.data.${/^[A-Za-z_]\w*$/.test(k) ? k : `[${JSON.stringify(k)}]`}`;
    write(
      page,
      `---
import { getCollection, render } from "astro:content";
import Layout from "@/layouts/BaseLayout.astro";
import Section from "@/components/wrapper/Section.astro";
import Heading from "@/components/typography/Heading.astro";
import RichText from "@/components/typography/RichText.astro";
${image ? 'import Img from "@/components/media/Img.astro";\n' : ""}import Breadcrumbs from "@/components/global/Breadcrumbs.astro";
import { article } from "@/utils/schema.ts";

export async function getStaticPaths() {
  const entries = await getCollection("${key}", ({ data }) => !data.draft);
  return entries.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const url = \`${c.route.replace(/\/$/, "")}/\${entry.id}\`;
// A search result shows about 160 characters: end on a whole word.
const clip = (text?: string) =>
  text && text.length > 160 ? \`\${text.slice(0, 157).replace(/\\s+\\S*$/, "")}…\` : text;
const description = clip(entry.data.seo?.description${summary ? ` ?? ${at(summary.key)}` : ""});
---

<Layout
  title={entry.data.seo?.title ?? entry.data.title}
  description={description}
  type="article"
  schema={article({
    headline: entry.data.title,
    url,
    datePublished: entry.data.published ?? new Date(),
    dateModified: entry.data.updated,
    description,
  })}
>
  <Section>
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: entry.data.title }]} />
    <Heading tag="h1">{entry.data.title}</Heading>
${image ? `    {${at(image.key)} && (\n      <Img src={${at(image.key)}.src} alt={${at(image.key)}.alt} />\n    )}\n` : ""}    <RichText><Content /></RichText>
  </Section>
</Layout>
`,
    );
    scaffolded.push(page);
  }

/* ---------------- report ---------------- */

if (!demote)
  for (const [folder, n] of bodiesWithH1)
    warnings.push(
      `${folder}: ${n} rich text value(s) contain an <h1>, and a page template has its own — run again with --demote-headings`,
    );

output("cms/manifest.json", JSON.stringify(manifest, null, 2));
console.log("| Collection | Items | Folder | Route |");
console.log("| --- | --- | --- | --- |");
for (const c of collections)
  console.log(
    `| ${c.key} | ${c.items.length} | src/content/${c.folder} | ${manifest.collections[c.key].route ?? "—"} |`,
  );
console.log(
  `\n${assets ? `${downloads.size} file(s) downloaded or already local` : "Assets left remote (--no-assets)"}; ${redirectLines.length} redirect(s); ${scaffolded.length ? `pages: ${scaffolded.join(", ")}` : "no pages scaffolded"}.`,
);
if (failed.length)
  console.log(`\nDownloads that failed:\n  ${failed.join("\n  ")}`);
if (warnings.length) console.log(`\nWarnings:\n  ${warnings.join("\n  ")}`);
console.log("\nNext: npx astro sync && node scripts/cms/verify.ts");
process.exit(failed.length ? 1 : 0);

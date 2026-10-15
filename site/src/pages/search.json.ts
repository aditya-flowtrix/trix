import type { APIRoute } from "astro";
import { render } from "astro:content";
import { allDocs, docPath, groupLabel } from "~/docs.ts";

/**
 * The search index: every page, and every h2 and h3 with the first words
 * under it. Built once with the site; the search dialog fetches it on first
 * open, so pages carry none of it.
 */

/** Markdown and MDX down to the words a reader sees. */
const plain = (md: string) =>
  md
    .replace(/^```[\s\S]*?^```$/gm, " ")
    .replace(/^(import|export) .*$/gm, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const clip = (text: string) =>
  text.length > 160 ? `${text.slice(0, 157).replace(/\s\S*$/, "")}…` : text;

export const GET: APIRoute = async () => {
  const entries = [];
  for (const doc of await allDocs()) {
    const path = docPath(doc);
    entries.push({
      k: "page",
      t: doc.data.title,
      c: groupLabel(doc),
      p: path,
      d: doc.data.description,
    });
    const { headings } = await render(doc);
    // The body split at each h2 or h3, in the order render() found them.
    const sections = (doc.body ?? "")
      .replace(/^```[\s\S]*?^```$/gm, "")
      .split(/^#{2,3} .*$/m)
      .slice(1);
    headings
      .filter((h) => h.depth === 2 || h.depth === 3)
      .forEach((h, i) =>
        entries.push({
          k: "heading",
          t: h.text,
          c: doc.data.title,
          p: `${path}#${h.slug}`,
          d: clip(plain(sections[i] ?? "")) || doc.data.description,
        }),
      );
  }
  return new Response(JSON.stringify(entries), {
    headers: { "Content-Type": "application/json" },
  });
};

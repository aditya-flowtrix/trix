/**
 * HTML → Portable Text, for the migration into a CMS that stores rich text
 * that way (Sanity, EmDash). Runs once per item at conversion, never at build:
 * it needs jsdom, a dev dependency.
 *
 * Every pattern Webflow's rich text holds has a rule here. Without one, a
 * pattern is lost and nothing warns: an image figure is dropped and its
 * caption becomes a paragraph, an embed disappears, a heading style the schema
 * does not list becomes a paragraph. `countPatterns` and `countBlocks` let the
 * converter prove nothing was.
 *
 *   figure with one img, img             → image { url, alt, caption, link }
 *   figure[data-rt-type=video], .w-embed → embed { html }
 *   table                                → embed { html }  (no table type)
 *   pre                                  → code { code, language }
 *   h1 in a body                         → every heading one down
 */

import { htmlToPortableText } from "@portabletext/html";
import { compileSchema, defineSchema } from "@portabletext/schema";
import { JSDOM } from "jsdom";
import {
  PLATFORM_CLASS,
  stripPlatformMarkup,
} from "../../src/utils/cms/model.ts";

export type Block = { _type: string; _key: string; [k: string]: unknown };

/** The block content every Portable Text CMS gets; its Studio schema says the same. */
export const BLOCK_CONTENT = {
  styles: ["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"],
  decorators: ["strong", "em", "code", "underline", "strike-through"],
  lists: ["bullet", "number"],
} as const;

const schema = compileSchema(
  defineSchema({
    styles: BLOCK_CONTENT.styles.map((name) => ({ name })),
    decorators: BLOCK_CONTENT.decorators.map((name) => ({ name })),
    lists: BLOCK_CONTENT.lists.map((name) => ({ name })),
    annotations: [{ name: "link", fields: [{ name: "href", type: "string" }] }],
    blockObjects: [
      {
        name: "image",
        fields: [
          { name: "url", type: "string" },
          { name: "alt", type: "string" },
          { name: "caption", type: "string" },
          { name: "link", type: "string" },
        ],
      },
      { name: "embed", fields: [{ name: "html", type: "string" }] },
      {
        name: "code",
        fields: [
          { name: "code", type: "string" },
          { name: "language", type: "string" },
        ],
      },
    ],
  }),
);

export interface ToBlocksOptions {
  /**
   * A link's replacement, or undefined to keep it: an internal link to a
   * migrated item becomes a reference here.
   */
  link?: (href: string) => Record<string, unknown> | undefined;
}

const EMBED = '.w-embed, figure[data-rt-type="video"], table';

export function htmlToBlocks(
  html: string,
  opts: ToBlocksOptions = {},
): Block[] {
  // The page's title is its h1: a body that has one moves every heading down.
  const demoted = /<h1\b/i.test(html)
    ? html.replace(
        /<(\/?)h([1-6])\b/gi,
        (_, close: string, n: string) =>
          `<${close}h${Math.min(6, Number(n) + 1)}`,
      )
    : html;
  // Embeds leave before conversion, which strips their <script>s, and come
  // back as they were: a form or widget embed needs its script.
  const doc = new JSDOM(demoted).window.document;
  const embeds: string[] = [];
  for (const el of doc.querySelectorAll(EMBED)) {
    const marker = doc.createElement("div");
    marker.setAttribute("data-trix-embed", String(embeds.length));
    embeds.push(
      stripPlatformMarkup(
        el.matches("table") ? el.outerHTML : el.innerHTML.trim(),
      ),
    );
    el.replaceWith(marker);
  }
  // A linked image gets a figure, which keeps its link: the bare image rule
  // cannot see the <a> around it.
  for (const img of doc.querySelectorAll("a[href] img")) {
    const a = img.closest("a")!;
    if (img.closest("figure") || a.textContent?.trim()) continue;
    const figure = doc.createElement("figure");
    a.replaceWith(figure);
    figure.append(a);
  }
  let k = 0; // keys count from zero per body: an unchanged body converts unchanged
  const blocks = htmlToPortableText(doc.body.innerHTML, {
    schema,
    whitespaceMode: "normalize",
    parseHtml: (h) => new JSDOM(h).window.document,
    keyGenerator: () => `k${k++}`,
    types: {
      image: ({ context, value }) => ({
        _key: context.keyGenerator(),
        _type: "image",
        url: value.src ?? "",
        alt: value.alt ?? "",
      }),
    },
    rules: [
      {
        deserialize(node, _next, block) {
          if (node.nodeType !== 1) return undefined;
          const el = node as Element;
          // Webflow's <figure data-rt-type="image">, WordPress's image block, a
          // linked image: the image, its caption and its link.
          if (el.matches("figure") && el.querySelectorAll("img").length === 1) {
            const img = el.querySelector("img")!;
            const link = img.closest("a[href]")?.getAttribute("href");
            return block({
              _type: "image",
              url: img.getAttribute("src") ?? "",
              alt: img.getAttribute("alt") ?? "",
              caption:
                el.querySelector("figcaption")?.textContent?.trim() ?? "",
              ...(link ? { link } : {}),
            });
          }
          const embed = el.getAttribute("data-trix-embed");
          if (embed !== null)
            return block({ _type: "embed", html: embeds[Number(embed)] });
          if (el.matches("pre"))
            return block({
              _type: "code",
              code: el.textContent ?? "",
              language:
                el
                  .querySelector("code")
                  ?.className.match(/(?:language|lang)-(\S+)/)?.[1] ?? "",
            });
          return undefined;
        },
      },
    ],
  }).filter(
    // Webflow keeps an empty paragraph as a zero-width joiner: it goes.
    (b) =>
      b._type !== "block" ||
      !("children" in b) ||
      !Array.isArray(b.children) ||
      b.children.some(
        (c: { _type: string; text?: unknown }) =>
          c._type !== "span" || String(c.text ?? "").replace(/[\s​-‍﻿]/g, ""),
      ),
  ) as Block[];

  if (opts.link)
    for (const b of blocks)
      if (Array.isArray(b.markDefs))
        b.markDefs = (b.markDefs as Block[]).map((d) => {
          const to = d._type === "link" && opts.link!(String(d.href ?? ""));
          return to ? { ...to, _key: d._key } : d;
        });
  return blocks;
}

/** What the source HTML holds that must not be lost. */
export function countPatterns(html: string) {
  const doc = new JSDOM(html).window.document;
  // An image inside an embed or a table stays in that embed's HTML.
  const images = [...doc.querySelectorAll("img")].filter(
    (i) => !i.closest(EMBED),
  );
  return {
    images: images.length,
    links: images.filter((i) => i.closest("a[href]")).length,
    embeds: doc.querySelectorAll(EMBED).length,
    code: doc.querySelectorAll("pre").length,
  };
}

/**
 * Styling Portable Text has no place for: a class or an inline style on text
 * (`<span class="highlight">`, `<p style="…">`). The conversion keeps the text
 * and drops the styling, so each is named for the owner to give a rule — a
 * decorator, a block style — or let go. Embeds and code keep theirs.
 */
export function droppedStyling(html: string): string[] {
  const doc = new JSDOM(html).window.document;
  const found: string[] = [];
  for (const el of doc.body.querySelectorAll("[class], [style]")) {
    if (el.closest(`${EMBED}, pre`)) continue;
    const tag = el.tagName.toLowerCase();
    for (const c of el.classList)
      if (!PLATFORM_CLASS.test(c)) found.push(`<${tag} class="${c}">`);
    if (el.hasAttribute("style")) found.push(`<${tag} style>`);
  }
  return found;
}

/** The same counts after conversion. */
export function countBlocks(blocks: Block[]) {
  const n = (t: string) => blocks.filter((b) => b._type === t).length;
  return {
    images: n("image"),
    links: blocks.filter((b) => b._type === "image" && b.link).length,
    embeds: n("embed"),
    code: n("code"),
  };
}

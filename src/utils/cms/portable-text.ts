/**
 * Portable Text → HTML, for the build: any CMS that stores rich text as
 * Portable Text (Sanity, EmDash) renders through this, so the page gets the
 * same HTML body a file would hold. The other direction, for the migration,
 * is scripts/cms/html-to-portable-text.ts.
 *
 * Block types it knows are the ones that direction writes: `image`, `embed`,
 * `code`, and the `internalLink` annotation. A CMS says where an image lives
 * and where an internal link points; the rest is the same for every CMS.
 */

import { escapeHTML, toHTML, uriLooksSafe } from "@portabletext/to-html";

type PortableTextBlock = Extract<
  Parameters<typeof toHTML>[0],
  unknown[]
>[number];

export interface PortableTextUrls {
  /** The image block's URL: from its asset reference, or its own `url`. */
  image: (value: Record<string, unknown>) => string | undefined;
  /** An `internalLink`'s path on the new site. */
  link: (value: Record<string, unknown>) => string | undefined;
}

/** Is this value Portable Text (an array with at least one text block)? */
export function isPortableText(v: unknown): v is PortableTextBlock[] {
  return (
    Array.isArray(v) &&
    v.some((b) => b && typeof b === "object" && b._type === "block")
  );
}

export function portableTextToHtml(
  blocks: PortableTextBlock[],
  urls: PortableTextUrls,
): string {
  const attr = (v: unknown) => escapeHTML(String(v ?? ""));
  return toHTML(blocks, {
    components: {
      types: {
        image: ({ value }) => {
          const src = urls.image(value);
          if (!src) return "";
          const link = String(value.link ?? "");
          const img =
            link && uriLooksSafe(link)
              ? `<a href="${attr(link)}"><img src="${attr(src)}" alt="${attr(value.alt)}"></a>`
              : `<img src="${attr(src)}" alt="${attr(value.alt)}">`;
          return value.caption
            ? `<figure>${img}<figcaption>${attr(value.caption)}</figcaption></figure>`
            : `<figure>${img}</figure>`;
        },
        // ponytail: an embed is the editor's own HTML, rendered as it is —
        // the Studio decides who may add one.
        embed: ({ value }) => String(value.html ?? ""),
        code: ({ value }) =>
          `<pre><code${value.language ? ` class="language-${attr(value.language)}"` : ""}>${attr(value.code)}</code></pre>`,
      },
      marks: {
        internalLink: ({ children, value }) => {
          const href = value && urls.link(value);
          return href ? `<a href="${attr(href)}">${children}</a>` : children;
        },
        link: ({ children, value }) => {
          const href = String(value?.href ?? "");
          return href && uriLooksSafe(href)
            ? `<a href="${attr(href)}">${children}</a>`
            : children;
        },
      },
    },
  });
}

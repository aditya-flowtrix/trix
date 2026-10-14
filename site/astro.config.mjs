// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import trix from "../astro.config.mjs";
import { SITE_URL } from "./src/consts.ts";
import { codeThemes } from "./src/code-theme.ts";

/**
 * The Trix docs site. It is built with the framework it documents: every
 * component, style and font comes from ../src, so an example on a docs page
 * is the component as it is today, never a copy.
 *
 *   npm run docs:dev      npm run docs:build
 */

const here = (/** @type {string} */ path) =>
  fileURLToPath(new URL(path, import.meta.url));
const trixConsts = here("../src/consts.ts");
const siteConsts = here("./src/consts.ts");

/** @type {import("vite").Plugin[]} */
const plugins = [
  // Trix's components read the site's name, URL and color mode from
  // src/consts.ts — this site's, wherever they import it from.
  {
    name: "trix-site-consts",
    enforce: "pre",
    async resolveId(id, importer, options) {
      if (!/consts(\.ts)?$/.test(id)) return;
      const resolved = await this.resolve(id, importer, {
        ...options,
        skipSelf: true,
      });
      if (resolved?.id === trixConsts) return siteConsts;
    },
  },
  // A fence marked `live` renders its code and shows it:
  //   ```astro live
  //   <Button>Primary</Button>
  //   ```
  // becomes <Example code="…"><Button>Primary</Button></Example>. Extra
  // words in the fence are Example's props: ```astro live stage="wide"
  {
    name: "trix-live-examples",
    enforce: "pre",
    transform(source, id) {
      if (!/\.mdx(\?|$)/.test(id)) return;
      return source.replace(
        /^```astro live([^\n]*)\n([\s\S]*?)^```$/gm,
        (_, attrs, code) =>
          `<Example code={${JSON.stringify(code.trimEnd())}}${attrs}>\n${code}</Example>`,
      );
    },
  },
];

// Trix's fonts, from the framework's own files: its local paths are relative
// to the repository root, this site's to site/.
/** @type {any} */
const fonts = (trix.fonts ?? []).map((font) => ({
  ...font,
  options: font.options && {
    ...font.options,
    variants: font.options.variants?.map((v) => ({
      ...v,
      src: v.src.map((s) =>
        typeof s === "string" ? s.replace(/^\.\//, "../") : s,
      ),
    })),
  },
}));

export default defineConfig({
  site: SITE_URL,
  prefetch: true,
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [mdx(), sitemap()],
  fonts,
  markdown: {
    shikiConfig: {
      themes: codeThemes,
      defaultColor: false,
    },
  },
  vite: {
    ...trix.vite,
    plugins,
    resolve: {
      alias: [
        { find: /^@\//, replacement: here("../src/") },
        { find: /^~\//, replacement: here("./src/") },
      ],
    },
  },
});

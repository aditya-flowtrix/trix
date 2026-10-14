import Example from "~/components/Example.astro";
import Props from "~/components/Props.astro";
import Aside from "~/components/Aside.astro";
import Classes from "~/components/Classes.astro";
import Skills from "~/components/Skills.astro";
import MarkdownFile from "~/components/MarkdownFile.astro";
import Table from "~/components/Table.astro";

/**
 * What a docs page can use without importing it: every Trix component by its
 * file name (`<Button>`, `<Section>`), and the docs' own `Example`, `Props`,
 * `Aside`, `Classes` and `Skills`. New components appear here on their own.
 */
const trix = Object.fromEntries(
  Object.entries(
    import.meta.glob<{ default: unknown }>("@/components/**/*.astro", {
      eager: true,
    }),
  )
    .filter(([path]) => !path.includes("/content/StyleGuide"))
    .map(([path, mod]) => [
      path.split("/").pop()!.replace(".astro", ""),
      mod.default,
    ]),
);

export const components = {
  ...trix,
  Example,
  Props,
  Aside,
  Classes,
  Skills,
  MarkdownFile,
  // Markdown's own tables, made reachable by keyboard when they scroll.
  table: Table,
};

import { parseProps, type Prop } from "../../scripts/props.ts";

/**
 * Component props as the docs show them, read from the source at build, so
 * every table is the API as it is today. Used by `Props` and `Variants`.
 */

/** Every component's source, by its path under src/components without `.astro`. */
export const components = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("@/components/**/*.astro", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([path, source]) => [
    path.replace(/^.*\/components\//, "").replace(/\.astro$/, ""),
    source,
  ]),
);

const tokenTypes = Object.values(
  import.meta.glob<string>("@/styles/generated/tokens.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

/** A component's props, in the order it declares them. */
export const propsOf = (component: string) =>
  parseProps(components[component]).props;

// Named unions — the component's own and the token scales — spelled out.
const aliases = new Map<string, string>();
for (const text of [tokenTypes, ...Object.values(components)])
  for (const m of text.matchAll(
    /^(?:export )?type (\w+) =\s*((?:\|?\s*(?:"[^"]*"|[A-Z]\w*)\s*)+);/gm,
  ))
    if (!aliases.has(m[1]))
      aliases.set(
        m[1],
        m[2]
          .replace(/\s+/g, " ")
          .replace(/^\|\s*/, "")
          .trim(),
      );
// Twice, for a union of unions: `HeadingStyle = TextStyle | "inherit"`.
const expand = (t: string) =>
  t
    .replace(/Exclude<(\w+),\s*("[^"]*")>/g, (_, from: string, drop: string) =>
      (aliases.get(from) ?? from)
        .split(/\s*\|\s*/)
        .filter((v) => v !== drop)
        .join(" | "),
    )
    .replace(/\b[A-Z]\w*\b/g, (name) => aliases.get(name) ?? name);

/** Each value a prop takes, named unions spelled out. */
export const valuesOf = (p: Prop) => [
  ...new Set(p.types.flatMap((t) => expand(expand(t)).split(/\s*\|\s*/))),
];

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** A doc comment as HTML: it is written in Markdown's inline code and bullets. */
export const docHtml = (doc: string | null) =>
  doc
    ? escape(doc)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/ - (?=<code>)/g, "<br>")
    : "";

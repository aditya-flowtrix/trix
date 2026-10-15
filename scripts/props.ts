/**
 * Reads a component's props from its frontmatter: each prop in declaration
 * order with the doc comment above it, every type it takes across the
 * branches of a union, and its default from the destructure. Shared by the
 * prop audit (`/trix-audit-props`) and the docs site's props tables, so the
 * two read the same API.
 */

import { readFileSync } from "node:fs";

export type Prop = {
  name: string;
  /** The type in the first branch that declares it. */
  type: string;
  /** Every distinct type across the branches of a union. */
  types: string[];
  optional: boolean;
  doc: string | null;
  default?: string;
};

export const readComponent = (file: string) =>
  parseProps(readFileSync(file, "utf8"));

/** The same, from a component's source text. */
export function parseProps(src: string) {
  const fm = src.startsWith("---") ? src.split("---")[1] : "";
  const props: Prop[] = [];
  const byName = new Map<string, Prop>();

  /* Only look inside type declarations. Scanning the whole frontmatter reads
     object literals as props — a `const marks = { play, close, arrow }` is not
     an API, and neither is a lookup table of variant names. */
  const blocks: string[] = [];
  /* Capture a whole declaration: `interface X { … }` by brace matching, and
     `type X = … ;` to its terminating semicolon at depth zero. A union spreads
     its props over several branches, and cutting at the first branch loses the
     documented ones. */
  for (const decl of fm.matchAll(/\b(interface|type)\s+(\w+)/g)) {
    let i = decl.index;
    let depth = 0;
    let started = false;
    for (; i < fm.length; i++) {
      const ch = fm[i];
      if (ch === "{" || ch === "(") {
        depth++;
        started = true;
      } else if (ch === "}" || ch === ")") {
        depth--;
        if (started && depth === 0 && decl[1] === "interface") {
          i++;
          break;
        }
      } else if (ch === ";" && depth === 0) {
        break;
      } // also ends a brace-less union
    }
    blocks.push(fm.slice(decl.index, i + 1));
  }
  const re =
    /(?:\/\*\*([\s\S]*?)\*\/\s*)?^(\s{2,8})([a-zA-Z_]\w*)(\?)?:\s*([^\n]+)$/gm;
  /* Only a declaration that actually holds props counts towards "spans a
     union" — a bare `type Tag = "span" | "p"` is a vocabulary, not a shape. */
  let blocksWithProps = 0;
  for (const block of blocks) {
    const before = props.length;
    for (const m of block.matchAll(re)) {
      const [, doc, , name, optional, first] = m;
      // A union written one member per line continues on lines starting `|`.
      const more = block
        .slice(m.index + m[0].length)
        .match(/^(?:\n\s*\|[^\n]*)*/)![0];
      const raw = `${first} ${more}`.replace(/\s+/g, " ");
      const type = raw
        .trim()
        .replace(/;$/, "")
        .replace(/^\|\s*/, "");
      // A `type: "x"` discriminant names a branch; it is not a prop.
      if (name === "type" && /^"[^"]*"$/.test(type)) continue;
      /* `never` marks a prop that belongs to a different variant branch. */
      if (/^never$/.test(type)) continue;
      const text = doc
        ? doc
            .replace(/^\s*\*\s?/gm, "")
            .replace(/\s+/g, " ")
            .trim()
        : null;
      const seen = byName.get(name);
      if (seen) {
        if (!seen.types.includes(type)) seen.types.push(type);
        seen.optional ||= !!optional;
        seen.doc ??= text;
        continue;
      }
      const prop = {
        name,
        type,
        types: [type],
        optional: !!optional,
        doc: text,
      };
      byName.set(name, prop);
      props.push(prop);
    }
    if (props.length > before) blocksWithProps++;
  }

  const d = fm.match(/const \{([\s\S]*?)\} = Astro\.props/);
  const destructured = d
    ? [...d[1].matchAll(/^\s*([a-zA-Z_]\w*)/gm)].map((x) => x[1])
    : [];
  for (const m of d?.[1].matchAll(/^\s*(\w+)\s*=\s*(.+?),?\s*$/gm) ?? []) {
    const prop = byName.get(m[1]);
    if (prop) prop.default = m[2];
  }

  return { props, destructured, multiBlock: blocksWithProps > 1 };
}

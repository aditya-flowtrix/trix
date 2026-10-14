/**
 * The docs' syntax colours, in Flowtrix's: green for keywords and tags, mint
 * strings, greys for the rest. Every colour clears 4.5:1 on its background.
 * Used by Markdown code blocks (astro.config.mjs), examples and the home page.
 */
const theme = (
  name: string,
  type: "light" | "dark",
  c: Record<
    | "bg"
    | "fg"
    | "keyword"
    | "string"
    | "attr"
    | "constant"
    | "punct"
    | "comment",
    string
  >,
) => ({
  name,
  type,
  colors: { "editor.background": c.bg, "editor.foreground": c.fg },
  tokenColors: [
    { settings: { foreground: c.fg } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: c.comment, fontStyle: "italic" },
    },
    {
      scope: [
        "keyword",
        "storage",
        "entity.name.tag",
        "support.class.component",
        "entity.name.function",
        "support.function",
        "entity.name.type",
      ],
      settings: { foreground: c.keyword },
    },
    {
      scope: ["string", "markup.inline.raw", "string.unquoted"],
      settings: { foreground: c.string },
    },
    {
      scope: [
        "entity.other.attribute-name",
        "support.type.property-name",
        "variable.parameter",
        "meta.object-literal.key",
      ],
      settings: { foreground: c.attr },
    },
    {
      scope: [
        "constant",
        "constant.numeric",
        "constant.language",
        "support.constant",
        "variable.other.constant",
      ],
      settings: { foreground: c.constant },
    },
    {
      scope: ["punctuation", "meta.brace", "keyword.operator"],
      settings: { foreground: c.punct },
    },
  ],
});

export const codeThemes = {
  light: theme("trix-light", "light", {
    bg: "#f5f5f5",
    fg: "#171717",
    keyword: "#006a37",
    string: "#00542a",
    attr: "#404040",
    constant: "#003e1e",
    punct: "#525252",
    comment: "#666666",
  }),
  dark: theme("trix-dark", "dark", {
    bg: "#0a0a0a",
    fg: "#e5e5e5",
    keyword: "#0fd375",
    string: "#a3fcbf",
    attr: "#d4d4d4",
    constant: "#04bd67",
    punct: "#a3a3a3",
    comment: "#8f8f8f",
  }),
};

type Slots = {
  has(name: string): boolean;
  render(name: string): Promise<string>;
};

/** Ignores empty and comment-only slots. Used by Button, NavLink, and slotted form, interactive, typography, and wrapper components. */
export async function slotContent(
  slots: Slots,
  name = "default",
): Promise<string> {
  if (!slots.has(name)) return "";
  const html = await slots.render(name);
  return html.replace(/<!--[\s\S]*?-->/g, "").trim();
}

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Each element at the top of a slot's HTML, whole, so a component can wrap
 * each one (Tabs' panels, Slider's slides). ponytail: tags are counted, not
 * parsed — an inline script holding `<` would miscount; parse properly if
 * one ever does.
 */
export function topElements(html: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = 0;
  for (const m of html.matchAll(
    /<(\/?)([a-zA-Z][^\s/>]*)(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g,
  )) {
    const [tag, closing, name, selfClosing] = m;
    if (closing) {
      depth -= 1;
      if (depth === 0) found.push(html.slice(start, m.index + tag.length));
      continue;
    }
    if (depth === 0) start = m.index;
    if (!selfClosing && !VOID.has(name.toLowerCase())) depth += 1;
    else if (depth === 0) found.push(tag);
  }
  return found;
}

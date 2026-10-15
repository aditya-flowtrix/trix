/**
 * Reads the design system out of `src/styles/tokens.css` and
 * `src/styles/themes.css`. Shared by the generator (`scripts/tokens.ts`) and
 * the style guide page, so neither carries a copy of a single value.
 *
 * Plain, erasable TypeScript: Node runs it directly.
 */

export interface Token {
  name: string;
  value: string;
  group: string;
}

export interface Theme {
  name: string;
  selectors: string[];
  tokens: Map<string, string>;
}

export interface Fluid {
  name: string;
  min: string;
  max: string;
  viewportMin: string;
  viewportMax: string;
}

export interface Model {
  tokens: Token[];
  byName: Map<string, string>;
  groups: { name: string; tokens: Token[] }[];
  themes: Theme[];
  fluid: Fluid[];
  textStyles: string[];
  /** Font family roles: `--<name>-family` (primary, secondary, mono, …). */
  families: string[];
  palette: Token[];
  spaces: string[];
  sectionSpaces: string[];
  radii: string[];
  lineHeights: string[];
  letterSpacings: string[];
  weights: string[];
  breakpoints: { name: string; value: string }[];
}

const DECLARATION = /\/\*([\s\S]*?)\*\/|(--[\w-]+)\s*:\s*([^;]+);/g;

function block(css: string, selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) return "";
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (depth && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

/** Every custom property in the `:root` block, with the comment heading above it. */
export function parseTokens(css: string): Token[] {
  const body = block(css, /:root\s*\{/);
  const tokens: Token[] = [];
  let group = "";
  for (const m of body.matchAll(/(?:^|[;{\s])(--[^\s:;{}]+)\s*:/g)) {
    if (!/^--[\w-]+$/.test(m[1])) {
      throw new Error(
        `Invalid token name "${m[1]}" — use letters, digits and dashes only.`,
      );
    }
  }
  for (const m of body.matchAll(DECLARATION)) {
    if (m[1] !== undefined) {
      group = m[1].trim().split("\n")[0].trim();
    } else {
      tokens.push({ name: m[2].slice(2), value: m[3].trim(), group });
    }
  }
  return tokens;
}

/** Each rule whose selector list names a `.theme-*` class (or `:root`) is a theme. */
export function parseThemes(css: string): Theme[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const themes: Theme[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const named = selectors
      .map((s) => s.match(/^\.theme-([\w-]+)$/)?.[1])
      .find(Boolean);
    if (!named) continue;
    const tokens = new Map<string, string>();
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(d[1].slice(2), d[2].trim());
    }
    if (tokens.size) themes.push({ name: named, selectors, tokens });
  }
  return themes;
}

/**
 * Text styles are opt-in: a `/* Text style — name *\/` group. A `-font-family`
 * token elsewhere (`--button-label-family`) is a component setting, not a style.
 */
function textStyles(groups: Model["groups"], byName: Map<string, string>) {
  return groups.flatMap((g) => {
    const name = g.name.match(/^Text style\s*[—–-]\s*([\w-]+)$/)?.[1];
    if (!name) {
      if (/^text style\b/i.test(g.name))
        throw new Error(
          `"/* ${g.name} */" is not a text style heading — write exactly "/* Text style — name */" and put any note on the next line.`,
        );
      return [];
    }
    if (!byName.has(`${name}-font-family`))
      throw new Error(
        `"/* ${g.name} */" has no --${name}-font-family — a text style's tokens are named after its heading.`,
      );
    return [name];
  });
}

const NUMERIC = (a: string, b: string) =>
  Number(a.match(/\d+$/)?.[0] ?? 0) - Number(b.match(/\d+$/)?.[0] ?? 0);

export function buildModel(tokensCss: string, themesCss: string): Model {
  const tokens = parseTokens(tokensCss);
  const byName = new Map(tokens.map((t) => [t.name, t.value]));
  const groups: Model["groups"] = [];
  for (const token of tokens) {
    const last = groups.at(-1);
    if (last?.name === token.group) last.tokens.push(token);
    else groups.push({ name: token.group, tokens: [token] });
  }

  const fluid: Fluid[] = tokens
    .filter(
      (t) =>
        t.name.endsWith("-min") && byName.has(`${t.name.slice(0, -4)}-max`),
    )
    .map((t) => {
      const name = t.name.slice(0, -4);
      return {
        name,
        min: t.value,
        max: byName.get(`${name}-max`)!,
        viewportMin: byName.has(`${name}-viewport-min`)
          ? `${name}-viewport-min`
          : "viewport-min",
        viewportMax: byName.has(`${name}-viewport-max`)
          ? `${name}-viewport-max`
          : "viewport-max",
      };
    })
    .filter((f) => !f.name.endsWith("viewport"));

  const names = tokens.map((t) => t.name);
  const fluidNames = fluid.map((f) => f.name);
  const pick = (re: RegExp, from = names) =>
    from.filter((n) => re.test(n)).map((n) => n.match(re)![1]);

  return {
    tokens,
    byName,
    groups,
    themes: parseThemes(themesCss),
    fluid,
    textStyles: textStyles(groups, byName),
    families: pick(/^(\w+)-family$/),
    palette: tokens.filter(
      (t) =>
        t.group.startsWith("Color") &&
        (isColor(t.value) || t.value.startsWith("var(")),
    ),
    spaces: pick(/^(space-\d+)$/, fluidNames).sort(NUMERIC),
    sectionSpaces: pick(/^section-space-(.+)$/, fluidNames),
    radii: pick(/^radius-(.+?)(?:-min|-max)?$/).filter(
      (n, i, a) => a.indexOf(n) === i,
    ),
    lineHeights: pick(/^line-height-(.+)$/),
    letterSpacings: pick(/^letter-spacing-(.+)$/),
    weights: pick(
      /^primary-(thin|extralight|light|regular|medium|semibold|bold|extrabold|black)$/,
    ),
    breakpoints: tokens
      .filter((t) => t.name.startsWith("breakpoint-"))
      .map((t) => ({ name: t.name.slice(11), value: t.value })),
  };
}

/* ------------------------------------------------------------------ */
/* Resolving values — for docs, Figma and the style guide labels      */
/* ------------------------------------------------------------------ */

export function isColor(value: string): boolean {
  return /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|color-mix\(|transparent$|white$|black$)/i.test(
    value,
  );
}

/** Follows `var()` chains through the given lookups, first match wins. Stops at a variable none of them define. */
export function resolveVar(
  value: string,
  ...scopes: Map<string, string>[]
): string {
  let current = value.trim();
  for (let i = 0; i < 20; i++) {
    const m = current.match(/^var\(--([\w-]+)(?:\s*,\s*(.+))?\)$/);
    if (!m) return current;
    const next = scopes.map((s) => s.get(m[1])).find((v) => v !== undefined);
    if (next === undefined) return current;
    current = next.trim();
  }
  return current;
}

/** px number from a token value: a bare number is px, rem/em are ×16. */
export function toPx(value: string): number | undefined {
  const m = value.trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

export type Rgba = [number, number, number, number];

export function parseColor(value: string): Rgba | undefined {
  const v = value.trim().toLowerCase();
  if (v === "white") return [1, 1, 1, 1];
  if (v === "black") return [0, 0, 0, 1];
  if (v === "transparent") return [0, 0, 0, 0];
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  const rgb = v.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] ?? 1];
  }
  return undefined;
}

export function toHex([r, g, b, a]: Rgba): string {
  const c = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}${a < 1 ? c(a) : ""}`;
}

const lin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const gam = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

function toLab([r, g, b]: Rgba): number[] {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  // sRGB → XYZ D50 (Bradford-adapted), CSS Color 4
  const x = 0.4360747 * R + 0.3850649 * G + 0.1430804 * B;
  const y = 0.2225045 * R + 0.7168786 * G + 0.0606169 * B;
  const z = 0.0139322 * R + 0.0971045 * G + 0.7141733 * B;
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  const [fx, fy, fz] = [f(x / D50[0]), f(y / D50[1]), f(z / D50[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function fromLab([L, a, b]: number[], alpha: number): Rgba {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) =>
    t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);
  const [x, y, z] = [inv(fx) * D50[0], inv(fy) * D50[1], inv(fz) * D50[2]];
  const R = 3.1341359 * x - 1.6173863 * y - 0.4906619 * z;
  const G = -0.9787684 * x + 1.9161415 * y + 0.033454 * z;
  const B = 0.0719453 * x - 0.2289914 * y + 1.4052427 * z;
  return [gam(R), gam(G), gam(B), alpha];
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && !depth) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Resolves a color token to a concrete color, following `var()` through the
 * theme and the palette, and evaluating `color-mix()` in srgb or lab.
 * `currentcolor` resolves to the theme's `--text`.
 */
export function resolveColor(
  value: string,
  scopes: Map<string, string>[],
): Rgba | undefined {
  const v = resolveVar(value, ...scopes);
  if (/^currentcolor$/i.test(v)) {
    return resolveColor("var(--text)", scopes);
  }
  const mix = v.match(/^color-mix\(\s*in\s+(srgb|lab|oklab)\s*,(.+)\)$/i);
  if (!mix) return parseColor(v);
  const [a, b] = splitArgs(mix[2]).map((part) => {
    const m = part.match(/^(.+?)\s+([\d.]+)%$/);
    return {
      color: (m ? m[1] : part).trim(),
      pct: m ? Number(m[2]) / 100 : undefined,
    };
  });
  let pa = a.pct ?? (b.pct !== undefined ? 1 - b.pct : 0.5);
  let pb = b.pct ?? 1 - pa;
  const sum = pa + pb;
  pa /= sum;
  pb /= sum;
  const ca = resolveColor(a.color, scopes);
  const cb = resolveColor(b.color, scopes);
  if (!ca || !cb) return undefined;
  const alpha = ca[3] * pa + cb[3] * pb;
  if (!alpha) return [0, 0, 0, 0];
  // Premultiplied interpolation: a transparent side only lowers alpha.
  const wa = (ca[3] * pa) / alpha;
  const wb = (cb[3] * pb) / alpha;
  if (mix[1].toLowerCase() === "srgb") {
    return [
      ca[0] * wa + cb[0] * wb,
      ca[1] * wa + cb[1] * wb,
      ca[2] * wa + cb[2] * wb,
      alpha,
    ];
  }
  const la = toLab(ca);
  const lb = toLab(cb);
  return fromLab(
    [0, 1, 2].map((i) => la[i] * wa + lb[i] * wb),
    alpha,
  );
}

/** The value of a fluid token at a viewport width, in px. */
export function fluidAt(
  model: Model,
  name: string,
  viewport: number,
): number | undefined {
  const f = model.fluid.find((x) => x.name === name);
  if (!f) return undefined;
  const num = (v: string) => toPx(resolveVar(v, model.byName));
  const [min, max] = [num(f.min), num(f.max)];
  const [vmin, vmax] = [
    num(model.byName.get(f.viewportMin) ?? "320"),
    num(model.byName.get(f.viewportMax) ?? "1440"),
  ];
  if ([min, max, vmin, vmax].some((n) => n === undefined)) return undefined;
  const t = Math.min(1, Math.max(0, (viewport - vmin!) / (vmax! - vmin!)));
  return min! + (max! - min!) * t;
}

/**
 * A fixed length token in px: follows var() references and evaluates simple
 * calc() arithmetic in px and rem (`calc(var(--viewport-max) / 16 * 1rem)`).
 */
export function lengthPx(model: Model, name: string): number | undefined {
  let value = model.byName.get(name) ?? "";
  for (let i = 0; i < 20 && value.includes("var("); i++)
    value = value.replace(
      /var\(--([\w-]+)\)/g,
      (m, n: string) => model.byName.get(n) ?? m,
    );
  const expr = value
    .replace(/^calc\(([\s\S]*)\)$/, "$1")
    .replace(/(-?[\d.]+)rem\b/g, (_, n: string) => `${Number(n) * 16}`)
    .replace(/(-?[\d.]+)px\b/g, "$1");
  // Only digits and arithmetic reach Function — never a token's raw text.
  if (!/^[\d.\s+\-*/()]+$/.test(expr)) return undefined;
  const n = Function(`return (${expr})`)() as number;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The layout grid at a viewport width, in px: what a Figma frame of that
 * width should carry, and what `<Row>` renders inside a Section.
 */
export function layoutGrid(model: Model, viewport: number) {
  const columns = Number(model.byName.get("grid-columns") ?? 12);
  const margin = fluidAt(model, "site-margin", viewport) ?? 0;
  const gutter = fluidAt(model, "site-gutter", viewport) ?? 0;
  const maxWidth = lengthPx(model, "max-width-main") ?? Infinity;
  const container = Math.min(viewport - margin * 2, maxWidth);
  return {
    columns,
    gutter,
    margin: (viewport - container) / 2,
    container,
    column: (container - gutter * (columns - 1)) / columns,
  };
}

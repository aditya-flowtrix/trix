/**
 * The rules `Filter` filters, sorts and pages by — no DOM, so they can be
 * read and tested on their own. The component's script does the rest.
 */

/** How an item's field is compared with what the visitor chose. */
export type Operator =
  | "contain"
  | "not-contain"
  | "equal"
  | "not-equal"
  | "exist"
  | "not-exist"
  | "greater"
  | "greater-equal"
  | "less"
  | "less-equal";

/** A value an item carries, as `FilterItem` writes it. */
export type FieldValue =
  string | number | boolean | Date | null | undefined | (string | number)[];

export type Fields = Record<string, FieldValue>;

/** One thing the visitor chose: a field (or several, or the item's whole
 * text when `fields` is empty), an operator and the values to compare. */
export type Condition = {
  key: string;
  fields: string[];
  op: Operator;
  values: string[];
  /** Several values: the item matches one of them, or all of them. */
  match: "any" | "all";
  /** Words may be misspelt — search only. */
  fuzzy?: boolean;
};

/** An item as the script reads it: its fields and, for search, its text. */
export type Item = { fields: Fields; text: string };

/** A field's values as a flat list: `false`, `null` and `""` are no value. */
export const valuesOf = (value: FieldValue): (string | number)[] =>
  (Array.isArray(value) ? value : [value]).flatMap((v) =>
    v === null || v === undefined || v === false || v === ""
      ? []
      : v instanceof Date
        ? [v.toISOString().slice(0, 10)]
        : v === true
          ? ["true"]
          : [v],
  );

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** A value as a number to compare: numbers, numeric text and ISO dates. */
export const numberOf = (value: string | number): number | undefined => {
  if (typeof value === "number") return value;
  if (ISO_DATE.test(value)) return Date.parse(value);
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

const norm = (value: string | number) =>
  String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Edit distance between two words, stopping once it passes `max`. */
export const distance = (a: string, b: string, max: number) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      best = Math.min(best, next[j]);
    }
    if (best > max) return max + 1;
    row = next;
  }
  return row[b.length];
};

/** One typo allowed per four letters; shorter words must match exactly. */
const fuzzyIn = (text: string, term: string) => {
  if (text.includes(term)) return true;
  const max = Math.floor(term.length / 4);
  if (max === 0) return false;
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .some(
      (word) => distance(word.slice(0, term.length + max), term, max) <= max,
    );
};

/** Whether one of an item's values passes `op` against one chosen value. */
const passes = (
  op: Operator,
  have: (string | number)[],
  want: string,
  fuzzy = false,
): boolean => {
  switch (op) {
    case "exist":
      return have.length > 0;
    case "not-exist":
      return have.length === 0;
    case "not-contain":
      return !passes("contain", have, want, fuzzy);
    case "not-equal":
      return !passes("equal", have, want);
    case "equal":
      return have.some((v) => norm(v) === norm(want));
    case "contain": {
      // Every word searched for is somewhere in the value, in any order.
      const text = have.map(norm).join(" ");
      return norm(want)
        .split(/\s+/)
        .every((term) => (fuzzy ? fuzzyIn(text, term) : text.includes(term)));
    }
    default: {
      const target = numberOf(want);
      if (target === undefined) return true;
      return have.some((v) => {
        const n = numberOf(v);
        if (n === undefined) return false;
        if (op === "greater") return n > target;
        if (op === "greater-equal") return n >= target;
        if (op === "less") return n < target;
        return n <= target;
      });
    }
  }
};

/** Whether an item meets one condition. */
export const meets = (item: Item, c: Condition) => {
  const have = c.fields.length
    ? c.fields.flatMap((f) => valuesOf(item.fields[f]))
    : [item.text];
  // `exist` needs no value: a checked "Has video" box is the condition.
  if (c.op === "exist" || c.op === "not-exist") return passes(c.op, have, "");
  const one = (want: string) => passes(c.op, have, want, c.fuzzy);
  return c.match === "all" ? c.values.every(one) : c.values.some(one);
};

/** Whether an item meets the conditions, all of them or any one. */
export const matches = (
  item: Item,
  conditions: Condition[],
  match: "all" | "any",
) =>
  conditions.length === 0 ||
  (match === "all"
    ? conditions.every((c) => meets(item, c))
    : conditions.some((c) => meets(item, c)));

/**
 * Compares two items by a field, for `Array.sort`. Numbers and dates compare
 * as numbers, text in the page's language with numbers in it read as numbers
 * ("Item 2" before "Item 10"). An item without the field goes last either way.
 */
export const compareBy =
  (field: string, direction: "asc" | "desc", locale?: string) =>
  (a: Item, b: Item) => {
    const [x] = valuesOf(a.fields[field]);
    const [y] = valuesOf(b.fields[field]);
    if (x === undefined || y === undefined)
      return x === y ? 0 : x === undefined ? 1 : -1;
    const nx = numberOf(x);
    const ny = numberOf(y);
    const order =
      nx !== undefined && ny !== undefined
        ? nx - ny
        : String(x).localeCompare(String(y), locale, {
            numeric: true,
            sensitivity: "base",
          });
    return direction === "asc" ? order : -order;
  };

/** `"date-desc"` → the field and direction; `""` keeps the page's order. */
export const parseSort = (value: string) => {
  const m = /^(.+)-(asc|desc)$/.exec(value);
  return m ? { field: m[1], direction: m[2] as "asc" | "desc" } : undefined;
};

/**
 * The page numbers to show: the first and last `boundary` pages, `siblings`
 * either side of the current one, and `"…"` for a gap of more than one page.
 */
export const pageRange = (
  current: number,
  pages: number,
  siblings = 1,
  boundary = 1,
): (number | "…")[] => {
  const shown = new Set<number>();
  for (let p = 1; p <= pages; p++)
    if (
      p <= boundary ||
      p > pages - boundary ||
      Math.abs(p - current) <= siblings
    )
      shown.add(p);
  const out: (number | "…")[] = [];
  let last = 0;
  for (const p of [...shown].sort((a, b) => a - b)) {
    if (p - last === 2) out.push(p - 1);
    else if (p - last > 2) out.push("…");
    out.push(p);
    last = p;
  }
  return out;
};

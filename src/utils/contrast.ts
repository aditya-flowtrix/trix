/** WCAG contrast between two `#rrggbb` colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The WCAG 2 thresholds: AA and AAA, for body text and large text. */
export const levels = [
  { name: "AA, body text", min: 4.5 },
  { name: "AA, large text", min: 3 },
  { name: "AAA, body text", min: 7 },
  { name: "AAA, large text", min: 4.5 },
];

/** What a contrast ratio is good for, in a sentence. */
export const verdict = (ratio: number) =>
  ratio >= 4.5
    ? "Readable at any size."
    : ratio >= 3
      ? "Readable for large text only, such as headings."
      : "Too low to read; pick another pair.";

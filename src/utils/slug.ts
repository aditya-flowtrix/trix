/** Creates field-name and tab slugs, keeping letters and digits of any script. Used by Choice, Input, Range, Select, Tabs and Textarea. */
export function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

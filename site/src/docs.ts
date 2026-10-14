import { getCollection, type CollectionEntry } from "astro:content";

export type Doc = CollectionEntry<"docs">;

/** Sidebar groups, in order: the folder under src/content/docs, and its label. */
export const GROUPS = [
  ["start", "Start here"],
  ["system", "The system"],
  ["components", "Components"],
  ["classes", "Classes"],
  ["guides", "Guides"],
] as const;

export const groupOf = (doc: Doc) => doc.id.split("/")[0];
export const groupLabel = (doc: Doc) =>
  GROUPS.find(([g]) => g === groupOf(doc))?.[1] ?? "";

/** `/docs`, `/docs/installation`, `/docs/components/button` — Start here sits at the top. */
export function docPath(doc: Doc) {
  const [group, ...rest] = doc.id.split("/");
  const slug = rest.join("/");
  if (group !== "start") return `/docs/${group}/${slug}`;
  return slug === "introduction" ? "/docs" : `/docs/${slug}`;
}

/** Every page, in sidebar order. */
export async function allDocs() {
  const rank = (d: Doc) => GROUPS.findIndex(([g]) => g === groupOf(d));
  return (await getCollection("docs")).sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.data.order - b.data.order ||
      a.data.title.localeCompare(b.data.title),
  );
}

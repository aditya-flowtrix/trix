import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docs = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    /** One line under the title, in search results and the meta description. */
    description: z.string(),
    /** Position in its sidebar group. */
    order: z.number().default(100),
    /** A label beside the sidebar link: `New`, `Updated`. */
    badge: z.string().optional(),
    /** The component file this page documents, from src/components. */
    component: z.string().optional(),
  }),
});

export const collections = { docs };

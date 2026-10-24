import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    // chapterId: the chapter's Quarto id (for @sec- links); source: the .qmd it was converted from
    schema: docsSchema({ extend: z.object({ chapterId: z.string().optional(), source: z.string().optional() }) }),
  }),
};

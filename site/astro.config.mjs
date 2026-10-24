// KP Riverside NICU Manual: Astro + Starlight site. Content lives in src/content/docs/*.mdx.
// SITE_BASE sets where the site is hosted ("/" for the Cloudflare preview, "/RMC-NICU-Manual" for GitHub Pages).
import fs from "node:fs";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkManual from "./src/plugins/remark-manual.mjs";

const chapters = JSON.parse(fs.readFileSync("./src/chapters.json", "utf8"));
const exists = (slug) => fs.existsSync(`./src/content/docs/${slug}.mdx`);

// Sidebar: the book's parts, in book order (only chapters already converted)
const sidebar = [];
for (const ch of chapters) {
  if (ch.slug === "index" || !exists(ch.slug)) continue;
  let group = sidebar.find((g) => g.label === ch.part);
  if (!group) sidebar.push((group = { label: ch.part || "Manual", items: [] }));
  group.items.push(ch.slug);
}

export default defineConfig({
  site: process.env.SITE_URL || "https://nicu-manual-preview.pages.dev",
  base: process.env.SITE_BASE || "/",
  build: { format: "file" }, // respiratory.html, as in the Quarto manual
  markdown: { processor: unified({ remarkPlugins: [remarkManual, remarkMath], rehypePlugins: [rehypeKatex] }) },
  // node_modules is a link into node_modules.nosync (kept out of iCloud); keep library paths recognizable
  vite: { resolve: { preserveSymlinks: true } },
  integrations: [
    starlight({
      title: "NICU Manual",
      description: "KP Riverside Neonatal ICU Manual: unit protocols, guidelines, and dot phrases.",
      logo: { src: "./src/assets/logo.svg", replacesTitle: false },
      favicon: "/pwa/favicon-64.png",
      customCss: ["katex/dist/katex.min.css", "./src/styles/kp.css"],
      head: [
        { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
        { tag: "link", attrs: { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" } },
      ],
      components: { PageTitle: "./src/components/PageTitle.astro" },
      sidebar,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 }, // main sections only: a short, scannable rail
      lastUpdated: false,
      pagination: true,
    }),
  ],
});

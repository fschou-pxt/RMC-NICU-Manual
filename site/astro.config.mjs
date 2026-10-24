// KP Riverside NICU Manual: Astro + Starlight site. Content lives in src/content/docs/*.mdx.
// SITE_BASE sets where the site is hosted ("/" for the Cloudflare preview, "/RMC-NICU-Manual" for GitHub Pages).
import fs from "node:fs";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkManual from "./src/plugins/remark-manual.mjs";
import remarkEvidence from "./src/plugins/remark-evidence.mjs";

const chapters = JSON.parse(fs.readFileSync("./src/chapters.json", "utf8"));
const exists = (slug) => fs.existsSync(`./src/content/docs/${slug}.mdx`);

// Sidebar: the tools, then the book's parts in book order (only chapters already converted)
const sidebar = [{ label: "Tools", items: ["ask", "calculators"] }];
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
  markdown: { processor: unified({ remarkPlugins: [remarkManual, remarkEvidence, remarkMath], rehypePlugins: [rehypeKatex] }) },
  // node_modules is a link into node_modules.nosync (kept out of iCloud); keep library paths recognizable
  vite: { resolve: { preserveSymlinks: true } },
  integrations: [
    starlight({
      title: "NICU Manual",
      description: "KP Riverside Neonatal ICU Manual: unit protocols, guidelines, and dot phrases.",
      logo: { src: "./src/assets/logo.svg", replacesTitle: false },
      favicon: "/pwa/favicon-64.png",
      // installable app (same tags as pwa/head.html); relative paths work because every page sits at the site root
      customCss: ["katex/dist/katex.min.css", "./src/styles/kp.css"],
      head: [
        { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
        { tag: "link", attrs: { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" } },
        { tag: "link", attrs: { rel: "stylesheet", href: "site_libs/bootstrap/bootstrap-icons.css" } }, // icons used by the chat bubble
        { tag: "link", attrs: { rel: "manifest", href: "manifest.webmanifest" } },
        { tag: "meta", attrs: { name: "theme-color", content: "#003b71" } },
        { tag: "meta", attrs: { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" } },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "pwa/apple-touch-icon.png" } },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" } },
        { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" } },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "NICU Manual" } },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" } },
      ],
      components: { PageTitle: "./src/components/PageTitle.astro", Footer: "./src/components/Footer.astro" },
      sidebar,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 }, // main sections only: a short, scannable rail
      lastUpdated: false,
      pagination: true,
    }),
  ],
});

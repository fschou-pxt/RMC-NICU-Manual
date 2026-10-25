// Images: give each local image its real width and height, so the browser reserves its space before the
// (lazy-loaded) file arrives. Without this, images load after a jump to a section further down (e.g. the
// home page's "Therapeutic hypothermia" link) and push the section away from where the jump landed.
// Covers Markdown images and HTML <img> written in the pages (MDX JSX). Remote images are left alone.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { visit } from "unist-util-visit";

const ROOT = path.resolve(".."); // Figures/ and files/ live in the project folder above site/
const cache = new Map();

async function size(src) {
  if (!src || /^(https?:|data:|\/\/)/.test(src)) return null;
  const file = path.join(ROOT, decodeURIComponent(src.replace(/^\.?\//, "").split(/[?#]/)[0]));
  if (!cache.has(file)) {
    cache.set(file, fs.existsSync(file)
      ? sharp(file).metadata().then((m) => (m.width && m.height ? { width: m.width, height: m.height } : null)).catch(() => null)
      : Promise.resolve(null));
  }
  return cache.get(file);
}

export default function rehypeImageSize() {
  return async (tree) => {
    const jobs = [];
    visit(tree, (n) => (n.type === "element" && n.tagName === "img") || (/^mdxJsx(Flow|Text)Element$/.test(n.type) && n.name === "img"), (n) => {
      if (n.type === "element") {
        if (n.properties?.width || n.properties?.height) return;
        jobs.push(size(n.properties?.src).then((s) => { if (s) Object.assign(n.properties, s); }));
      } else {
        const attr = (k) => n.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === k);
        const src = attr("src")?.value;
        if (typeof src !== "string" || attr("width") || attr("height")) return;
        jobs.push(size(src).then((s) => {
          if (s) n.attributes.push({ type: "mdxJsxAttribute", name: "width", value: String(s.width) }, { type: "mdxJsxAttribute", name: "height", value: String(s.height) });
        }));
      }
    });
    await Promise.all(jobs);
  };
}

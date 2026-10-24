// Manual-specific Markdown handling for the Astro site:
// - `## Title {/*#sec-id*/}` gives the heading that id (the ids the Quarto manual used, so old links still work)
// - `@sec-id` in text becomes a link to that section, labeled with its heading
// - "Either of the following:" / "All of the following:" lists are marked as criteria (any / all)
// - ```mermaid blocks are left for the browser to draw
import fs from "node:fs";
import path from "node:path";
import { visit, SKIP } from "unist-util-visit";

const DOCS = path.resolve("src/content/docs");
const ID_COMMENT = /^\/\*#([\w-]+)\*\/$/;

// id -> { page, title } for every section id in every page (read once per build)
let sections;
function sectionMap() {
  if (sections) return sections;
  sections = new Map();
  for (const file of fs.readdirSync(DOCS).filter((f) => f.endsWith(".mdx"))) {
    const page = file.replace(/\.mdx$/, "");
    const text = fs.readFileSync(path.join(DOCS, file), "utf8");
    const chapter = text.match(/^chapterId:\s*"?([\w-]+)"?\s*$/m);
    const title = text.match(/^title:\s*"?(.+?)"?\s*$/m);
    if (chapter) sections.set(chapter[1], { page, title: title ? title[1] : page, isChapter: true });
    for (const m of text.matchAll(/^#{2,6} (.+?) \{\/\*#([\w-]+)\*\/\}\s*$/gm)) {
      sections.set(m[2], { page, title: m[1].replace(/<[^>]+>/g, "").replace(/&#?\w+;/g, (e) => ({ "&lt;": "<", "&gt;": ">", "&amp;": "&" })[e] ?? e) });
    }
  }
  return sections;
}

const LOGIC = [
  [/^(either|any|one) of the following\b/i, "any"],
  [/^(all|both) of the following\b/i, "all"],
];

export default function remarkManual() {
  return (tree) => {
    const map = sectionMap();

    visit(tree, "heading", (node) => {
      const i = node.children.findIndex((c) => c.type === "mdxTextExpression" && ID_COMMENT.test(c.value.trim()));
      if (i < 0) return;
      const id = node.children[i].value.trim().match(ID_COMMENT)[1];
      node.children.splice(i, 1);
      const last = node.children[node.children.length - 1];
      if (last?.type === "text") last.value = last.value.replace(/\s+$/, "");
      node.data = { ...node.data, hProperties: { ...(node.data?.hProperties || {}), id } };
    });

    visit(tree, "text", (node, index, parent) => {
      if (!node.value.includes("@sec-") || parent.type === "link") return;
      const parts = node.value.split(/(@sec-[\w-]+)/);
      const out = parts.filter(Boolean).map((p) => {
        const id = p.startsWith("@sec-") ? p.slice(1) : null;
        const hit = id && map.get(id);
        if (!hit) return { type: "text", value: p };
        const href = hit.isChapter ? hit.page : `${hit.page}#${id}`;
        return { type: "link", url: href, data: { hProperties: { className: ["xref"] } }, children: [{ type: "text", value: hit.title }] };
      });
      parent.children.splice(index, 1, ...out);
      return [SKIP, index + out.length];
    });

    // numbered lists that continue (start at 3, say) keep their numbers in the step circles
    visit(tree, "list", (node) => {
      if (node.ordered && node.start > 1) {
        const hp = node.data?.hProperties || {};
        node.data = { ...node.data, hProperties: { ...hp, style: `counter-reset: step ${node.start - 1}` } };
      }
    });

    visit(tree, "list", (node, index, parent) => {
      const prev = parent?.children[index - 1];
      if (!prev || prev.type !== "paragraph") return;
      const lead = prev.children.map((c) => c.value || "").join("").trim();
      const hit = LOGIC.find(([re]) => re.test(lead));
      if (!hit) return;
      node.data = { ...node.data, hProperties: { ...(node.data?.hProperties || {}), className: ["criteria"], "data-logic": hit[1] } };
      prev.data = { ...prev.data, hProperties: { className: ["criteria-lead"] } };
    });

    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mermaid") return;
      const esc = node.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      parent.children.splice(index, 1, { type: "html", value: `<div class="diagram"><pre class="mermaid">${esc}</pre></div>` });
      return [SKIP, index + 1];
    });
  };
}

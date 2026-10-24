// Evidence notes: approved evidence checks (evidence/<chapter>/<section>.json, from the three-agent
// pipeline in evidence/PIPELINE.md) shown at the end of the section they cover. Labeled as AI-generated;
// the manual's own text is never changed. On the page: one line per note (verdict, the manual's statement,
// citations, and a "Let's discuss" count); the reviewed notes, all statements and references sit under Details.
import fs from "node:fs";
import path from "node:path";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";

const EVIDENCE = path.resolve("..", "evidence");
const VERDICT = {
  concordant: ["Supported", "ok"],
  partly_concordant: ["Partly supported", "partly"],
  discordant: ["Evidence differs", "differs"],
  insufficient: ["Limited evidence", "limited"],
  practice_varies: ["Practice varies", "varies"],
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// the manual's text as stored by the pipeline (Quarto markup) -> readable plain text
const manualText = (s) => s.replace(/&ge;/g, "≥").replace(/&le;/g, "≤").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s*\*\s+/g, " · ").replace(/^ · /, "").replace(/:\s*·\s*/g, ": ").replace(/(\w)~([^~\s]+)~/g, "$1$2").replace(/\s+/g, " ").trim();
const manualHtml = (s) => esc(manualText(s)).replace(/FiO2/g, "FiO<sub>2</sub>").replace(/SpO2/g, "SpO<sub>2</sub>");

function load(page) {
  const out = [];
  if (!fs.existsSync(EVIDENCE)) return out;
  for (const dir of fs.readdirSync(EVIDENCE, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith("_") || dir.name === "agents") continue;
    for (const f of fs.readdirSync(path.join(EVIDENCE, dir.name)).filter((x) => x.endsWith(".json"))) {
      const ev = JSON.parse(fs.readFileSync(path.join(EVIDENCE, dir.name, f), "utf8"));
      const [file, hash] = ev.anchor.split("#");
      if (file.replace(/\.html$/, "") === page && ev.review?.verdict === "APPROVED") out.push({ ...ev, id: `${dir.name}-${f.replace(/\.json$/, "")}`, hash });
    }
  }
  return out;
}

function render(ev) {
  const refs = ev.references, order = [];
  const num = (key) => { if (!order.includes(key)) order.push(key); return order.indexOf(key) + 1; };
  const KEY = /\[([A-Za-z][\w-]*\d{4}[a-z]?(?:;\s*[A-Za-z][\w-]*\d{4}[a-z]?)*)\]/g;
  const link = (n) => `<a href="#ev-${ev.id}-r${n}" onclick="this.closest('.evidence').querySelector('details').open=true">${n}</a>`;
  // "[Sweet2026; Dargaville2021]" -> superscript reference numbers
  const cite = (text) => esc(text).replace(KEY, (m, keys) => "<sup class=\"ev-cite\">" + keys.split(/;\s*/).map((k) => link(num(k))).join(",") + "</sup>");
  // all references a note cites, as one superscript: 1–4,7
  const citeAll = (text) => {
    const ns = [...new Set([...text.matchAll(KEY)].flatMap((m) => m[1].split(/;\s*/).map(num)))].sort((a, b) => a - b);
    const runs = [];
    for (const n of ns) { const r = runs[runs.length - 1]; if (r && n === r[1] + 1) r[1] = n; else runs.push([n, n]); }
    return ns.length ? `<sup class="ev-cite">${runs.map(([a, b]) => b > a + 1 ? `${link(a)}–${link(b)}` : b > a ? `${link(a)},${link(b)}` : link(a)).join(",")}</sup>` : "";
  };
  const claims = ev.claims, omissions = ev.omissions || [];
  const counts = {};
  for (const c of claims) counts[c.verdict] = (counts[c.verdict] || 0) + 1;
  const summary = Object.entries(counts).map(([v, n]) => `${n} ${VERDICT[v][0].toLowerCase()}`).join(" · ");
  const checked = new Date(ev.checked + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const notes = [
    ...claims.filter((c) => c.note).map((c) => ({ id: c.id, label: VERDICT[c.verdict][0], tone: VERDICT[c.verdict][1], line: manualHtml(c.manual_text), note: c.note })),
    ...omissions.map((o) => ({ id: o.id, label: "Related point", tone: "related", line: esc(o.topic || ""), note: o.note })),
  ];
  // one "Let's discuss" per box: a count for the whole section
  const discuss = `<button type="button" class="ev-discuss" data-discuss="${esc(ev.id)}" aria-pressed="false" title="Let the protocol leads know this section is worth discussing"><span aria-hidden="true">✋</span> Let's discuss<span class="ev-n"></span></button>`;
  const lines = notes.map((n) => `<li class="ev-line ev-${n.tone}"><span class="ev-chip ev-${n.tone}">${esc(n.label)}</span> <span class="ev-what">${n.line}</span>${citeAll(n.note)}</li>`).join("\n");
  // Details: the reviewed notes in full, every statement, and the references
  const full = notes.map((n) => `<div class="ev-note ev-${n.tone}"><p class="ev-label">${esc(n.label)}: <span>${n.line}</span></p><p>${cite(n.note)}</p></div>`).join("\n");
  const rows = claims.map((c) => `<li><p class="ev-manual">${manualHtml(c.manual_text)} <span class="ev-chip ev-${VERDICT[c.verdict][1]}">${VERDICT[c.verdict][0]}</span></p><p>${cite(c.summary)}</p></li>`).join("\n");
  for (const r of refs) num(r.key); // uncited references go last
  const refHtml = order.map((key, i) => {
    const r = refs.find((x) => x.key === key) || { key };
    const where = [r.journal, [r.year, r.volume && `;${r.volume}${r.issue ? `(${r.issue})` : ""}`, r.pages && `:${r.pages}`].filter(Boolean).join("")].filter(Boolean).join(". ");
    const doi = r.doi ? ` <a href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">doi:${esc(r.doi)}</a>` : r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">link</a>` : "";
    const who = (r.citation || [r.authors, r.title].filter(Boolean).join(". ")).replace(/\.+$/, ""); // "et al." keeps one period
    return `<li id="ev-${ev.id}-r${i + 1}">${esc(who)}${where ? ". " + esc(where) : ""}.${doi}</li>`;
  }).join("\n");
  return `<section class="evidence not-content" aria-label="Evidence check">
<div class="ev-head"><span class="ev-badge">Evidence check</span>${discuss}</div>
<p class="ev-meta">AI-generated · independently AI-reviewed · checked ${esc(checked)}</p>
${lines ? `<ul class="ev-lines">${lines}</ul>` : ""}
<details class="ev-more"><summary>Details: all ${claims.length} statements (${esc(summary)}) and ${refs.length} references</summary>
${full}
<p class="ev-refs-title">All ${claims.length} statements</p>
<ol class="ev-claims">${rows}</ol>
<p class="ev-refs-title">References</p>
<ol class="ev-refs">${refHtml}</ol>
<p class="ev-fine">Produced by separate AI research, comparison, and review steps, each checked against the retrieved sources (${ev.review.rounds} review rounds, ${ev.review.quotes_checked} quotes verified). It does not change the unit protocol above. "Let's discuss" adds to a count the protocol leads review.</p>
<button type="button" class="ev-close" onclick="const d=this.closest('details');d.open=false;d.scrollIntoView({block:'nearest'})">Hide details</button>
</details>
</section>`;
}

export default function remarkEvidence() {
  return (tree, file) => {
    const page = path.basename(file.path || "", ".mdx");
    const checks = load(page);
    if (!checks.length) return;
    const slugger = new GithubSlugger();
    const heads = [];
    visit(tree, "heading", (node, index, parent) => {
      if (parent !== tree) return;
      const id = node.data?.hProperties?.id || slugger.slug(toString(node));
      heads.push({ node, id, depth: node.depth });
    });
    // insert from the end so earlier positions stay valid
    const inserts = [];
    for (const ev of checks) {
      const at = heads.findIndex((h) => h.id === ev.hash);
      if (at < 0) continue;
      const next = heads.slice(at + 1).find((h) => h.depth <= heads[at].depth);
      const pos = next ? tree.children.indexOf(next.node) : tree.children.length;
      inserts.push([pos, { type: "html", value: render(ev) }]);
    }
    inserts.sort((a, b) => b[0] - a[0]).forEach(([pos, node]) => tree.children.splice(pos, 0, node));
  };
}

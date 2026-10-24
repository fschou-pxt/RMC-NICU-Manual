// Evidence notes: approved evidence checks (evidence/<chapter>/<section>.json, from the three-agent
// pipeline in evidence/PIPELINE.md) shown at the end of the section they cover. Labeled as AI-generated;
// the manual's own text is never changed. "Let's discuss" emails the protocol leads.
import fs from "node:fs";
import path from "node:path";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";

const EVIDENCE = path.resolve("..", "evidence");
const LEADS = ["James.A.Washington@kp.org", "Michael.S.Chang@kp.org"]; // same as the app's "Let's discuss"
const LIVE = "https://fschou-pxt.github.io/RMC-NICU-Manual/";
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
      if (file.replace(/\.html$/, "") === page && ev.review?.verdict === "APPROVED") out.push({ ...ev, id: f.replace(/\.json$/, ""), hash });
    }
  }
  return out;
}

function render(ev) {
  const refs = ev.references, order = [];
  const num = (key) => { if (!order.includes(key)) order.push(key); return order.indexOf(key) + 1; };
  // "[Sweet2026; Dargaville2021]" -> superscript reference numbers
  const cite = (text) => esc(text).replace(/\[([A-Za-z][\w-]*\d{4}[a-z]?(?:;\s*[A-Za-z][\w-]*\d{4}[a-z]?)*)\]/g, (m, keys) =>
    "<sup class=\"ev-cite\">" + keys.split(/;\s*/).map((k) => `<a href="#ev-${ev.id}-r${num(k)}">${num(k)}</a>`).join(",") + "</sup>");
  const claims = ev.claims, omissions = ev.omissions || [];
  const counts = {};
  for (const c of claims) counts[c.verdict] = (counts[c.verdict] || 0) + 1;
  const summary = Object.entries(counts).map(([v, n]) => `${n} ${VERDICT[v][0].toLowerCase()}`).join(" · ");
  const checked = new Date(ev.checked + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const page = LIVE + ev.anchor;
  const discuss = (subjectBit, manual, note) => {
    const body = `I'd like to discuss an evidence note in the NICU Manual (${ev.section}).\n\nManual: ${manual}\n\nEvidence note (AI-generated, checked ${checked}): ${note}\n\nPage: ${page}\n\nMy thoughts (optional):\n\n\nPlease don't include patient identifiers.`;
    const href = `mailto:${LEADS.join(",")}?subject=${encodeURIComponent(`Let's discuss (NICU Manual evidence): ${ev.section}, ${subjectBit}`)}&body=${encodeURIComponent(body)}`;
    return `<a class="ev-discuss" href="${esc(href)}"><span aria-hidden="true">✋</span> Let's discuss</a>`;
  };
  const notes = [
    ...claims.filter((c) => c.note).map((c) => ({ label: VERDICT[c.verdict][0], tone: VERDICT[c.verdict][1], manual: c.manual_text, note: c.note, bit: manualText(c.manual_text).slice(0, 50) })),
    ...omissions.map((o) => ({ label: "Related point", tone: "related", manual: claims.find((c) => c.id === o.related_claim)?.manual_text || "", note: o.note, bit: o.topic || "related point" })),
  ];
  const noteHtml = notes.map((n) => `<div class="ev-note ev-${n.tone}">
<p class="ev-label">${esc(n.label)}</p>
${n.manual ? `<p class="ev-manual"><span>Manual:</span> ${manualHtml(n.manual)}</p>` : ""}
<p>${cite(n.note)}</p>
${discuss(n.bit, manualText(n.manual), n.note.replace(/\s*\[[^\]]+\]/g, ""))}
</div>`).join("\n");
  const rows = claims.map((c) => `<li><p class="ev-manual">${manualHtml(c.manual_text)} <span class="ev-chip ev-${VERDICT[c.verdict][1]}">${VERDICT[c.verdict][0]}</span></p><p>${cite(c.summary)}</p></li>`).join("\n");
  for (const r of refs) num(r.key); // uncited references go last
  const refHtml = order.map((key, i) => {
    const r = refs.find((x) => x.key === key) || { key };
    const where = [r.journal, [r.year, r.volume && `;${r.volume}${r.issue ? `(${r.issue})` : ""}`, r.pages && `:${r.pages}`].filter(Boolean).join("")].filter(Boolean).join(". ");
    const doi = r.doi ? ` <a href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">doi:${esc(r.doi)}</a>` : r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">link</a>` : "";
    return `<li id="ev-${ev.id}-r${i + 1}">${esc(r.citation || [r.authors, r.title].filter(Boolean).join(". "))}${where ? ". " + esc(where) : ""}.${doi}</li>`;
  }).join("\n");
  return `<section class="evidence not-content" aria-label="Evidence check">
<div class="ev-head"><span class="ev-badge">Evidence check</span><span class="ev-meta">AI-generated · independently AI-reviewed · checked ${esc(checked)}</span></div>
<p class="ev-sum">${claims.length} statements in this section compared with published evidence: ${esc(summary)}.</p>
${noteHtml}
<details class="ev-more"><summary>All ${claims.length} statements and ${refs.length} references</summary>
<ol class="ev-claims">${rows}</ol>
<p class="ev-refs-title">References</p>
<ol class="ev-refs">${refHtml}</ol>
<p class="ev-fine">Produced by separate AI research, comparison, and review steps, each checked against the retrieved sources (${ev.review.rounds} review rounds, ${ev.review.quotes_checked} quotes verified). It does not change the unit protocol above; use "Let's discuss" to raise it with the protocol leads.</p>
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

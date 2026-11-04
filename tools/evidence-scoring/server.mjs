#!/usr/bin/env node
// Local scoring app for the AI evidence checks (the evidence-check audit: AI notes vs two clinician reviewers).
// Run from anywhere:  node tools/evidence-scoring/server.mjs            (opens http://127.0.0.1:4177)
// All reviewers:      node tools/evidence-scoring/server.mjs --export-all   (merged CSV from this Mac's files, for analysis only)
// Hosted version:     see cloud/README.md (--build-cloud, --export-cloud). It leaves out the retrieved full texts.
// Scores: research/evidence-scores/reviewers/<reviewer>.jsonl, append-only, one line per save; the last line per item
// counts. The app only ever returns the signed-in reviewer's own lines, so reviewers stay blind to each other.
// This server listens on 127.0.0.1 only: the retrieved full texts it serves must stay on this machine.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SCALE, slugOf, makeRecord, toCsv, latest, canFrame, fetchAbstract } from "./shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EVIDENCE = path.join(ROOT, "evidence");
const DIST = path.join(ROOT, "site", "dist");
const OUT = path.join(ROOT, "research", "evidence-scores");
const REVIEWERS = path.join(OUT, "reviewers");
const PORT = Number(process.env.PORT) || 4177;

// as in site/src/plugins/remark-evidence.mjs, which builds the yellow box
const VERDICT = {
  concordant: ["Supported", "ok"],
  partly_concordant: ["Partly supported", "partly"],
  discordant: ["Evidence differs", "differs"],
  insufficient: ["Limited evidence", "limited"],
  practice_varies: ["Practice varies", "varies"],
};
const KEY = /\[([A-Za-z][\w-]*\d{4}[a-z]?(?:;\s*[A-Za-z][\w-]*\d{4}[a-z]?)*)\]/g;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const manualText = (s) => s.replace(/&ge;/g, "≥").replace(/&le;/g, "≤").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s*\*\s+/g, " · ").replace(/^ · /, "").replace(/:\s*·\s*/g, ": ").replace(/(\w)~([^~\s]+)~/g, "$1$2").replace(/\s+/g, " ").trim();
const manualHtml = (s) => esc(manualText(s)).replace(/FiO2/g, "FiO<sub>2</sub>").replace(/SpO2/g, "SpO<sub>2</sub>");
const keysIn = (text) => [...String(text).matchAll(KEY)].flatMap((m) => m[1].split(/;\s*/));

// the retrieved copies of a reference, best first (embedding always works for these)
function localCopies(folder, slug, key) {
  const dir = path.join(EVIDENCE, "_work", folder, slug, "sources");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(key + ".") && /\.(pdf|txt|md)$/.test(f));
  const rank = (f) => [".pdf", ".txt", ".md"].indexOf(path.extname(f));
  return files.sort((a, b) => rank(a) - rank(b)).map((f) => ({ kind: path.extname(f).slice(1), href: `/src/${folder}/${slug}/${encodeURIComponent(f)}` }));
}

// every yellow-box line of every approved note, in book order. Reference numbers follow the box's own numbering.
function loadItems() {
  const chapters = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "src", "chapters.json"), "utf8"));
  const bookOrder = (page) => { const i = chapters.findIndex((c) => c.slug === page); return i < 0 ? 999 : i; };
  const chapterTitle = (page) => {
    try { return /^title:\s*"?(.+?)"?\s*$/m.exec(fs.readFileSync(path.join(ROOT, "site", "src", "content", "docs", page + ".mdx"), "utf8"))[1]; } catch { return page; }
  };
  const sections = [];
  for (const dir of fs.readdirSync(EVIDENCE, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith("_") || dir.name === "agents") continue;
    for (const f of fs.readdirSync(path.join(EVIDENCE, dir.name)).filter((x) => x.endsWith(".json"))) {
      const ev = JSON.parse(fs.readFileSync(path.join(EVIDENCE, dir.name, f), "utf8"));
      if (ev.review?.verdict !== "APPROVED") continue;
      const slug = f.replace(/\.json$/, "");
      const [file, hash] = ev.anchor.split("#");
      sections.push({ ...ev, id: `${dir.name}-${slug}`, folder: dir.name, slug, page: file.replace(/\.html$/, ""), hash });
    }
  }
  const line = (s) => parseInt(String(s.source?.lines), 10) || 0;
  sections.sort((a, b) => bookOrder(a.page) - bookOrder(b.page) || line(a) - line(b));

  const items = [], out = [];
  for (const ev of sections) {
    const claims = ev.claims, omissions = ev.omissions || [];
    // what is scored: every statement (in the box or only under Details), then the related points
    const notes = [
      ...claims.map((c) => ({ id: c.id, kind: "claim", inBox: !!c.note, label: VERDICT[c.verdict][0], tone: VERDICT[c.verdict][1], lineHtml: manualHtml(c.manual_text), statement: manualText(c.manual_text), note: c.note || c.summary, target: c.manual_text })),
      ...omissions.map((o) => ({ id: o.id, kind: "related", inBox: true, label: "Related point", tone: "related", lineHtml: esc(o.topic || ""), statement: o.topic || "", note: o.note, target: claims.find((c) => c.id === o.related_claim)?.manual_text || "" })),
    ];
    const order = [];
    const num = (key) => { if (!order.includes(key)) order.push(key); return order.indexOf(key) + 1; };
    for (const n of notes.filter((x) => x.inBox)) keysIn(n.note).forEach(num);
    for (const c of claims) keysIn(c.summary).forEach(num);
    for (const r of ev.references) num(r.key);
    const refs = order.map((key, i) => {
      const r = ev.references.find((x) => x.key === key) || { key };
      const where = [r.journal, [r.year, r.volume && `;${r.volume}${r.issue ? `(${r.issue})` : ""}`, r.pages && `:${r.pages}`].filter(Boolean).join("")].filter(Boolean).join(". ");
      const who = (r.citation || [r.authors, r.title].filter(Boolean).join(". ")).replace(/\.+$/, "");
      return { n: i + 1, key, text: `${who || key}${where ? ". " + where : ""}.`, doi: r.doi || null, url: r.url || null, pmid: r.pmid || null, local: localCopies(ev.folder, ev.slug, key) };
    });
    out.push({ id: ev.id, page: ev.page, hash: ev.hash, chapter: chapterTitle(ev.page), section: ev.section.split(" › ")[0], fullSection: ev.section, checked: ev.checked, refs, targets: claims.map((c) => c.manual_text) });
    for (const n of notes) {
      // each item stands alone in the app, so its citations count 1, 2, 3 in reading order; data-ref stays the box's number
      const cited = [...new Set(keysIn(n.note))].filter((k) => refs.some((r) => r.key === k));
      for (const r of refs) if (!cited.includes(r.key) && new RegExp(`\\b${r.key}\\b`).test(n.note)) cited.push(r.key);
      const noteHtml = esc(n.note).replace(KEY, (m, keys) => `<sup class="ev-cite">${keys.split(/;\s*/).map((k) => `<a href="#" data-ref="${num(k)}">${cited.indexOf(k) + 1 || "?"}</a>`).join(",")}</sup>`);
      const hash = crypto.createHash("sha256").update(JSON.stringify([n.statement, n.note, n.label])).digest("hex").slice(0, 12);
      items.push({ id: `${ev.id}-${n.id}`, sectionId: ev.id, item: n.id, kind: n.kind, inBox: n.inBox, label: n.label, tone: n.tone, lineHtml: n.lineHtml, statement: n.statement, noteHtml, cited: cited.map(num), target: n.target, hash });
    }
  }
  return { sections: out, items, scale: SCALE };
}

const fileOf = (name) => path.join(REVIEWERS, slugOf(name) + ".jsonl");

const readLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { console.error("skipped an unreadable line in", path.basename(file)); return []; } }) : []);
const currentScores = (file) => latest(readLines(file));
const scoredRows = (file) => Object.values(currentScores(file)).filter((r) => r.score != null || r.comment);

if (process.argv.includes("--export-all")) {
  const files = fs.existsSync(REVIEWERS) ? fs.readdirSync(REVIEWERS).filter((f) => f.endsWith(".jsonl")) : [];
  const rows = files.flatMap((f) => scoredRows(path.join(REVIEWERS, f)));
  const dest = path.join(OUT, "all-reviewers.csv");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(dest, toCsv(rows));
  console.log(`${rows.length} rows from ${files.length} reviewer(s) -> ${path.relative(ROOT, dest)}`);
  process.exit(0);
}

// the hosted copy: the app, the frozen item list and the manual's pages, never the retrieved full texts
if (process.argv.includes("--build-cloud")) {
  const dest = path.join(OUT, "cloud-build");
  const data = loadItems();
  for (const s of data.sections) for (const r of s.refs) r.local = [];
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, "api"), { recursive: true });
  fs.writeFileSync(path.join(dest, "api", "items.json"), JSON.stringify(data));
  fs.copyFileSync(path.join(HERE, "index.html"), path.join(dest, "index.html"));
  for (const page of new Set(data.sections.map((s) => s.page))) fs.copyFileSync(path.join(DIST, page + ".html"), path.join(dest, page + ".html"));
  for (const dir of ["_astro", "Figures"]) fs.cpSync(fs.realpathSync(path.join(DIST, dir)), path.join(dest, dir), { recursive: true });
  const stray = fs.readdirSync(dest, { recursive: true }).filter((f) => /sources|\.txt$/.test(String(f)));
  if (stray.length) throw new Error("retrieved text in the hosted copy: " + stray.join(", "));
  console.log(`${data.items.length} items, ${data.sections.length} sections -> ${path.relative(ROOT, dest)}`);
  process.exit(0);
}

// every reviewer's hosted scores: the merged CSV, and the full append-only log as a backup
if (process.argv.includes("--export-cloud")) {
  const out = execFileSync("npx", ["-y", "wrangler@4", "d1", "execute", "evidence-scores", "--remote", "--json", "--command", "SELECT record FROM scores ORDER BY id"], { cwd: path.join(HERE, "cloud"), encoding: "utf8", maxBuffer: 1 << 28 });
  const lines = JSON.parse(out)[0].results.map((r) => JSON.parse(r.record));
  const byReviewer = Object.groupBy(lines, (r) => slugOf(r.reviewer));
  const rows = Object.values(byReviewer).flatMap((l) => Object.values(latest(l))).filter((r) => r.score != null || r.comment);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "cloud-all-reviewers.csv"), toCsv(rows));
  fs.writeFileSync(path.join(OUT, "cloud-log-backup.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`${rows.length} rows from ${Object.keys(byReviewer).length} reviewer(s) -> research/evidence-scores/cloud-all-reviewers.csv (log: cloud-log-backup.jsonl)`);
  process.exit(0);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const sendJson = (res, data, code = 200) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };
function sendFile(req, res, file) {
  const stat = fs.statSync(file), type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || ""); // video needs ranges
  if (m) {
    const start = Number(m[1]), end = m[2] ? Number(m[2]) : stat.size - 1;
    res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "content-type": type, "content-length": stat.size, "accept-ranges": "bytes", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}
const inside = (base, p) => p === base || p.startsWith(base + path.sep);
const readBody = (req) => new Promise((ok, no) => { let b = ""; req.on("data", (d) => { b += d; if (b.length > 1e5) no(new Error("too large")); }); req.on("end", () => ok(b)); req.on("error", no); });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const p = decodeURIComponent(url.pathname);
    if (p === "/" || p === "/app") return sendFile(req, res, path.join(HERE, "index.html"));
    if (p === "/api/items.json") return sendJson(res, loadItems());
    if (p === "/api/scores") {
      const who = url.searchParams.get("reviewer");
      if (!slugOf(who || "")) return sendJson(res, { error: "reviewer required" }, 400);
      return sendJson(res, currentScores(fileOf(who)));
    }
    if (p === "/api/score" && req.method === "POST") {
      if (!/application\/json/.test(req.headers["content-type"] || "")) return sendJson(res, { error: "json only" }, 415);
      const b = JSON.parse(await readBody(req));
      const rec = makeRecord(b, loadItems());
      if (!rec) return sendJson(res, { error: "bad request" }, 400);
      fs.mkdirSync(REVIEWERS, { recursive: true });
      fs.appendFileSync(fileOf(b.reviewer), JSON.stringify(rec) + "\n");
      return sendJson(res, rec);
    }
    if (p === "/api/export.csv") {
      const who = url.searchParams.get("reviewer");
      if (!slugOf(who || "")) return sendJson(res, { error: "reviewer required" }, 400);
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="evidence-scores-${slugOf(who)}.csv"`, "cache-control": "no-store" });
      return res.end(toCsv(scoredRows(fileOf(who))));
    }
    if (p === "/api/frame") return sendJson(res, await canFrame(url.searchParams.get("url")));
    if (p === "/api/abstract") {
      const r = await fetchAbstract(url.searchParams.get("pmid"));
      res.writeHead(r.status, { "content-type": "text/plain; charset=utf-8" });
      return res.end(r.text);
    }
    const src = /^\/src\/([\w-]+)\/([\w-]+)\/([\w.-]+)$/.exec(p);
    if (src) {
      const f = path.join(EVIDENCE, "_work", src[1], src[2], "sources", src[3]);
      if (fs.existsSync(f)) return sendFile(req, res, f);
    }
    // anything else is the built site, for the manual's pages, styles and figures
    const f = path.resolve(DIST, "." + p);
    if (inside(path.resolve(DIST), f) && fs.existsSync(f) && fs.statSync(f).isFile()) return sendFile(req, res, f);
    res.writeHead(404).end("Not found");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, { error: "server error" }, 500);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const { items, sections } = loadItems();
  console.log(`Evidence scoring: http://127.0.0.1:${PORT}  (${items.length} items in ${sections.length} sections; scores in ${path.relative(ROOT, REVIEWERS)}/)`);
  if (!fs.existsSync(DIST)) console.log("site/dist is missing: run `cd site && npm run build` to show the manual text.");
  if (!process.argv.includes("--no-open")) spawn("open", [`http://127.0.0.1:${PORT}`], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
});

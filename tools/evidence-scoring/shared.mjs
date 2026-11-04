// Used by both the local server (server.mjs) and the hosted version (cloud/functions).
export const SCALE = { 1: "Strongly disagree", 2: "Disagree", 3: "Neutral", 4: "Agree", 5: "Strongly agree" };

export const slugOf = (name) => String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// one saved score, or null if the request is not valid
export function makeRecord(b, data) {
  const item = data.items.find((i) => i.id === b.item_id), sec = item && data.sections.find((s) => s.id === item.sectionId);
  const score = b.score == null ? null : Number(b.score);
  if (!slugOf(b.reviewer || "") || !item || (score !== null && !SCALE[score])) return null;
  return {
    reviewer: String(b.reviewer).trim(), item_id: item.id, section_id: item.sectionId, page: sec.page, section: sec.fullSection, item_kind: item.kind,
    ai_label: item.label, statement: item.statement, score, score_label: score ? SCALE[score] : null, comment: String(b.comment || "").trim(),
    item_hash: item.hash, evidence_checked: sec.checked, timestamp: new Date().toISOString(),
  };
}

// a reviewer's current record per item: the log is append-only, the last line wins
export const latest = (records) => Object.fromEntries(records.map((r) => [r.item_id, r]));

const COLS = ["reviewer", "item_id", "section_id", "page", "section", "item_kind", "ai_label", "statement", "score", "score_label", "comment", "item_hash", "evidence_checked", "timestamp"];
const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => "﻿" + [COLS.join(","), ...rows.map((r) => COLS.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";

// can this page sit in an iframe? Reads each redirect hop's headers; anything unclear means "open in a new tab"
const frameCache = new Map();
export async function canFrame(url) {
  if (!/^https:\/\//.test(url || "")) return { ok: false, reason: "not a web link" };
  if (frameCache.has(url)) return frameCache.get(url);
  let at = url, result = { ok: false, reason: "too many redirects" };
  try {
    for (let hop = 0; hop < 8; hop++) {
      const res = await fetch(at, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36", accept: "text/html,*/*" } });
      res.body?.cancel().catch(() => {});
      const xfo = res.headers.get("x-frame-options");
      const fa = /frame-ancestors([^;]*)/i.exec(res.headers.get("content-security-policy") || "")?.[1]?.trim();
      if (xfo || (fa && fa !== "*")) { result = { ok: false, reason: "the site blocks embedding" }; break; }
      const next = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && next) { at = new URL(next, at).href; continue; }
      result = res.status < 400 ? { ok: true } : { ok: false, reason: `the site answered ${res.status}` };
      break;
    }
  } catch { result = { ok: false, reason: "the site did not answer" }; }
  frameCache.set(url, result);
  return result;
}

// PubMed refuses iframes, so its abstract comes from NCBI's public E-utilities as plain text
const abstracts = new Map();
export async function fetchAbstract(pmid) {
  if (!/^\d+$/.test(pmid || "")) return { status: 400, text: "pmid required" };
  if (!abstracts.has(pmid)) {
    try {
      const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error();
      abstracts.set(pmid, await r.text());
    } catch { return { status: 502, text: "PubMed did not answer. Use Open in new tab." }; }
  }
  return { status: 200, text: abstracts.get(pmid) };
}

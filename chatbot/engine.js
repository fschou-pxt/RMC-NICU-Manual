// NICU Manual chat engine, shared by the chat bubble (chatbot/widget.html) and the Ask page (site/src/components/AskApp.astro).
// Runs in the browser with the user's own API key (Anthropic, OpenAI, or xAI), or, where the site has the study's
// server function (/api/ask), with the study's Grok key; the AI instructions are in prompts.js.

import { SYSTEM, SCHEMA, REPHRASE_SYSTEM, REPHRASE_SCHEMA, NEO_SYSTEM, EXTERNAL_SYSTEM, WEB_SYSTEM, OUT_OF_SCOPE, readWebReply } from "./prompts.js";

export const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm";
export const LIVE_BASE = "https://fschou-pxt.github.io/RMC-NICU-Manual/";
export const ROOT = new URL("../", import.meta.url).href; // site root (this file lives in chatbot/)

// one list of every provider/model offered (model IDs checked October 2026)
export const PROVIDERS = {
  anthropic: { name: "Anthropic", keyHint: "sk-ant-…", console: "console.anthropic.com",
    keyOk: (k) => k.startsWith("sk-ant-") },
  openai: { name: "OpenAI", keyHint: "sk-…", console: "platform.openai.com",
    keyOk: (k) => k.startsWith("sk-") && !k.startsWith("sk-ant-") },
  xai: { name: "xAI", keyHint: "xai-…", console: "console.x.ai", keyOk: (k) => k.startsWith("xai-") },
};
export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)", provider: "anthropic" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable, costliest)", provider: "anthropic" },
  { id: "gpt-6-astra", label: "GPT-6 Astra", provider: "openai" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", provider: "openai" },
  { id: "gpt-6-luna", label: "GPT-6 Luna (fastest, cheapest)", provider: "openai" },
  { id: "grok-4.7", label: "Grok 4.7", provider: "xai" },
];
export const modelInfo = (id) => MODELS.find((m) => m.id === id) || MODELS[0];
export const shortLabel = (m) => m.label.replace(/ \(.*\)$/, "");
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"];
export const K = { history: "nicuChat.history", open: "nicuChat.open", pending: "nicuChat.pending",
  key: "nicuChat.key", settings: "nicuChat.settings", ui: "nicuChat.ui", app: "nicuChat.app" };

// ---------- storage (every access guarded: private windows can throw) ----------
export const store = {
  get(area, k) { try { return area.getItem(k); } catch { return null; } },
  set(area, k, v) { try { area.setItem(k, v); } catch {} },
  del(area, k) { try { area.removeItem(k); } catch {} },
};
export const S = window.sessionStorage, L = window.localStorage;
export const readJSON = (area, k, d) => { try { return JSON.parse(store.get(area, k)) ?? d; } catch { return d; } };

// ---------- the study: where the site has /api/ask (preview/functions/api/ask.js), everyone uses the study's Grok key ----------
// Checked once per visit; with Ask switched off for the site build (window.NICU_ASK === false) it isn't checked at all.
async function detectStudy() {
  if (window.NICU_ASK === false) return null;
  const cached = readJSON(S, "nicuChat.study", null);
  if (cached) return cached.study ? cached : null;
  let info;
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(ROOT + "api/ask", { cache: "no-store", signal: ctrl.signal });
    const v = r.ok && (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
    info = v?.study ? { study: true, model: v.model } : { study: false };
  } catch { return null; } // offline or slow: personal keys this time, checked again next visit
  finally { clearTimeout(timer); }
  store.set(S, "nicuChat.study", JSON.stringify(info));
  return info.study ? info : null;
}
export const STUDY = await detectStudy();
const STUDY_MODEL = STUDY && { ...(MODELS.find((m) => m.id === STUDY.model) || { label: STUDY.model }), id: STUDY.model, provider: "study" };
export const STUDY_NOTICE = "Questions and answers are saved without your name, for a quality review of Ask. Patient details are removed automatically, but never type them.";
// The disclaimer: under Ask's text box (a link) and in Settings
export const disclaimerHTML = () => `<p class="nc-note">Using <b>${esc(shortLabel(currentModel()))}</b>. Answers may be wrong; check the linked source. ` +
  `Not medical advice: Ask supports, but does not replace, clinical judgment. When in doubt, ask the attending neonatologist.</p>` +
  (STUDY ? `<p class="nc-note">${esc(STUDY_NOTICE)}</p>` : "");

// one saved key per provider: nicuChat.key.anthropic, nicuChat.key.openai, nicuChat.key.xai
const keyName = (provider) => K.key + "." + provider;
export function getKey(provider) { return store.get(S, keyName(provider)) || store.get(L, keyName(provider)) || ""; }
export function keyRemembered() { return Object.keys(PROVIDERS).some((p) => store.get(L, keyName(p))); }
export function saveKey(provider, key, remember) {
  store.del(S, keyName(provider)); store.del(L, keyName(provider));
  if (key) store.set(remember ? L : S, keyName(provider), key);
}
export function settings() {
  const st = { model: "claude-opus-5-5", autoJump: true, ...readJSON(L, K.settings, {}) };
  st.model = modelInfo(st.model).id;
  return st;
}
export const currentModel = () => STUDY_MODEL || modelInfo(settings().model);
export const hasKey = () => !!STUDY || !!getKey(currentModel().provider);
// keys saved by the first version of the widget (single slot) move to their provider's slot
for (const area of [S, L]) {
  const old = store.get(area, K.key);
  if (!old) continue;
  const p = Object.keys(PROVIDERS).find((id) => PROVIDERS[id].keyOk(old));
  if (p && !store.get(area, keyName(p))) store.set(area, keyName(p), old);
  store.del(area, K.key);
}

// the conversation is shared between the app and the page widget for the length of the visit
export const loadHistory = () => readJSON(S, K.history, []);
export const saveHistory = (h) => store.set(S, K.history, JSON.stringify(h.slice(-30)));

export const localize = (url) => url.startsWith(LIVE_BASE) ? ROOT + url.slice(LIVE_BASE.length) : url;

// ---------- knowledge + retrieval ----------
let knowledgePromise = null;
let manualVersion = ""; // fingerprint of the manual text searched (first 12 hex of its SHA-256), kept with each study record
export function loadKnowledge() {
  knowledgePromise ??= fetch(ROOT + "chatbot/nicu-manual-knowledge.md")
    .then((r) => { if (!r.ok) throw new Error("Could not load the manual text (" + r.status + ")."); return r.text(); })
    .then(async (md) => {
      try {
        const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(md));
        manualVersion = [...new Uint8Array(d)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch {}
      return { sections: parseSections(md), chapters: parseChapters(md) };
    })
    .catch((e) => { knowledgePromise = null; throw e; });
  return knowledgePromise;
}
export const loadSections = () => loadKnowledge().then((k) => k.sections);
function parseSections(md) {
  const out = [];
  for (const block of md.split(/\n(?=## )/)) {
    const m = block.match(/^## (.+)\nURL: (\S+)\n([\s\S]*)$/);
    if (!m) continue;
    const text = m[3].replace(/\n# [^\n]*\nURL: \S+\s*$/, "").trim();
    if (text) out.push({ title: m[1].trim(), url: m[2], text });
  }
  out.forEach((s, i) => { s.id = i + 1; s.tokens = tokenize(s.title + " " + s.title + " " + s.text); });
  return out;
}
function parseChapters(md) {
  return [...md.matchAll(/^# (.+)\nURL: (\S+)$/gm)].slice(1).map((m) => ({ title: m[1].trim(), url: m[2] }));
}
const STOP = new Set(("a an and are as at be by can do does for from has have how i if in is it its of on or " +
  "should that the their there this to was we what when where which who why will with you your our me my " +
  "please tell about").split(" "));
// crude stemming so cool/cooling/cooled and feed/feeds/feeding match
function stem(t) {
  if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  return t;
}
export function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9.%/+-]+/g, " ").split(" ")
    .map((t) => t.replace(/^[.%/+-]+|[.%/+-]+$/g, ""))
    .filter((t) => t && !STOP.has(t))
    .map(stem);
}
// Unit shorthand -> the manual's wording. A starter list, not exhaustive: questions the
// manual "doesn't address" are also retried after the model rewrites them in formal terms.
const GLOSSARY = [
  [/\bcool(ing|ed)?\b/, "therapeutic hypothermia TH hypoxic ischemic encephalopathy HIE cooling"],
  [/\bbili\b/, "bilirubin hyperbilirubinemia phototherapy"],
  [/\blights\b/, "phototherapy bilirubin"],
  [/\bsurf\b/, "surfactant LISA"],
  [/\bjet\b/, "HFJV high frequency jet ventilation"],
  [/\b(oscillator|oscillate|oscillating|osc)\b/, "HFOV high frequency oscillatory ventilation"],
  [/\b(nows|withdrawal)\b/, "neonatal abstinence syndrome NAS opioid withdrawal"],
  [/\bhead bleed\b/, "intraventricular hemorrhage IVH head ultrasound"],
  [/\bhus\b/, "head ultrasound"],
  [/\blines?\b/, "central line UVC UAC PICC"],
  [/\b(mbm|ebm)\b/, "breast milk mother's milk"],
  [/\bdbm\b/, "donor breast milk"],
  [/\blytes\b/, "electrolytes"],
  [/\b(synagis|beyfortus|nirsevimab|palivizumab)\b/, "RSV prevention"],
  [/\bnitric\b/, "inhaled nitric oxide iNO"],
  [/\bsats\b/, "oxygen saturation"],
  [/\bductus\b/, "PDA patent ductus arteriosus"],
  [/\b(mother[- ]baby|well baby|newborn nursery)\b/, "family care center FCC"],
];
export function expandQuery(q) {
  const lower = q.toLowerCase();
  return [q, ...GLOSSARY.filter(([re]) => re.test(lower)).map(([, add]) => add)].join(" ");
}
// BM25 over sections, best first, within a character budget
export function retrieve(sections, query, maxSections = 20, maxChars = 60000) {
  const q = [...new Set(tokenize(query))];
  if (!q.length) return [];
  const N = sections.length;
  const avg = sections.reduce((a, s) => a + s.tokens.length, 0) / N;
  const df = Object.fromEntries(q.map((t) => [t, sections.filter((s) => s.tokens.includes(t)).length]));
  const scored = sections.map((s) => {
    let score = 0;
    for (const t of q) {
      if (!df[t]) continue;
      const tf = s.tokens.filter((x) => x === t).length;
      if (!tf) continue;
      const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * s.tokens.length / avg));
    }
    return { s, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.s);
  // Guidelines are split into small sections (e.g. Criteria A / Criteria B / Exclusion), so the
  // best hits bring the rest of their subsection along: top hits, then their families, then the rest.
  const ordered = [], seen = new Set();
  const add = (s) => { if (!seen.has(s.id)) { seen.add(s.id); ordered.push(s); } };
  const top = scored.slice(0, 3);
  top.forEach(add);
  for (const s of top) {
    const parent = s.title.split(" › ").slice(0, -1).join(" › ");
    if (parent.split(" › ").length < 2) continue; // never pull in a whole chapter
    const family = sections.filter((x) => x.title === parent || x.title.startsWith(parent + " › "));
    if (family.reduce((a, x) => a + x.text.length, 0) <= 20000) family.forEach(add);
  }
  scored.forEach(add);
  const picked = [];
  let chars = 0;
  for (const s of ordered) {
    if (picked.length >= maxSections) break;
    const text = s.text.length > 12000 ? s.text.slice(0, 12000) + "\n[section truncated]" : s.text;
    if (chars + text.length > maxChars && picked.length) continue;
    picked.push({ ...s, text });
    chars += text.length;
  }
  return picked;
}
// letters/digits only (plus a few symbols), so quotes match regardless of markdown, spacing and table cells
export function squashChar(c) {
  if (/\s/.test(c) || "*_`|\\#>".includes(c)) return "";
  if (c === "‘" || c === "’") return "'";
  if (c === "“" || c === "”") return '"';
  return c.toLowerCase();
}
export const squash = (t) => [...t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/^\s*([-*•]|\d+[.)])\s+/gm, "")].map(squashChar).join(""); // list markers aren't page text

// ---------- the model call ----------
function buildMessages(history, question, excerpts, interpreted = "") {
  const msgs = [];
  for (const m of history.slice(-6)) {
    if (m.role === "user") msgs.push({ role: "user", content: m.text });
    else if (m.role === "assistant" && !m.error)
      msgs.push({ role: "assistant", content: (m.external ? "[Answer from outside the manual] " : "") + m.text +
        (m.neo ? "\n[From In[Neo]Sight articles, not the manual] " + m.neo.text : "") });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const ctx = excerpts.length
    ? excerpts.map((s) => `<excerpt id="${s.id}" title="${s.title.replace(/"/g, "'")}">\n${s.text}\n</excerpt>`).join("\n\n")
    : "(no matching excerpts found)";
  const interp = interpreted ? `\n(In formal terms: ${interpreted})` : "";
  msgs.push({ role: "user", content: `<manual_excerpts>\n${ctx}\n</manual_excerpts>\n\nQuestion: ${question}${interp}` });
  return msgs;
}

let sdk = null;
let status = () => {}; // progress callback for the request in flight
async function askClaude(key, model, { system, schema, messages, maxTokens = 8000 }) {
  sdk ??= await import(SDK_URL);
  const Anthropic = sdk.default;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const params = { model, max_tokens: maxTokens, system, messages,
    output_config: { effort: "low", format: { type: "json_schema", schema } } };
  let resp;
  try {
    resp = FALLBACK_MODELS.includes(model)
      ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(params);
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError) || !FALLBACK_MODELS.includes(model)) throw e;
    resp = await client.messages.create(params); // retry once without the fallback beta
  }
  if (resp.stop_reason === "refusal") throw new Error("The model declined to answer this question.");
  if (resp.stop_reason === "max_tokens") throw new Error("The answer was cut off. Try a narrower question.");
  const text = resp.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from the model.");
  return JSON.parse(text);
}
// OpenAI and xAI share the chat-completions request shape
const CHAT_URLS = { openai: "https://api.openai.com/v1/chat/completions", xai: "https://api.x.ai/v1/chat/completions" };
async function askChatCompletions(provider, key, model, { system, schema, messages }) {
  const body = { model, messages: [{ role: "system", content: system }, ...messages],
    response_format: { type: "json_schema", json_schema: { name: "manual_response", schema, strict: true } } };
  body.reasoning_effort = "low"; // OpenAI and xAI: full reasoning made Grok 4.7 answers ~4x slower, no better (2026-10-29 test)
  const send = () => fetch(CHAT_URLS[provider], {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  let r = await send();
  if (r.status === 429) { // one retry after the provider's suggested wait (max 20 s)
    const wait = Math.min(20, Number(r.headers.get("retry-after")) || 5);
    const peek = await r.clone().text();
    if (!/quota|credit|billing|balance/i.test(peek)) {
      status(`Rate limited; retrying in ${wait} s…`);
      await new Promise((res) => setTimeout(res, wait * 1000));
      r = await send();
    }
  }
  if (!r.ok) throw await httpError(provider, r);
  const data = await r.json();
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new Error("The model declined to answer this question.");
  if (choice?.finish_reason === "length") throw new Error("The answer was cut off. Try a narrower question.");
  return JSON.parse(choice?.message?.content || "{}");
}
// The study's key: the server function adds the instructions for this kind of request (chatbot/prompts.js)
let lastModel = ""; // model version the provider reported for the latest answer
let lastCitations = []; // pages the study's web search cited for the latest answer
async function askStudy(kind, messages) {
  const r = await fetch(ROOT + "api/ask", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, messages }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`Ask error ${r.status}${data.detail ? ": " + data.detail.slice(0, 200) : ""}`);
    err.status = r.status; err.study = data.error;
    throw err;
  }
  if (data.refusal) throw new Error("The model declined to answer this question.");
  if (data.finish === "length") throw new Error("The answer was cut off. Try a narrower question.");
  lastModel = data.model || "";
  lastCitations = Array.isArray(data.citations) ? data.citations : [];
  return data.content || "";
}
// ---------- In[Neo]Sight articles: searched automatically when the manual has no answer, or when the user asks ----------

// through the site's /api/neo (preview/functions/api/neo.js), which holds In[Neo]Sight's key and allows 5 searches a minute
// per browser, counted by a random ID kept in this browser for that purpose only
let neoId; // kept in memory too, for browsers that block storage
function browserId() {
  neoId ??= store.get(L, "nicuChat.neoId");
  if (!neoId) {
    neoId = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    store.set(L, "nicuChat.neoId", neoId);
  }
  return neoId;
}
export const NEO_LIMIT = "In[Neo]Sight allows 5 searches a minute. Wait a minute and try again.";
async function searchNeo(terms) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try {
    r = await fetch(ROOT + "api/neo", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: terms.join(" ").slice(0, 500), browser: browserId() }), signal: ctrl.signal });
  } catch { return []; } // offline or blocked: the other options still show
  finally { clearTimeout(timer); }
  if (r.status === 429) throw Object.assign(new Error(NEO_LIMIT), { neoLimit: true });
  return r.ok ? (await r.json()).articles || [] : [];
}
async function answerFromNeo(ask, question, terms) {
  const articles = await searchNeo(terms);
  if (!articles.length) return null;
  const ctx = articles.map((a, i) => `<article id="${i + 1}" title="${a.title.replace(/"/g, "'")}" reviewed="${a.reviewed}">\n${a.text}\n</article>`).join("\n\n");
  const out = await ask({ kind: "neo", system: NEO_SYSTEM, schema: SCHEMA, maxTokens: 4000,
    messages: [{ role: "user", content: `<inneosight_articles>\n${ctx}\n</inneosight_articles>\n\nQuestion: ${question}` }] });
  if (!out || out.not_in_manual) return null;
  const used = [...new Set((out.sources || []).map((s) => s.id))].map((id) => articles[id - 1]).filter(Boolean);
  return { text: out.answer, articles: (used.length ? used : articles).map((a) => ({ title: a.title, url: a.url, reviewed: a.reviewed })) };
}
// The user asked for In[Neo]Sight on an answer the manual gave (history[msgIndex]). Returns {neo} (null when no article
// fits) or {error}.
export async function checkNeo(history, msgIndex) {
  const started = Date.now();
  const model = currentModel(), provider = model.provider, key = getKey(provider);
  const before = history.slice(0, msgIndex).filter((m) => m.role === "user"), user = before.at(-1) || {};
  const prior = before.at(-2)?.text || "";
  let neo = null, error = "";
  try { neo = await answerFromNeo(asker(provider, key, model.id), user.text || "", [...new Set(tokenize((user.text || "") + " " + prior))]); }
  catch (e) { error = e?.neoLimit ? e.message : friendlyError(e, provider); }
  if (STUDY) record({ conversation: conversationId(false), turn: Math.max(1, before.length), kind: "inneosight", question: user.text || "",
    phi_removed: (user.removed || []).join(", "), seconds: (Date.now() - started) / 1000,
    ...recordOf(error ? { error: true, text: error } : { text: neo ? neo.text : "No In[Neo]Sight article covers this question.", neo }) });
  return error ? { error } : { neo };
}

// ---------- answers from outside the manual (only when the user asks for them) ----------

async function askExternal(provider, key, model, messages) {
  if (provider === "study") return askStudy("external", messages);
  if (provider === "anthropic") {
    sdk ??= await import(SDK_URL);
    const client = new sdk.default({ apiKey: key, dangerouslyAllowBrowser: true });
    const resp = await client.messages.create({ model, max_tokens: 4000, system: EXTERNAL_SYSTEM, messages,
      output_config: { effort: "low" } });
    if (resp.stop_reason === "refusal") throw new Error("The model declined to answer this question.");
    return resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  }
  const r = await fetch(CHAT_URLS[provider], { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, messages: [{ role: "system", content: EXTERNAL_SYSTEM }, ...messages], reasoning_effort: "low" }) });
  if (!r.ok) throw await httpError(provider, r);
  return (await r.json()).choices?.[0]?.message?.content || "";
}
// Web search: the study's Grok and a personal xAI key (Responses API), or a personal Claude key (its web search tool);
// other keys answer from general knowledge instead. Returns {text, cites: [{url, title}]}.
const canSearchWeb = (provider) => provider === "study" || provider === "xai" || provider === "anthropic";
async function askWeb(provider, key, model, messages) {
  if (provider === "study") { const text = await askStudy("web", messages); return { text, cites: lastCitations }; }
  if (provider === "anthropic") {
    sdk ??= await import(SDK_URL);
    const client = new sdk.default({ apiKey: key, dangerouslyAllowBrowser: true });
    // the dynamic-filtering version needs Opus or Sonnet; other models take the basic one
    const tool = /^claude-(opus|sonnet)-/.test(model) ? "web_search_20260209" : "web_search_20250305";
    const resp = await client.messages.create({ model, max_tokens: 8000, system: WEB_SYSTEM, messages,
      tools: [{ type: tool, name: "web_search", max_uses: 3 }], output_config: { effort: "low" } });
    if (resp.stop_reason === "refusal") throw new Error("The model declined to answer this question.");
    // Claude cites per passage: put a link after each cited passage so the numbering below matches
    let text = "";
    for (const b of resp.content) if (b.type === "text") {
      const urls = [...new Set((b.citations || []).filter((c) => c.url).map((c) => c.url))];
      text += b.text + urls.map((u) => ` [[c]](${u})`).join("");
    }
    const cites = resp.content.flatMap((b) => b.type === "text" ? (b.citations || []) : []).filter((c) => c.url)
      .map((c) => ({ url: c.url, title: c.title || "" }));
    return { text, cites };
  }
  const r = await fetch("https://api.x.ai/v1/responses", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, input: [{ role: "system", content: WEB_SYSTEM }, ...messages], tools: [{ type: "web_search" }],
      reasoning: { effort: "low" } }) });
  if (!r.ok) throw await httpError(provider, r);
  const web = readWebReply(await r.json());
  if (web.refusal) throw new Error("The model declined to answer this question.");
  if (web.finish === "length") throw new Error("The answer was cut off. Try a narrower question.");
  return web;
}
// Inline links ("[[1]](url)") become plain numbers ("[1]") that match the source list, numbered by first mention;
// without inline links, the cited pages are listed unnumbered.
const realTitle = (t) => t && !/^(\d+|https?:\/\/\S*)$/.test(t) ? t : ""; // Grok's titles are often just a number or the URL
function numberWebSources({ text, cites }) {
  const nums = new Map(), sources = [], title = new Map((cites || []).filter((c) => realTitle(c.title)).map((c) => [c.url, c.title]));
  const add = (url) => { if (!nums.has(url)) { nums.set(url, sources.length + 1); sources.push({ url, title: title.get(url) || "", n: sources.length + 1 }); } return nums.get(url); };
  text = (text || "").replace(/\s*\[\[?([^\]]*)\]?\]\((https?:\/\/[^\s)]+)\)/g, (all, label, url) => /^(\d+|c)$/.test(label) ? ` [${add(url)}]` : all)
    .replace(/(\[\d+\])(\s*\1)+/g, "$1")
    .replace(/\s*\[web:\d+\]/g, ""); // Grok's search-result numbers: no link to tell which page, so dropped (the text names its sources)
  const start = text.indexOf("**Answer:**");
  if (start > 0) text = text.slice(start); // a line written before searching ("I'll look up …")
  if (!sources.length) for (const c of cites || []) if (!nums.has(c.url) && sources.length < 8) { nums.set(c.url, 0); sources.push({ url: c.url, title: realTitle(c.title) }); }
  return { text, sources };
}
async function httpError(provider, r) {
  const detail = await r.text();
  const err = new Error(`${PROVIDERS[provider].name} error ${r.status}: ${detail.slice(0, 200)}`);
  err.status = r.status;
  try { err.error = { error: JSON.parse(detail).error }; } catch {}
  return err;
}
export function friendlyError(e, provider) {
  const code = e?.status;
  if (provider === "study") {
    if (e?.study === "cap") return "Ask is resting until tomorrow (the study's daily limit was reached). Use Search at the top of the page in the meantime.";
    if (code === 429) return "The AI service is busy. Try again in a minute.";
    if (code >= 500) return "The AI service is busy or unavailable. Try again shortly.";
    if (e instanceof TypeError) return "Couldn't reach Ask. Check your connection.";
    return e?.message || String(e);
  }
  if (code === 401 || (code === 400 && /api key/i.test(e.message))) return "Your API key was rejected. Check it in settings (⚙).";
  // OpenAI omits CORS headers on error replies, so a bad key surfaces as a network failure
  if (provider === "openai" && e instanceof TypeError)
    return "Couldn't get a reply from OpenAI. Check your OpenAI key in settings (⚙) and your connection.";
  if (code === 403) return "This API key doesn't have access to that model.";
  if (code === 429) {
    // show the provider's own reason: no credit and per-minute limits both come back as 429
    const detail = e?.error?.error?.message || e?.error?.message || "";
    if (/quota|credit|billing|balance/i.test(detail + e.message))
      return "Your API account has no available credit. Add billing/credit in the provider's console. (" + detail.slice(0, 160) + ")";
    return "The provider's per-minute limit for your API account was reached" +
      (detail ? ": " + detail.slice(0, 200) : ".") + " New accounts start with low limits that rise with usage.";
  }
  if (code >= 500) return "The AI service is busy or unavailable. Try again shortly.";
  if (code === 400) return "The request was rejected: " + (e?.error?.error?.message || e.message);
  if (sdk && e instanceof sdk.default.APIConnectionError || e instanceof TypeError)
    return "Couldn't reach the AI service. Check your connection.";
  return e?.message || String(e);
}

// Answer a question from the manual. `past` is the conversation before this question; `removed` lists the patient
// details replaced in it (prepareQuestion). Returns the assistant message to append (never throws).
// In the study, each answer is also recorded for the answer review.
export async function answerQuestion(question, past, onStatus = () => {}, { removed = [] } = {}) {
  const started = Date.now();
  const turn = past.filter((m) => m.role === "user").length + 1;
  const conversation = STUDY && conversationId(turn === 1);
  const reply = await answerFromManual(question, past, onStatus);
  if (STUDY) record({ conversation, turn, kind: "manual", question, phi_removed: removed.join(", "),
    seconds: (Date.now() - started) / 1000, ...recordOf(reply) });
  return reply;
}
// one structured request (system, schema, messages) to the chosen model; returns the parsed reply
function asker(provider, key, modelId) {
  return (req) => provider === "study" ? askStudy(req.kind, req.messages).then((c) => JSON.parse(c || "{}"))
    : provider === "anthropic" ? askClaude(key, modelId, req)
    : askChatCompletions(provider, key, modelId, req);
}
async function answerFromManual(question, past, onStatus) {
  const st = settings(), model = currentModel(), provider = model.provider, key = getKey(provider);
  status = onStatus;
  const prior = past.filter((m) => m.role === "user").slice(-1).map((m) => m.text).join(" ");
  try {
    const sections = await loadSections();
    const ask = asker(provider, key, model.id);
    const answer = (excerpts, interpreted) =>
      ask({ kind: "answer", system: SYSTEM, schema: SCHEMA, messages: buildMessages(past, question, excerpts, interpreted) });
    let excerpts = retrieve(sections, expandQuery(question + " " + prior));
    let out = excerpts.length ? await answer(excerpts) : null;
    let rephrased = "", terms = [];
    if (!out || out.not_in_manual) {
      // second try: have the model restate the question in formal terms, then search again
      onStatus("Rephrasing and searching again…");
      const rq = await ask({ kind: "rephrase", system: REPHRASE_SYSTEM, schema: REPHRASE_SCHEMA, maxTokens: 2000,
        messages: [{ role: "user", content: (prior ? `Earlier question: ${prior}\n` : "") + `Question: ${question}` }] });
      terms = rq.terms || [];
      const again = retrieve(sections, expandQuery([rq.question, ...terms, question].join(" ")));
      if (again.some((s) => !excerpts.some((e) => e.id === s.id))) { // only re-ask if the search found something new
        rephrased = (rq.question || "").trim();
        excerpts = again;
        out = await answer(excerpts, rephrased);
      }
    }
    out ??= { answer: "The manual does not address this. Check with the attending neonatologist or pharmacy.",
      not_in_manual: true, sources: [] };
    let neo = null, neoNote = "";
    if (out.not_in_manual) {
      onStatus("Checking In[Neo]Sight articles…");
      // the question's own words first: In[Neo]Sight uses only the first 12 (a trial name typed by the user must survive)
      const words = [...new Set(tokenize(question + " " + terms.join(" ")))];
      neo = await answerFromNeo(ask, question, words).catch((e) => { if (e?.neoLimit) neoNote = e.message; return null; });
    }
    const byId = new Map(excerpts.map((s) => [s.id, s]));
    const seen = new Set();
    const sources = (out.sources || []).filter((s) => byId.has(s.id) && !seen.has(s.id) && seen.add(s.id)).map((s) => {
      const sec = byId.get(s.id);
      const ok = s.quote && squash(sec.text).includes(squash(s.quote));
      return { title: sec.title, url: sec.url, quote: ok ? s.quote : "" };
    });
    return { role: "assistant", text: out.answer || "(no answer)", rephrased, neo, ...(neoNote ? { neoNote } : {}),
      sources: out.not_in_manual ? sources.slice(0, 1) : sources, offerExternal: !!out.not_in_manual };
  } catch (e) {
    return { role: "assistant", error: true, text: friendlyError(e, provider) };
  }
}
// The user chose to go outside the manual for the question answered at history[msgIndex].
export async function answerOutside(history, msgIndex) {
  const started = Date.now();
  const reply = await answerOutsideManual(history, msgIndex);
  if (STUDY) {
    const before = history.slice(0, msgIndex).filter((m) => m.role === "user"), user = before.at(-1) || {};
    record({ conversation: conversationId(false), turn: Math.max(1, before.length), kind: reply.external === "ai" ? "general_ai" : "web",
      question: user.text || "", phi_removed: (user.removed || []).join(", "), seconds: (Date.now() - started) / 1000,
      ...recordOf({ ...reply, sources: (reply.webSources || []).map((w) => ({ title: w.title, url: w.url })) }) });
  }
  return reply;
}
async function answerOutsideManual(history, msgIndex) {
  const model = currentModel(), provider = model.provider, key = getKey(provider);
  const q = history.slice(0, msgIndex).reverse().find((m) => m.role === "user")?.text || "";
  try {
    const messages = [];
    for (const m of history.slice(0, msgIndex - 1).slice(-4)) {
      if (m.role === "user") messages.push({ role: "user", content: m.text });
      else if (!m.error) messages.push({ role: "assistant", content: m.text });
    }
    while (messages.length && messages[0].role !== "user") messages.shift();
    messages.push({ role: "user", content: q });
    const ai = shortLabel(model);
    if (canSearchWeb(provider)) {
      const { text, sources } = numberWebSources(await askWeb(provider, key, model.id, messages));
      return { role: "assistant", external: "web", text: text || "(no answer)", webSources: sources, ai,
        ...(sources.length || outOfScope(text) ? {} : { noWeb: "uncited" }) };
    }
    const text = await askExternal(provider, key, model.id, messages);
    return { role: "assistant", external: "ai", text: text || "(no answer)", ai, ...(outOfScope(text) ? {} : { noWeb: "off" }) };
  } catch (e) {
    return { role: "assistant", error: true, text: friendlyError(e, provider) };
  }
}

// the model's reply to a question outside neonatal-perinatal and maternal-fetal medicine (prompts.js)
const outOfScope = (text) => (text || "").includes(OUT_OF_SCOPE.slice(0, 60));
// The warning on an answer from outside the manual that no web page backs: web search is off for this AI, or it cited none
export function noWebWarning(m) {
  if (m.noWeb === "off") return `Web search is off for ${m.ai || "this AI"}: this answer comes only from what the model learned in training. It may be out of date and has no sources to check.`;
  if (m.noWeb === "uncited") return `${m.ai || "The AI"} cited no web pages, so this answer may come from its training rather than a web search. It may be out of date and has no sources to check.`;
  return "";
}

// ---------- study record of each answer (the site's /api/ask-log), for the answer review ----------
// A random conversation ID, new for each chat (first question), kept for the visit; no person or device ID.
function conversationId(fresh) {
  let id = fresh ? "" : store.get(S, "nicuChat.conv");
  if (!id) {
    id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
    store.set(S, "nicuChat.conv", id);
  }
  return id;
}
const recordOf = (m) => ({ model: lastModel || STUDY.model, manual_version: manualVersion, ...(m.error ? { error: m.text } : {
  answer: m.text, rephrased: m.rephrased || "", not_in_manual: !!m.offerExternal, sources: m.sources || [], inneosight: m.neo || null }) });
function record(rec) {
  // keepalive: still sent if the person opens a source in the manual right away
  try {
    fetch(ROOT + "api/ask-log", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec) }).catch(() => {});
  } catch {}
}

// ---------- patient information (PHI): never sent to the AI services ----------
// The 18 HIPAA Safe Harbor identifiers, with NICU examples
export const PHI_ITEMS = [
  "Names: the baby's, parents', or family members' (including \"Baby Girl Smith\")",
  "Addresses, cities, counties, or ZIP codes",
  "Any date tied to the patient except the year: birth, admission, discharge, procedure, or death dates",
  "Ages over 89 (for family members)",
  "Phone and fax numbers",
  "Email addresses",
  "Social Security numbers",
  "Medical record numbers (MRN)",
  "Health plan or insurance numbers",
  "Account or billing numbers",
  "Certificate or license numbers",
  "Vehicle identifiers, including license plates",
  "Device identifiers and serial numbers",
  "Web addresses (URLs) tied to the patient",
  "IP addresses",
  "Fingerprints, voiceprints, or other biometrics",
  "Photos of the patient's or family's face",
  "Any other unique number, code, or detail that could identify the patient (for example a bed number with a date)",
];
export function phiNoticeHTML(lead = "") {
  return `<details class="nc-phi"><summary><b>Never enter patient information (PHI).</b> ${lead}What counts?</summary>
    <p>Your question goes to an outside AI company. Leave out all of these:</p>
    <ul>${PHI_ITEMS.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p><b>Safe to ask:</b> gestational age, weight, day of life, lab values, and clinical findings, with no names or dates.</p></details>`;
}
// Things in a question that look like patient information; empty when nothing is found
const MONTH = "jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?"; // "May" is checked case-sensitively below
const PHI_CHECKS = [
  ["a date", new RegExp(`\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b(${MONTH})\\.? \\d{1,2}(st|nd|rd|th)?\\b`, "i")],
  ["a date", /\bMay \d{1,2}(st|nd|rd|th)?\b/],
  ["a record or ID number", /\b\d{7,}\b|\b(mrn|dob|ssn)\b/i],
  ["a phone number", /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/],
  ["an email address", /[\w.+-]+@[\w-]+\.[\w.]+/],
  ["a name", /\b[Bb]aby ([Bb]oy|[Gg]irl) [A-Z][a-z]+|\b(Mr|Mrs|Ms|Miss)\.? [A-Z][a-z]+/],
];
export const phiFlags = (text) => [...new Set(PHI_CHECKS.filter(([, re]) => re.test(text)).map(([label]) => label))];
// In the study, what was found is replaced by a tag before the question goes anywhere (email and phone first,
// so their digits aren't taken for a record number)
const PHI_TAGS = [["an email address", "[email]"], ["a phone number", "[phone]"], ["a date", "[date]"],
  ["a record or ID number", "[ID]"], ["a name", "[name]"]];
const STRIP_ID = /\b\d{7,}\b/; // the number itself; words like "MRN" or "DOB" stay
export function phiStrip(text) {
  const removed = [];
  for (const [label, tag] of PHI_TAGS) {
    const res = label === "a record or ID number" ? [STRIP_ID] : PHI_CHECKS.filter(([l]) => l === label).map(([, re]) => re);
    for (const re of res) {
      if (!re.test(text)) continue;
      text = text.replace(new RegExp(re.source, re.flags + "g"), tag);
      if (!removed.includes(label)) removed.push(label);
    }
  }
  return { text, removed };
}
// The question to send, or null if the person cancels: in the study, patient details are replaced automatically;
// with a personal key, the person is warned and decides.
export function prepareQuestion(text) {
  if (STUDY) return phiStrip(text);
  return phiConfirm(text) ? { text, removed: [] } : null;
}
export function phiConfirm(text) {
  const flags = phiFlags(text);
  return !flags.length || confirm(`This question may contain patient information (${flags.join(", ")}).\n\nRemove it before asking. Send anyway?`);
}

// ---------- highlighting a quote inside any element ----------
export function clearHighlights(scope = document) {
  scope.querySelectorAll("mark.nicu-hl").forEach((m) => m.replaceWith(...m.childNodes));
}
// Wraps the quote's text in <mark class="nicu-hl"> inside `container`; returns the marks (empty if not found).
export function highlightIn(container, quote) {
  if (!quote) return [];
  const nodes = [], map = [];
  let flat = "";
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, { acceptNode: (n) =>
    n.parentElement.closest("script,style,#nicu-chat-root,.anchorjs-link") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const ni = nodes.push(n) - 1;
    for (let i = 0; i < n.data.length; i++) {
      const c = squashChar(n.data[i]);
      if (c) { flat += c; map.push([ni, i]); }
    }
  }
  let needle = squash(quote), at = flat.indexOf(needle);
  if (at < 0 && needle.length > 30) { needle = needle.slice(0, 30); at = flat.indexOf(needle); }
  if (at < 0) return [];
  const [sn, so] = map[at], [en, eo] = map[at + needle.length - 1];
  const marks = [];
  for (let ni = en; ni >= sn; ni--) {
    let node = nodes[ni];
    const s = ni === sn ? so : 0, e = ni === en ? eo + 1 : node.data.length;
    if (e <= s || !node.data.slice(s, e).trim()) continue;
    if (s > 0) node = node.splitText(s);
    if (e - s < node.data.length) node.splitText(e - s);
    const mark = document.createElement("mark");
    mark.className = "nicu-hl";
    node.replaceWith(mark);
    mark.appendChild(node);
    marks.unshift(mark);
  }
  return marks;
}

// ---------- tiny markdown renderer (escaped first) ----------
export function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1").replace(/~(\w+)~/g, "<sub>$1</sub>").replace(/\^(\w+)\^/g, "<sup>$1</sup>")
    .replace(/\\([&<>*_\\[\]#|-])/g, "$1");
}
// Answers use bullets, numbers and **bold**; manual sections (shown in the app) also have tables and headings.
export function renderMd(md) {
  const out = [];
  let list = null, table = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeTable = () => { if (table) { out.push("</tbody></table></div>"); table = null; } };
  let fence = false;
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) { // diagrams (mermaid) and code: point to the manual instead of showing source
      if (!fence) { closeList(); closeTable(); out.push('<p class="nc-note">[Diagram: open in manual]</p>'); }
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/^\s*\|.*\|\s*$/.test(line)) { // pipe table row
      closeList();
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue; // header separator
      if (!table) { out.push('<div class="nc-table"><table><tbody>'); table = true; }
      out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
      continue;
    }
    closeTable();
    if (line.trim() === "[image]") { closeList(); out.push('<p class="nc-note">[Image: open in manual]</p>'); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); out.push(`<p class="nc-h">${inline(h[2])}</p>`); continue; }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const kind = ul ? "ul" : ol ? "ol" : null;
    if (kind) {
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      const item = (ul || ol)[1], mark = { "✓": "nc-met", "✗": "nc-unmet", "?": "nc-unknown" }[item[0]];
      out.push(mark ? `<li class="nc-crit ${mark}"><b>${item[0]}</b><span>${inline(item.slice(1).trim())}</span></li>`
        : `<li>${inline(item)}</li>`);
      continue;
    }
    closeList();
    if (line.trim()) out.push(`<p>${inline(line.trim())}</p>`);
  }
  closeList(); closeTable();
  return out.join("");
}

// sources grouped by guideline: the guideline name once, then a short tag per subsection
export function renderSources(sources, msgIndex) {
  if (!sources.length) return "";
  const groups = new Map();
  sources.forEach((s, j) => {
    const parts = s.title.split(" › ");
    const head = parts.length > 2 ? parts[1] : parts[0];
    let leaf = parts.length > 1 ? parts[parts.length - 1] : "Open section";
    if (leaf.length > 32 && leaf.includes(":")) leaf = leaf.split(":")[0];
    leaf = leaf.replace(/:$/, "");
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(`<button type="button" class="nc-chip" data-msg="${msgIndex}" data-src="${j}" title="${esc(s.title)}">${esc(leaf)}</button>`);
  });
  const body = [...groups].map(([head, chips]) => `<div class="nc-sg"><span>${esc(head)}</span>${chips.join("")}</div>`).join("");
  return `<div class="nc-src"><b>Sources</b>${body}</div>`;
}
const siteOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
// One chat message as HTML (classes styled by the widget and the app).
export function renderMessage(m, i, busy) {
  if (m.role === "user") return `<div class="nc-msg nc-user">${esc(m.text)}</div>` +
    (m.removed?.length ? `<p class="nc-note nc-removed">Removed before sending: ${esc(m.removed.join(", "))}</p>` : "");
  if (m.error) return `<div class="nc-msg nc-bot nc-err">${esc(m.text)}</div>`;
  if (m.external) return `<div class="nc-msg nc-bot nc-ext"><div class="nc-ext-banner">⚠ Not from the KP manual — ${m.external === "web"
    ? "AI summary of web sources" : "general AI knowledge"}</div>${noWebWarning(m) ? `<p class="nc-noweb">⚠ ${esc(noWebWarning(m))}</p>` : ""}${renderMd(m.text)}${m.webSources?.length ? `<div class="nc-src"><b>Web sources</b>${
    m.webSources.map((w) => `<a class="nc-art" href="${esc(/^https?:\/\//i.test(w.url) ? w.url : "#")}" target="_blank" rel="noopener">${
      w.n ? `[${w.n}] ` : ""}${esc(w.title || siteOf(w.url))}${w.title ? ` <small>(${esc(siteOf(w.url))})</small>` : ""}</a>`).join("")}</div>` : ""}</div>`;
  const again = m.rephrased ? `<p class="nc-note">Searched again as: <i>${esc(m.rephrased)}</i></p>` : "";
  // In[Neo]Sight box: the research summary, or (the manual answered) the button, its progress, or why nothing came back
  const neoBody = m.neo ? `${renderMd(m.neo.text)}<div class="nc-src"><b>Articles</b>${m.neo.articles.map((a) =>
      `<a class="nc-art" href="${esc(/^https?:\/\//i.test(a.url) ? a.url : "#")}" target="_blank" rel="noopener">${esc(a.title)}${a.reviewed ? ` <small>(${esc(a.reviewed.slice(0, 7))})</small>` : ""}</a>`).join("")}</div>`
    : m.neoBusy ? `<p class="nc-neo-wait">Checking In[Neo]Sight articles…</p>`
    : m.neoNote ? `<p class="nc-neo-note">${esc(m.neoNote)}</p>`
    : m.offerExternal || m.externalAsked || busy ? "" // the manual had no answer: In[Neo]Sight was already searched
    : `<p>See what recent neonatal research says about this question (takes 10-25 seconds).</p>
      <button type="button" class="nc-btn nc-neo-btn" data-neo="1" data-msg="${i}">Check In[Neo]Sight research</button>`;
  const neo = neoBody ? `<div class="nc-neo" data-of="${i}"><div class="nc-ext-banner">Not from the KP manual — In[Neo]Sight research summaries</div>
    ${neoBody}</div>` : "";
  const web = canSearchWeb(currentModel().provider);
  const offer = m.offerExternal && !busy ? `<div class="nc-offer">${web
    ? `<p>${m.neo ? "Still need more?" : "Want to see what the web says?"} The AI searches the web and summarizes what it finds (neonatal-perinatal and maternal-fetal medicine questions only; takes up to a minute). It will <b>not</b> come from the KP manual or In[Neo]Sight: check the linked sources before acting.</p>
    <button type="button" class="nc-btn nc-ghost" data-ext="web" data-msg="${i}">Search the web (AI summary)</button>`
    : `<p>${m.neo ? "Still need more?" : "Want an answer from the AI's general knowledge?"} Neonatal-perinatal and maternal-fetal medicine questions only. It will <b>not</b> come from the KP manual or In[Neo]Sight and uses more of your API credit.</p>
    <p class="nc-noweb">⚠ Web search is off for ${esc(shortLabel(currentModel()))}: the answer comes only from what the model learned in training, may be out of date, and has no sources. To search the web, switch to a Grok or Claude model in Settings.</p>
    <button type="button" class="nc-btn nc-ghost" data-ext="ai" data-msg="${i}">Ask AI (general knowledge)</button>`}</div>` : "";
  return `<div class="nc-msg nc-bot">${again}${renderMd(m.text)}${renderSources(m.sources || [], i)}${neo}${offer}</div>`;
}

// ---------- settings form (model + key), rendered into any container ----------
export function renderSettings(container, { onSaved, onBack, extraHTML = "" }) {
  const st = settings(), current = modelInfo(st.model);
  if (STUDY) { // no model or key to choose: the study's Grok key
    container.innerHTML = `<div class="nc-set">
      <p class="nc-note">Ask uses <b>${esc(STUDY_MODEL.label)}</b> (xAI) through the study's account, so no API key is needed.</p>
      <label class="nc-check"><input id="nc-jump" type="checkbox"${st.autoJump ? " checked" : ""}> Open and highlight the source automatically</label>
      ${extraHTML}
      <div class="nc-disc"><b>Disclaimer</b>${disclaimerHTML()}</div>
      <div class="nc-row">
        <button type="button" class="nc-btn" data-set="save">Save</button>
        <button type="button" class="nc-btn nc-ghost" data-set="back">Back</button>
      </div></div>`;
    container.querySelector(".nc-set").addEventListener("click", (ev) => {
      const act = ev.target.closest("button")?.dataset.set;
      if (act === "back") onBack();
      else if (act === "save") {
        store.set(L, K.settings, JSON.stringify({ ...readJSON(L, K.settings, {}), autoJump: container.querySelector("#nc-jump").checked }));
        onSaved();
      }
    });
    return;
  }
  const opts = Object.entries(PROVIDERS).map(([pid, p]) =>
    `<optgroup label="${p.name}">` + MODELS.filter((m) => m.provider === pid).map((m) =>
      `<option value="${m.id}"${m.id === current.id ? " selected" : ""}>${esc(m.label)}</option>`).join("") + "</optgroup>").join("");
  container.innerHTML = `<div class="nc-set">
    <p class="nc-note">This assistant uses <b>your own API key</b> from Anthropic, OpenAI, or xAI. Your questions and the relevant manual sections go directly from this browser to that company and are billed to your account. Do not enter patient identifiers.</p>
    <label for="nc-model">AI model</label>
    <select id="nc-model">${opts}</select>
    <label for="nc-key" id="nc-key-label"></label>
    <input id="nc-key" type="password" autocomplete="off">
    <label class="nc-check"><input id="nc-remember" type="checkbox"${keyRemembered() ? " checked" : ""}> Remember on this device (don't check on shared NICU computers)</label>
    <label class="nc-check"><input id="nc-jump" type="checkbox"${st.autoJump ? " checked" : ""}> Open and highlight the source automatically</label>
    ${extraHTML}
    <div class="nc-disc"><b>Disclaimer</b>${disclaimerHTML()}</div>
    <div class="nc-row">
      <button type="button" class="nc-btn" data-set="save">Save</button>
      <button type="button" class="nc-btn nc-ghost" data-set="forget">Forget key</button>
      <button type="button" class="nc-btn nc-ghost" data-set="back">Back</button>
    </div>
    <p class="nc-note" id="nc-set-msg"></p></div>`;
  const $ = (s) => container.querySelector(s);
  const sync = () => { // show the selected model's provider key (each provider keeps its own)
    const provider = modelInfo($("#nc-model").value).provider, p = PROVIDERS[provider], key = getKey(provider);
    $("#nc-key-label").textContent = `${p.name} API key (${p.keyHint}, from ${p.console})`;
    $("#nc-key").placeholder = p.keyHint;
    $("#nc-key").value = key;
    $('[data-set="forget"]').hidden = !key;
    $('[data-set="back"]').hidden = !hasKey();
    $("#nc-set-msg").textContent = "";
  };
  sync();
  $("#nc-model").addEventListener("change", sync);
  container.querySelector(".nc-set").addEventListener("click", (ev) => {
    const act = ev.target.closest("button")?.dataset.set;
    if (act === "back") onBack();
    else if (act === "forget") { saveKey(modelInfo($("#nc-model").value).provider, "", false); sync(); }
    else if (act === "save") {
      const model = modelInfo($("#nc-model").value), p = PROVIDERS[model.provider];
      const key = $("#nc-key").value.trim(), remember = $("#nc-remember").checked;
      if (!p.keyOk(key)) { $("#nc-set-msg").textContent = `That doesn't look like an ${p.name} key (${p.keyHint}).`; return; }
      saveKey(model.provider, key, remember);
      // move the other providers' saved keys to match the "remember" choice
      for (const other of Object.keys(PROVIDERS)) if (other !== model.provider && getKey(other)) saveKey(other, getKey(other), remember);
      store.set(L, K.settings, JSON.stringify({ model: model.id, autoJump: $("#nc-jump").checked }));
      onSaved();
    }
  });
}

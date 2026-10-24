// NICU Manual chat engine, shared by the page widget (chatbot/widget.html) and the app (app.html).
// Runs entirely in the browser with the user's own API key (Anthropic, OpenAI, or xAI).

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
  { id: "grok-4.3", label: "Grok 4.3 (cheaper)", provider: "xai" },
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
export const currentModel = () => modelInfo(settings().model);
export const hasKey = () => !!getKey(currentModel().provider);
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
export function loadKnowledge() {
  knowledgePromise ??= fetch(ROOT + "chatbot/nicu-manual-knowledge.md")
    .then((r) => { if (!r.ok) throw new Error("Could not load the manual text (" + r.status + ")."); return r.text(); })
    .then((md) => ({ sections: parseSections(md), chapters: parseChapters(md) }))
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
const SYSTEM = `You answer questions for clinicians in the KP Riverside NICU using only excerpts from the KP Riverside Neonatal ICU Manual. Each excerpt has a numeric id, a breadcrumb title, and its text.

- Base every answer only on the excerpts. Do not add facts, doses, thresholds, or recommendations from general medical knowledge.
- Answer every part of the question (for example both "whether" and "how"), using the procedure or steps sections when the manual has them.
- Read criteria lists literally. Only treat bulleted criteria as all required when the manual says "all", "and", or "both"; when it says "either", "any", or "or", one criterion is enough; when it doesn't say, state that the manual lists these criteria without saying whether all are needed, rather than assuming.
- Format every answer the same way, as short markdown lines (no paragraphs longer than two sentences):
  1. First line: "**Bottom line:** " followed by the direct answer in one sentence: "Yes", "No", or "Depends on …".
  2. Then up to 6 bullets with the supporting details. For eligibility, indication, or criteria questions, give one bullet per criterion and start it with ✓ (met by the details given), ✗ (not met), or ? (not stated in the question), followed by the criterion in plain words and the patient's value.
  3. Make the bottom line follow the manual's any/all logic. For "either/any of" criteria: Yes if any criterion is met; Depends on the unknown ones if none is met but some are unknown; No only if every criterion is clearly not met. For "all of" criteria: No if any criterion is not met; Depends on the unknown ones if the rest are met; Yes only if all are met.
  4. If the manual gives an action or procedure, add "**Next step:** " with it (numbered steps for a procedure).
  5. If information the user didn't give would change the answer, end with "**To confirm:** " and ask the user about it directly, one short question per missing item (e.g. "Does the baby have increased work of breathing?"), so they can reply and get a final answer. When they reply, use the earlier question and your earlier answer to finish it.
- Give a well-rounded answer from the surrounding sections, not just the one matching line: for a treatment question, include the indication criteria, how to do it (procedure or order set), and any exclusions or cautions the manual lists.
- Use only labels that appear in the excerpts (such as a guideline's own "Criteria A"); never invent labels or numbering. When the manual uses a short label, spell out what it means rather than using it bare.
- Copy numbers, doses, rates, order names and codes, phone numbers, and times exactly as written, with units.
- If the excerpts do not answer the question, set not_in_manual to true, say "The manual does not address this," and suggest checking with the attending neonatologist or pharmacy. Do not fill the gap yourself.
- If excerpts conflict, or the answer depends on site (RMC vs. MVMC), gestational age, or weight, give each version.
- Say so when the manual marks something as pending, TBD, an open item, or temporarily suspended.
- For a dose, rate, or treatment decision, end with one line reminding that the manual does not replace clinical judgment.
- If the question contains patient names, MRNs, dates of birth, or other identifiers, do not repeat them and remind the user not to enter patient information.
- Keep it brief and clinical. Use markdown bullets and **bold** only. Do not include URLs or excerpt ids in the answer; source links are added automatically.

sources: list each excerpt you used, most important first, with its id and a quote copied character-for-character from that excerpt's text (one short sentence, phrase, or table row of at most 200 characters) that best supports the answer. Use an empty list when nothing applies.`;

const SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    not_in_manual: { type: "boolean" },
    sources: { type: "array", items: { type: "object",
      properties: { id: { type: "integer" }, quote: { type: "string" } },
      required: ["id", "quote"], additionalProperties: false } },
  },
  required: ["answer", "not_in_manual", "sources"],
  additionalProperties: false,
};

// Second try when the manual "doesn't address" a question: rewrite it in formal terms, search again
const REPHRASE_SYSTEM = `You help search a neonatal ICU manual. Rewrite the clinician's question as a clear, formal neonatal-perinatal medicine question, translating unit slang, shorthand, and abbreviations into standard clinical terms (for example, "cool" means therapeutic hypothermia for hypoxic-ischemic encephalopathy; "bili" means bilirubin). Then list 5-12 formal search terms, synonyms, and standard abbreviations that a hospital guideline on this topic would use. Do not answer the question. Leave out any patient identifiers.`;
const REPHRASE_SCHEMA = {
  type: "object",
  properties: { question: { type: "string" }, terms: { type: "array", items: { type: "string" } } },
  required: ["question", "terms"],
  additionalProperties: false,
};

function buildMessages(history, question, excerpts, interpreted = "") {
  const msgs = [];
  for (const m of history.slice(-6)) {
    if (m.role === "user") msgs.push({ role: "user", content: m.text });
    else if (m.role === "assistant" && !m.error)
      msgs.push({ role: "assistant", content: (m.external ? "[Answer from outside the manual] " : "") + m.text });
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
  if (provider === "openai") body.reasoning_effort = "low";
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
// ---------- answers from outside the manual (only when the user asks for them) ----------
const EXTERNAL_SYSTEM = `You are assisting a NICU clinician at KP Riverside. The unit's NICU manual does not cover this question, so the clinician asked for an answer from outside the manual.
- Answer concisely: at most 120 words. Start with "**Bottom line:** " and one sentence, then up to 4 short bullets.
- Say where evidence is limited or practice varies, and recommend confirming with the attending neonatologist, pharmacy, or KP policy before acting.
- Answer from general neonatal-perinatal knowledge. Never invent references, guideline names, or numbers. Do not repeat patient identifiers.
- Use markdown bullets and **bold** only; no URLs.`;

async function askExternal(provider, key, model, messages) {
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
    body: JSON.stringify({ model, messages: [{ role: "system", content: EXTERNAL_SYSTEM }, ...messages] }) });
  if (!r.ok) throw await httpError(provider, r);
  return (await r.json()).choices?.[0]?.message?.content || "";
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

// Answer a question from the manual. `past` is the conversation before this question.
// Returns the assistant message to append (never throws).
export async function answerQuestion(question, past, onStatus = () => {}) {
  const st = settings(), provider = modelInfo(st.model).provider, key = getKey(provider);
  status = onStatus;
  const prior = past.filter((m) => m.role === "user").slice(-1).map((m) => m.text).join(" ");
  try {
    const sections = await loadSections();
    const ask = (req) => provider === "anthropic" ? askClaude(key, st.model, req)
      : askChatCompletions(provider, key, st.model, req);
    const answer = (excerpts, interpreted) =>
      ask({ system: SYSTEM, schema: SCHEMA, messages: buildMessages(past, question, excerpts, interpreted) });
    let excerpts = retrieve(sections, expandQuery(question + " " + prior));
    let out = excerpts.length ? await answer(excerpts) : null;
    let rephrased = "";
    if (!out || out.not_in_manual) {
      // second try: have the model restate the question in formal terms, then search again
      onStatus("Rephrasing and searching again…");
      const rq = await ask({ system: REPHRASE_SYSTEM, schema: REPHRASE_SCHEMA, maxTokens: 2000,
        messages: [{ role: "user", content: (prior ? `Earlier question: ${prior}\n` : "") + `Question: ${question}` }] });
      const again = retrieve(sections, expandQuery([rq.question, ...(rq.terms || []), question].join(" ")));
      if (again.some((s) => !excerpts.some((e) => e.id === s.id))) { // only re-ask if the search found something new
        rephrased = (rq.question || "").trim();
        excerpts = again;
        out = await answer(excerpts, rephrased);
      }
    }
    out ??= { answer: "The manual does not address this. Check with the attending neonatologist or pharmacy.",
      not_in_manual: true, sources: [] };
    const byId = new Map(excerpts.map((s) => [s.id, s]));
    const seen = new Set();
    const sources = (out.sources || []).filter((s) => byId.has(s.id) && !seen.has(s.id) && seen.add(s.id)).map((s) => {
      const sec = byId.get(s.id);
      const ok = s.quote && squash(sec.text).includes(squash(s.quote));
      return { title: sec.title, url: sec.url, quote: ok ? s.quote : "" };
    });
    return { role: "assistant", text: out.answer || "(no answer)", rephrased,
      sources: out.not_in_manual ? sources.slice(0, 1) : sources, offerExternal: !!out.not_in_manual };
  } catch (e) {
    return { role: "assistant", error: true, text: friendlyError(e, provider) };
  }
}
// The user chose to go outside the manual for the question answered at history[msgIndex].
export async function answerOutside(history, msgIndex) {
  const st = settings(), provider = modelInfo(st.model).provider, key = getKey(provider);
  const q = history.slice(0, msgIndex).reverse().find((m) => m.role === "user")?.text || "";
  try {
    const messages = [];
    for (const m of history.slice(0, msgIndex - 1).slice(-4)) {
      if (m.role === "user") messages.push({ role: "user", content: m.text });
      else if (!m.error) messages.push({ role: "assistant", content: m.text });
    }
    while (messages.length && messages[0].role !== "user") messages.shift();
    messages.push({ role: "user", content: q });
    const text = await askExternal(provider, key, st.model, messages);
    return { role: "assistant", external: "ai", text: text || "(no answer)" };
  } catch (e) {
    return { role: "assistant", error: true, text: friendlyError(e, provider) };
  }
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
// One chat message as HTML (classes styled by the widget and the app).
export function renderMessage(m, i, busy) {
  if (m.role === "user") return `<div class="nc-msg nc-user">${esc(m.text)}</div>`;
  if (m.error) return `<div class="nc-msg nc-bot nc-err">${esc(m.text)}</div>`;
  if (m.external) return `<div class="nc-msg nc-bot nc-ext"><div class="nc-ext-banner">⚠ Not from the KP manual — general AI knowledge</div>
    ${renderMd(m.text)}</div>`;
  const again = m.rephrased ? `<p class="nc-note">Searched again as: <i>${esc(m.rephrased)}</i></p>` : "";
  const offer = m.offerExternal && !busy ? `<div class="nc-offer">
    <p>Want an answer from the AI's general knowledge? It will <b>not</b> come from the KP manual and uses more of your API credit.</p>
    <button type="button" class="nc-btn nc-ghost" data-ext="ai" data-msg="${i}">Ask AI (general knowledge)</button></div>` : "";
  return `<div class="nc-msg nc-bot">${again}${renderMd(m.text)}${renderSources(m.sources || [], i)}${offer}</div>`;
}

// ---------- settings form (model + key), rendered into any container ----------
export function renderSettings(container, { onSaved, onBack, extraHTML = "" }) {
  const st = settings(), current = modelInfo(st.model);
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

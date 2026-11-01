// Record of each Ask answer for the study's answer review (D1 binding STATS, table ask_answers in stats/ask-schema.sql).
// The page POSTs one record per answer once it is shown. Patient details were already removed from the question in
// the browser (chatbot/engine.js, phiStrip). No person, device ID or IP address is stored: a random conversation ID
// (new for each chat), the turn number, the day and hour (Pacific), and the answer. Nothing is readable from the web;
// the owner exports the records with wrangler (stats/export_ask.py).
const CONV = /^[a-z0-9]{8,32}$/;
// an answer from the manual (and In[Neo]Sight when it had none), In[Neo]Sight asked for beside a manual answer, the AI summary
// of a web search, or the general-AI one (a personal key whose model cannot search)
const KINDS = new Set(["manual", "inneosight", "web", "general_ai"]);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const pacific = (d = new Date()) => ({
  day: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d),
  hour: Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(d)),
});
const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
// JSON kept as text, or null; dropped if too long
const blob = (v, max) => { if (v == null) return null; const s = JSON.stringify(v); return s.length <= max ? s : null; };

export async function onRequestPost({ request, env }) {
  if (!env.STATS) return json({ error: "not set up" }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !(request.headers.get("content-type") || "").startsWith("application/json")) return json({ error: "forbidden" }, 403);
  let v;
  try { v = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const turn = Number(v?.turn);
  if (!CONV.test(String(v?.conversation)) || !Number.isInteger(turn) || turn < 1 || turn > 200 || !KINDS.has(v?.kind) ||
      !text(v?.question, 1500)) return json({ error: "bad request" }, 400);
  const sources = Array.isArray(v.sources) ? v.sources.slice(0, 20).map((s) => ({
    title: text(s?.title, 300), url: text(s?.url, 300), quote: text(s?.quote, 400) })) : [];
  const neo = v.inneosight && typeof v.inneosight === "object" ? {
    text: text(v.inneosight.text, 6000),
    articles: (Array.isArray(v.inneosight.articles) ? v.inneosight.articles : []).slice(0, 10).map((a) => ({
      title: text(a?.title, 300), url: text(a?.url, 300), reviewed: text(a?.reviewed, 30) })),
  } : null;
  const t = pacific();
  try {
    await env.STATS.prepare(
      `INSERT INTO ask_answers (day, hour, conversation, turn, kind, question, phi_removed, rephrased, answer,
         not_in_manual, sources, inneosight, error, model, manual_version, seconds)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
    ).bind(t.day, t.hour, v.conversation, turn, v.kind, text(v.question, 1500), text(v.phi_removed, 200),
      text(v.rephrased, 1500), text(v.answer, 12000), v.not_in_manual ? 1 : 0, blob(sources, 12000), blob(neo, 12000),
      text(v.error, 500) || null, text(v.model, 60), text(v.manual_version, 40),
      Number.isFinite(v.seconds) ? Math.min(600, Math.max(0, Math.round(v.seconds * 10) / 10)) : null).run();
    return new Response(null, { status: 204 });
  } catch {
    return json({ error: "try again" }, 503);
  }
}

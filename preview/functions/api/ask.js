// Ask with the study's Grok key (secret XAI_API_KEY, set by the owner with `wrangler pages secret put`; it never
// reaches the browser). The page sends {kind, messages}; the instructions for each kind come from chatbot/prompts.js,
// so the key can only be used for Ask's own requests. A daily cap on calls for the whole site (ASK_DAILY_CAP,
// default 300) is counted in D1 (binding STATS, table ask_usage in stats/ask-schema.sql).
// GET returns {study: true, model} when the key and the database are set up; the page then uses this instead of a
// personal API key. Without the key it returns {study: false} and Ask asks for a personal key, as before.
import { KINDS, readWebReply } from "../../../chatbot/prompts.js";

const MODEL = "grok-4.7";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const XAI_WEB_URL = "https://api.x.ai/v1/responses"; // web search runs only through the Responses API
const MAX_MESSAGES = 14, MAX_CHARS = 120000; // the manual excerpts make one request up to about 60,000 characters
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const pacificDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const ready = (env) => !!(env.XAI_API_KEY && env.STATS);

export async function onRequestGet({ env }) {
  return json(ready(env) ? { study: true, model: MODEL } : { study: false });
}

export async function onRequestPost({ request, env }) {
  if (!ready(env)) return json({ error: "not set up" }, 503);
  // only this site's own pages
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !(request.headers.get("content-type") || "").startsWith("application/json")) return json({ error: "forbidden" }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const kind = KINDS[body?.kind], messages = body?.messages;
  const ok = kind && Array.isArray(messages) && messages.length >= 1 && messages.length <= MAX_MESSAGES &&
    messages.every((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string") &&
    messages.reduce((n, m) => n + m.content.length, 0) <= MAX_CHARS && messages.at(-1).role === "user";
  if (!ok) return json({ error: "bad request" }, 400);

  // the day's calls so far, this one included (Pacific day)
  const cap = Number(env.ASK_DAILY_CAP) || 300;
  let calls;
  try {
    calls = (await env.STATS.prepare(
      `INSERT INTO ask_usage (day, calls) VALUES (?1, 1) ON CONFLICT (day) DO UPDATE SET calls = calls + 1 RETURNING calls`
    ).bind(pacificDay()).first("calls"));
  } catch {
    return json({ error: "try again" }, 503);
  }
  if (calls > cap) return json({ error: "cap" }, 429);

  // same requests as a personal xAI key sends (chatbot/engine.js)
  const turns = [{ role: "system", content: kind.system }, ...messages.map(({ role, content }) => ({ role, content }))];
  const req = kind.web ? { model: MODEL, reasoning: { effort: "low" }, input: turns, tools: [{ type: "web_search" }] }
    : { model: MODEL, reasoning_effort: "low", messages: turns };
  if (kind.schema) req.response_format = { type: "json_schema", json_schema: { name: "manual_response", schema: kind.schema, strict: true } };
  let r;
  try {
    r = await fetch(env.XAI_URL || (kind.web ? XAI_WEB_URL : XAI_URL), { // XAI_URL: a stand-in service for local tests only
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.XAI_API_KEY },
      body: JSON.stringify(req),
    });
  } catch {
    return json({ error: "unreachable" }, 502);
  }
  if (!r.ok) {
    // the provider's status and reason, never the key
    const detail = (await r.text()).slice(0, 300);
    return json({ error: "provider", status: r.status, detail }, r.status === 429 ? 429 : 502);
  }
  const data = await r.json();
  if (kind.web) {
    const web = readWebReply(data);
    return json({ content: web.text, citations: web.cites.slice(0, 20), refusal: web.refusal, finish: web.finish,
      model: data.model || MODEL });
  }
  const choice = data.choices?.[0];
  return json({ content: choice?.message?.content || "", refusal: !!choice?.message?.refusal,
    finish: choice?.finish_reason || "", model: data.model || MODEL });
}

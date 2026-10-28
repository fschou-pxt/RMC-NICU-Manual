// "Let's discuss" counts for evidence notes, kept in Workers KV (binding DISCUSS). Anonymous: only ids and numbers.
// One KV value per evidence note (section), "discuss:<note id>" -> {"c4": 2, "o1": 1}: a count per item (claim or
// related point), so a page reads one value per evidence box. A plain number (the old one-per-section count) reads as {}.
// GET ?ids=a,b returns {a: {c4: 2}, b: {}}; POST {id, item, delta: 1 | -1} returns {id: {...}}.
// Without the KV binding it answers 503 and the page simply shows no counts.
const ID = /^[a-z0-9-]{1,60}$/; // note ids: "<chapter>-<slug>", lowercase
const ITEM = /^[a-z][0-9]{1,3}$/; // item ids: c4, o1
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const read = async (env, id) => {
  try {
    const v = JSON.parse(await env.DISCUSS.get("discuss:" + id));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
};
// only this site's own pages may change a count (blocks cross-site form posts)
const sameSite = (request) => request.headers.get("origin") === new URL(request.url).origin &&
  (request.headers.get("content-type") || "").startsWith("application/json");

export async function onRequestGet({ request, env }) {
  if (!env.DISCUSS) return json({ error: "counts not set up" }, 503);
  const ids = (new URL(request.url).searchParams.get("ids") || "").split(",").filter((id) => ID.test(id)).slice(0, 100);
  const out = {};
  await Promise.all(ids.map(async (id) => { out[id] = await read(env, id); }));
  return json(out);
}

export async function onRequestPost({ request, env }) {
  if (!env.DISCUSS) return json({ error: "counts not set up" }, 503);
  if (!sameSite(request)) return json({ error: "forbidden" }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const { id, item, delta } = body || {};
  if (!ID.test(String(id || "")) || !ITEM.test(String(item || "")) || (delta !== 1 && delta !== -1)) return json({ error: "bad request" }, 400);
  // KV is not atomic: two taps in the same section at the same moment may count once. Fine for a rough count.
  try {
    const counts = await read(env, id);
    const n = Math.max(0, (Number(counts[item]) || 0) + delta);
    if (n) counts[item] = n; else delete counts[item];
    await env.DISCUSS.put("discuss:" + id, JSON.stringify(counts));
    return json({ [id]: counts });
  } catch {
    return json({ error: "try again" }, 503);
  }
}

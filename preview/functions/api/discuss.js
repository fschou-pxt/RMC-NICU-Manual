// "Let's discuss" counts for evidence notes, kept in Workers KV (binding DISCUSS). Anonymous: only a note id
// (e.g. "lisa-c1") and a number are stored. GET ?ids=a,b returns {a: n, b: n}; POST {id, delta: 1 | -1} returns {id: n}.
// Without the KV binding it answers 503 and the page simply shows no counts.
const ID = /^[a-z0-9-]{1,60}$/; // evidence ids: "<chapter>-<section>", lowercase
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const read = async (env, id) => Number(await env.DISCUSS.get("discuss:" + id)) || 0;
// only this site's own pages may change a count (blocks cross-site form posts)
const sameSite = (request) => request.headers.get("origin") === new URL(request.url).origin &&
  (request.headers.get("content-type") || "").startsWith("application/json");

export async function onRequestGet({ request, env }) {
  if (!env.DISCUSS) return json({ error: "counts not set up" }, 503);
  const ids = (new URL(request.url).searchParams.get("ids") || "").split(",").filter((id) => ID.test(id)).slice(0, 50);
  const out = {};
  await Promise.all(ids.map(async (id) => { out[id] = await read(env, id); }));
  return json(out);
}

export async function onRequestPost({ request, env }) {
  if (!env.DISCUSS) return json({ error: "counts not set up" }, 503);
  if (!sameSite(request)) return json({ error: "forbidden" }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const { id, delta } = body || {};
  if (!ID.test(String(id || "")) || (delta !== 1 && delta !== -1)) return json({ error: "bad request" }, 400);
  // KV is not atomic: two taps at the same moment may count once. Fine for a rough "how many want to discuss".
  try {
    const n = Math.max(0, (await read(env, id)) + delta);
    await env.DISCUSS.put("discuss:" + id, String(n));
    return json({ [id]: n });
  } catch {
    return json({ error: "try again" }, 503);
  }
}

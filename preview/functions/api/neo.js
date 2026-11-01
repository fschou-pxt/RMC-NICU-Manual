// In[Neo]Sight article search for Ask (chatbot/engine.js). The page POSTs {q}; this passes it to In[Neo]Sight with the
// manual's In[Neo]Sight API key (secret NEO_KEY, issued with In[Neo]Sight's scripts/api-keys.mjs on the "internal" plan
// and piped into `wrangler pages secret put`), so the key never reaches the browser.
// Each browser gets 5 searches a minute (the page sends a random ID it keeps for this), and each IP address 30 a minute,
// a backstop against scripts that change the ID (a hospital network may put the whole unit behind one address).
// Counted in D1 (binding STATS, table neo_rate in stats/ask-schema.sql) under keyed hashes of the ID and the address;
// neither is stored as such, and rows go after 2 minutes.
const NEO_URL = "https://inneosight.org/api/manual-source";
const PER_BROWSER = 5, PER_ADDRESS = 30, MAX_CHARS = 500;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

async function who(ip, key) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(ip));
  return [...new Uint8Array(sig).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.NEO_KEY || !env.STATS) return json({ error: "not set up" }, 503);
  // only this site's own pages
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !(request.headers.get("content-type") || "").startsWith("application/json")) return json({ error: "forbidden" }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const q = body?.q, browser = body?.browser;
  if (typeof q !== "string" || !q.trim() || q.length > MAX_CHARS || !/^[0-9a-f]{32}$/.test(String(browser))) return json({ error: "bad request" }, 400);

  // this browser's and this address's searches in the current minute, this one included
  const minute = Math.floor(Date.now() / 60000);
  let byBrowser, byAddress;
  try {
    const count = env.STATS.prepare(`INSERT INTO neo_rate (who, minute, calls) VALUES (?1, ?2, 1)
      ON CONFLICT (who, minute) DO UPDATE SET calls = calls + 1 RETURNING calls`);
    const [b, a] = await env.STATS.batch([
      count.bind("b:" + await who(browser, env.NEO_KEY), minute),
      count.bind("a:" + await who(request.headers.get("cf-connecting-ip") || "unknown", env.NEO_KEY), minute),
    ]);
    byBrowser = b.results[0].calls; byAddress = a.results[0].calls;
    if (byAddress === 1) await env.STATS.prepare(`DELETE FROM neo_rate WHERE minute < ?1`).bind(minute - 1).run();
  } catch {
    return json({ error: "try again" }, 503);
  }
  if (byBrowser > PER_BROWSER || byAddress > PER_ADDRESS) return json({ error: "limit" }, 429);

  let r;
  try {
    r = await fetch((env.NEO_URL || NEO_URL) + "?q=" + encodeURIComponent(q), { // NEO_URL: a stand-in service for local tests only
      headers: { authorization: "Bearer " + env.NEO_KEY.trim() },
    });
  } catch {
    return json({ error: "unreachable" }, 502);
  }
  if (!r.ok) return json({ error: "inneosight", status: r.status }, 502);
  const data = await r.json();
  return json({ articles: Array.isArray(data.articles) ? data.articles.slice(0, 3) : [] });
}

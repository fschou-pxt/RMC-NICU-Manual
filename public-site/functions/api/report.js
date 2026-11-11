// The numbers behind the editor's daily report, as JSON: section views (D1 STATS) and "Let's discuss" taps (KV DISCUSS).
// Read-only, fixed queries; the only input is ?day=YYYY-MM-DD (default: today, Pacific). Counts only, as stored.
// Needs the secret REPORT_KEY, sent as "Authorization: Bearer <key>". Without that secret it answers 503.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const sha = async (t) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));

export async function onRequestGet({ request, env }) {
  if (!env.REPORT_KEY || !env.STATS || !env.DISCUSS) return json({ error: "not set up" }, 503);
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!crypto.subtle.timingSafeEqual(await sha(sent), await sha(env.REPORT_KEY))) return json({ error: "forbidden" }, 403);
  const day = new URL(request.url).searchParams.get("day") || today();
  if (!DAY.test(day)) return json({ error: "bad request" }, 400);

  const onDay = (sql) => env.STATS.prepare(sql).bind(day);
  const by = (col) => onDay(`SELECT ${col}, SUM(n) AS views FROM section_views WHERE day = ?1 GROUP BY ${col} ORDER BY views DESC`);
  const [totals, top, source, device, hour, daily, pages] = (await env.STATS.batch([
    onDay(`SELECT SUM(n) AS views, COUNT(DISTINCT page) AS pages, COUNT(DISTINCT page || '#' || section) AS sections FROM section_views WHERE day = ?1`),
    onDay(`SELECT page, section, SUM(n) AS views FROM section_views WHERE day = ?1 GROUP BY page, section ORDER BY views DESC LIMIT 10`),
    by("source"), by("device"), by("hour"),
    env.STATS.prepare(`SELECT day, SUM(n) AS views FROM section_views GROUP BY day ORDER BY day`),
    env.STATS.prepare(`SELECT page, SUM(n) AS views FROM section_views WHERE day >= '2026-10-26' GROUP BY page ORDER BY views DESC`),
  ])).map((r) => r.results);

  // "Let's discuss": every note with at least one tap (one KV value per note)
  const keys = (await env.DISCUSS.list({ prefix: "discuss:", limit: 100 })).keys;
  const discuss = {};
  await Promise.all(keys.map(async ({ name }) => {
    const counts = await env.DISCUSS.get(name, "json").catch(() => null);
    if (counts && typeof counts === "object" && Object.keys(counts).length) discuss[name.slice(8)] = counts;
  }));

  return json({ day, totals: totals[0], top, source, device, hour, daily, pages, discuss });
}

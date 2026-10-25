// Anonymous section-view counts (D1 binding STATS; table in stats/schema.sql). The site's pages POST
// {page, section, source, ask, device} when a section has been on screen for a few seconds. Only those values,
// the day and the hour are kept, as a count: no person, device ID, IP address or question text. Nothing is readable
// from the web; the owner queries the database with wrangler (see README.md).
const NAME = /^[A-Za-z0-9_-]{1,80}$/;
// how the reader got to the section
const SOURCES = new Set([
  "browse",   // scrolled to it on the page
  "home",     // a home-page link (quick link, recent, what's new, the manual list)
  "sidebar",  // the left navigation
  "toc",      // "On this page", the section chips under a chapter title
  "search",   // the site search
  "link",     // a link in the manual's own text
  "ask",      // a source from Ask (chat answer) opened in the manual
  "ask-panel",// a source read in Ask's side panel without leaving Ask
  "direct",   // typed, bookmarked, or from outside the site
]);
// kind of device, judged in the browser from screen size and touch (not an identifier)
const DEVICES = new Set(["phone", "tablet", "computer"]);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
// day and hour of the view, Pacific time
const pacific = (d = new Date()) => ({
  day: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d),
  hour: Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(d)),
});

export async function onRequestPost({ request, env }) {
  if (!env.STATS) return json({ error: "not set up" }, 503);
  // only this site's own pages (blocks cross-site posts)
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "forbidden" }, 403);
  let v;
  try { v = JSON.parse(await request.text()); } catch { return json({ error: "bad request" }, 400); }
  const { page, section, source } = v || {};
  const ask = v?.ask ? 1 : 0;
  const device = DEVICES.has(v?.device) ? v.device : "unknown"; // pages cached before this field existed send none
  if (!NAME.test(String(page)) || !NAME.test(String(section)) || !SOURCES.has(source)) return json({ error: "bad request" }, 400);
  const t = pacific();
  try {
    await env.STATS.prepare(
      `INSERT INTO section_views (day, hour, page, section, source, ask, device, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
       ON CONFLICT (day, hour, page, section, source, ask, device) DO UPDATE SET n = n + 1`
    ).bind(t.day, t.hour, page, section, source, ask, device).run();
    return new Response(null, { status: 204 });
  } catch {
    return json({ error: "try again" }, 503);
  }
}

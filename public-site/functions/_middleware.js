// Public site: no password. During the soft launch the site stays out of search engines (the old manual is
// still the indexed one); remove NOINDEX at the official launch.
const NOINDEX = true;

export async function onRequest({ next }) {
  const res = await next();
  if (!NOINDEX) return res;
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  return out;
}

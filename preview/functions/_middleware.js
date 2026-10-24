// Password gate for the stakeholder preview (nicu-manual-preview.pages.dev), run by Cloudflare Pages before
// any file is served. Browser sign-in box (HTTP Basic): user name "nicu", password = the PREVIEW_PASSWORD
// secret, which the owner sets with `wrangler pages secret put`. With no secret set, everyone is refused.
const USER = "nicu";
// Needed to install the app from the browser, which fetches these without sending the sign-in
const OPEN = [/^\/manifest\.webmanifest$/, /^\/pwa\/[\w.-]+\.png$/];

async function sameText(a, b) {
  // compare digests so the time taken doesn't reveal how much of the password matched
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname;
  let allowed = OPEN.some((re) => re.test(path));
  if (!allowed && env.PREVIEW_PASSWORD) {
    const auth = request.headers.get("Authorization") || "";
    if (auth.startsWith("Basic ")) {
      let decoded = "";
      try { decoded = atob(auth.slice(6)); } catch {}
      const i = decoded.indexOf(":");
      allowed = i > 0 && decoded.slice(0, i) === USER && (await sameText(decoded.slice(i + 1), env.PREVIEW_PASSWORD));
    }
  }
  if (!allowed) {
    return new Response("NICU Manual preview: sign-in required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="NICU Manual preview", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow"); // keep the preview out of search engines
  out.headers.set("Cache-Control", "private, no-cache");
  return out;
}

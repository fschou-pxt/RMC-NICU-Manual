// Passcode gate, run before any file is served. Browser sign-in box (HTTP Basic): any user name, password = the
// SCORING_PASSCODE secret, which the owner sets with `wrangler pages secret put`. With no secret set, everyone is refused.
async function sameText(a, b) {
  // compare digests so the time taken doesn't reveal how much of the passcode matched
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  let allowed = false;
  const auth = request.headers.get("Authorization") || "";
  if (env.SCORING_PASSCODE && auth.startsWith("Basic ")) {
    let decoded = "";
    try { decoded = atob(auth.slice(6)); } catch {}
    const i = decoded.indexOf(":");
    allowed = i >= 0 && (await sameText(decoded.slice(i + 1), env.SCORING_PASSCODE));
  }
  if (!allowed) {
    return new Response("Evidence check scoring: passcode required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Evidence check scoring", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  out.headers.set("Cache-Control", "private, no-store");
  return out;
}

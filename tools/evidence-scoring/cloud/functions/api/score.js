import { slugOf, makeRecord } from "../../../shared.mjs";

export async function onRequestPost({ request, env }) {
  if (!/application\/json/.test(request.headers.get("content-type") || "")) return Response.json({ error: "json only" }, { status: 415 });
  const b = await request.json();
  const data = await (await env.ASSETS.fetch(new URL("/api/items.json", request.url))).json();
  const rec = makeRecord(b, data);
  if (!rec) return Response.json({ error: "bad request" }, { status: 400 });
  await env.SCORES.prepare("INSERT INTO scores (reviewer_slug, item_id, record) VALUES (?, ?, ?)").bind(slugOf(b.reviewer), rec.item_id, JSON.stringify(rec)).run();
  return Response.json(rec);
}

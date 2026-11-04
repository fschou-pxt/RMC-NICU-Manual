import { slugOf, toCsv } from "../../../shared.mjs";
import { reviewerRecords } from "../_db.js";

export async function onRequestGet({ request, env }) {
  const who = new URL(request.url).searchParams.get("reviewer");
  if (!slugOf(who || "")) return Response.json({ error: "reviewer required" }, { status: 400 });
  const rows = Object.values(await reviewerRecords(env, who)).filter((r) => r.score != null || r.comment);
  return new Response(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="evidence-scores-${slugOf(who)}.csv"` } });
}

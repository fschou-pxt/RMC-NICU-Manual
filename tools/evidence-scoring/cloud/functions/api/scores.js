import { slugOf } from "../../../shared.mjs";
import { reviewerRecords } from "../_db.js";

export async function onRequestGet({ request, env }) {
  const who = new URL(request.url).searchParams.get("reviewer");
  if (!slugOf(who || "")) return Response.json({ error: "reviewer required" }, { status: 400 });
  return Response.json(await reviewerRecords(env, who));
}

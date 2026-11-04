import { slugOf, latest } from "../../shared.mjs";

// this reviewer's own rows only: no route returns another reviewer's scores
export async function reviewerRecords(env, reviewer) {
  const { results } = await env.SCORES.prepare("SELECT record FROM scores WHERE reviewer_slug = ? ORDER BY id").bind(slugOf(reviewer)).all();
  return latest(results.map((r) => JSON.parse(r.record)));
}

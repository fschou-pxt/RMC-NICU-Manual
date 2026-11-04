import { fetchAbstract } from "../../../shared.mjs";

export async function onRequestGet({ request }) {
  const r = await fetchAbstract(new URL(request.url).searchParams.get("pmid"));
  return new Response(r.text, { status: r.status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

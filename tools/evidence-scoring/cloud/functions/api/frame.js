import { canFrame } from "../../../shared.mjs";

export const onRequestGet = async ({ request }) => Response.json(await canFrame(new URL(request.url).searchParams.get("url")));

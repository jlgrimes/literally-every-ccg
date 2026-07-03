import { resolveBattle, eligibleKeys } from "../../../lib/battle";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "bad request" }, { status: 400 });
  if (Array.isArray(body.filter)) {
    return Response.json({ ok: eligibleKeys(body.filter.slice(0, 20000)) });
  }
  const r = resolveBattle(body.team);
  if (r.error) return Response.json({ error: r.error }, { status: 400 });
  return Response.json(r);
}

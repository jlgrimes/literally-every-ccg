import { resolveBattle, eligibleKeys, draftDeck } from "../../../lib/battle";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "bad request" }, { status: 400 });
  if (Array.isArray(body.filter)) {
    return Response.json({ ok: eligibleKeys(body.filter.slice(0, 20000)) });
  }
  if (body.draft) {
    const loan = Math.max(0, Math.min(20, body.draft.loan | 0));
    return Response.json({
      deck: draftDeck(body.draft.tiers),
      loaners: loan ? draftDeck(null, loan) : [],
    });
  }
  const r = resolveBattle(body.team);
  if (r.error) return Response.json({ error: r.error }, { status: 400 });
  return Response.json(r);
}

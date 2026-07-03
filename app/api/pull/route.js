import { drawOne, ODDS, UNIVERSES } from "../../../lib/gacha";

const TIERS = new Set(["common", "uncommon", "rare", "epic", "legendary"]);

// Single draw. With ?tier=X, draws a replacement card of exactly that tier
// (used by the client when a card's image host fails).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const uParam = searchParams.get("u") || "all";
  const u = UNIVERSES.includes(uParam) ? uParam : "all";
  const tier = searchParams.get("tier");
  const table = TIERS.has(tier) ? [[tier, 1]] : ODDS;
  const card = drawOne(u, table);
  if (!card) return Response.json({ error: "empty pool" }, { status: 500 });
  return Response.json({ pulls: [card] });
}

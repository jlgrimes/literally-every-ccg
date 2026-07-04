import { openPack, UNIVERSES } from "../../../lib/gacha";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const uParam = searchParams.get("u") || "all";
  const u = UNIVERSES.includes(uParam) ? uParam : "all";
  const { game, pack, god } = openPack(u, searchParams.get("god") === "1");
  if (!pack.length) return Response.json({ error: "empty pool" }, { status: 500 });
  return Response.json({ game, pack, god });
}

import { META } from "../../../lib/gacha";
export async function GET() {
  return Response.json(META);
}

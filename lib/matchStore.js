// Match storage for multiplayer duels.
// With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set, rows live in the
// `matches` table (see supabase/schema.sql). Without them, falls back to an
// in-process Map — fine for local dev, useless on serverless, so production
// multiplayer needs the env vars.

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const persistent = !!(SB_URL && SB_KEY);

const mem = (globalThis.__omniMatches ||= new Map());

async function sb(method, path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "" : "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

export async function createMatch(row) {
  if (!persistent) { mem.set(row.code, { ...row }); return row; }
  const [saved] = await sb("POST", "matches", row);
  return saved;
}

export async function getMatch(code) {
  if (!persistent) return mem.get(code) || null;
  const rows = await sb("GET", `matches?code=eq.${encodeURIComponent(code)}&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

export async function updateMatch(code, fields) {
  if (!persistent) {
    const row = mem.get(code);
    if (!row) return null;
    Object.assign(row, fields);
    return row;
  }
  const rows = await sb("PATCH", `matches?code=eq.${encodeURIComponent(code)}`, fields);
  return rows && rows[0] ? rows[0] : null;
}

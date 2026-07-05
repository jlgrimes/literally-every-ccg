import { createMatch, getMatch, updateMatch, persistent } from "../../../lib/matchStore";
import { initDuel } from "../../../lib/duel";

export const dynamic = "force-dynamic";

// health check: `persistent` is true when Supabase env vars are wired up,
// false means matches live in process memory (dev only — dies on serverless)
export async function GET() {
  return Response.json({ multiplayer: true, persistent });
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
const err = (msg, status = 400) => Response.json({ error: msg }, { status });

// a deck sent by a client: 20 cards, each with the fields the engine needs
function validDeck(deck) {
  return Array.isArray(deck) && deck.length === 20 && deck.every((c) =>
    c && typeof c.name === "string" && typeof c.img === "string" &&
    ["mtg", "pokemon", "yugioh"].includes(c.game) &&
    Array.isArray(c.bs) && c.bs.length === 2 && c.bs.every((v) => Number.isFinite(v) && v >= 1 && v <= 100)
  );
}

const sideOf = (m, token) => (token && token === m.host_token ? "p" : token && token === m.guest_token ? "ai" : null);
const trimLog = (state) => { if (state && Array.isArray(state.log) && state.log.length > 120) state.log = state.log.slice(-120); return state; };

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.op !== "string") return err("bad request");

  if (body.op === "create") {
    if (!validDeck(body.deck)) return err("bring a valid 20-card deck");
    const code = newCode();
    const host_token = crypto.randomUUID();
    await createMatch({
      code, status: "waiting", seq: 0,
      host_name: String(body.name || "Host").slice(0, 20),
      host_token, guest_token: null, guest_name: null,
      host_deck: body.deck, state: null,
    });
    return Response.json({ code, token: host_token, side: "p" });
  }

  const code = String(body.code || "").toUpperCase().trim();
  const m = code ? await getMatch(code) : null;
  if (!m) return err("no such match", 404);

  if (body.op === "join") {
    if (m.status !== "waiting") return err("match already started");
    if (!validDeck(body.deck)) return err("bring a valid 20-card deck");
    const guest_token = crypto.randomUUID();
    const guestName = String(body.name || "Guest").slice(0, 20);
    // host is "p" and goes first; real names flow into the shared battle log
    const state = trimLog(initDuel(m.host_deck, body.deck, Math.random, { p: m.host_name || "Host", ai: guestName }));
    await updateMatch(code, {
      status: "active", guest_token, guest_name: guestName,
      state, seq: 1, updated_at: new Date().toISOString(),
    });
    return Response.json({ code, token: guest_token, side: "ai" });
  }

  if (body.op === "state") {
    if (!sideOf(m, body.token)) return err("not your match", 403);
    const since = body.since | 0;
    const base = { seq: m.seq, status: m.status, hostName: m.host_name, guestName: m.guest_name };
    return Response.json(m.seq > since ? { ...base, state: m.state } : base);
  }

  if (body.op === "move") {
    const side = sideOf(m, body.token);
    if (!side) return err("not your match", 403);
    if (m.status !== "active") return err("match is not active");
    const prev = m.state;
    const state = trimLog(body.state);
    if (!state || !state.p || !state.ai) return err("bad state");
    // only the player whose turn it is may write — except the DEFENDER
    // resolving a block phase, and concedes (any-time, can only lose you
    // the game)
    const isConcede = state.over && state[side] && state[side].hp <= 0;
    const isBlockResolve = prev && prev.phase === "block" && prev.active !== side;
    if (prev && prev.active !== side && !prev.over && !isConcede && !isBlockResolve) return err("not your turn", 409);
    await updateMatch(code, {
      state, seq: m.seq + 1,
      status: state.over ? "done" : "active",
      updated_at: new Date().toISOString(),
    });
    return Response.json({ seq: m.seq + 1 });
  }

  return err("unknown op");
}

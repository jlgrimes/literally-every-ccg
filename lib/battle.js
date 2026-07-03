import cards from "../data/cards.json";

// Only cards carrying battle stats (bs: [atk, hp] on a shared 1-100 scale,
// assigned at seed time) can fight — currently MTG creatures, Pokémon, and
// Yu-Gi-Oh monsters. Everything else spectates.
export const BATTLE_GAMES = ["mtg", "pokemon", "yugioh"];
export const TEAM_SIZE = 3;

const fighters = cards.filter((c) => Array.isArray(c.bs));
const byKey = new Map(fighters.map((c) => [`${c.game}:${c.id}`, c]));

const TIER_WALK = ["legendary", "epic", "rare", "uncommon", "common"];
const byTier = {};
for (const c of fighters) (byTier[c.tier] ||= []).push(c);

// binder entries saved before stats existed have no bs — this lets the
// client ask which of its cards can fight, and learn their stats
export function eligibleKeys(keys) {
  const ok = [];
  for (const k of keys) {
    const c = byKey.get(String(k));
    if (c) ok.push({ key: `${c.game}:${c.id}`, bs: c.bs });
  }
  return ok;
}

const hitsToKO = (att, def) => Math.ceil(def.bs[1] / Math.max(1, att.bs[0]));

// simultaneous slugfest: both cards swing every round; whoever needs fewer
// rounds to KO wins the lane. Same count → higher ATK, then higher HP.
export function duel(a, b) {
  const hitsA = hitsToKO(a, b), hitsB = hitsToKO(b, a);
  let winner = "draw";
  if (hitsA !== hitsB) winner = hitsA < hitsB ? "a" : "b";
  else if (a.bs[0] !== b.bs[0]) winner = a.bs[0] > b.bs[0] ? "a" : "b";
  else if (a.bs[1] !== b.bs[1]) winner = a.bs[1] > b.bs[1] ? "a" : "b";
  return { hitsA, hitsB, winner };
}

// AI drafts a random fighter of the same tier, from any battle game
function draftOpponent(card) {
  let i = TIER_WALK.indexOf(card.tier);
  let pool = byTier[TIER_WALK[i]];
  while ((!pool || !pool.length) && i < TIER_WALK.length - 1) pool = byTier[TIER_WALK[++i]];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function resolveBattle(keys) {
  if (!Array.isArray(keys) || keys.length !== TEAM_SIZE) return { error: `pick exactly ${TEAM_SIZE} cards` };
  const team = keys.map((k) => byKey.get(String(k)));
  const bad = team.findIndex((c) => !c);
  if (bad !== -1) return { error: `card ${keys[bad]} isn't battle-eligible` };
  let playerWins = 0, aiWins = 0;
  const lanes = team.map((p) => {
    const ai = draftOpponent(p);
    const d = duel(p, ai);
    if (d.winner === "a") playerWins++;
    else if (d.winner === "b") aiWins++;
    return {
      player: p, ai,
      playerHits: d.hitsA, aiHits: d.hitsB,
      winner: d.winner === "a" ? "player" : d.winner === "b" ? "ai" : "draw",
    };
  });
  const result = playerWins > aiWins ? "win" : aiWins > playerWins ? "loss" : "draw";
  return { lanes, playerWins, aiWins, result };
}

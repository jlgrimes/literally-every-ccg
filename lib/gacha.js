import cards from "../data/cards.json";

export const ODDS = [
  ["legendary", 0.015],
  ["epic", 0.05],
  ["rare", 0.16],
  ["uncommon", 0.30],
  ["common", 0.475],
];
export const PITY_ODDS = [
  ["legendary", 0.20],
  ["epic", 0.80],
];
export const UNIVERSES = [...new Set(cards.map((c) => c.game))];

// ---- unified booster structure: 6 commons / 3 uncommons / 1 hit, hit last ----
// Every slot draws from the selected pool — on "all" that's the mixed
// multiverse pool, so one pack can hold cards from all four games.
const C = [["common", 1]];
const U = [["uncommon", 1]];
const HIT = [["legendary", 0.08], ["epic", 0.20], ["rare", 0.72]];
export const PACK_STRUCTURE = [C, C, C, C, C, C, U, U, U, HIT];

// ---- god packs: 1 in 200 packs comes out ALL epics and legendaries ----
export const GOD_CHANCE = 1 / 200;
const GOD_SLOT = [["legendary", 0.35], ["epic", 0.65]];
export const GOD_STRUCTURE = Array.from({ length: 10 }, () => GOD_SLOT);

// ---- index by universe + tier ----
const index = {};
for (const c of cards) {
  (index[`${c.game}:${c.tier}`] ||= []).push(c);
  (index[`all:${c.tier}`] ||= []).push(c);
}

export const META = (() => {
  const byGame = {}, byTier = {};
  for (const c of cards) {
    byGame[c.game] = (byGame[c.game] || 0) + 1;
    byTier[c.tier] = (byTier[c.tier] || 0) + 1;
  }
  return { total: cards.length, byGame, byTier };
})();

const TIER_WALK = ["legendary", "epic", "rare", "uncommon", "common"];

export function rollTier(table) {
  let r = Math.random();
  for (const [tier, p] of table) {
    if (r < p) return tier;
    r -= p;
  }
  return table[table.length - 1][0];
}

export function drawOne(u, table) {
  let tier = rollTier(table);
  let pool = index[`${u}:${tier}`];
  let i = TIER_WALK.indexOf(tier);
  while ((!pool || !pool.length) && i < TIER_WALK.length - 1) {
    i++;
    pool = index[`${u}:${TIER_WALK[i]}`];
  }
  if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function openPack(u, forceGod = false) {
  const pool = UNIVERSES.includes(u) ? u : "all";
  const god = forceGod || Math.random() < GOD_CHANCE;
  const pack = [];
  for (const slot of god ? GOD_STRUCTURE : PACK_STRUCTURE) {
    const card = drawOne(pool, slot);
    if (card) pack.push(card);
  }
  return { game: pool, pack, god };
}

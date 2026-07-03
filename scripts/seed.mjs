// OMNIDECK seed — harvests real cards from 4 public TCG APIs
// into data/cards.json with normalized rarity tiers.
import { writeFileSync, mkdirSync } from "fs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

async function jfetch(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "omnideck-seed/1.0" } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

function mapRarity(game, raw) {
  const r = (raw || "").toLowerCase();
  if (game === "mtg") {
    if (r === "mythic") return "legendary";
    if (r === "special" || r === "bonus") return "epic";
    if (r === "rare") return "rare";
    if (r === "uncommon") return "uncommon";
    return "common";
  }
  if (game === "pokemon") {
    if (/secret|hyper|rainbow|gold/.test(r)) return "legendary";
    if (/ultra|illustration|special|shiny|amazing|crown|ace|vmax|vstar/.test(r)) return "epic";
    if (/holo/.test(r)) return "epic";
    if (/rare/.test(r)) return "rare";
    if (/uncommon/.test(r)) return "uncommon";
    return "common";
  }
  if (game === "yugioh") {
    if (/starlight|ghost|ultimate|secret|collector|quarter/.test(r)) return "legendary";
    if (/ultra|prismatic|gold|platinum/.test(r)) return "epic";
    if (/super/.test(r)) return "rare";
    if (r.includes("rare")) return "uncommon";
    return "common";
  }
  if (game === "lorcana") {
    if (/enchanted|legendary/.test(r)) return "legendary";
    if (/super/.test(r)) return "epic";
    if (/rare/.test(r)) return "rare";
    if (/uncommon/.test(r)) return "uncommon";
    return "common";
  }
  return "common";
}

const out = [];
const seen = new Set();
function add(c) {
  const key = c.game + ":" + c.id;
  if (seen.has(key) || !c.img || !c.name) return;
  seen.add(key);
  out.push(c);
}

// ---------- MAGIC (Scryfall) ----------
async function seedMTG() {
  console.log("MTG: seeding from Scryfall…");
  const rarities = ["common", "uncommon", "rare", "mythic"];
  for (const rar of rarities) {
    const first = await jfetch(`https://api.scryfall.com/cards/search?q=r%3A${rar}+game%3Apaper&page=1`);
    const totalPages = Math.max(1, Math.floor(first.total_cards / 175));
    const pages = new Set([1]);
    while (pages.size < 3) pages.add(1 + rnd(Math.min(totalPages, 100)));
    for (const p of pages) {
      const j = p === 1 ? first : await jfetch(`https://api.scryfall.com/cards/search?q=r%3A${rar}+game%3Apaper&page=${p}`);
      for (const c of j.data || []) {
        const iu = c.image_uris || (c.card_faces && c.card_faces[0].image_uris);
        if (!iu) continue;
        add({ id: c.id, name: c.name, game: "mtg", img: iu.normal || iu.large, native: c.rarity, tier: mapRarity("mtg", c.rarity), set: c.set_name });
      }
      await sleep(120);
    }
  }
  console.log("MTG done:", out.filter(c => c.game === "mtg").length);
}

// ---------- POKÉMON (pokemontcg.io, fallback TCGdex) ----------
async function seedPokemon() {
  console.log("Pokémon: seeding…");
  try {
    const meta = await jfetch("https://api.pokemontcg.io/v2/cards?page=1&pageSize=1");
    const totalPages = Math.floor(meta.totalCount / 250);
    const pages = new Set();
    while (pages.size < 5) pages.add(1 + rnd(totalPages));
    for (const p of pages) {
      const j = await jfetch(`https://api.pokemontcg.io/v2/cards?page=${p}&pageSize=250`);
      for (const c of j.data || []) {
        if (!c.images || !c.images.large) continue;
        add({ id: c.id, name: c.name, game: "pokemon", img: c.images.large, native: c.rarity || "Common", tier: mapRarity("pokemon", c.rarity), set: c.set ? c.set.name : "—" });
      }
      await sleep(300);
    }
  } catch (e) {
    console.log("pokemontcg.io failed, falling back to TCGdex:", e.message);
    const sets = (await jfetch("https://api.tcgdex.net/v2/en/sets")).filter(s => s.cardCount && s.cardCount.total > 30);
    const chosen = new Set();
    while (chosen.size < 8) chosen.add(pick(sets).id);
    for (const sid of chosen) {
      const set = await jfetch(`https://api.tcgdex.net/v2/en/sets/${sid}`);
      const withImg = (set.cards || []).filter(c => c.image);
      // fetch details in small batches for rarity
      for (let i = 0; i < Math.min(withImg.length, 120); i += 10) {
        const batch = withImg.slice(i, i + 10);
        const details = await Promise.allSettled(batch.map(c => jfetch(`https://api.tcgdex.net/v2/en/cards/${c.id}`)));
        details.forEach((d, k) => {
          const brief = batch[k];
          const native = d.status === "fulfilled" && d.value.rarity ? d.value.rarity : "Common";
          add({ id: brief.id, name: brief.name, game: "pokemon", img: brief.image + "/high.webp", native, tier: mapRarity("pokemon", native), set: set.name });
        });
        await sleep(150);
      }
    }
  }
  console.log("Pokémon done:", out.filter(c => c.game === "pokemon").length);
}

// ---------- YU-GI-OH (YGOPRODeck) ----------
async function seedYGO() {
  console.log("Yu-Gi-Oh: seeding from YGOPRODeck…");
  const offsets = new Set();
  while (offsets.size < 4) offsets.add(rnd(12000));
  for (const off of offsets) {
    const j = await jfetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?num=300&offset=${off}`);
    for (const c of j.data || []) {
      const img = c.card_images && c.card_images[0] && c.card_images[0].image_url;
      if (!img) continue;
      const printing = c.card_sets && c.card_sets.length ? pick(c.card_sets) : null;
      const native = printing ? printing.set_rarity : "Common";
      add({ id: String(c.id), name: c.name, game: "yugioh", img, native, tier: mapRarity("yugioh", native), set: printing ? printing.set_name : "—" });
    }
    await sleep(250);
  }
  console.log("Yu-Gi-Oh done:", out.filter(c => c.game === "yugioh").length);
}

// ---------- LORCANA (Lorcast) ----------
async function seedLorcana() {
  console.log("Lorcana: seeding from Lorcast…");
  const j = await jfetch("https://api.lorcast.com/v0/sets");
  const sets = (j.results || j).filter(s => s.code);
  for (const s of sets) {
    try {
      const cards = await jfetch(`https://api.lorcast.com/v0/sets/${s.code}/cards`);
      for (const c of cards) {
        if (!c.image_uris || !c.image_uris.digital) continue;
        const native = (c.rarity || "Common").replace(/_/g, " ");
        add({ id: c.id, name: c.name + (c.version ? " — " + c.version : ""), game: "lorcana", img: c.image_uris.digital.normal || c.image_uris.digital.large, native, tier: mapRarity("lorcana", c.rarity || ""), set: s.name });
      }
      await sleep(150);
    } catch (e) { console.log("lorcana set failed:", s.code, e.message); }
  }
  console.log("Lorcana done:", out.filter(c => c.game === "lorcana").length);
}

const results = await Promise.allSettled([seedMTG(), seedPokemon(), seedYGO(), seedLorcana()]);
results.forEach((r, i) => { if (r.status === "rejected") console.log("seeder", i, "failed:", r.reason.message); });

mkdirSync("data", { recursive: true });
writeFileSync("data/cards.json", JSON.stringify(out));

const byGame = {}, byTier = {};
for (const c of out) { byGame[c.game] = (byGame[c.game] || 0) + 1; byTier[c.tier] = (byTier[c.tier] || 0) + 1; }
console.log("\nTOTAL:", out.length, "\nby game:", byGame, "\nby tier:", byTier);

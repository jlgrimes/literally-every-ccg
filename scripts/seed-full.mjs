// OMNIDECK full-catalog seed — ingests the COMPLETE card databases.
import { writeFileSync, mkdirSync } from "fs";

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jfetch(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "omnideck-seed/2.0" } });
      if (r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1000 * (i + 1));
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
    if (/ultra|illustration|special|shiny|amazing|crown|ace|vmax|vstar|prime|legend|break/.test(r)) return "epic";
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
  if (game === "onepiece") {
    if (/sec|sp|tr/.test(r)) return "legendary";
    if (r === "sr" || r === "l" || r === "p") return "epic";
    if (r === "r") return "rare";
    if (r === "uc") return "uncommon";
    return "common";
  }
  if (game === "digimon") {
    if (r === "sec") return "legendary";
    if (r === "sr" || r === "p") return "epic";
    if (r === "r") return "rare";
    if (r === "u") return "uncommon";
    return "common";
  }
  if (game === "gundam") {
    if (r === "lr" || r === "sec") return "legendary";
    if (r === "sr" || r === "p") return "epic";
    if (r === "r") return "rare";
    if (r === "u" || r === "uc") return "uncommon";
    return "common";
  }
  if (game === "dbfusion") {
    if (r === "scr" || r === "sec") return "legendary";
    if (r === "sr" || r === "l" || r === "p") return "epic";
    if (r === "r") return "rare";
    if (r === "uc") return "uncommon";
    return "common";
  }
  if (game === "unionarena") {
    if (/sr\*\*\*|3\*/.test(r)) return "legendary";
    if (/sr|ap/.test(r)) return "epic";
    if (/^r/.test(r)) return "rare";
    if (/^u/.test(r)) return "uncommon";
    return "common";
  }
  if (game === "hearthstone") {
    if (r === "legendary") return "legendary";
    if (r === "epic") return "epic";
    if (r === "rare") return "rare";
    return "common";
  }
  if (game === "runeterra") {
    if (r === "champion") return "legendary";
    if (r === "epic") return "epic";
    if (r === "rare") return "rare";
    return "common";
  }
  if (game === "swu") {
    if (r === "legendary") return "legendary";
    if (r === "special") return "epic";
    if (r === "rare") return "rare";
    if (r === "uncommon") return "uncommon";
    return "common";
  }
  if (game === "fab") {
    if (r === "l" || r === "f" || r === "v") return "legendary";
    if (r === "m" || r === "p") return "epic";
    if (r === "s" || r === "r") return "rare";
    return "common";
  }
  if (game === "riftbound") {
    if (/overnumbered|showcase/.test(r)) return "legendary";
    if (/alternate|epic/.test(r)) return "epic";
    if (/^rare/.test(r)) return "rare";
    if (/uncommon/.test(r)) return "uncommon";
    return "common";
  }
  if (game === "weiss") {
    if (/^(sp|ssp|sec|sgr|rrr|rr\+|xr)$/.test(r)) return "legendary";
    if (/^(rr|sr)$/.test(r)) return "epic";
    if (/^(r|cr|ps)$/.test(r)) return "rare";
    if (/^(u|pr)$/.test(r)) return "uncommon";
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

// battle stats: normalize each game's native combat numbers onto one shared
// 1-100 ATK/HP scale (bs: [atk, hp]). Only MTG creatures with numeric P/T,
// Pokémon with a damaging attack, and Yu-Gi-Oh monsters get stats — cards
// without bs sit out of the arena.
const clampStat = v => Math.max(1, Math.min(100, Math.round(v)));
function mapStats(game, s) {
  if (game === "mtg") {
    if (!Number.isFinite(s.pow) || !Number.isFinite(s.tou)) return null;
    return [clampStat(s.pow * 11), clampStat(s.tou * 11)];
  }
  if (game === "pokemon") {
    if (!(s.hp > 0) || !(s.dmg > 0)) return null;
    return [clampStat(s.dmg / 2.4), clampStat(s.hp / 3.4)];
  }
  if (game === "yugioh") {
    if (!(s.atk >= 0) || !(s.def >= 0)) return null;
    return [clampStat(s.atk / 45), clampStat(s.def / 45)];
  }
  return null;
}

// spell/trainer effects: classify rules text into a tiny shared effect
// vocabulary, fx: [kind, n] on the same 1-100 scale as battle stats.
// Kinds: dmg, kill, nuke, draw, buff, weak, heal, tutor (search deck for any
// card), tutorc (search deck for a creature/monster/Pokémon).
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const WORD_N = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const wnum = w => WORD_N[w] || parseInt(w, 10) || 0;
const FX_SCALE = { mtg: 11, pokemon: 1 / 2.4, yugioh: 1 / 45 };
function mapFx(game, text, opts = {}) {
  const t = (text || "").toLowerCase().replace(/\s+/g, " ");
  const s = FX_SCALE[game];
  let m;
  if (/search your (deck|library)/.test(t) || /add (?:1|one) [^.]{0,60}from your deck to your hand/.test(t)) {
    return [/(pokémon|pokemon|monster|creature)/.test(t) ? "tutorc" : "tutor", 1];
  }
  if (/special summon[^.]{0,40}(gy|graveyard)/.test(t) || /(gy|graveyard)[^.]{0,40}special summon/.test(t)) return ["tutorc", 1];
  if (/destroy all (monsters|creatures)/.test(t)) return ["nuke", 99];
  if ((m = t.match(/(\d+) damage to (all|each)/))) return ["nuke", clampN(+m[1] * s, 8, 60)];
  if (/destroy (target|1|one|up to one) [^.]{0,30}(creature|monster)/.test(t)) return ["kill", 0];
  if ((m = t.match(/deals? (\d+) damage/)) || (m = t.match(/inflict (\d+) damage/))) return ["dmg", clampN(+m[1] * s, 6, 60)];
  if ((m = t.match(/draws? (\d+|a|an|one|two|three|four|five|six|seven) cards?/))) return ["draw", clampN(wnum(m[1]), 1, 3)];
  if ((m = t.match(/\+(\d+)\/\+(\d+)/))) return ["buff", clampN(Math.max(+m[1], +m[2]) * 11, 6, 33)];
  if ((m = t.match(/gains? (\d+) atk/))) return ["buff", clampN(+m[1] / 45, 6, 33)];
  if ((m = t.match(/-(\d+)\/-(\d+)/))) return ["weak", clampN(Math.max(+m[1], +m[2]) * 11, 6, 33)];
  if ((m = t.match(/loses? (\d+) atk/))) return ["weak", clampN(+m[1] / 45, 6, 33)];
  if ((m = t.match(/gain(?:s)? (\d+) life/))) return ["heal", clampN(+m[1], 3, 12)];
  if ((m = t.match(/remove (?:up to )?(\d+) damage counters/))) return ["heal", clampN(+m[1] * 3, 3, 12)];
  if ((m = t.match(/heal (\d+) damage/))) return ["heal", clampN(+m[1] / 3.4, 3, 12)];
  if (game === "mtg") return ["dmg", clampN((opts.cmc || 2) * 9, 9, 45)];
  if (game === "pokemon") return ["draw", 1];
  if (opts.equip) return ["buff", 22];
  if (opts.trap) return ["weak", 11];
  return ["dmg", 18];
}

const out = [];
const seen = new Set();
function add(c) {
  const k = c.game + ":" + c.id;
  if (seen.has(k) || !c.img || !c.name) return;
  seen.add(k);
  out.push(c);
}
const count = g => out.filter(c => c.game === g).length;

// ---------- MAGIC: Scryfall bulk "oracle_cards" (every unique card) ----------
async function seedMTG() {
  console.log("MTG: fetching Scryfall bulk data index…");
  const bulk = await jfetch("https://api.scryfall.com/bulk-data");
  const oracle = bulk.data.find(d => d.type === "oracle_cards");
  console.log(`MTG: downloading ${(oracle.size / 1e6).toFixed(0)}MB bulk file…`);
  const r = await fetch(oracle.download_uri);
  const all = await r.json();
  console.log(`MTG: parsing ${all.length} cards…`);
  for (const c of all) {
    if (c.layout === "art_series" || c.layout === "token" || c.layout === "double_faced_token") continue;
    if (c.set_type === "memorabilia" || c.set_type === "token") continue;
    const iu = c.image_uris || (c.card_faces && c.card_faces[0].image_uris);
    if (!iu || !iu.normal) continue;
    const face = (c.card_faces && c.card_faces[0]) || c;
    const num = v => (/^\d+$/.test(v || "") ? +v : NaN);
    const bs = mapStats("mtg", { pow: num(c.power ?? face.power), tou: num(c.toughness ?? face.toughness) });
    const typeLine = c.type_line || face.type_line || "";
    const isSpell = !bs && /\b(Instant|Sorcery)\b/.test(typeLine);
    const fx = isSpell ? mapFx("mtg", c.oracle_text || face.oracle_text || "", { cmc: Math.round(c.cmc || 0) }) : null;
    // mc: real converted mana cost, used by the duel instead of derived cost
    add({ id: c.oracle_id || c.id, name: c.name, game: "mtg", img: iu.normal, native: c.rarity, tier: mapRarity("mtg", c.rarity), set: c.set_name, ...(bs && { bs, mc: Math.round(c.cmc || 0) }), ...(fx && { fx, mc: Math.round(c.cmc || 0) }) });
  }
  console.log("MTG done:", count("mtg"));
}

// ---------- POKÉMON: official pokemon-tcg-data GitHub dump ----------
import { execSync } from "child_process";
import { readFileSync, readdirSync } from "fs";
async function seedPokemon() {
  console.log("Pokémon: downloading official data dump…");
  execSync("curl -sL https://github.com/PokemonTCG/pokemon-tcg-data/archive/refs/heads/master.tar.gz -o /tmp/ptcg.tgz && mkdir -p /tmp/ptcg && tar xzf /tmp/ptcg.tgz -C /tmp/ptcg --strip-components=1", { stdio: "inherit" });
  const setsMeta = JSON.parse(readFileSync("/tmp/ptcg/sets/en.json", "utf8"));
  const setName = Object.fromEntries(setsMeta.map(s => [s.id, s.name]));
  const dir = "/tmp/ptcg/cards/en";
  for (const f of readdirSync(dir)) {
    const setId = f.replace(".json", "");
    const cards = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    for (const c of cards) {
      if (!c.images || !c.images.large) continue;
      let dmg = 0;
      const atks = [];
      for (const a of c.attacks || []) {
        const d = parseInt(a.damage, 10);
        if (d > dmg) dmg = d;
        // atks: the REAL attack list [name, dmg on the shared scale, energy cost];
        // in the duel, attached energy unlocks these tier by tier
        if (d > 0) atks.push([a.name, clampStat(d / 2.4), Math.min((a.cost || []).length, 4)]);
      }
      atks.sort((x, y) => x[2] - y[2] || y[1] - x[1]);
      const bs = c.supertype === "Pokémon" ? mapStats("pokemon", { hp: parseInt(c.hp, 10), dmg }) : null;
      const fx = c.supertype === "Trainer" ? mapFx("pokemon", (c.rules || []).join(" ")) : null;
      // evo: name of the pre-evolution — the duel only lets these be played on top of it
      add({ id: c.id, name: c.name, game: "pokemon", img: c.images.large, native: c.rarity || "Common", tier: mapRarity("pokemon", c.rarity), set: setName[setId] || setId, ...(bs && { bs }), ...(bs && atks.length && { atks: atks.slice(0, 3) }), ...(bs && c.evolvesFrom && { evo: c.evolvesFrom }), ...(fx && { fx }) });
    }
  }
  console.log("Pokémon done:", count("pokemon"));
}

// ---------- YU-GI-OH: full pagination ----------
async function seedYGO() {
  console.log("Yu-Gi-Oh: walking full catalog…");
  let offset = 0;
  while (true) {
    const j = await jfetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?num=2000&offset=${offset}`);
    const batch = j.data || [];
    if (!batch.length) break;
    for (const c of batch) {
      const img = c.card_images && c.card_images[0] && c.card_images[0].image_url;
      if (!img) continue;
      const printing = c.card_sets && c.card_sets.length ? c.card_sets[Math.floor(Math.random() * c.card_sets.length)] : null;
      const native = printing ? printing.set_rarity : "Common";
      // link monsters have no DEF — treat as 0 so they fight as glass cannons
      const def = typeof c.def === "number" ? c.def : (typeof c.linkval === "number" ? 0 : NaN);
      const bs = /monster/i.test(c.type || "") ? mapStats("yugioh", { atk: c.atk, def }) : null;
      const fx = /spell|trap/i.test(c.type || "")
        ? mapFx("yugioh", c.desc || "", { trap: /trap/i.test(c.type), equip: /equip/i.test(c.race || "") })
        : null;
      add({ id: String(c.id), name: c.name, game: "yugioh", img, native, tier: mapRarity("yugioh", native), set: printing ? printing.set_name : "—", ...(bs && { bs }), ...(fx && { fx }) });
    }
    offset += batch.length;
    console.log(`Yu-Gi-Oh: ${offset}`);
    if (!j.meta || !j.meta.next_page_offset) break;
    await sleep(400);
  }
  console.log("Yu-Gi-Oh done:", count("yugioh"));
}

// ---------- LORCANA: all sets (already near-complete) ----------
async function seedLorcana() {
  console.log("Lorcana: fetching all sets…");
  const j = await jfetch("https://api.lorcast.com/v0/sets");
  const sets = (j.results || j).filter(s => s.code);
  for (const s of sets) {
    try {
      const cards = await jfetch(`https://api.lorcast.com/v0/sets/${s.code}/cards`);
      for (const c of cards) {
        if (!c.image_uris || !c.image_uris.digital) continue;
        const native = (c.rarity || "Common").replace(/_/g, " ");
        const chr = [].concat(c.type || []).some((t) => /character/i.test(t));
        add({ id: c.id, name: c.name + (c.version ? " — " + c.version : ""), game: "lorcana", img: c.image_uris.digital.normal || c.image_uris.digital.large, native, tier: mapRarity("lorcana", c.rarity || ""), set: s.name, ...(chr && { chr: 1 }) });
      }
      await sleep(150);
    } catch (e) { console.log("lorcana set failed:", s.code, e.message); }
  }
  console.log("Lorcana done:", count("lorcana"));
}


// ---------- apitcg GitHub data repos (One Piece / Gundam / DB Fusion / Union Arena) ----------
async function seedApitcgRepo(repo, game, isChar = () => false) {
  console.log(game + ": downloading apitcg dump…");
  execSync(`curl -sL https://github.com/apitcg/${repo}/archive/refs/heads/main.tar.gz -o /tmp/${repo}.tgz && rm -rf /tmp/${repo} && mkdir -p /tmp/${repo} && tar xzf /tmp/${repo}.tgz -C /tmp/${repo} --strip-components=1`);
  const dir = `/tmp/${repo}/cards/en`;
  for (const f of readdirSync(dir)) {
    let cards;
    try { cards = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); } catch (e) { continue; }
    if (!Array.isArray(cards)) continue;
    for (const c of cards) {
      const img = c.images && (c.images.large || c.images.small);
      if (!img) continue;
      add({ id: c.code || c.id, name: c.name, game, img, native: c.rarity || "C", tier: mapRarity(game, c.rarity), set: (c.set && c.set.name) || (c.code || "").split("-")[0], ...(isChar(c) && { chr: 1 }) });
    }
  }
  console.log(game + " done:", count(game));
}

// ---------- RIFTBOUND (League of Legends TCG): apitcg dump ----------
// Not routed through seedApitcgRepo: the dump includes sealed products (rarity
// null), and neither c.code nor c.id is unique — alt treatments share collector
// numbers — so the TCGplayer product id is the only stable per-card key.
async function seedRiftbound() {
  console.log("riftbound: downloading apitcg dump…");
  execSync(`curl -sL https://github.com/apitcg/riftbound-tcg-data/archive/refs/heads/main.tar.gz -o /tmp/riftbound.tgz && rm -rf /tmp/riftbound && mkdir -p /tmp/riftbound && tar xzf /tmp/riftbound.tgz -C /tmp/riftbound --strip-components=1`);
  const dir = "/tmp/riftbound/cards/en";
  for (const f of readdirSync(dir)) {
    let cards;
    try { cards = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); } catch (e) { continue; }
    if (!Array.isArray(cards)) continue;
    for (const c of cards) {
      if (!c.rarity || /token/i.test(c.cardType || "")) continue;
      const img = c.images && (c.images.large || c.images.small);
      if (!img) continue;
      add({ id: String((c.tcgplayer && c.tcgplayer.id) || c.id), name: c.name, game: "riftbound", img, native: c.rarity, tier: mapRarity("riftbound", c.rarity), set: (c.set && c.set.name) || f.replace(".json", ""), ...(/unit/i.test(c.cardType || "") && { chr: 1 }) });
    }
  }
  console.log("riftbound done:", count("riftbound"));
}

// ---------- DIGIMON: apitcg dump (no rarity — tier from Digimon level) ----------
export function digimonTier(c) {
  const lv = parseInt(String(c.level || "").replace(/\D/g, ""), 10) || 0;
  if (lv >= 7) return "legendary";
  if (lv === 6) return "epic";
  if (lv === 5) return "rare";
  if (lv === 4 || c.cardType === "Tamer") return "uncommon";
  return "common"; // eggs, rookies, options
}
async function seedDigimon() {
  console.log("digimon: downloading apitcg dump…");
  execSync(`curl -sL https://github.com/apitcg/digimon-tcg-data/archive/refs/heads/main.tar.gz -o /tmp/digimon.tgz && rm -rf /tmp/digimon && mkdir -p /tmp/digimon && tar xzf /tmp/digimon.tgz -C /tmp/digimon --strip-components=1`);
  const dir = "/tmp/digimon/cards/en";
  for (const f of readdirSync(dir)) {
    let cards;
    try { cards = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); } catch (e) { continue; }
    if (!Array.isArray(cards)) continue;
    for (const c of cards) {
      const img = c.images && (c.images.large || c.images.small);
      if (!img) continue;
      add({ id: c.code || c.id, name: c.name, game: "digimon", img, native: c.level && c.level !== "-" ? c.level : (c.cardType || "—"), tier: digimonTier(c), set: (c.set && c.set.name) || (c.code || "").split("-")[0], ...(c.cardType === "Digimon" && { chr: 1 }) });
    }
  }
  console.log("digimon done:", count("digimon"));
}

// ---------- NETRUNNER: NetrunnerDB json (LCG — no rarity, tier synthesized) ----------
async function seedNetrunner() {
  console.log("netrunner: downloading NetrunnerDB dump…");
  execSync(`curl -sL https://github.com/NetrunnerDB/netrunner-cards-json/archive/refs/heads/master.tar.gz -o /tmp/nrdb.tgz && rm -rf /tmp/nrdb && mkdir -p /tmp/nrdb && tar xzf /tmp/nrdb.tgz -C /tmp/nrdb --strip-components=1`);
  const packName = Object.fromEntries(JSON.parse(readFileSync("/tmp/nrdb/packs.json", "utf8")).map((p) => [p.code, p.name]));
  for (const f of readdirSync("/tmp/nrdb/pack")) {
    let cards;
    try { cards = JSON.parse(readFileSync(`/tmp/nrdb/pack/${f}`, "utf8")); } catch (e) { continue; }
    if (!Array.isArray(cards)) continue;
    for (const c of cards) {
      if (!c.code || !c.title) continue;
      const tier = c.type_code === "identity" ? "legendary"
        : c.type_code === "agenda" ? "epic"
        : c.uniqueness ? "rare"
        : (c.faction_cost || 0) >= 4 ? "uncommon" : "common";
      add({ id: c.code, name: c.title, game: "netrunner", img: `https://static.nrdbassets.com/v1/large/${c.code}.jpg`, native: c.type_code || "card", tier, set: packName[c.pack_code] || c.pack_code || "—", ...((c.type_code === "ice" || c.type_code === "program") && { chr: 1 }) });
    }
  }
  console.log("netrunner done:", count("netrunner"));
}

// ---------- WEISS SCHWARZ: HOTC english DB (official ws-tcg images) ----------
async function seedWeiss() {
  console.log("weiss: downloading WeissSchwarz-ENG-DB…");
  execSync(`curl -sL https://github.com/CCondeluci/WeissSchwarz-ENG-DB/archive/refs/heads/master.tar.gz -o /tmp/weiss.tgz && rm -rf /tmp/weiss && mkdir -p /tmp/weiss && tar xzf /tmp/weiss.tgz -C /tmp/weiss --strip-components=1`);
  const dir = "/tmp/weiss/DB";
  for (const f of readdirSync(dir)) {
    let j;
    try { j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); } catch (e) { continue; }
    for (const c of (Array.isArray(j) ? j : Object.values(j))) {
      if (!c.code || !c.name || !c.image) continue;
      add({ id: c.code, name: c.name, game: "weiss", img: c.image, native: c.rarity || "C", tier: mapRarity("weiss", c.rarity), set: c.expansion || "—", ...(c.type === "Character" && { chr: 1 }) });
    }
  }
  console.log("weiss done:", count("weiss"));
}

// ---------- HEARTHSTONE: hearthstonejson ----------
async function seedHearthstone() {
  console.log("hearthstone: fetching collectible cards…");
  const all = await jfetch("https://api.hearthstonejson.com/v1/latest/enUS/cards.collectible.json");
  for (const c of all) {
    if (!c.id || !c.name || c.type === "HERO" && !c.rarity) continue;
    add({ id: c.id, name: c.name, game: "hearthstone", img: `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${c.id}.png`, native: c.rarity || "FREE", tier: mapRarity("hearthstone", c.rarity), set: c.set || "—" });
  }
  console.log("hearthstone done:", count("hearthstone"));
}

// ---------- LEGENDS OF RUNETERRA: Riot Data Dragon ----------
async function seedRuneterra() {
  console.log("runeterra: walking sets…");
  for (let s = 1; s <= 10; s++) {
    try {
      const all = await jfetch(`https://dd.b.pvp.net/latest/set${s}/en_us/data/set${s}-en_us.json`);
      for (const c of all) {
        if (!c.collectible) continue;
        const img = c.assets && c.assets[0] && c.assets[0].gameAbsolutePath;
        if (!img) continue;
        add({ id: c.cardCode, name: c.name, game: "runeterra", img, native: c.rarity || "None", tier: mapRarity("runeterra", c.rarityRef || c.rarity), set: `Set ${s}` });
      }
    } catch (e) { /* set doesn't exist yet */ }
    await sleep(200);
  }
  console.log("runeterra done:", count("runeterra"));
}

// ---------- STAR WARS UNLIMITED: swu-db ----------
async function seedSWU() {
  console.log("swu: walking sets…");
  for (const set of ["sor", "shd", "twi", "jtl", "lof", "sec"]) {
    try {
      const j = await jfetch(`https://api.swu-db.com/cards/${set}?format=json`);
      for (const c of j.data || []) {
        if (!c.FrontArt) continue;
        add({ id: `${c.Set}-${c.Number}`, name: c.Name + (c.Subtitle ? " — " + c.Subtitle : ""), game: "swu", img: c.FrontArt, native: c.Rarity || "Common", tier: mapRarity("swu", c.Rarity), set: c.Set, ...((c.Type === "Unit" || c.Type === "Leader") && { chr: 1 }) });
      }
    } catch (e) { console.log("swu set", set, "skipped:", e.message); }
    await sleep(300);
  }
  console.log("swu done:", count("swu"));
}

// ---------- FLESH AND BLOOD: the-fab-cube dump ----------
async function seedFAB() {
  console.log("fab: downloading card dump…");
  const all = await jfetch("https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/develop/json/english/card.json");
  for (const c of all) {
    const printing = (c.printings || []).find(p => p.image_url);
    if (!printing) continue;
    const rar = printing.rarity || "C"; // rarity lives on the printing
    if (rar === "T" || rar === "B") continue; // tokens / basics
    const pow = parseInt(c.power, 10), def = parseInt(c.defense, 10);
    // real combat stats where printed: power scales like MTG P/T, block
    // value (defense) anchors the health side
    const bs = Number.isFinite(pow)
      ? [Math.max(1, Math.min(99, pow * 9)), Math.max(1, Math.min(99, (Number.isFinite(def) ? def : 2) * 14 + 8))]
      : null;
    add({ id: c.unique_id, name: c.name, game: "fab", img: printing.image_url, native: rar, tier: mapRarity("fab", rar), set: printing.set_id || "—", ...(bs && { bs }) });
  }
  console.log("fab done:", count("fab"));
}

for (const [name, fn] of [["mtg", seedMTG], ["pokemon", seedPokemon], ["ygo", seedYGO], ["lorcana", seedLorcana],
  ["onepiece", () => seedApitcgRepo("one-piece-tcg-data", "onepiece", (c) => c.type === "CHARACTER" || c.type === "LEADER")],
  ["gundam", () => seedApitcgRepo("gundam-tcg-data", "gundam", (c) => c.cardType === "UNIT")],
  ["dbfusion", () => seedApitcgRepo("dragon-ball-fusion-tcg-data", "dbfusion", (c) => c.cardType === "BATTLE" || c.cardType === "LEADER")],
  ["unionarena", () => seedApitcgRepo("union-arena-tcg-data", "unionarena", (c) => c.type === "Character")],
  ["swu", seedSWU],
  ["fab", seedFAB],
  ["riftbound", seedRiftbound],
  ["digimon", seedDigimon],
  ["netrunner", seedNetrunner],
  ["weiss", seedWeiss]]) {
  try { await fn(); } catch (e) { console.log("seeder", name, "FAILED:", e.message); }
  if (globalThis.gc) globalThis.gc();
}

// ---------- universal playability: every CHARACTER fights ----------
// Creature/character cards (chr flag, from each game's real card-type data)
// with no battle stats get them derived from their rarity tier — the shared
// power ladder — spread across the tier's band by a stable per-card hash so
// no two play identically. Non-character cards (events, items, sites, …)
// stay collection-only. (Same formula as lib/duel.js expects.)
const BAND = { common: [30, 56], uncommon: [46, 71], rare: [62, 91], epic: [86, 116], legendary: [106, 141] };
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
let derived = 0;
for (const c of out) {
  const chr = c.chr;
  delete c.chr;
  if (!chr) continue; // only creatures/characters fight — the rest spectate
  if (Array.isArray(c.bs) || Array.isArray(c.fx)) continue;
  const [lo, hi] = BAND[c.tier] || BAND.common;
  const h = fnv(`${c.game}:${c.id}`);
  const sum = lo + (h % (hi - lo + 1));
  const atk = Math.max(1, Math.min(99, Math.round(sum * (0.35 + ((h >>> 8) % 31) / 100))));
  c.bs = [atk, Math.max(1, Math.min(99, sum - atk))];
  derived++;
}
console.log("universal playability: derived stats for", derived, "cards");

mkdirSync("data", { recursive: true });
writeFileSync("data/cards.json", JSON.stringify(out));

const byGame = {}, byTier = {};
for (const c of out) { byGame[c.game] = (byGame[c.game] || 0) + 1; byTier[c.tier] = (byTier[c.tier] || 0) + 1; }
console.log("\nTOTAL:", out.length, "\nby game:", byGame, "\nby tier:", byTier);

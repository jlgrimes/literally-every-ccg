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
    add({ id: c.oracle_id || c.id, name: c.name, game: "mtg", img: iu.normal, native: c.rarity, tier: mapRarity("mtg", c.rarity), set: c.set_name });
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
      add({ id: c.id, name: c.name, game: "pokemon", img: c.images.large, native: c.rarity || "Common", tier: mapRarity("pokemon", c.rarity), set: setName[setId] || setId });
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
      add({ id: String(c.id), name: c.name, game: "yugioh", img, native, tier: mapRarity("yugioh", native), set: printing ? printing.set_name : "—" });
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
        add({ id: c.id, name: c.name + (c.version ? " — " + c.version : ""), game: "lorcana", img: c.image_uris.digital.normal || c.image_uris.digital.large, native, tier: mapRarity("lorcana", c.rarity || ""), set: s.name });
      }
      await sleep(150);
    } catch (e) { console.log("lorcana set failed:", s.code, e.message); }
  }
  console.log("Lorcana done:", count("lorcana"));
}


// ---------- apitcg GitHub data repos (One Piece / Gundam / DB Fusion / Union Arena) ----------
async function seedApitcgRepo(repo, game) {
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
      add({ id: c.code || c.id, name: c.name, game, img, native: c.rarity || "C", tier: mapRarity(game, c.rarity), set: (c.set && c.set.name) || (c.code || "").split("-")[0] });
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
      add({ id: String((c.tcgplayer && c.tcgplayer.id) || c.id), name: c.name, game: "riftbound", img, native: c.rarity, tier: mapRarity("riftbound", c.rarity), set: (c.set && c.set.name) || f.replace(".json", "") });
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
      add({ id: c.code || c.id, name: c.name, game: "digimon", img, native: c.level && c.level !== "-" ? c.level : (c.cardType || "—"), tier: digimonTier(c), set: (c.set && c.set.name) || (c.code || "").split("-")[0] });
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
      add({ id: c.code, name: c.title, game: "netrunner", img: `https://static.nrdbassets.com/v1/large/${c.code}.jpg`, native: c.type_code || "card", tier, set: packName[c.pack_code] || c.pack_code || "—" });
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
      add({ id: c.code, name: c.name, game: "weiss", img: c.image, native: c.rarity || "C", tier: mapRarity("weiss", c.rarity), set: c.expansion || "—" });
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
        add({ id: `${c.Set}-${c.Number}`, name: c.Name + (c.Subtitle ? " — " + c.Subtitle : ""), game: "swu", img: c.FrontArt, native: c.Rarity || "Common", tier: mapRarity("swu", c.Rarity), set: c.Set });
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
    const rar = (c.rarities || [])[0] || "C";
    if (rar === "T") continue; // tokens
    add({ id: c.unique_id, name: c.name, game: "fab", img: printing.image_url, native: rar, tier: mapRarity("fab", rar), set: printing.set_id || "—" });
  }
  console.log("fab done:", count("fab"));
}

for (const [name, fn] of [["mtg", seedMTG], ["pokemon", seedPokemon], ["ygo", seedYGO], ["lorcana", seedLorcana],
  ["onepiece", () => seedApitcgRepo("one-piece-tcg-data", "onepiece")],
  ["gundam", () => seedApitcgRepo("gundam-tcg-data", "gundam")],
  ["dbfusion", () => seedApitcgRepo("dragon-ball-fusion-tcg-data", "dbfusion")],
  ["unionarena", () => seedApitcgRepo("union-arena-tcg-data", "unionarena")],
  ["swu", seedSWU],
  ["fab", seedFAB],
  ["riftbound", seedRiftbound],
  ["digimon", seedDigimon],
  ["netrunner", seedNetrunner],
  ["weiss", seedWeiss]]) {
  try { await fn(); } catch (e) { console.log("seeder", name, "FAILED:", e.message); }
  if (globalThis.gc) globalThis.gc();
}

mkdirSync("data", { recursive: true });
writeFileSync("data/cards.json", JSON.stringify(out));

const byGame = {}, byTier = {};
for (const c of out) { byGame[c.game] = (byGame[c.game] || 0) + 1; byTier[c.tier] = (byTier[c.tier] || 0) + 1; }
console.log("\nTOTAL:", out.length, "\nby game:", byGame, "\nby tier:", byTier);

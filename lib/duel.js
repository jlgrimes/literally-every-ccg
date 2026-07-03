// OMNIRULES — the merged ruleset. One duel, three resource systems:
//   Magic     → mana: your pool grows +1 each turn (cap 10) and refills;
//               creatures cost mana and have summoning sickness.
//   Pokémon   → energy: benching is free, but attacking needs energy;
//               you may attach 1 energy per turn to one of your Pokémon.
//   Yu-Gi-Oh  → normal summon: one per turn; big monsters demand tributes —
//               sacrifice your own board (any game's cards). Attack instantly.
// Shared: 25 HP, deck of 20, draw 1/turn, board of 5, hand cap 8. Attack a
// creature and it hits back; attack face for ceil(ATK/10). 0 HP loses.
//
// Pure functions over a plain state object — the UI and the AI-vs-AI
// simulator both drive the same engine. Card objects must carry bs:[atk,hp].

export const PLAYER_HP = 25;
export const DECK_SIZE = 20;
export const BOARD_MAX = 5;
export const HAND_MAX = 8;
export const MANA_MAX = 10;

export const manaCost = (c) => Math.max(1, Math.min(MANA_MAX, Math.ceil((c.bs[0] + c.bs[1]) / 22)));
export const energyNeed = (c) => Math.max(1, Math.min(3, Math.ceil(c.bs[0] / 25)));
export const tributeNeed = (c) => { const s = c.bs[0] + c.bs[1]; return s >= 120 ? 2 : s >= 80 ? 1 : 0; };
export const faceDmg = (c) => Math.ceil(c.bs[0] / 10);
const statSum = (c) => c.bs[0] + c.bs[1];

// what a card demands, for UI badges: {kind:"mana"|"energy"|"tribute", n}
export function costOf(c) {
  if (c.game === "mtg") return { kind: "mana", n: manaCost(c) };
  if (c.game === "pokemon") return { kind: "energy", n: energyNeed(c) };
  return { kind: "tribute", n: tributeNeed(c) };
}

const slot = (card) => ({ card, curHp: card.bs[1], energy: 0, sick: card.game === "mtg", attacked: false });

export function initDuel(playerDeck, aiDeck, rng = Math.random) {
  const shuffle = (a) => { const d = [...a]; for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; };
  const side = (deck) => ({ hp: PLAYER_HP, deck: shuffle(deck), hand: [], board: [], turns: 0, mana: 0, maxMana: 0, energyUsed: false, summonUsed: false });
  const state = { active: "p", turn: 1, over: false, winner: null, log: [], p: side(playerDeck), ai: side(aiDeck) };
  for (let i = 0; i < 4; i++) { draw(state.p); draw(state.ai); }
  beginTurn(state, "p", true); // going first: no draw on turn 1
  return state;
}

function draw(s) { if (s.deck.length && s.hand.length < HAND_MAX) s.hand.push(s.deck.pop()); else s.deck.pop(); }

function beginTurn(state, who, skipDraw = false) {
  const s = state[who];
  state.active = who;
  s.turns++;
  if (!skipDraw) draw(s);
  s.maxMana = Math.min(MANA_MAX, s.turns);
  s.mana = s.maxMana;
  s.energyUsed = false;
  s.summonUsed = false;
  for (const b of s.board) { b.sick = false; b.attacked = false; }
}

function say(state, msg) { state.log.push(msg); }

function checkOver(state) {
  if (state.p.hp <= 0 && state.ai.hp <= 0) { state.over = true; state.winner = "draw"; }
  else if (state.ai.hp <= 0) { state.over = true; state.winner = "p"; }
  else if (state.p.hp <= 0) { state.over = true; state.winner = "ai"; }
  if (state.over && state.winner !== "draw") say(state, state.winner === "p" ? "🏆 You win!" : "💀 You lose.");
  return state.over;
}

export function canPlay(state, who, i) {
  const s = state[who];
  const c = s.hand[i];
  if (!c || state.over || state.active !== who || s.board.length >= BOARD_MAX) return false;
  if (c.game === "mtg") return manaCost(c) <= s.mana;
  if (c.game === "pokemon") return true;
  return !s.summonUsed && tributeNeed(c) <= s.board.length;
}

// tributes: indexes into own board (Yu-Gi-Oh cards needing them)
export function playCard(state, who, i, tributes = []) {
  if (!canPlay(state, who, i)) return false;
  const s = state[who];
  const c = s.hand[i];
  if (c.game === "mtg") s.mana -= manaCost(c);
  if (c.game === "yugioh") {
    const need = tributeNeed(c);
    const t = [...new Set(tributes)].filter((x) => s.board[x]).slice(0, need);
    if (t.length < need) return false;
    for (const x of t.sort((a, b) => b - a)) {
      say(state, `${who === "p" ? "You" : "AI"} tribute${who === "p" ? "" : "s"} ${s.board[x].card.name}`);
      s.board.splice(x, 1);
    }
    s.summonUsed = true;
  }
  s.hand.splice(i, 1);
  s.board.push(slot(c));
  say(state, `${who === "p" ? "You" : "AI"} play${who === "p" ? "" : "s"} ${c.name} (${c.bs[0]}⚔/${c.bs[1]}♥)`);
  return true;
}

export function canAttach(state, who, bi) {
  const s = state[who];
  const b = s.board[bi];
  return !!b && !state.over && state.active === who && !s.energyUsed &&
    b.card.game === "pokemon" && b.energy < energyNeed(b.card);
}

export function attachEnergy(state, who, bi) {
  if (!canAttach(state, who, bi)) return false;
  const s = state[who];
  s.board[bi].energy++;
  s.energyUsed = true;
  say(state, `⚡ energy on ${s.board[bi].card.name} (${s.board[bi].energy}/${energyNeed(s.board[bi].card)})`);
  return true;
}

export function canAttackWith(state, who, bi) {
  const s = state[who];
  const b = s.board[bi];
  if (!b || state.over || state.active !== who || b.attacked) return false;
  if (b.card.game === "mtg" && b.sick) return false;
  if (b.card.game === "pokemon" && b.energy < energyNeed(b.card)) return false;
  return true;
}

// target: enemy board index, or "face"
export function attack(state, who, bi, target) {
  if (!canAttackWith(state, who, bi)) return false;
  const foe = who === "p" ? "ai" : "p";
  const s = state[who], o = state[foe];
  const b = s.board[bi];
  b.attacked = true;
  if (target === "face") {
    const d = faceDmg(b.card);
    o.hp -= d;
    say(state, `${b.card.name} hits ${foe === "ai" ? "the AI" : "you"} for ${d}`);
    checkOver(state);
    return true;
  }
  const t = o.board[target];
  if (!t) return false;
  t.curHp -= b.card.bs[0];
  b.curHp -= t.card.bs[0]; // defender strikes back
  say(state, `${b.card.name} attacks ${t.card.name}`);
  if (t.curHp <= 0) { say(state, `💥 ${t.card.name} is destroyed`); o.board.splice(target, 1); }
  if (b.curHp <= 0) { say(state, `💥 ${b.card.name} is destroyed`); s.board.splice(bi, 1); }
  return true;
}

// ---------- AI (also usable to sim both sides) ----------
export function runAiSide(state, who) {
  const s = state[who];
  const foe = who === "p" ? "ai" : "p";

  // 1. Yu-Gi-Oh: best summon, tributing only when it upgrades the board
  if (!s.summonUsed) {
    const picks = s.hand
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => c.game === "yugioh" && canPlay(state, who, i))
      .sort((a, b) => statSum(b.c) - statSum(a.c));
    for (const { c, i } of picks) {
      const need = tributeNeed(c);
      const fodder = s.board.map((b, x) => ({ b, x })).sort((a, b) => statSum(a.b.card) - statSum(b.b.card)).slice(0, need);
      const cost = fodder.reduce((n, f) => n + statSum(f.b.card), 0);
      if (need === 0 || statSum(c) > cost + 20) {
        if (playCard(state, who, i, fodder.map((f) => f.x))) break;
      }
    }
  }
  // 2. Magic: greedy mana dump, biggest first
  let played = true;
  while (played) {
    played = false;
    const picks = s.hand.map((c, i) => ({ c, i }))
      .filter(({ c, i }) => c.game === "mtg" && canPlay(state, who, i))
      .sort((a, b) => manaCost(b.c) - manaCost(a.c));
    if (picks.length) played = playCard(state, who, picks[0].i);
  }
  // 3. Pokémon: bench the hardest hitter
  const pk = s.hand.map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.game === "pokemon" && canPlay(state, who, i))
    .sort((a, b) => b.c.bs[0] - a.c.bs[0]);
  if (pk.length) playCard(state, who, pk[0].i);
  // 4. energy: the Pokémon closest to swinging, biggest ATK first
  const en = s.board.map((b, x) => ({ b, x }))
    .filter(({ x }) => canAttach(state, who, x))
    .sort((a, b) => (energyNeed(a.b.card) - a.b.energy) - (energyNeed(b.b.card) - b.b.energy) || b.b.card.bs[0] - a.b.card.bs[0]);
  if (en.length) attachEnergy(state, who, en[0].x);
  // 5. attacks: lethal → face; else favorable trades; else face
  const o = state[foe];
  const ready = () => s.board.map((b, x) => ({ b, x })).filter(({ x }) => canAttackWith(state, who, x));
  const lethal = ready().reduce((n, { b }) => n + faceDmg(b.card), 0) >= o.hp;
  let guard = 0;
  while (!state.over && ready().length && guard++ < 30) {
    const { b, x } = ready().sort((a, z) => z.b.card.bs[0] - a.b.card.bs[0])[0];
    if (lethal) { attack(state, who, x, "face"); continue; }
    const kills = o.board.map((t, ti) => ({ t, ti }))
      .filter(({ t }) => t.curHp <= b.card.bs[0])
      .filter(({ t }) => b.curHp > t.card.bs[0] || statSum(t.card) >= statSum(b.card))
      .sort((a, z) => statSum(z.t.card) - statSum(a.t.card));
    if (kills.length) attack(state, who, x, kills[0].ti);
    else attack(state, who, x, "face");
  }
}

// player ends their turn → AI plays out its whole turn → back to player
export function endTurn(state) {
  if (state.over || state.active !== "p") return state;
  beginTurn(state, "ai");
  runAiSide(state, "ai");
  if (!state.over) { state.turn++; beginTurn(state, "p"); }
  return state;
}

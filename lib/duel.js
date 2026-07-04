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

// real printed CMC when the card carries it (mc), else derived from stats
export const manaCost = (c) => Number.isFinite(c.mc)
  ? Math.min(MANA_MAX, c.mc)
  : Math.max(1, Math.min(MANA_MAX, Math.ceil((c.bs[0] + c.bs[1]) / 22)));
export const energyNeed = (c) => Math.max(1, Math.min(3, Math.ceil(c.bs[0] / 25)));
export const tributeNeed = (c) => { const s = c.bs[0] + c.bs[1]; return s >= 100 ? 2 : s >= 60 ? 1 : 0; };
export const faceDmg = (c) => Math.ceil(c.bs[0] / 10);
const statSum = (c) => c.bs[0] + c.bs[1];

// non-creature cards carry fx: [kind, n] — spells, trainers, traps
export const isSpell = (c) => Array.isArray(c.fx);
// which target the effect needs: enemy creature, own creature, deck pick, none
export const FX_TARGET = { dmg: "enemy", kill: "enemy", weak: "enemy", buff: "own", tutor: "deck", tutorc: "deck", draw: null, heal: null, nuke: null };
export const FX_LABEL = { dmg: "💥", kill: "☠", weak: "🌀", buff: "💪", tutor: "🔍", tutorc: "🔍", draw: "📜", heal: "❤️", nuke: "💫" };

// what a card demands, for UI badges: {kind:"mana"|"energy"|"tribute"|"trainer"|"spell", n}
export function costOf(c) {
  if (c.game === "mtg") return { kind: "mana", n: manaCost(c) };
  if (isSpell(c)) return { kind: c.game === "pokemon" ? "trainer" : "spell", n: 0 };
  if (c.game === "pokemon") return { kind: "energy", n: energyNeed(c) };
  return { kind: "tribute", n: tributeNeed(c) };
}

const slot = (card) => ({ card, curHp: card.bs[1], energy: 0, sick: card.game === "mtg", attacked: false });

// log labels: "You"/"AI" solo, real names in multiplayer
const label = (state, who) => (state.names && state.names[who]) || (who === "p" ? "You" : "AI");
const verb = (state, who, v) => (label(state, who) === "You" ? v : v + "s");
const hitName = (state, who) => { const l = label(state, who); return l === "You" ? "you" : l === "AI" ? "the AI" : l; };

export function initDuel(playerDeck, aiDeck, rng = Math.random, names = null) {
  const shuffle = (a) => { const d = [...a]; for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; };
  const side = (deck) => ({ hp: PLAYER_HP, deck: shuffle(deck), hand: [], board: [], turns: 0, mana: 0, maxMana: 0, energyUsed: false, summonUsed: false, trainerUsed: false, spellUsed: false });
  const state = { active: "p", turn: 1, over: false, winner: null, log: [], names, p: side(playerDeck), ai: side(aiDeck) };
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
  s.trainerUsed = false;
  s.spellUsed = false;
  for (const b of s.board) { b.sick = false; b.attacked = false; }
}

function say(state, msg) { state.log.push(msg); }

function checkOver(state) {
  if (state.p.hp <= 0 && state.ai.hp <= 0) { state.over = true; state.winner = "draw"; }
  else if (state.ai.hp <= 0) { state.over = true; state.winner = "p"; }
  else if (state.p.hp <= 0) { state.over = true; state.winner = "ai"; }
  if (state.over && state.winner !== "draw") {
    const w = label(state, state.winner);
    say(state, w === "You" ? "🏆 You win!" : `🏆 ${w} wins the duel!`);
  }
  return state.over;
}

// evolution cards (evo: name of the pre-evolution) can only be played on
// top of a matching Pokémon you control
export const isEvolution = (c) => c.game === "pokemon" && !!c.evo;
export function evoTargets(state, who, c) {
  if (!isEvolution(c)) return [];
  return state[who].board
    .map((b, x) => ({ b, x }))
    .filter(({ b }) => b.card.game === "pokemon" && b.card.name === c.evo)
    .map(({ x }) => x);
}

// spells with a target need one that exists; deck searches need a match in deck
export function fxTargets(state, who, c) {
  const kind = c.fx[0];
  const need = FX_TARGET[kind];
  const foe = who === "p" ? "ai" : "p";
  if (need === "enemy") return state[foe].board.map((_, x) => x);
  if (need === "own") return state[who].board.map((_, x) => x);
  if (need === "deck") {
    return state[who].deck
      .map((d, x) => ({ d, x }))
      .filter(({ d }) => (kind === "tutorc" ? Array.isArray(d.bs) : true))
      .map(({ x }) => x);
  }
  return null; // untargeted
}

export function canPlay(state, who, i) {
  const s = state[who];
  const c = s.hand[i];
  if (!c || state.over || state.active !== who) return false;
  if (isSpell(c)) {
    if (c.game === "mtg" && manaCost(c) > s.mana) return false;
    if (c.game === "pokemon" && s.trainerUsed) return false;
    if (c.game === "yugioh" && s.spellUsed) return false;
    if (c.fx[0] === "dmg") return true; // face is always a legal target
    const t = fxTargets(state, who, c);
    return t === null || t.length > 0;
  }
  if (isEvolution(c)) return evoTargets(state, who, c).length > 0; // replaces a slot, board-full ok
  if (s.board.length >= BOARD_MAX) return false;
  if (c.game === "mtg") return manaCost(c) <= s.mana;
  if (c.game === "pokemon") return true;
  return !s.summonUsed && tributeNeed(c) <= s.board.length;
}

// cull a side's board of anything at 0 HP
function cull(state, who) {
  const s = state[who];
  for (let x = s.board.length - 1; x >= 0; x--) {
    if (s.board[x].curHp <= 0) {
      say(state, `💥 ${s.board[x].card.name} is destroyed`);
      s.board.splice(x, 1);
    }
  }
}

// resolve a spell/trainer/trap. spellTarget: enemy/own board index, "face"
// (dmg only), or a deck index for tutors.
function castSpell(state, who, i, spellTarget) {
  const s = state[who];
  const foe = who === "p" ? "ai" : "p";
  const o = state[foe];
  const c = s.hand[i];
  const [kind, n] = c.fx;
  const need = FX_TARGET[kind];
  let t = null;
  if (kind === "dmg" && spellTarget === "face") t = "face";
  else if (need === "enemy") { t = o.board[spellTarget] ? spellTarget : null; if (t === null) return false; }
  else if (need === "own") { t = s.board[spellTarget] ? spellTarget : null; if (t === null) return false; }
  else if (need === "deck") { if (!fxTargets(state, who, c).includes(spellTarget)) return false; t = spellTarget; }
  if (c.game === "mtg") s.mana -= manaCost(c);
  if (c.game === "pokemon") s.trainerUsed = true;
  if (c.game === "yugioh") s.spellUsed = true;
  s.hand.splice(i, 1);
  const me = label(state, who);
  if (kind === "dmg" && t === "face") {
    const d = Math.ceil(n / 10);
    o.hp -= d;
    say(state, `${FX_LABEL[kind]} ${c.name}: hits ${hitName(state, foe)} for ${d}`);
    checkOver(state);
  } else if (kind === "dmg") {
    const tgt = o.board[t];
    tgt.curHp -= n;
    say(state, `${FX_LABEL[kind]} ${c.name}: ${n} damage to ${tgt.card.name}`);
    cull(state, foe);
  } else if (kind === "kill") {
    say(state, `${FX_LABEL[kind]} ${c.name} destroys ${o.board[t].card.name}`);
    o.board.splice(t, 1);
  } else if (kind === "weak") {
    const tgt = o.board[t];
    tgt.card = { ...tgt.card, bs: [Math.max(1, tgt.card.bs[0] - n), tgt.card.bs[1]] };
    say(state, `${FX_LABEL[kind]} ${c.name}: ${tgt.card.name} loses ${n}⚔`);
  } else if (kind === "buff") {
    const tgt = s.board[t];
    tgt.card = { ...tgt.card, bs: [Math.min(120, tgt.card.bs[0] + n), Math.min(120, tgt.card.bs[1] + n)] };
    tgt.curHp += n;
    say(state, `${FX_LABEL[kind]} ${c.name}: ${tgt.card.name} gets +${n}⚔/+${n}♥`);
  } else if (kind === "draw") {
    for (let k = 0; k < n; k++) draw(s);
    say(state, `${FX_LABEL[kind]} ${me} ${verb(state, who, "play")} ${c.name}: draw${label(state, who) === "You" ? "" : "s"} ${n}`);
  } else if (kind === "heal") {
    s.hp = Math.min(PLAYER_HP, s.hp + n);
    say(state, `${FX_LABEL[kind]} ${c.name}: ${me === "You" ? "you heal" : me + " heals"} ${n}`);
  } else if (kind === "nuke") {
    for (const b of o.board) b.curHp -= n;
    say(state, `${FX_LABEL[kind]} ${c.name} blasts the enemy board for ${n}`);
    cull(state, foe);
  } else if (kind === "tutor" || kind === "tutorc") {
    const picked = s.deck.splice(t, 1)[0];
    if (s.hand.length < HAND_MAX) s.hand.push(picked);
    // shuffle what's left, like the card says
    for (let x = s.deck.length - 1; x > 0; x--) { const j = Math.floor(Math.random() * (x + 1)); [s.deck[x], s.deck[j]] = [s.deck[j], s.deck[x]]; }
    say(state, `${FX_LABEL[kind]} ${me} ${verb(state, who, "search")} the deck: ${picked.name} to hand`);
  } else return false;
  return true;
}

// tributes: indexes into own board (Yu-Gi-Oh cards needing them)
// evoTarget: own board index to evolve (Pokémon evolution cards)
// spellTarget: see castSpell
export function playCard(state, who, i, tributes = [], evoTarget = null, spellTarget = null) {
  if (!canPlay(state, who, i)) return false;
  const s = state[who];
  const c = s.hand[i];
  if (isSpell(c)) return castSpell(state, who, i, spellTarget);
  if (isEvolution(c)) {
    const targets = evoTargets(state, who, c);
    const x = targets.includes(evoTarget) ? evoTarget : targets[0];
    const b = s.board[x];
    const dmg = b.card.bs[1] - b.curHp; // damage carries over, like the real TCG
    say(state, `🧬 ${b.card.name} evolves into ${c.name} (${c.bs[0]}⚔/${c.bs[1]}♥)`);
    b.card = c;
    b.curHp = Math.max(1, c.bs[1] - dmg);
    b.sick = false; // energy, and whether it attacked, carry over too
    s.hand.splice(i, 1);
    return true;
  }
  if (c.game === "mtg") s.mana -= manaCost(c);
  if (c.game === "yugioh") {
    const need = tributeNeed(c);
    const t = [...new Set(tributes)].filter((x) => s.board[x]).slice(0, need);
    if (t.length < need) return false;
    for (const x of t.sort((a, b) => b - a)) {
      say(state, `${label(state, who)} ${verb(state, who, "tribute")} ${s.board[x].card.name}`);
      s.board.splice(x, 1);
    }
    s.summonUsed = true;
  }
  s.hand.splice(i, 1);
  s.board.push(slot(c));
  say(state, `${label(state, who)} ${verb(state, who, "play")} ${c.name} (${c.bs[0]}⚔/${c.bs[1]}♥)`);
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
    say(state, `${b.card.name} hits ${hitName(state, foe)} for ${d}`);
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
  const o = state[foe];
  const castable = () => s.hand.map((c, i) => ({ c, i })).filter(({ c, i }) => isSpell(c) && canPlay(state, who, i));
  const deckScore = (d) => (Array.isArray(d.bs) ? d.bs[0] + d.bs[1] : 30);

  // 0. spells: card advantage first, then removal
  let spGuard = 0, acted = true;
  while (acted && spGuard++ < 10) {
    acted = false;
    const list = castable();
    const adv = list.find(({ c }) => c.fx[0] === "draw" && s.hand.length <= 5) ||
      list.find(({ c }) => (c.fx[0] === "tutor" || c.fx[0] === "tutorc") && s.hand.length < HAND_MAX);
    if (adv) {
      if (adv.c.fx[0] === "draw") acted = playCard(state, who, adv.i);
      else {
        const targets = fxTargets(state, who, adv.c).sort((a, b) => deckScore(s.deck[b]) - deckScore(s.deck[a]));
        if (targets.length) acted = playCard(state, who, adv.i, [], null, targets[0]);
      }
      if (acted) continue;
    }
    const biggest = o.board.map((b, x) => ({ b, x })).sort((a, z) => statSum(z.b.card) - statSum(a.b.card))[0];
    for (const { c, i } of list) {
      const k = c.fx[0];
      if (k === "nuke" && o.board.length >= 2) { acted = playCard(state, who, i); break; }
      if (k === "kill" && biggest && statSum(biggest.b.card) >= 50) { acted = playCard(state, who, i, [], null, biggest.x); break; }
      if (k === "dmg") {
        const kb = o.board.map((b, x) => ({ b, x })).filter(({ b }) => b.curHp <= c.fx[1]).sort((a, z) => statSum(z.b.card) - statSum(a.b.card))[0];
        if (kb) { acted = playCard(state, who, i, [], null, kb.x); break; }
        if (o.hp <= Math.ceil(c.fx[1] / 10)) { acted = playCard(state, who, i, [], null, "face"); break; }
      }
      if (k === "weak" && biggest && biggest.b.card.bs[0] >= 30) { acted = playCard(state, who, i, [], null, biggest.x); break; }
      if (k === "heal" && s.hp <= PLAYER_HP - c.fx[1]) { acted = playCard(state, who, i); break; }
    }
  }

  // 1. Yu-Gi-Oh: best summon, tributing only when it upgrades the board
  if (!s.summonUsed) {
    const picks = s.hand
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => c.game === "yugioh" && !isSpell(c) && canPlay(state, who, i))
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
      .filter(({ c, i }) => c.game === "mtg" && !isSpell(c) && canPlay(state, who, i))
      .sort((a, b) => manaCost(b.c) - manaCost(a.c));
    if (picks.length) played = playCard(state, who, picks[0].i);
  }
  // 3. Pokémon: evolve whatever can evolve, then bench the hardest hitter
  let evolving = true, evGuard = 0;
  while (evolving && evGuard++ < 8) {
    const ev = s.hand.map((c, i) => ({ c, i }))
      .filter(({ c, i }) => isEvolution(c) && canPlay(state, who, i))
      .sort((a, b) => statSum(b.c) - statSum(a.c));
    evolving = ev.length ? playCard(state, who, ev[0].i) : false;
  }
  const pk = s.hand.map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.game === "pokemon" && !isSpell(c) && !isEvolution(c) && canPlay(state, who, i))
    .sort((a, b) => b.c.bs[0] - a.c.bs[0]);
  if (pk.length) playCard(state, who, pk[0].i);
  // 4. energy: the Pokémon closest to swinging, biggest ATK first
  const en = s.board.map((b, x) => ({ b, x }))
    .filter(({ x }) => canAttach(state, who, x))
    .sort((a, b) => (energyNeed(a.b.card) - a.b.energy) - (energyNeed(b.b.card) - b.b.energy) || b.b.card.bs[0] - a.b.card.bs[0]);
  if (en.length) attachEnergy(state, who, en[0].x);
  // 4.5 buff the biggest creature that can still swing
  const bf = castable().find(({ c }) => c.fx[0] === "buff");
  if (bf && s.board.length) {
    const tgt = s.board.map((b, x) => ({ b, x })).sort((a, z) => statSum(z.b.card) - statSum(a.b.card))[0];
    playCard(state, who, bf.i, [], null, tgt.x);
  }

  // 5. attacks: lethal → face; else favorable trades; else face
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

  // 6. leftover burn goes to the face
  let bGuard = 0;
  while (!state.over && bGuard++ < 8) {
    const burn = castable().find(({ c }) => c.fx[0] === "dmg");
    if (!burn || !playCard(state, who, burn.i, [], null, "face")) break;
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

// PvP: hand the turn to the other human — no AI involved
export function passTurn(state) {
  if (state.over) return state;
  const next = state.active === "p" ? "ai" : "p";
  if (next === "p") state.turn++;
  beginTurn(state, next);
  return state;
}

export function concede(state, side) {
  if (state.over) return state;
  state[side].hp = 0;
  say(state, `${label(state, side)} ${verb(state, side, "concede")}.`);
  checkOver(state);
  return state;
}

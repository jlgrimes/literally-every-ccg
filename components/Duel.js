"use client";
import { useRef, useState, useReducer } from "react";
import {
  initDuel, playCard, attachEnergy, attack, endTurn, canPlay, canAttach,
  canAttackWith, costOf, energyNeed, tributeNeed, isEvolution, evoTargets,
} from "../lib/duel";

const COST_GLYPH = { mana: "💧", energy: "⚡", tribute: "⭐" };
const GAME_TAG = { mtg: "MTG", pokemon: "PKM", yugioh: "YGO" };

export default function Duel({ playerDeck, aiDeck, onDone }) {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = initDuel(playerDeck, aiDeck);
  const [, force] = useReducer((x) => x + 1, 0);
  const [sel, setSel] = useState(null);          // own board index picked to attack
  // pending: { hand, need, picked:[] } tribute mode | { hand, evolve:true } evolution targeting
  const [pending, setPending] = useState(null);
  const [hint, setHint] = useState("Play cards, then attack. Mana fuels Magic, energy powers Pokémon, tributes summon big Yu-Gi-Oh monsters.");
  const reported = useRef(false);

  const st = stRef.current;
  const mine = st.p, foe = st.ai;

  function refresh() { force(); }
  function done() {
    if (st.over && !reported.current) { reported.current = true; onDone(st.winner === "p" ? "win" : st.winner === "ai" ? "loss" : "draw"); }
    else onDone(null);
  }

  function clickHand(i) {
    if (st.over) return;
    setSel(null);
    const c = mine.hand[i];
    if (!c) return;
    if (pending) { setPending(null); return; }
    if (!canPlay(st, "p", i)) {
      const { kind, n } = costOf(c);
      if (isEvolution(c)) setHint(`🧬 ${c.name} evolves from ${c.evo} — you need one on your board first.`);
      else if (mine.board.length >= 5) setHint("Board is full.");
      else if (kind === "mana") setHint(`${c.name} needs ${n}💧 — you have ${mine.mana}.`);
      else if (kind === "tribute") setHint(mine.summonUsed ? "Already normal-summoned this turn." : `${c.name} needs ${n}⭐ tribute${n > 1 ? "s" : ""} — not enough creatures.`);
      return;
    }
    if (isEvolution(c)) {
      const targets = evoTargets(st, "p", c);
      if (targets.length === 1) { playCard(st, "p", i, [], targets[0]); setHint(""); refresh(); }
      else { setPending({ hand: i, evolve: true }); setHint(`Evolve which ${c.evo}? Tap it.`); }
      return;
    }
    const need = c.game === "yugioh" ? tributeNeed(c) : 0;
    if (need > 0) {
      setPending({ hand: i, need, picked: [] });
      setHint(`Tribute summon: sacrifice ${need} of your creature${need > 1 ? "s" : ""} — tap them.`);
      return;
    }
    playCard(st, "p", i);
    setHint("");
    refresh();
  }

  function clickMine(x) {
    if (st.over) return;
    if (pending) {
      if (pending.evolve) {
        const c = mine.hand[pending.hand];
        if (c && evoTargets(st, "p", c).includes(x)) { playCard(st, "p", pending.hand, [], x); setPending(null); setHint(""); }
        refresh();
        return;
      }
      const picked = pending.picked.includes(x) ? pending.picked.filter((v) => v !== x) : [...pending.picked, x];
      if (picked.length >= pending.need) {
        playCard(st, "p", pending.hand, picked);
        setPending(null); setHint("");
      } else setPending({ ...pending, picked });
      refresh();
      return;
    }
    if (canAttackWith(st, "p", x)) { setSel(sel === x ? null : x); setHint("Pick a target — an enemy card, or their HP."); return; }
    if (canAttach(st, "p", x)) { attachEnergy(st, "p", x); setHint(""); refresh(); return; }
    const b = mine.board[x];
    if (!b) return;
    if (b.attacked) setHint(`${b.card.name} already attacked.`);
    else if (b.sick) setHint(`${b.card.name} has summoning sickness — attacks next turn.`);
    else if (b.card.game === "pokemon") setHint(mine.energyUsed ? "Energy already attached this turn." : `${b.card.name} needs ${energyNeed(b.card)}⚡ — tap it to attach.`);
  }

  function clickFoe(target) {
    if (st.over || sel === null) return;
    attack(st, "p", sel, target);
    setSel(null);
    refresh();
  }

  function onEnd() {
    if (st.over) return;
    setSel(null); setPending(null); setHint("");
    endTurn(st);
    refresh();
  }

  const Board = ({ side, ownSide }) => (
    <div className={`drow${ownSide ? " mineboard" : ""}`}>
      {side.board.map((b, x) => {
        const need = b.card.game === "pokemon" ? energyNeed(b.card) : 0;
        const ready = ownSide && canAttackWith(st, "p", x);
        const cls = [
          "dcard", `t-${b.card.tier}`,
          ownSide && sel === x ? "sel" : "",
          ownSide && pending && pending.picked.includes(x) ? "trib" : "",
          ready ? "ready" : "",
          !ownSide && sel !== null ? "targetable" : "",
          b.attacked ? "spent" : "",
        ].filter(Boolean).join(" ");
        return (
          <button key={`${b.card.game}:${b.card.id}:${x}`} className={cls}
            onClick={() => (ownSide ? clickMine(x) : clickFoe(x))}
            title={`${b.card.name} · ${GAME_TAG[b.card.game]}`}>
            <img src={b.card.img} alt={b.card.name} referrerPolicy="no-referrer" />
            <span className="dstat datk">{b.card.bs[0]}⚔</span>
            <span className={`dstat dhpv${b.curHp < b.card.bs[1] ? " hurt" : ""}`}>{b.curHp}♥</span>
            {b.sick && <span className="dtag">💤</span>}
            {need > 0 && <span className={`dtag den${b.energy >= need ? " full" : ""}`}>⚡{b.energy}/{need}</span>}
          </button>
        );
      })}
      {!side.board.length && <div className="drow-empty">no creatures</div>}
    </div>
  );

  return (
    <div className="packscreen duelscreen">
      <button className={`dhp foe${sel !== null ? " targetable" : ""}`} onClick={() => clickFoe("face")}>
        <b>AI</b> ♥ {Math.max(0, foe.hp)} <span className="dsub">· hand {foe.hand.length} · deck {foe.deck.length}</span>
        {sel !== null && <span className="dsub"> — tap to attack!</span>}
      </button>
      <Board side={foe} ownSide={false} />

      <div className="duel-log">
        {st.log.slice(-3).map((l, i) => <div key={st.log.length - 3 + i}>{l}</div>)}
      </div>

      <Board side={mine} ownSide={true} />
      <div className="dhp mine">
        <b>You</b> ♥ {Math.max(0, mine.hp)}
        <span className="dsub"> · 💧{mine.mana}/{mine.maxMana} · ⚡{mine.energyUsed ? "used" : "ready"} · ⭐{mine.summonUsed ? "used" : "ready"} · deck {mine.deck.length}</span>
      </div>

      <div className="duel-hand">
        {mine.hand.map((c, i) => {
          const { kind, n } = costOf(c);
          const ok = canPlay(st, "p", i);
          return (
            <button key={`${c.game}:${c.id}:${i}`} className={`dcard hand t-${c.tier}${ok ? "" : " nope"}${pending && pending.hand === i ? " sel" : ""}`}
              onClick={() => clickHand(i)} title={`${c.name} · ${GAME_TAG[c.game]}${isEvolution(c) ? ` · evolves from ${c.evo}` : ""}`}>
              <img src={c.img} alt={c.name} referrerPolicy="no-referrer" />
              <span className="dcost">{COST_GLYPH[kind]}{n}</span>
              {isEvolution(c) && <span className="dtag">🧬</span>}
              <span className="dstat datk">{c.bs[0]}⚔</span>
              <span className="dstat dhpv">{c.bs[1]}♥</span>
            </button>
          );
        })}
        {!mine.hand.length && <div className="drow-empty">empty hand</div>}
      </div>

      {hint && !st.over && <div className="duel-hint">{hint}</div>}

      <div className="arena-actions">
        <button className="pull display" disabled={st.over} onClick={onEnd}>END TURN</button>
        <button className="pull10 display" onClick={done}>{st.over ? "DONE" : "CONCEDE"}</button>
      </div>

      {st.over && (
        <div className="duel-over" onClick={done}>
          <div className={`ps-title display arena-${st.winner === "p" ? "win" : st.winner === "ai" ? "loss" : "draw"}`}>
            {st.winner === "p" ? "VICTORY" : st.winner === "ai" ? "DEFEAT" : "DRAW"}
          </div>
          <div className="arena-sub">turn {st.turn} · tap to close</div>
        </div>
      )}
    </div>
  );
}

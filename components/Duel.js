"use client";
import { useEffect, useRef, useState, useReducer } from "react";
import {
  initDuel, playCard, attachEnergy, attack, endTurn, passTurn, concede,
  canPlay, canAttach, canAttackWith, costOf, energyNeed, tributeNeed,
  isEvolution, evoTargets,
} from "../lib/duel";

const COST_GLYPH = { mana: "💧", energy: "⚡", tribute: "⭐" };
const GAME_TAG = { mtg: "MTG", pokemon: "PKM", yugioh: "YGO" };

// mode "ai": decks in, engine runs the opponent.
// mode "pvp": mySide "p"|"ai"; `external` {seq, state} applies the opponent's
// writes; every local action calls onSync(state) so they see yours.
export default function Duel({
  mode = "ai", mySide = "p", playerDeck, aiDeck, initialState = null,
  external = null, onSync = null, names = null, onDone,
}) {
  const my = mySide, their = my === "p" ? "ai" : "p";
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = initialState || initDuel(playerDeck, aiDeck);
  const [, force] = useReducer((x) => x + 1, 0);
  const appliedSeq = useRef(external ? external.seq : 0);
  const [sel, setSel] = useState(null);          // own board index picked to attack
  // pending: { hand, need, picked:[] } tribute mode | { hand, evolve:true } evolution targeting
  const [pending, setPending] = useState(null);
  const [hint, setHint] = useState("Play cards, then attack. Mana fuels Magic, energy powers Pokémon, tributes summon big Yu-Gi-Oh monsters.");
  const reported = useRef(false);

  // opponent moved — adopt their state. Never clobber our own in-progress
  // turn, except a game-ending state (their concede) which always lands.
  useEffect(() => {
    if (!external || !external.state || external.seq <= appliedSeq.current) return;
    if (!external.state.over && !stRef.current.over && stRef.current.active === my && external.state.active === my) return;
    appliedSeq.current = external.seq;
    stRef.current = external.state;
    setSel(null); setPending(null);
    force();
  }, [external, my]);

  const st = stRef.current;
  const mine = st[my], foe = st[their];
  const myTurn = !st.over && st.active === my;
  const meLabel = (names && names.me) || "You";
  const themLabel = (names && names.them) || (mode === "ai" ? "AI" : "Them");

  function refresh() { force(); }
  function sync() { if (onSync) onSync(st); }

  function done() {
    if (mode === "pvp" && !st.over) { concede(st, my); sync(); }
    if (st.over && !reported.current) {
      reported.current = true;
      onDone(st.winner === my ? "win" : st.winner === their ? "loss" : "draw");
    } else onDone(null);
  }

  function clickHand(i) {
    if (!myTurn) return;
    setSel(null);
    const c = mine.hand[i];
    if (!c) return;
    if (pending) { setPending(null); return; }
    if (!canPlay(st, my, i)) {
      const { kind, n } = costOf(c);
      if (isEvolution(c)) setHint(`🧬 ${c.name} evolves from ${c.evo} — you need one on your board first.`);
      else if (mine.board.length >= 5) setHint("Board is full.");
      else if (kind === "mana") setHint(`${c.name} needs ${n}💧 — you have ${mine.mana}.`);
      else if (kind === "tribute") setHint(mine.summonUsed ? "Already normal-summoned this turn." : `${c.name} needs ${n}⭐ tribute${n > 1 ? "s" : ""} — not enough creatures.`);
      return;
    }
    if (isEvolution(c)) {
      const targets = evoTargets(st, my, c);
      if (targets.length === 1) { playCard(st, my, i, [], targets[0]); setHint(""); sync(); refresh(); }
      else { setPending({ hand: i, evolve: true }); setHint(`Evolve which ${c.evo}? Tap it.`); }
      return;
    }
    const need = c.game === "yugioh" ? tributeNeed(c) : 0;
    if (need > 0) {
      setPending({ hand: i, need, picked: [] });
      setHint(`Tribute summon: sacrifice ${need} of your creature${need > 1 ? "s" : ""} — tap them.`);
      return;
    }
    playCard(st, my, i);
    setHint("");
    sync();
    refresh();
  }

  function clickMine(x) {
    if (!myTurn) return;
    if (pending) {
      if (pending.evolve) {
        const c = mine.hand[pending.hand];
        if (c && evoTargets(st, my, c).includes(x)) { playCard(st, my, pending.hand, [], x); setPending(null); setHint(""); sync(); }
        refresh();
        return;
      }
      const picked = pending.picked.includes(x) ? pending.picked.filter((v) => v !== x) : [...pending.picked, x];
      if (picked.length >= pending.need) {
        playCard(st, my, pending.hand, picked);
        setPending(null); setHint("");
        sync();
      } else setPending({ ...pending, picked });
      refresh();
      return;
    }
    if (canAttackWith(st, my, x)) { setSel(sel === x ? null : x); setHint("Pick a target — an enemy card, or their HP."); return; }
    if (canAttach(st, my, x)) { attachEnergy(st, my, x); setHint(""); sync(); refresh(); return; }
    const b = mine.board[x];
    if (!b) return;
    if (b.attacked) setHint(`${b.card.name} already attacked.`);
    else if (b.sick) setHint(`${b.card.name} has summoning sickness — attacks next turn.`);
    else if (b.card.game === "pokemon") setHint(mine.energyUsed ? "Energy already attached this turn." : `${b.card.name} needs ${energyNeed(b.card)}⚡ — tap it to attach.`);
  }

  function clickFoe(target) {
    if (!myTurn || sel === null) return;
    attack(st, my, sel, target);
    setSel(null);
    sync();
    refresh();
  }

  function onEnd() {
    if (!myTurn) return;
    setSel(null); setPending(null); setHint("");
    if (mode === "ai") endTurn(st);
    else passTurn(st);
    sync();
    refresh();
  }

  const Board = ({ side, ownSide }) => (
    <div className={`drow${ownSide ? " mineboard" : ""}`}>
      {side.board.map((b, x) => {
        const need = b.card.game === "pokemon" ? energyNeed(b.card) : 0;
        const ready = ownSide && myTurn && canAttackWith(st, my, x);
        const cls = [
          "dcard", `t-${b.card.tier}`,
          ownSide && sel === x ? "sel" : "",
          ownSide && pending && pending.picked && pending.picked.includes(x) ? "trib" : "",
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
        <b>{themLabel}</b> ♥ {Math.max(0, foe.hp)} <span className="dsub">· hand {foe.hand.length} · deck {foe.deck.length}</span>
        {sel !== null && <span className="dsub"> — tap to attack!</span>}
      </button>
      <Board side={foe} ownSide={false} />

      <div className="duel-log">
        {mode === "pvp" && !st.over && (
          <div className={`turn-tag${myTurn ? " yours" : ""}`}>{myTurn ? "▶ your turn" : `⏳ ${themLabel}'s turn…`}</div>
        )}
        {st.log.slice(-3).map((l, i) => <div key={st.log.length - 3 + i}>{l}</div>)}
      </div>

      <Board side={mine} ownSide={true} />
      <div className="dhp mine">
        <b>{meLabel}</b> ♥ {Math.max(0, mine.hp)}
        <span className="dsub"> · 💧{mine.mana}/{mine.maxMana} · ⚡{mine.energyUsed ? "used" : "ready"} · ⭐{mine.summonUsed ? "used" : "ready"} · deck {mine.deck.length}</span>
      </div>

      <div className="duel-hand">
        {mine.hand.map((c, i) => {
          const { kind, n } = costOf(c);
          const ok = myTurn && canPlay(st, my, i);
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

      {hint && !st.over && myTurn && <div className="duel-hint">{hint}</div>}

      <div className="arena-actions">
        <button className="pull display" disabled={st.over || !myTurn} onClick={onEnd}>END TURN</button>
        <button className="pull10 display" onClick={done}>{st.over ? "DONE" : "CONCEDE"}</button>
      </div>

      {st.over && (
        <div className="duel-over" onClick={done}>
          <div className={`ps-title display arena-${st.winner === my ? "win" : st.winner === their ? "loss" : "draw"}`}>
            {st.winner === my ? "VICTORY" : st.winner === their ? "DEFEAT" : "DRAW"}
          </div>
          <div className="arena-sub">turn {st.turn} · tap to close</div>
        </div>
      )}
    </div>
  );
}

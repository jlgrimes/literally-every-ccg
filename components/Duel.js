"use client";
import { useEffect, useRef, useState, useReducer } from "react";
import {
  initDuel, playCard, attachEnergy, passTurn, concede,
  declareAttack, resolveCombat, aiBlocks, runAiTurn,
  canPlay, canAttach, canAttackWith, costOf, energyNeed, tributeNeed,
  isEvolution, evoTargets, isSpell, fxTargets, FX_TARGET, FX_LABEL,
} from "../lib/duel";

const COST_GLYPH = { mana: "💧", energy: "⚡", tribute: "⭐", trainer: "🎒", spell: "✨" };
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
  const [atkSel, setAtkSel] = useState([]);      // my board indexes declared for the attack
  const [blkSel, setBlkSel] = useState(null);    // my blocker awaiting an attacker to block
  const [blocks, setBlocks] = useState({});      // attackerIdx -> my blocker idx
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
    setAtkSel([]); setBlkSel(null); setBlocks({}); setPending(null);
    force();
  }, [external, my]);

  const st = stRef.current;
  const mine = st[my], foe = st[their];
  const blocking = !st.over && st.phase === "block";
  const iDefend = blocking && st.active !== my;   // they attacked — I assign blocks
  const iWait = blocking && st.active === my;     // my attack — opponent is blocking
  const myTurn = !st.over && st.active === my && !blocking;
  const meLabel = (names && names.me) || "You";
  const themLabel = (names && names.them) || (mode === "ai" ? "AI" : "Them");

  function refresh() { force(); }
  function sync() { if (onSync) onSync(st); }

  function done() {
    if (mode === "pvp" && !st.over) { concede(st, my); sync(); }
    if (st.over && !reported.current) {
      reported.current = true;
      onDone(st.winner === my ? "win" : st.winner === their ? "loss" : "draw", {
        opp: themLabel, turns: st.turn, log: st.log,
        myHp: Math.max(0, mine.hp), theirHp: Math.max(0, foe.hp),
      });
    } else onDone(null);
  }

  function clickHand(i) {
    if (!myTurn) return;
    const c = mine.hand[i];
    if (!c) return;
    if (pending) { setPending(null); return; }
    if (!canPlay(st, my, i)) {
      const { kind, n } = costOf(c);
      if (isSpell(c)) {
        if (c.game === "mtg") setHint(`${c.name} needs ${n}💧 — you have ${mine.mana}.`);
        else if (c.game === "pokemon") setHint(mine.trainerUsed ? "Already played a trainer this turn." : "No valid target for that trainer.");
        else setHint(mine.spellUsed ? "Already cast a spell/trap this turn." : "No valid target for that card.");
      }
      else if (isEvolution(c)) setHint(`🧬 ${c.name} evolves from ${c.evo} — you need one on your board first.`);
      else if (mine.board.length >= 5) setHint("Board is full.");
      else if (kind === "mana") setHint(`${c.name} needs ${n}💧 — you have ${mine.mana}.`);
      else if (kind === "tribute") setHint(mine.summonUsed ? "Already normal-summoned this turn." : `${c.name} needs ${n}⭐ tribute${n > 1 ? "s" : ""} — not enough creatures.`);
      return;
    }
    if (isSpell(c)) {
      const kind = c.fx[0];
      const need = FX_TARGET[kind];
      if (need === null) { playCard(st, my, i); setHint(""); sync(); refresh(); return; }
      if (need === "deck") { setPending({ hand: i, tutor: true }); setHint("Deck search — pick a card to add to your hand."); return; }
      setPending({ hand: i, spell: true, own: need === "own" });
      setHint(need === "own" ? `${FX_LABEL[kind]} Pick one of your creatures.` : kind === "dmg" ? `${FX_LABEL[kind]} Pick an enemy card — or their HP.` : `${FX_LABEL[kind]} Pick an enemy creature.`);
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
    if (iDefend) {
      // pick which of my creatures will block — then tap the attacker
      setBlkSel(blkSel === x ? null : x);
      setHint(blkSel === x ? "" : "Now tap the attacker it should block. Unblocked attackers hit you.");
      return;
    }
    if (!myTurn) return;
    if (pending) {
      if (pending.spell) {
        if (pending.own && playCard(st, my, pending.hand, [], null, x)) { setPending(null); setHint(""); sync(); }
        refresh();
        return;
      }
      if (pending.tutor) { setPending(null); setHint(""); refresh(); return; }
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
    if (canAttackWith(st, my, x)) {
      setAtkSel(atkSel.includes(x) ? atkSel.filter((v) => v !== x) : [...atkSel, x]);
      setHint("Attackers swing at the enemy player — they choose blockers. Hit ⚔ ATTACK when ready.");
      return;
    }
    if (canAttach(st, my, x)) { attachEnergy(st, my, x); setHint(""); sync(); refresh(); return; }
    const b = mine.board[x];
    if (!b) return;
    if (b.attacked) setHint(`${b.card.name} already attacked.`);
    else if (b.sick) setHint(`${b.card.name} has summoning sickness — attacks next turn.`);
    else if (b.card.game === "pokemon") setHint(mine.energyUsed ? "Energy already attached this turn." : `${b.card.name} needs ${energyNeed(b.card)}⚡ — tap it to attach.`);
  }

  function clickFoe(target) {
    if (iDefend && target !== "face" && st.combat && st.combat.attackers.includes(target)) {
      // assign / unassign my selected blocker to this attacker
      const next = { ...blocks };
      if (blkSel === null) {
        if (next[target] !== undefined) { delete next[target]; setBlocks(next); }
        else setHint("Tap one of YOUR creatures first, then the attacker to block.");
        return;
      }
      for (const k of Object.keys(next)) if (next[k] === blkSel) delete next[k];
      next[target] = blkSel;
      setBlocks(next);
      setBlkSel(null);
      setHint("");
      return;
    }
    if (!myTurn) return;
    if (pending && pending.spell && !pending.own) {
      if (playCard(st, my, pending.hand, [], null, target)) { setPending(null); setHint(""); sync(); }
      else setHint("That card can't hit the face — pick an enemy creature.");
      refresh();
    }
  }

  function clickTutor(deckIdx) {
    if (!myTurn || !pending || !pending.tutor) return;
    if (playCard(st, my, pending.hand, [], null, deckIdx)) { setPending(null); setHint(""); sync(); }
    refresh();
  }

  function onEnd() {
    if (!myTurn) return;
    setPending(null); setHint("");
    if (atkSel.length) declareAttack(st, my, atkSel);
    else passTurn(st);
    setAtkSel([]);
    if (mode === "ai") {
      // AI blocks instantly, then plays its turn — possibly attacking back,
      // which leaves the block phase open for me
      if (st.phase === "block" && st.active === my) resolveCombat(st, aiBlocks(st));
      if (!st.over && st.active === "ai") runAiTurn(st);
    } else sync();
    refresh();
  }

  function onResolveBlocks() {
    if (!iDefend) return;
    resolveCombat(st, blocks);
    setBlocks({}); setBlkSel(null); setHint("");
    if (mode === "pvp") sync();
    refresh();
  }

  const attackerSet = blocking && st.combat ? new Set(st.combat.attackers) : new Set();
  const blockedBy = {};
  for (const [a, b] of Object.entries(blocks)) blockedBy[b] = +a;

  const Board = ({ side, ownSide }) => (
    <div className={`drow${ownSide ? " mineboard" : ""}`}>
      {side.board.map((b, x) => {
        const need = b.card.game === "pokemon" ? energyNeed(b.card) : 0;
        const ready = ownSide && myTurn && canAttackWith(st, my, x);
        // during blocks: enemy attackers glow; my picked blocker is outlined
        const isAtk = !ownSide && iDefend && attackerSet.has(x);
        const myAtk = ownSide && (iWait && attackerSet.has(x) || (myTurn && atkSel.includes(x)));
        const cls = [
          "dcard", `t-${b.card.tier}`,
          myAtk ? "sel" : "",
          ownSide && iDefend && blkSel === x ? "sel" : "",
          ownSide && iDefend && blockedBy[x] !== undefined ? "trib" : "",
          ownSide && pending && pending.picked && pending.picked.includes(x) ? "trib" : "",
          ready ? "ready" : "",
          isAtk ? "attacking" : "",
          !ownSide && pending && pending.spell && !pending.own ? "targetable" : "",
          ownSide && pending && pending.spell && pending.own ? "targetable" : "",
        ].filter(Boolean).join(" ");
        return (
          <button key={`${b.card.game}:${b.card.id}:${x}`} className={cls}
            onClick={() => (ownSide ? clickMine(x) : clickFoe(x))}
            title={`${b.card.name} · ${GAME_TAG[b.card.game]}`}>
            <img src={b.card.img} alt={b.card.name} referrerPolicy="no-referrer" />
            <span className="dstat datk">{b.card.bs[0]}⚔</span>
            <span className={`dstat dhpv${b.curHp < b.card.bs[1] ? " hurt" : ""}`}>{b.curHp}♥</span>
            {(myAtk || isAtk) && <span className="dtag datkmark">⚔</span>}
            {ownSide && blockedBy[x] !== undefined && <span className="dtag">🛡</span>}
            {b.sick && !myAtk && <span className="dtag">💤</span>}
            {need > 0 && <span className={`dtag den${b.energy >= need ? " full" : ""}`}>⚡{b.energy}/{need}</span>}
          </button>
        );
      })}
      {!side.board.length && <div className="drow-empty">no creatures</div>}
    </div>
  );

  return (
    <div className="packscreen duelscreen">
      <button className={`dhp foe${pending && pending.spell && !pending.own ? " targetable" : ""}`} onClick={() => clickFoe("face")}>
        <b>{themLabel}</b> ♥ {Math.max(0, foe.hp)} <span className="dsub">· hand {foe.hand.length} · deck {foe.deck.length}</span>
      </button>
      <Board side={foe} ownSide={false} />

      <div className="duel-log">
        {!st.over && (iDefend || iWait) && (
          <div className={`turn-tag${iDefend ? " yours" : ""}`}>{iDefend ? "🛡 BLOCK! Assign blockers, then resolve" : `⏳ ${themLabel} is choosing blockers…`}</div>
        )}
        {mode === "pvp" && !st.over && !blocking && (
          <div className={`turn-tag${myTurn ? " yours" : ""}`}>{myTurn ? "▶ your turn" : `⏳ ${themLabel}'s turn…`}</div>
        )}
        {st.log.slice(-3).map((l, i) => <div key={st.log.length - 3 + i}>{l}</div>)}
      </div>

      <Board side={mine} ownSide={true} />
      <div className="dhp mine">
        <b>{meLabel}</b> ♥ {Math.max(0, mine.hp)}
        <span className="dsub"> · 💧{mine.mana}/{mine.maxMana} · ⚡{mine.energyUsed ? "✗" : "✓"} · ⭐{mine.summonUsed ? "✗" : "✓"} · 🎒{mine.trainerUsed ? "✗" : "✓"} · ✨{mine.spellUsed ? "✗" : "✓"} · deck {mine.deck.length}</span>
      </div>

      <div className="duel-hand">
        {mine.hand.map((c, i) => {
          const { kind, n } = costOf(c);
          const ok = myTurn && canPlay(st, my, i);
          const spell = isSpell(c);
          return (
            <button key={`${c.game}:${c.id}:${i}`} className={`dcard hand t-${c.tier}${ok ? "" : " nope"}${pending && pending.hand === i ? " sel" : ""}`}
              onClick={() => clickHand(i)}
              title={`${c.name} · ${GAME_TAG[c.game]}${isEvolution(c) ? ` · evolves from ${c.evo}` : ""}${spell ? ` · ${c.fx[0]} ${c.fx[1]}` : ""}`}>
              <img src={c.img} alt={c.name} referrerPolicy="no-referrer" />
              <span className="dcost">{kind === "mana" ? <>{COST_GLYPH.mana}{n}</> : spell ? COST_GLYPH[kind] : <>{COST_GLYPH[kind]}{n}</>}</span>
              {isEvolution(c) && <span className="dtag">🧬</span>}
              {spell ? (
                <span className="dstat datk">{FX_LABEL[c.fx[0]]}{c.fx[0] === "kill" || c.fx[0] === "tutor" || c.fx[0] === "tutorc" ? "" : c.fx[1]}</span>
              ) : (
                <>
                  <span className="dstat datk">{c.bs[0]}⚔</span>
                  <span className="dstat dhpv">{c.bs[1]}♥</span>
                </>
              )}
            </button>
          );
        })}
        {!mine.hand.length && <div className="drow-empty">empty hand</div>}
      </div>

      {hint && !st.over && (myTurn || iDefend) && <div className="duel-hint">{hint}</div>}

      {/* deck search — tutors */}
      {pending && pending.tutor && !st.over && (
        <div className="tutor-panel">
          <div className="tutor-title">🔍 Your deck — pick one <button className="tutor-x" onClick={() => { setPending(null); setHint(""); }}>✕</button></div>
          <div className="tutor-grid">
            {fxTargets(st, my, mine.hand[pending.hand] || { fx: ["tutor", 1] }).map((di) => {
              const d = mine.deck[di];
              return (
                <button key={`${d.game}:${d.id}:${di}`} className={`dcard t-${d.tier}`} onClick={() => clickTutor(di)} title={d.name}>
                  <img src={d.img} alt={d.name} referrerPolicy="no-referrer" />
                  {d.bs
                    ? <><span className="dstat datk">{d.bs[0]}⚔</span><span className="dstat dhpv">{d.bs[1]}♥</span></>
                    : <span className="dstat datk">{FX_LABEL[d.fx[0]]}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="arena-actions">
        {iDefend ? (
          <button className="pull display" onClick={onResolveBlocks}>
            RESOLVE ({Object.keys(blocks).length} block{Object.keys(blocks).length === 1 ? "" : "s"})
          </button>
        ) : (
          <button className="pull display" disabled={st.over || !myTurn} onClick={onEnd}>
            {atkSel.length ? `⚔ ATTACK (${atkSel.length})` : "END TURN"}
          </button>
        )}
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

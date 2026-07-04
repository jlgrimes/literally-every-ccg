"use client";
import { useEffect, useRef, useState, useReducer } from "react";
import {
  initDuel, playCard, attachEnergy, passTurn, concede,
  declareAttack, resolveCombat, aiBlocks, aiStep, aiAttackers,
  canPlay, canAttach, canAttackWith, costOf, energyNeed, tributeNeed,
  isEvolution, evoTargets, isSpell, fxTargets, FX_TARGET, FX_LABEL,
  pkmAtks, slotAtk, minAtkCost, maxAtkCost,
} from "../lib/duel";

const atkList = (c) => (pkmAtks(c) ? " · " + c.atks.map(([n, d, co]) => `${n} ${d}⚔ (${co}⚡)`).join(", ") : "");

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
  const [aiPlan, setAiPlan] = useState(null);    // AI-mode: the AI's revealed block assignment
  const [aiActing, setAiActing] = useState(false); // AI-mode: its turn is playing out step by step
  const aiTimer = useRef(null);
  const rootRef = useRef(null);
  const svgRef = useRef(null);
  const [pops, setPops] = useState([]); // floating damage/heal numbers
  const prevHp = useRef(null);          // uid -> curHp, plus face HP per side
  const popId = useRef(0);
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
    setAtkSel([]); setBlkSel(null); setBlocks({}); setPending(null); setAiPlan(null);
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

  // the AI's turn plays out one action at a time, with a beat between
  useEffect(() => () => clearTimeout(aiTimer.current), []);
  function playAiTurnStaggered() {
    setAiActing(true);
    const step = () => {
      const cur = stRef.current;
      if (cur.over || cur.active !== "ai") { setAiActing(false); force(); return; }
      if (aiStep(cur, "ai")) {
        force();
        aiTimer.current = setTimeout(step, 550);
        return;
      }
      aiTimer.current = setTimeout(() => {
        declareAttack(cur, "ai", aiAttackers(cur, "ai"));
        setAiActing(false);
        force();
      }, 550);
    };
    aiTimer.current = setTimeout(step, 450);
  }

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
    else if (b.card.game === "pokemon") {
      const cheapest = pkmAtks(b.card) ? b.card.atks.find((a) => a[2] > b.energy) : null;
      setHint(mine.energyUsed ? "Energy already attached this turn."
        : cheapest ? `${b.card.name} needs ${cheapest[2]}⚡ for ${cheapest[0]} — tap it to attach.`
        : `${b.card.name} needs ${energyNeed(b.card)}⚡ — tap it to attach.`);
    }
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
      if (st.phase === "block" && st.active === my) {
        // reveal the AI's blocks as an explicit combat step
        setAiPlan(aiBlocks(st));
        refresh();
        return;
      }
      if (!st.over && st.active === "ai") playAiTurnStaggered();
    } else sync();
    refresh();
  }

  // AI mode: player confirms combat after seeing the AI's blockers
  function onResolveAiCombat() {
    if (!aiPlan) return;
    resolveCombat(st, aiPlan);
    setAiPlan(null);
    if (mode === "ai" && !st.over && st.active === "ai") playAiTurnStaggered();
    refresh();
  }

  function onResolveBlocks() {
    if (!iDefend) return;
    resolveCombat(st, blocks);
    setBlocks({}); setBlkSel(null); setHint("");
    if (mode === "pvp") sync();
    refresh();
  }

  // ---- floating damage/heal numbers: diff HP between renders ----
  useEffect(() => {
    const root = rootRef.current;
    const cur = { "face-my": mine.hp, "face-foe": foe.hp };
    for (const [side, tag] of [[mine, "m"], [foe, "f"]]) {
      side.board.forEach((b, x) => { cur[b.uid] = b.curHp; cur[`${b.uid}:at`] = `[data-bid="${tag}${x}"]`; });
    }
    const prev = prevHp.current;
    prevHp.current = cur;
    if (!prev || !root) return;
    const born = [];
    const spawn = (sel, delta) => {
      const el = root.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      born.push({
        id: ++popId.current,
        x: r.left + r.width / 2 + (Math.random() * 16 - 8),
        y: r.top + r.height * 0.3,
        text: delta > 0 ? `+${delta}` : `${delta}`,
        cls: delta > 0 ? "up" : "down",
      });
    };
    for (const key of Object.keys(cur)) {
      if (key.endsWith(":at") || !(key in prev)) continue;
      const d = cur[key] - prev[key];
      if (!d) continue;
      spawn(key === "face-my" ? ".dhp.mine" : key === "face-foe" ? ".dhp.foe" : cur[`${key}:at`], d);
    }
    if (born.length) {
      setPops((p) => [...p, ...born]);
      const ids = born.map((b) => b.id);
      setTimeout(() => setPops((p) => p.filter((q) => !ids.includes(q.id))), 950);
    }
  });

  // ---- attack/block arrows, drawn from live card positions ----
  useEffect(() => {
    const root = rootRef.current, svg = svgRef.current;
    if (!svg) return;
    const specs = [];
    if (root && !st.over) {
      if (myTurn && atkSel.length) for (const x of atkSel) specs.push([`[data-bid="m${x}"]`, ".dhp.foe", "atk"]);
      if (iDefend && st.combat) for (const a of st.combat.attackers) {
        if (blocks[a] !== undefined) specs.push([`[data-bid="m${blocks[a]}"]`, `[data-bid="f${a}"]`, "blk"]);
        else specs.push([`[data-bid="f${a}"]`, ".dhp.mine", "atk"]);
      }
      if (aiPlan && st.combat) for (const a of st.combat.attackers) {
        if (aiPlan[a] !== undefined) specs.push([`[data-bid="f${aiPlan[a]}"]`, `[data-bid="m${a}"]`, "blk"]);
        else specs.push([`[data-bid="m${a}"]`, ".dhp.foe", "atk"]);
      }
      if (mode === "pvp" && iWait && st.combat) for (const a of st.combat.attackers) {
        specs.push([`[data-bid="m${a}"]`, ".dhp.foe", "atk"]);
      }
    }
    const mid = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    let html = "";
    for (const [fs, ts, cls] of specs) {
      const fe = root.querySelector(fs), te = root.querySelector(ts);
      if (!fe || !te) continue;
      const [x1, y1] = mid(fe), [x2, y2] = mid(te);
      const bend = (x2 >= x1 ? 1 : -1) * Math.min(40, Math.abs(y2 - y1) / 3 + 12);
      html += `<path class="ar-${cls}" d="M ${x1} ${y1} Q ${(x1 + x2) / 2 + bend} ${(y1 + y2) / 2} ${x2} ${y2}" marker-end="url(#ah-${cls})"/>`;
    }
    svg.innerHTML = `<defs>
      <marker id="ah-atk" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#ff5d6c"/></marker>
      <marker id="ah-blk" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#4fc58a"/></marker>
    </defs>${html}`;
  });
  useEffect(() => {
    const onR = () => force();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  const attackerSet = blocking && st.combat ? new Set(st.combat.attackers) : new Set();
  const blockedBy = {};
  for (const [a, b] of Object.entries(blocks)) blockedBy[b] = +a;
  // AI-mode reveal: which of the AI's creatures are blocking, and which of
  // my attackers got blocked
  const foeBlockers = aiPlan ? new Set(Object.values(aiPlan)) : null;
  const myBlockedAtk = aiPlan ? new Set(Object.keys(aiPlan).map(Number)) : null;

  const Board = ({ side, ownSide }) => (
    <div className={`drow${ownSide ? " mineboard" : ""}`}>
      {side.board.map((b, x) => {
        const need = b.card.game === "pokemon" ? (pkmAtks(b.card) ? maxAtkCost(b.card) : energyNeed(b.card)) : 0;
        const liveAtk = slotAtk(b);
        const ready = ownSide && myTurn && canAttackWith(st, my, x);
        // during blocks: enemy attackers glow; my picked blocker is outlined
        const isAtk = !ownSide && iDefend && attackerSet.has(x);
        const myAtk = ownSide && (iWait && attackerSet.has(x) || (myTurn && atkSel.includes(x)));
        const foeIsBlocking = !ownSide && foeBlockers && foeBlockers.has(x);
        const cls = [
          "dcard", `t-${b.card.tier}`,
          myAtk ? "sel" : "",
          ownSide && iDefend && blkSel === x ? "sel" : "",
          ownSide && iDefend && blockedBy[x] !== undefined ? "trib" : "",
          ownSide && pending && pending.picked && pending.picked.includes(x) ? "trib" : "",
          ready ? "ready" : "",
          isAtk ? "attacking" : "",
          foeIsBlocking ? "blocking" : "",
          !ownSide && pending && pending.spell && !pending.own ? "targetable" : "",
          ownSide && pending && pending.spell && pending.own ? "targetable" : "",
        ].filter(Boolean).join(" ");
        return (
          <button key={b.uid || `${b.card.game}:${b.card.id}:${x}`} className={cls} data-bid={(ownSide ? "m" : "f") + x}
            onClick={() => (ownSide ? clickMine(x) : clickFoe(x))}
            title={`${b.card.name} · ${GAME_TAG[b.card.game]}${atkList(b.card)}`}>
            <img src={b.card.img} alt={b.card.name} referrerPolicy="no-referrer" />
            <span className={`dstat datk${pkmAtks(b.card) && liveAtk < b.card.bs[0] ? " dim" : ""}`}>{liveAtk}⚔</span>
            <span className={`dstat dhpv${b.curHp < b.card.bs[1] ? " hurt" : ""}`}>{b.curHp}♥</span>
            {(myAtk || isAtk) && <span className="dtag datkmark">⚔{myAtk && myBlockedAtk && myBlockedAtk.has(x) ? "🛡" : ""}</span>}
            {(ownSide && blockedBy[x] !== undefined || foeIsBlocking) && <span className="dtag">🛡</span>}
            {b.sick && !myAtk && <span className="dtag">💤</span>}
            {need > 0 && <span className={`dtag den${b.energy >= need ? " full" : ""}`}>⚡{b.energy}/{need}</span>}
            {ownSide && myTurn && !pending && canAttach(st, my, x) && (
              <span className="dattach" title="Attach energy"
                onClick={(e) => { e.stopPropagation(); attachEnergy(st, my, x); setHint(""); sync(); refresh(); }}>⚡+</span>
            )}
          </button>
        );
      })}
      {!side.board.length && <div className="drow-empty">no creatures</div>}
    </div>
  );

  return (
    <div className="packscreen duelscreen" ref={rootRef}>
      <svg className="duel-arrows" ref={svgRef} />
      <div className="duel-pops">
        {pops.map((p) => (
          <span key={p.id} className={`dpop ${p.cls}`} style={{ left: p.x, top: p.y }}>{p.text}</span>
        ))}
      </div>
      <button className={`dhp foe${pending && pending.spell && !pending.own ? " targetable" : ""}`} onClick={() => clickFoe("face")}>
        <b>{themLabel}</b> ♥ {Math.max(0, foe.hp)} <span className="dsub">· hand {foe.hand.length} · deck {foe.deck.length}</span>
      </button>
      <Board side={foe} ownSide={false} />

      <div className="duel-log">
        {mode === "ai" && aiActing && !st.over && (
          <div className="turn-tag">🤖 {themLabel} is playing…</div>
        )}
        {!st.over && (iDefend || iWait) && (
          <div className={`turn-tag${iDefend ? " yours" : ""}`}>
            {iDefend ? "🛡 BLOCK! Assign blockers, then resolve"
              : aiPlan ? `🛡 ${themLabel} blocks with ${Object.keys(aiPlan).length ? Object.values(aiPlan).map((b) => foe.board[b] && foe.board[b].card.name).filter(Boolean).join(", ") : "nothing"} — resolve!`
              : `⏳ ${themLabel} is choosing blockers…`}
          </div>
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
              title={`${c.name} · ${GAME_TAG[c.game]}${isEvolution(c) ? ` · evolves from ${c.evo}` : ""}${spell ? ` · ${c.fx[0]} ${c.fx[1]}` : ""}${atkList(c)}`}>
              <img src={c.img} alt={c.name} referrerPolicy="no-referrer" />
              <span className="dcost">{kind === "mana" ? <>{COST_GLYPH.mana}{n}</> : spell ? COST_GLYPH[kind] : <>{COST_GLYPH[kind]}{kind === "energy" && pkmAtks(c) ? minAtkCost(c) : n}</>}</span>
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
        ) : aiPlan ? (
          <button className="pull display" onClick={onResolveAiCombat}>💥 RESOLVE COMBAT</button>
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

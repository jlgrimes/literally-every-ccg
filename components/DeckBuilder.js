"use client";
import { useMemo, useState } from "react";
import { costOf, isEvolution, isSpell, FX_LABEL, DECK_SIZE } from "../lib/duel";

const COST_GLYPH = { mana: "💧", energy: "⚡", tribute: "⭐" };
const TIER_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const rank = (t) => TIER_ORDER.indexOf(t);
const key = (c) => `${c.game}:${c.id}`;

// pool: binder cards with bs (carry .count). initial: saved deck keys.
export default function DeckBuilder({ pool, initial, onSave, onClose }) {
  const byKey = useMemo(() => new Map(pool.map((c) => [key(c), c])), [pool]);
  const [deck, setDeck] = useState(() => (initial || []).filter((k) => byKey.has(k)));

  const inDeck = {};
  for (const k of deck) inDeck[k] = (inDeck[k] || 0) + 1;
  const owned = pool.reduce((n, c) => n + (c.count || 1), 0);

  const power = (c) => (c.bs ? c.bs[0] + c.bs[1] : (c.fx ? c.fx[1] : 0));
  const sorted = useMemo(
    () => [...pool].sort((a, b) => rank(b.tier) - rank(a.tier) || power(b) - power(a)),
    [pool]
  );

  function add(k) {
    const c = byKey.get(k);
    if (!c || deck.length >= DECK_SIZE || (inDeck[k] || 0) >= (c.count || 1)) return;
    setDeck([...deck, k]);
  }
  function removeOne(k) {
    const i = deck.lastIndexOf(k);
    if (i !== -1) setDeck([...deck.slice(0, i), ...deck.slice(i + 1)]);
  }

  return (
    <div className="packscreen arenascreen">
      <div className="ps-portal" />
      <div className="ps-title display">Build your deck</div>
      <div className="arena-sub">
        {owned < DECK_SIZE
          ? <>You own {owned} fighter{owned === 1 ? "" : "s"} — you need {DECK_SIZE} to duel. Rip more packs! (Magic creatures, Pokémon &amp; Yu-Gi-Oh monsters count; duplicates too.)</>
          : <>Pick {DECK_SIZE} — duplicates up to the copies you own. 🧬 evolutions only play on top of their pre-evolution, so bring the whole line.</>}
      </div>

      <div className={`deck-strip${deck.length === DECK_SIZE ? " full" : ""}`}>
        <span className="deck-count display">{deck.length}/{DECK_SIZE}</span>
        {deck.map((k, i) => {
          const c = byKey.get(k);
          return (
            <button key={`${k}:${i}`} className={`dcard t-${c.tier}`} title={`${c.name} — tap to remove`} onClick={() => removeOne(k)}>
              <img src={c.img} alt={c.name} referrerPolicy="no-referrer" />
            </button>
          );
        })}
        {!deck.length && <span className="drow-empty">tap cards below to add them</span>}
      </div>

      <div className="arena-grid builder-grid">
        {sorted.map((c) => {
          const k = key(c);
          const n = inDeck[k] || 0;
          const max = c.count || 1;
          const { kind, n: cost } = costOf(c);
          const costTag = kind === "mana" ? `💧${cost} · ` : kind === "trainer" ? "🎒 · " : kind === "spell" ? "✨ · " : `${COST_GLYPH[kind]}${cost} · `;
          const statTag = c.bs ? `${c.bs[0]}⚔${c.bs[1]}♥` : `${FX_LABEL[c.fx[0]]}${c.fx[0] === "kill" || c.fx[0] === "tutor" || c.fx[0] === "tutorc" ? "" : c.fx[1]}`;
          return (
            <button key={k} className={`thumb t-${c.tier}${n ? " picked" : ""}${n >= max ? " maxed" : ""}`}
              title={`${c.name} · ${c.bs ? `${c.bs[0]}⚔/${c.bs[1]}♥` : `effect: ${c.fx[0]} ${c.fx[1]}`} · own ×${max}${isEvolution(c) ? ` · evolves from ${c.evo}` : ""}`}
              onClick={() => (n >= max ? removeOne(k) : add(k))}>
              <img src={c.img} alt={c.name} loading="lazy" referrerPolicy="no-referrer" />
              <span className="bs-badge">{costTag}{statTag}</span>
              {isEvolution(c) && <span className="evo-badge">🧬</span>}
              {isSpell(c) && <span className="evo-badge">{FX_LABEL[c.fx[0]]}</span>}
              {max > 1 && <span className="count-badge">×{max}</span>}
              {n > 0 && <span className="pick-badge">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="arena-actions">
        <button className="pull display" disabled={deck.length !== DECK_SIZE} onClick={() => onSave(deck)}>
          SAVE DECK {deck.length}/{DECK_SIZE}
        </button>
        <button className="pull10 display" onClick={onClose}>CANCEL</button>
      </div>
    </div>
  );
}

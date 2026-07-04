"use client";
import { useMemo, useState } from "react";
import { costOf, isEvolution, isSpell, pkmAtks, FX_LABEL, DECK_SIZE } from "../lib/duel";

const COST_GLYPH = { mana: "💧", energy: "⚡", tribute: "⭐", trainer: "🎒", spell: "✨" };
const TIER_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const GAME_CHIP = {
  mtg: "Magic", pokemon: "Pokémon", yugioh: "Yu-Gi-Oh!", lorcana: "Lorcana", onepiece: "One Piece",
  gundam: "Gundam", dbfusion: "DB Fusion", unionarena: "Union Arena", swu: "SW Unlimited", fab: "Flesh & Blood",
  riftbound: "Riftbound", digimon: "Digimon", netrunner: "Netrunner", weiss: "Weiß Schwarz",
};
const FX_TEXT = {
  dmg: (n) => `Deals ${n} damage to a creature — or ${Math.ceil(n / 10)} to the face`,
  kill: () => "Destroys an enemy creature",
  nuke: (n) => (n >= 99 ? "Destroys ALL enemy creatures" : `Hits ALL enemy creatures for ${n}`),
  draw: (n) => `Draw ${n} card${n > 1 ? "s" : ""}`,
  buff: (n) => `One of your creatures gets +${n}⚔/+${n}♥`,
  weak: (n) => `An enemy creature loses ${n}⚔`,
  heal: (n) => `Restore ${n} HP`,
  tutor: () => "Search your deck for ANY card",
  tutorc: () => "Search your deck for a creature",
};
const rank = (t) => TIER_ORDER.indexOf(t);
const key = (c) => `${c.game}:${c.id}`;

function costText(c) {
  const { kind, n } = costOf(c);
  if (kind === "mana") return `💧${n} mana`;
  if (kind === "energy") return `⚡ energy attacks`;
  if (kind === "tribute") return n ? `⭐${n} tribute${n > 1 ? "s" : ""}` : "free summon";
  if (kind === "trainer") return "🎒 trainer · 1/turn";
  return "✨ spell · 1/turn";
}
function costChip(c) {
  const { kind, n } = costOf(c);
  if (kind === "mana") return `💧${n}`;
  if (kind === "energy") return "⚡";
  if (kind === "tribute") return `⭐${n}`;
  return COST_GLYPH[kind];
}
const statChip = (c) => (c.bs ? `${c.bs[0]}⚔ ${c.bs[1]}♥` : `${FX_LABEL[c.fx[0]]}${["kill", "tutor", "tutorc"].includes(c.fx[0]) ? "" : c.fx[1]}`);

// pool: duel-legal binder cards (carry .count). initial: saved deck keys.
export default function DeckBuilder({ pool, initial, deckName, onSave, onClose }) {
  const byKey = useMemo(() => new Map(pool.map((c) => [key(c), c])), [pool]);
  const poolGames = useMemo(() => [...new Set(pool.map((c) => c.game))].sort(), [pool]);
  const [deck, setDeck] = useState(() => (initial || []).filter((k) => byKey.has(k)));
  const [name, setName] = useState(deckName || "My deck");
  const [tab, setTab] = useState("pool");
  const [q, setQ] = useState("");
  const [fGame, setFGame] = useState("all");
  const [fKind, setFKind] = useState("all");
  const [sheet, setSheet] = useState(null); // card shown in the detail sheet

  const inDeck = {};
  for (const k of deck) inDeck[k] = (inDeck[k] || 0) + 1;
  const owned = pool.reduce((n, c) => n + (c.count || 1), 0);
  const nCreatures = deck.filter((k) => byKey.get(k) && byKey.get(k).bs).length;
  const nSpells = deck.length - nCreatures;

  const power = (c) => (c.bs ? c.bs[0] + c.bs[1] : c.fx ? c.fx[1] : 0);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool
      .filter((c) =>
        (fGame === "all" || c.game === fGame) &&
        (fKind === "all" || (fKind === "creature" ? !!c.bs : fKind === "spell" ? !!c.fx : isEvolution(c))) &&
        (!needle || c.name.toLowerCase().includes(needle)))
      .sort((a, b) => rank(b.tier) - rank(a.tier) || power(b) - power(a));
  }, [pool, q, fGame, fKind]);

  // deck tab: one row per unique card, with a count stepper
  const deckRows = useMemo(() => {
    const rows = [];
    for (const [k, n] of Object.entries(inDeck)) {
      const c = byKey.get(k);
      if (c) rows.push({ c, n });
    }
    return rows.sort((a, b) => a.c.game.localeCompare(b.c.game) || power(a.c) - power(b.c));
  }, [deck]); // eslint-disable-line

  function add(k) {
    const c = byKey.get(k);
    if (!c || deck.length >= DECK_SIZE || (inDeck[k] || 0) >= (c.count || 1)) return;
    setDeck((d) => [...d, k]);
  }
  function removeOne(k) {
    setDeck((d) => {
      const i = d.lastIndexOf(k);
      return i === -1 ? d : [...d.slice(0, i), ...d.slice(i + 1)];
    });
  }

  const SheetView = ({ c }) => {
    const k = key(c);
    const n = inDeck[k] || 0;
    const max = c.count || 1;
    return (
      <div className="sheet-back" onClick={() => setSheet(null)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-body">
            <img className="sheet-img" src={c.img} alt={c.name} referrerPolicy="no-referrer" />
            <div className="sheet-info">
              <div className="sheet-name display">{c.name}</div>
              <span className={`tierpill tp-${c.tier}`}>{c.tier}</span>
              <div className="sheet-row">{GAME_CHIP[c.game] || c.game} · {c.native}</div>
              <div className="sheet-row"><b>Cost</b> {costText(c)}</div>
              {c.bs && <div className="sheet-row"><b>Stats</b> {c.bs[0]}⚔ attack · {c.bs[1]}♥ health</div>}
              {pkmAtks(c) && (
                <div className="sheet-row"><b>Attacks</b>
                  {c.atks.map(([an, ad, ac]) => <div key={an} className="sheet-atk">⚡{ac} {an} — {ad}⚔</div>)}
                </div>
              )}
              {c.fx && <div className="sheet-row"><b>Effect</b> {FX_LABEL[c.fx[0]]} {(FX_TEXT[c.fx[0]] || (() => c.fx[0]))(c.fx[1])}</div>}
              {isEvolution(c) && <div className="sheet-row evo">🧬 Evolves from <b>{c.evo}</b> — needs it on your board</div>}
              {c.game !== "pokemon" && c.game !== "yugioh" && c.bs && <div className="sheet-row dim">Summoning sickness: can't attack the turn it's played</div>}
              <div className="sheet-row"><b>Owned</b> ×{max} · <b>In deck</b> {n}</div>
            </div>
          </div>
          <div className="sheet-actions">
            <button className="pull10 display sheet-btn" disabled={n === 0} onClick={() => removeOne(k)}>− REMOVE</button>
            <button className="pull display sheet-btn" disabled={n >= max || deck.length >= DECK_SIZE} onClick={() => add(k)}>＋ ADD</button>
            <button className="pull10 display sheet-btn" onClick={() => setSheet(null)}>✕</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="packscreen builderscreen">
      <div className="bhead">
        <input className="mp-input deck-name-input" maxLength={18} placeholder="deck name"
          value={name} onChange={(e) => setName(e.target.value)} />
        <button className="pull display bsave" disabled={deck.length !== DECK_SIZE} onClick={() => onSave(deck, name.trim() || "My deck")}>
          SAVE
        </button>
        <button className="pull10 display bsave" onClick={onClose}>✕</button>
      </div>

      <div className="btabs">
        <button className={`btab${tab === "pool" ? " on" : ""}`} onClick={() => setTab("pool")}>CARDS</button>
        <button className={`btab${tab === "deck" ? " on" : ""}`} onClick={() => setTab("deck")}>
          DECK <b className={deck.length === DECK_SIZE ? "ok" : ""}>{deck.length}/{DECK_SIZE}</b>
        </button>
      </div>
      <div className="bsummary">
        {deck.length === 0
          ? (owned < DECK_SIZE
            ? `You own ${owned} duel-legal cards — you need ${DECK_SIZE}. Rip more packs!`
            : "Tap a card for details, or ＋ to add it fast.")
          : <>⚔ {nCreatures} creatures · ✨ {nSpells} spells{deck.length === DECK_SIZE ? " · ready to save ✓" : ` · ${DECK_SIZE - deck.length} more`}</>}
      </div>

      {tab === "pool" && (
        <>
          <div className="pool-toolbar">
            <input className="mp-input pool-search" placeholder="🔍 search cards…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="filters filters-scroll">
              {[["all", "All"], ...poolGames.map((g) => [g, GAME_CHIP[g] || g])].map(([g, l]) => (
                <button key={g} className={`fchip${fGame === g ? " on" : ""}`} onClick={() => setFGame(g)}>{l}</button>
              ))}
              {[["all", "All types"], ["creature", "⚔ Creatures"], ["spell", "✨ Spells"], ["evo", "🧬 Evolutions"]].map(([kd, l]) => (
                <button key={kd} className={`fchip${fKind === kd ? " on" : ""}`} onClick={() => setFKind(kd)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="pool-grid">
            {filtered.slice(0, 200).map((c) => {
              const k = key(c);
              const n = inDeck[k] || 0;
              const max = c.count || 1;
              return (
                <div key={k} className={`ptile t-${c.tier}${n ? " picked" : ""}`}>
                  <button className="ptile-hit" onClick={() => setSheet(c)}>
                    <img src={c.img} alt={c.name} loading="lazy" referrerPolicy="no-referrer" />
                  </button>
                  <div className="ptile-cap">
                    <span className="ptile-name">{c.name}</span>
                    <span className="ptile-meta">{costChip(c)} · {statChip(c)}</span>
                  </div>
                  <button className={`padd${n >= max || deck.length >= DECK_SIZE ? " off" : ""}`}
                    onClick={() => (n >= max ? removeOne(k) : add(k))}>
                    {n >= max ? "−" : "＋"}
                  </button>
                  {isEvolution(c) && <span className="evo-badge">🧬</span>}
                  {n > 0 && <span className="pick-badge">{n}</span>}
                  {max > 1 && <span className="count-badge">×{max}</span>}
                </div>
              );
            })}
            {!filtered.length && <div className="empty pool-empty">Nothing matches — clear the search or filters.</div>}
          </div>
        </>
      )}

      {tab === "deck" && (
        <div className="deck-rows">
          {deckRows.map(({ c, n }) => {
            const k = key(c);
            const max = c.count || 1;
            return (
              <div key={k} className={`deckrow2 t-${c.tier}`}>
                <button className="deckrow2-hit" onClick={() => setSheet(c)}>
                  <img src={c.img} alt={c.name} referrerPolicy="no-referrer" />
                  <span className="deckrow2-txt">
                    <span className="deckrow2-name">{isEvolution(c) ? "🧬 " : ""}{c.name}</span>
                    <span className="deckrow2-meta">{GAME_CHIP[c.game] || c.game} · {costChip(c)} · {statChip(c)}</span>
                  </span>
                </button>
                <div className="stepper">
                  <button onClick={() => removeOne(k)}>−</button>
                  <b>{n}</b>
                  <button className={n >= max || deck.length >= DECK_SIZE ? "off" : ""} onClick={() => add(k)}>＋</button>
                </div>
              </div>
            );
          })}
          {!deckRows.length && <div className="empty pool-empty">Deck is empty — add cards from the CARDS tab.</div>}
        </div>
      )}

      {sheet && <SheetView c={byKey.get(key(sheet)) || sheet} />}
    </div>
  );
}

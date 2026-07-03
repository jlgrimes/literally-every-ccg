"use client";
import { useEffect, useRef, useState } from "react";
import PackWrapper from "../components/PackWrapper";
import CardStack from "../components/CardStack";

const TIER_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const TIER_LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const GAME_LABEL = {
  mtg: "Magic: The Gathering", pokemon: "Pokémon TCG", yugioh: "Yu-Gi-Oh!", lorcana: "Disney Lorcana",
  onepiece: "One Piece", gundam: "Gundam", dbfusion: "Dragon Ball Fusion World",
  unionarena: "Union Arena", swu: "Star Wars Unlimited", fab: "Flesh and Blood",
};
const GAME_CHIP = {
  mtg: "Magic", pokemon: "Pokémon", yugioh: "Yu-Gi-Oh!", lorcana: "Lorcana", onepiece: "One Piece",
  gundam: "Gundam", dbfusion: "DB Fusion", unionarena: "Union Arena", swu: "SW Unlimited", fab: "Flesh & Blood",
};
const rank = (t) => TIER_ORDER.indexOf(t);
const key = (c) => `${c.game}:${c.id}`;
const EMPTY = { pulls: 0, tiers: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }, binder: {} };

function loadOk(src) {
  return new Promise((res) => {
    const i = new Image();
    i.referrerPolicy = "no-referrer";
    const t = setTimeout(() => res(false), 8000);
    i.onload = () => { clearTimeout(t); res(true); };
    i.onerror = () => { clearTimeout(t); res(false); };
    i.src = src;
  });
}

export default function Home() {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(EMPTY);
  const [meta, setMeta] = useState(null);
  const [inspect, setInspect] = useState(null);
  const [newIds, setNewIds] = useState(new Set());
  const [toastMsg, setToastMsg] = useState("");
  const [fGame, setFGame] = useState("all");
  const [fTier, setFTier] = useState("all");

  // fullscreen pack experience: null | { phase: "wrapper"|"stack"|"summary", cards, idx }
  const [screen, setScreen] = useState(null);

  const toastTimer = useRef(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const v2 = localStorage.getItem("omnideck:v2");
      if (v2) {
        const s = JSON.parse(v2);
        setState({ pulls: s.pulls || 0, tiers: s.tiers || EMPTY.tiers, binder: s.binder || {} });
      }
    } catch (e) {}
    loaded.current = true;
    fetch("/api/meta").then((r) => r.json()).then(setMeta).catch(() => {});
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem("omnideck:v2", JSON.stringify(state)); } catch (e) {}
  }, [state]);

  // lock page scroll while the pack screen is open
  useEffect(() => {
    document.body.style.overflow = screen || inspect ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [screen, inspect]);

  function toast(msg) {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }

  function celebrate(tier) {
    if (rank(tier) >= rank("epic")) {
      const f = document.getElementById("foil");
      if (f) { f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
    }
    if (tier === "legendary") {
      const ps = document.getElementById("packscreen");
      if (ps) { ps.classList.remove("shake"); void ps.offsetWidth; ps.classList.add("shake"); }
    }
  }

  function record(cards) {
    const fresh = new Set();
    setState((s) => {
      const tiers = { ...s.tiers };
      const binder = { ...s.binder };
      for (const c of cards) {
        tiers[c.tier]++;
        const k = key(c);
        if (binder[k]) binder[k] = { ...binder[k], count: binder[k].count + 1 };
        else { binder[k] = { ...c, count: 1, ts: Date.now() }; fresh.add(k); }
      }
      return { pulls: s.pulls + cards.length, tiers, binder };
    });
    setNewIds(fresh);
  }

  // validate a card's image; replace with same-tier redraws if the host fails
  async function validateOrReplace(c) {
    let cur = c;
    for (let i = 0; i < 3; i++) {
      if (await loadOk(cur.img)) return cur;
      try {
        const r = await fetch(`/api/pull?u=all&tier=${cur.tier}`);
        const j = await r.json();
        cur = j.pulls[0];
      } catch (e) { break; }
    }
    return null;
  }

  async function buyPack() {
    if (busy) return;
    setBusy(true); setInspect(null);
    try {
      const r = await fetch("/api/pack?u=all");
      const j = await r.json();
      const validated = (await Promise.all(j.pack.map(validateOrReplace))).filter(Boolean);
      if (!validated.length) throw new Error("no valid cards");
      record(validated); // only cards that actually render count
      setScreen({ phase: "wrapper", cards: validated, idx: 0 });
    } catch (e) {
      toast("Pack machine jammed — try again");
    } finally { setBusy(false); }
  }

  function onTorn() {
    setScreen((s) => s && { ...s, phase: "stack" });
    if (screen) celebrate(screen.cards[0].tier);
  }

  function advance() {
    setScreen((s) => {
      if (!s) return s;
      if (s.idx >= s.cards.length - 1) return { ...s, phase: "summary" };
      const next = s.idx + 1;
      celebrate(s.cards[next].tier);
      return { ...s, idx: next };
    });
  }

  function closeScreen() { setScreen(null); }

  function showFromBinder(c) { setInspect(c); }

  function clearAll() {
    if (!confirm("Clear your entire collection and stats?")) return;
    setState(EMPTY); setNewIds(new Set()); setInspect(null);
  }

  const games = meta ? Object.keys(meta.byGame) : [];
  const binderCards = Object.values(state.binder)
    .filter((c) => (fGame === "all" || c.game === fGame) && (fTier === "all" || c.tier === fTier))
    .sort((a, b) => rank(b.tier) - rank(a.tier) || a.name.localeCompare(b.name));
  const uniqueOwned = Object.keys(state.binder).length;
  const totalInDb = meta ? meta.total : null;
  const pct = totalInDb ? Math.min(100, (uniqueOwned / totalInDb) * 100) : 0;

  const top = screen && screen.phase === "stack" ? screen.cards[screen.idx] : null;
  const best = screen ? screen.cards.reduce((a, b) => (rank(b.tier) > rank(a.tier) ? b : a)) : null;

  return (
    <>
      <div className="foil" id="foil" />

      {/* ---------- main screen ---------- */}
      <div className="wrap">
        <header>
          <div className="lockup display">
            <span className="lockup-top">LITERALLY EVERY</span>
            <span className="lockup-big">CCG</span>
          </div>
          {meta && <div className="dbcount"><b>{meta.total.toLocaleString()}</b> real cards · {games.length} paper universes</div>}
        </header>

        <div className="homestage">
          <div className="idlehint">
            <div className="idleglyph display">✦</div>
            <div>{totalInDb ? totalInDb.toLocaleString() : "…"} cards.<br />One pack at a time.</div>
          </div>
        </div>

        <div className="pullrow">
          <button className="pull display" disabled={busy} onClick={buyPack}>
            {busy ? "SHUFFLING…" : "OPEN PACK"}
          </button>
          <div className="odds">
            Hit slot — <b className="ol">Legendary 8%</b> · <b className="oe">Epic 20%</b> · <b className="or">Rare 72%</b>
          </div>
        </div>

        <div className="stats">
          <div className="stat"><b className="display">{state.pulls}</b><span>Cards</span></div>
          <div className="stat rar"><b className="display">{state.tiers.rare}</b><span>Rare</span></div>
          <div className="stat epi"><b className="display">{state.tiers.epic}</b><span>Epic</span></div>
          <div className="stat leg"><b className="display">{state.tiers.legendary}</b><span>Legendary</span></div>
        </div>

        <div className="shelf">
          <h2 className="display">Binder <button onClick={clearAll}>Clear</button></h2>
          <div className="progress">
            <div className="row"><span>Unique collected</span><b>{uniqueOwned.toLocaleString()}{totalInDb ? ` / ${totalInDb.toLocaleString()}` : ""}</b></div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="filters filters-scroll">
            <button className={`fchip${fGame === "all" ? " on" : ""}`} onClick={() => setFGame("all")}>All</button>
            {games.map((g) => (
              <button key={g} className={`fchip${fGame === g ? " on" : ""}`} onClick={() => setFGame(g)}>{GAME_CHIP[g] || g}</button>
            ))}
          </div>
          <div className="filters">
            {[["all", "All tiers"], ...TIER_ORDER.slice().reverse().map((t) => [t, TIER_LABEL[t]])].map(([t, label]) => (
              <button key={t} className={`fchip ft-${t}${fTier === t ? " on" : ""}`} onClick={() => setFTier(t)}>{label}</button>
            ))}
          </div>
          {binderCards.length ? (
            <div className="grid">
              {binderCards.slice(0, 120).map((c) => (
                <button key={key(c)} className={`thumb t-${c.tier}`} title={`${c.name} ×${c.count} · ${TIER_LABEL[c.tier]}`}
                  aria-label={`Show ${c.name}`} onClick={() => showFromBinder(c)}>
                  <img src={c.img} alt={c.name} loading="lazy" referrerPolicy="no-referrer" />
                  {c.count > 1 && <span className="count-badge">×{c.count}</span>}
                  {newIds.has(key(c)) && <span className="new-badge">NEW</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">{uniqueOwned ? "No cards match these filters." : "Empty binder. Rip your first pack."}</div>
          )}
        </div>

        <footer>
          Card effects © Simon Goellner — <a href="https://github.com/simeydotme/pokemon-cards-css" target="_blank" rel="noreferrer">simeydotme/pokemon-cards-css</a> (GPL-3.0) · <a href="https://github.com/jlgrimes/literally-every-ccg" target="_blank" rel="noreferrer">Source</a> · thanks, Simon ♥
        </footer>
      </div>

      {/* ---------- fullscreen pack experience ---------- */}
      {screen && (
        <div className="packscreen" id="packscreen"
          onClick={screen.phase === "summary" ? closeScreen : undefined}>
          <div className="ps-portal" />

          {screen.phase === "wrapper" && (
            <PackWrapper onTorn={onTorn} universeLabel="Multiverse" />
          )}

          {screen.phase === "stack" && (
            <>
              <div className="ps-counter">{screen.idx + 1} / {screen.cards.length}</div>
              <CardStack cards={screen.cards} idx={screen.idx} onAdvance={advance} />
              {top && (
                <div className="banner ps-banner">
                  <span className={`tierpill tp-${top.tier}`}>{TIER_LABEL[top.tier]}{newIds.has(key(top)) ? " · NEW" : ""}</span>
                  <span className="name display">{top.name}</span>
                  <span className="meta">{top.native} · {GAME_LABEL[top.game]} · {top.set}</span>
                  <span className="meta dim">tap the card for the next one</span>
                </div>
              )}
            </>
          )}

          {screen.phase === "summary" && (
            <>
              <div className="ps-title display">Pack complete</div>
              <div className="fan ps-fan">
                {screen.cards.map((c, i) => (
                  <div key={i} className={`mini t-${c.tier}`} style={{ animationDelay: `${i * 70}ms` }}>
                    <img src={c.img} alt={c.name} referrerPolicy="no-referrer" />
                    {newIds.has(key(c)) && <span className="new-badge">NEW</span>}
                  </div>
                ))}
              </div>
              {best && <div className="banner"><span className="meta">Best pull: {best.name} ({TIER_LABEL[best.tier]})</span></div>}
              <div className="ps-continue">tap anywhere to continue</div>
            </>
          )}
        </div>
      )}

      {/* ---------- single-card inspect overlay ---------- */}
      {inspect && (
        <div className="packscreen inspectscreen" onClick={() => setInspect(null)}>
          <CardStack cards={[inspect]} idx={0} onAdvance={null} onInspectTap={() => setInspect(null)} />
          <div className="banner ps-banner">
            <span className={`tierpill tp-${inspect.tier}`}>{TIER_LABEL[inspect.tier]}</span>
            <span className="name display">{inspect.name}</span>
            <span className="meta">{inspect.native} · {GAME_LABEL[inspect.game]} · {inspect.set} · owned ×{inspect.count || 1}</span>
          </div>
          <div className="ps-continue">tap anywhere to close</div>
        </div>
      )}

      <div className={`toast${toastMsg ? " show" : ""}`}>{toastMsg}</div>
    </>
  );
}

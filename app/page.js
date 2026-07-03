"use client";
import { useEffect, useRef, useState } from "react";
import PackWrapper from "../components/PackWrapper";
import CardStack from "../components/CardStack";
import Duel from "../components/Duel";

const TIER_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const TIER_LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const GAME_LABEL = {
  mtg: "Magic: The Gathering", pokemon: "Pokémon TCG", yugioh: "Yu-Gi-Oh!", lorcana: "Disney Lorcana",
  onepiece: "One Piece", gundam: "Gundam", dbfusion: "Dragon Ball Fusion World",
  unionarena: "Union Arena", swu: "Star Wars Unlimited", fab: "Flesh and Blood",
  riftbound: "Riftbound: League of Legends",
};
const GAME_CHIP = {
  mtg: "Magic", pokemon: "Pokémon", yugioh: "Yu-Gi-Oh!", lorcana: "Lorcana", onepiece: "One Piece",
  gundam: "Gundam", dbfusion: "DB Fusion", unionarena: "Union Arena", swu: "SW Unlimited", fab: "Flesh & Blood",
  riftbound: "Riftbound",
};
const rank = (t) => TIER_ORDER.indexOf(t);
const key = (c) => `${c.game}:${c.id}`;
const EMPTY = { pulls: 0, tiers: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }, binder: {} };
const BATTLE_GAMES = ["mtg", "pokemon", "yugioh"];
const EMPTY_RECORD = { w: 0, l: 0, d: 0 };

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

  // arena: null | { phase: "pick", sel: [keys] } | { phase: "result", sel, data }
  const [arena, setArena] = useState(null);
  const [arenaRec, setArenaRec] = useState(EMPTY_RECORD);

  // duel: null | { playerDeck, aiDeck }
  const [duel, setDuel] = useState(null);

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
    try {
      const ar = localStorage.getItem("omnideck:arena");
      if (ar) setArenaRec({ ...EMPTY_RECORD, ...JSON.parse(ar) });
    } catch (e) {}
    loaded.current = true;
    fetch("/api/meta").then((r) => r.json()).then(setMeta).catch(() => {});
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem("omnideck:v2", JSON.stringify(state)); } catch (e) {}
  }, [state]);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem("omnideck:arena", JSON.stringify(arenaRec)); } catch (e) {}
  }, [arenaRec]);

  // lock page scroll while the pack screen is open
  useEffect(() => {
    document.body.style.overflow = screen || inspect || arena || duel ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [screen, inspect, arena, duel]);

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

  // ---------- arena & duel ----------
  // binder cards saved before battle stats existed lack bs — ask the server
  // which of them can fight and heal the stored copies once. Returns the
  // healed binder so callers don't have to wait for the state update.
  async function healFighters() {
    const need = Object.entries(state.binder)
      .filter(([, c]) => BATTLE_GAMES.includes(c.game) && !c.bs)
      .map(([k]) => k);
    if (!need.length) return state.binder;
    try {
      const r = await fetch("/api/battle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: need }),
      });
      const j = await r.json();
      if (!j.ok || !j.ok.length) return state.binder;
      const healed = { ...state.binder };
      for (const { key: k, bs } of j.ok) if (healed[k]) healed[k] = { ...healed[k], bs };
      setState((s) => {
        const binder = { ...s.binder };
        for (const { key: k, bs } of j.ok) if (binder[k]) binder[k] = { ...binder[k], bs };
        return { ...s, binder };
      });
      return healed;
    } catch (e) { return state.binder; }
  }

  function openArena() {
    setArena({ phase: "pick", sel: [] });
    healFighters();
  }

  // full merged-rules duel: your best 20 fighters (loaners fill the gaps),
  // AI drafts a deck mirroring your tier profile
  async function openDuel() {
    if (busy) return;
    setBusy(true);
    try {
      const binder = await healFighters();
      const mine = Object.values(binder)
        .filter((c) => Array.isArray(c.bs))
        .sort((a, b) => rank(b.tier) - rank(a.tier) || b.bs[0] + b.bs[1] - (a.bs[0] + a.bs[1]))
        .slice(0, 20);
      const r = await fetch("/api/battle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { tiers: mine.map((c) => c.tier), loan: 20 - mine.length } }),
      });
      const j = await r.json();
      if (!j.deck || !j.deck.length) throw new Error("no deck");
      setDuel({ playerDeck: [...mine, ...(j.loaners || [])], aiDeck: j.deck });
    } catch (e) {
      toast("The dueling grounds jammed — try again");
    } finally { setBusy(false); }
  }

  function duelDone(result) {
    if (result) {
      setArenaRec((rec) => ({
        w: rec.w + (result === "win" ? 1 : 0),
        l: rec.l + (result === "loss" ? 1 : 0),
        d: rec.d + (result === "draw" ? 1 : 0),
      }));
      if (result === "win") celebrate("epic");
    }
    setDuel(null);
  }

  function toggleFighter(k) {
    setArena((a) => {
      if (!a || a.phase !== "pick") return a;
      const sel = a.sel.includes(k) ? a.sel.filter((x) => x !== k)
        : a.sel.length < 3 ? [...a.sel, k] : a.sel;
      return { ...a, sel };
    });
  }

  async function fight() {
    if (!arena || arena.sel.length !== 3 || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/battle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: arena.sel }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setArenaRec((rec) => ({
        w: rec.w + (j.result === "win" ? 1 : 0),
        l: rec.l + (j.result === "loss" ? 1 : 0),
        d: rec.d + (j.result === "draw" ? 1 : 0),
      }));
      if (j.result === "win") celebrate("epic");
      setArena({ phase: "result", sel: arena.sel, data: j });
    } catch (e) {
      toast("The arena gates jammed — try again");
    } finally { setBusy(false); }
  }

  function showFromBinder(c) { setInspect(c); }

  function clearAll() {
    if (!confirm("Clear your entire collection and stats?")) return;
    setState(EMPTY); setNewIds(new Set()); setInspect(null);
  }

  const games = meta ? Object.keys(meta.byGame) : [];
  const fighterPool = Object.values(state.binder)
    .filter((c) => Array.isArray(c.bs))
    .sort((a, b) => rank(b.tier) - rank(a.tier) || b.bs[0] + b.bs[1] - (a.bs[0] + a.bs[1]))
    .slice(0, 200);
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
          <div className="btns">
            <button className="pull display" disabled={busy} onClick={buyPack}>
              {busy ? "SHUFFLING…" : "OPEN PACK"}
            </button>
            <button className="pull10 display" disabled={busy} onClick={openDuel}>⚔ DUEL</button>
            <button className="pull10 display" disabled={busy} onClick={openArena}>🗡 SKIRMISH</button>
          </div>
          <div className="odds">
            Hit slot — <b className="ol">Legendary 8%</b> · <b className="oe">Epic 20%</b> · <b className="or">Rare 72%</b>
          </div>
          {(arenaRec.w + arenaRec.l + arenaRec.d) > 0 && (
            <div className="odds">Arena record — <b className="oe">{arenaRec.w}W</b> · {arenaRec.l}L · {arenaRec.d}D</div>
          )}
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

      {/* ---------- arena ---------- */}
      {arena && (
        <div className="packscreen arenascreen">
          <div className="ps-portal" />

          {arena.phase === "pick" && (
            <>
              <div className="ps-title display">Choose your fighters</div>
              <div className="arena-sub">
                {fighterPool.length
                  ? <>Pick 3 — Magic creatures, Pokémon &amp; Yu-Gi-Oh! monsters battle with their real stats, normalized to one scale.</>
                  : <>No fighters in your binder yet. Rip packs for Magic, Pokémon or Yu-Gi-Oh! cards — creatures and monsters can battle.</>}
              </div>
              {fighterPool.length > 0 && (
                <div className="arena-grid">
                  {fighterPool.map((c) => {
                    const k = key(c);
                    const n = arena.sel.indexOf(k);
                    return (
                      <button key={k} className={`thumb t-${c.tier}${n !== -1 ? " picked" : ""}`}
                        title={`${c.name} · ${c.bs[0]} ATK / ${c.bs[1]} HP`} onClick={() => toggleFighter(k)}>
                        <img src={c.img} alt={c.name} loading="lazy" referrerPolicy="no-referrer" />
                        <span className="bs-badge">{c.bs[0]}⚔ {c.bs[1]}♥</span>
                        {n !== -1 && <span className="pick-badge">{n + 1}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="arena-actions">
                <button className="pull display" disabled={arena.sel.length !== 3 || busy} onClick={fight}>
                  {busy ? "FIGHTING…" : `FIGHT ${arena.sel.length}/3`}
                </button>
                <button className="pull10 display" onClick={() => setArena(null)}>BACK</button>
              </div>
            </>
          )}

          {arena.phase === "result" && (
            <>
              <div className={`ps-title display arena-${arena.data.result}`}>
                {arena.data.result === "win" ? "VICTORY" : arena.data.result === "loss" ? "DEFEAT" : "DRAW"}
              </div>
              <div className="arena-sub">
                Lanes {arena.data.playerWins} – {arena.data.aiWins} · record {arenaRec.w}W · {arenaRec.l}L · {arenaRec.d}D
              </div>
              <div className="lanes">
                {arena.data.lanes.map((l, i) => (
                  <div key={i} className={`lane lane-${l.winner}`}>
                    <div className="fighter">
                      <img src={l.player.img} alt={l.player.name} referrerPolicy="no-referrer" />
                      <span className="fname">{l.player.name}</span>
                      <span className="fmeta"><b>{l.player.bs[0]}⚔ {l.player.bs[1]}♥</b> · KOs in {l.playerHits}</span>
                    </div>
                    <span className="vs display">{l.winner === "player" ? "◀" : l.winner === "ai" ? "▶" : "="}</span>
                    <div className="fighter foe">
                      <img src={l.ai.img} alt={l.ai.name} referrerPolicy="no-referrer" />
                      <span className="fname">{l.ai.name}</span>
                      <span className="fmeta"><b>{l.ai.bs[0]}⚔ {l.ai.bs[1]}♥</b> · KOs in {l.aiHits}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="arena-actions">
                <button className="pull display" disabled={busy} onClick={fight}>REMATCH</button>
                <button className="pull10 display" onClick={() => setArena({ phase: "pick", sel: arena.sel })}>NEW TEAM</button>
                <button className="pull10 display" onClick={() => setArena(null)}>DONE</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- merged-rules duel ---------- */}
      {duel && <Duel playerDeck={duel.playerDeck} aiDeck={duel.aiDeck} onDone={duelDone} />}

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

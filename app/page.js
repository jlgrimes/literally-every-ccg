"use client";
import { useEffect, useRef, useState } from "react";
import PackWrapper from "../components/PackWrapper";
import CardStack from "../components/CardStack";
import Duel from "../components/Duel";
import DeckBuilder from "../components/DeckBuilder";
import Rules from "../components/Rules";

const TIER_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const TIER_LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const GAME_LABEL = {
  mtg: "Magic: The Gathering", pokemon: "Pokémon TCG", yugioh: "Yu-Gi-Oh!", lorcana: "Disney Lorcana",
  onepiece: "One Piece", gundam: "Gundam", dbfusion: "Dragon Ball Fusion World",
  unionarena: "Union Arena", swu: "Star Wars Unlimited", fab: "Flesh and Blood",
  riftbound: "Riftbound: League of Legends", digimon: "Digimon Card Game",
  netrunner: "Android: Netrunner", weiss: "Weiß Schwarz",
};
const GAME_CHIP = {
  mtg: "Magic", pokemon: "Pokémon", yugioh: "Yu-Gi-Oh!", lorcana: "Lorcana", onepiece: "One Piece",
  gundam: "Gundam", dbfusion: "DB Fusion", unionarena: "Union Arena", swu: "SW Unlimited", fab: "Flesh & Blood",
  riftbound: "Riftbound", digimon: "Digimon", netrunner: "Netrunner", weiss: "Weiß Schwarz",
};
const rank = (t) => TIER_ORDER.indexOf(t);
const key = (c) => `${c.game}:${c.id}`;
const EMPTY = { pulls: 0, tiers: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }, binder: {} };
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

  // duel: null | { mode:"ai", playerDeck, aiDeck } | { mode:"pvp", side, state, ext }
  const [duel, setDuel] = useState(null);
  // multiple saved decks: { decks: [{id, name, keys}], active: id }
  const [deckStore, setDeckStore] = useState({ decks: [], active: null });
  const [tab, setTab] = useState("home");         // bottom nav: home | cards | decks | battle
  const [rules, setRules] = useState(false);      // ℹ full-page rules modal
  const [editDeck, setEditDeck] = useState(null); // deck being edited in the builder
  const duelAfterSave = useRef(false);
  const activeDeck = deckStore.decks.find((d) => d.id === deckStore.active) || null;
  const deckKeys = activeDeck ? activeDeck.keys : null;

  // match log: newest-first records of finished matches
  const [history, setHistory] = useState([]);

  // multiplayer: null | { phase:"menu", code } | { phase:"waiting", code, token }
  const [mp, setMp] = useState(null);
  const [pname, setPname] = useState("");
  const mpSeq = useRef(0);
  const mpInfo = useRef(null); // { code, token, side, names } for the live match

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
    try {
      const ds = JSON.parse(localStorage.getItem("omnideck:decks") || "null");
      if (ds && Array.isArray(ds.decks)) setDeckStore(ds);
      else {
        // migrate the single-deck era
        const dk = JSON.parse(localStorage.getItem("omnideck:deck") || "null");
        if (Array.isArray(dk)) setDeckStore({ decks: [{ id: "d1", name: "Deck 1", keys: dk }], active: "d1" });
      }
    } catch (e) {}
    try { setPname(localStorage.getItem("omnideck:name") || ""); } catch (e) {}
    try {
      const h = JSON.parse(localStorage.getItem("omnideck:history") || "[]");
      if (Array.isArray(h)) setHistory(h);
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
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem("omnideck:decks", JSON.stringify(deckStore)); } catch (e) {}
  }, [deckStore]);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem("omnideck:history", JSON.stringify(history)); } catch (e) {}
  }, [history]);

  // lock page scroll while a fullscreen experience (or the in-tab editor) is up
  useEffect(() => {
    const editing = editDeck && tab === "decks";
    document.body.style.overflow = screen || inspect || arena || duel || editing || mp || rules ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [screen, inspect, arena, duel, editDeck, mp, tab, rules]);

  // multiplayer polling: waiting room → opponent joined; in-game → their moves
  useEffect(() => {
    const waiting = mp && mp.phase === "waiting";
    const playing = duel && duel.mode === "pvp";
    if (!waiting && !playing) return;
    const tick = async () => {
      const info = waiting ? { code: mp.code, token: mp.token } : mpInfo.current;
      if (!info) return;
      try {
        const r = await fetch("/api/match", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "state", code: info.code, token: info.token, since: mpSeq.current }),
        });
        const j = await r.json();
        if (j.error) return;
        if (waiting) {
          if (j.status !== "waiting" && j.state) {
            mpSeq.current = j.seq;
            mpInfo.current = { code: mp.code, token: mp.token, side: "p", names: { me: pname || "You", them: j.guestName || "Guest" } };
            setMp(null);
            setDuel({ mode: "pvp", side: "p", state: j.state, ext: { seq: j.seq, state: j.state } });
          }
          return;
        }
        if (j.seq > mpSeq.current && j.state) {
          mpSeq.current = j.seq;
          setDuel((d) => (d && d.mode === "pvp" ? { ...d, ext: { seq: j.seq, state: j.state } } : d));
        }
      } catch (e) {}
    };
    const t = setInterval(tick, 2000);
    tick();
    return () => clearInterval(t);
  }, [mp, duel && duel.mode === "pvp", pname]);

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
      setScreen({ phase: "wrapper", cards: validated, idx: 0, god: !!j.god });
    } catch (e) {
      toast("Pack machine jammed — try again");
    } finally { setBusy(false); }
  }

  function onTorn() {
    setScreen((s) => s && { ...s, phase: "stack" });
    if (screen) celebrate(screen.god ? "legendary" : screen.cards[0].tier);
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
      .filter(([, c]) => (!c.bs && !c.fx) || (c.game === "pokemon" && c.bs && !c.atks))
      .map(([k]) => k);
    if (!need.length) return state.binder;
    try {
      const r = await fetch("/api/battle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: need }),
      });
      const j = await r.json();
      if (!j.ok || !j.ok.length) return state.binder;
      const apply = (binder) => {
        const next = { ...binder };
        for (const { key: k, ...patch } of j.ok) if (next[k]) next[k] = { ...next[k], ...patch };
        return next;
      };
      const healed = apply(state.binder);
      setState((s) => ({ ...s, binder: apply(s.binder) }));
      return healed;
    } catch (e) { return state.binder; }
  }

  function openArena() {
    setArena({ phase: "pick", sel: [] });
    healFighters();
  }

  // duels require a deck YOU built from cards you actually pulled:
  // 20 cards, duplicates allowed up to the copies you own
  function validDeck(keys, binder) {
    if (!Array.isArray(keys) || keys.length !== 20) return false;
    const used = {};
    for (const k of keys) {
      const c = binder[k];
      if (!c || !Array.isArray(c.bs)) return false; // creatures only
      used[k] = (used[k] || 0) + 1;
      if (used[k] > (c.count || 1)) return false;
    }
    return true;
  }

  async function startDuel(keys, binder) {
    try {
      const deckCards = keys.map((k) => binder[k]);
      const r = await fetch("/api/battle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { tiers: deckCards.map((c) => c.tier) } }),
      });
      const j = await r.json();
      if (!j.deck || !j.deck.length) throw new Error("no deck");
      setDuel({ playerDeck: deckCards, aiDeck: j.deck });
    } catch (e) {
      toast("The dueling grounds jammed — try again");
    }
  }

  async function openDuel() {
    if (busy) return;
    setBusy(true);
    try {
      const binder = await healFighters();
      if (validDeck(deckKeys, binder)) { await startDuel(deckKeys, binder); return; }
      const owned = Object.values(binder).filter((c) => Array.isArray(c.bs)).reduce((n, c) => n + (c.count || 1), 0);
      if (owned < 20) toast(`You need 20 creatures for a deck — you own ${owned}. Rip more packs!`);
      else {
        duelAfterSave.current = true;
        setEditDeck(activeDeck ? { ...activeDeck } : { id: null, name: "Deck 1", keys: [] });
        setTab("decks");
      }
    } finally { setBusy(false); }
  }

  function goTab(t) {
    setTab(t);
    if (t === "decks") { duelAfterSave.current = false; healFighters(); }
  }

  function newDeck() {
    setEditDeck({ id: null, name: `Deck ${deckStore.decks.length + 1}`, keys: [] });
  }

  function deleteDeck(id) {
    if (!confirm("Delete this deck?")) return;
    setDeckStore((s) => {
      const decks = s.decks.filter((d) => d.id !== id);
      return { decks, active: s.active === id ? (decks[0] ? decks[0].id : null) : s.active };
    });
  }

  function saveDeck(keys, name) {
    let id = editDeck && editDeck.id;
    setDeckStore((s) => {
      let decks = [...s.decks];
      if (!id) { id = "d" + Date.now().toString(36); decks.push({ id, name, keys }); }
      else decks = decks.map((d) => (d.id === id ? { ...d, name, keys } : d));
      return { decks: decks.slice(0, 12), active: id };
    });
    setEditDeck(null);
    if (duelAfterSave.current) {
      duelAfterSave.current = false;
      startDuel(keys, state.binder);
    } else toast("Deck saved");
  }

  function recordMatch(entry) {
    setHistory((h) => [{ ts: Date.now(), ...entry }, ...h].slice(0, 50));
  }

  function duelDone(result, summary) {
    if (result) {
      setArenaRec((rec) => ({
        w: rec.w + (result === "win" ? 1 : 0),
        l: rec.l + (result === "loss" ? 1 : 0),
        d: rec.d + (result === "draw" ? 1 : 0),
      }));
      if (result === "win") celebrate("epic");
      recordMatch({
        mode: duel && duel.mode === "pvp" ? "pvp" : "ai",
        result,
        opp: (summary && summary.opp) || "AI",
        turns: summary && summary.turns,
        myHp: summary && summary.myHp,
        oppHp: summary && summary.theirHp,
        log: ((summary && summary.log) || []).slice(-60),
      });
    }
    mpInfo.current = null;
    setDuel(null);
  }

  // ---------- multiplayer ----------
  function setName(v) {
    setPname(v);
    try { localStorage.setItem("omnideck:name", v); } catch (e) {}
  }

  // both flows need your saved deck — send its cards along
  async function deckForMp() {
    const binder = await healFighters();
    if (!validDeck(deckKeys, binder)) {
      setMp(null);
      const owned = Object.values(binder).filter((c) => Array.isArray(c.bs)).reduce((n, c) => n + (c.count || 1), 0);
      if (owned < 20) toast(`You need 20 creatures for a deck — you own ${owned}. Rip more packs!`);
      else {
        duelAfterSave.current = false;
        setEditDeck(activeDeck ? { ...activeDeck } : { id: null, name: "Deck 1", keys: [] });
        setTab("decks");
        toast("Build your deck first");
      }
      return null;
    }
    return deckKeys.map((k) => binder[k]);
  }

  async function mpCreate() {
    if (busy) return;
    setBusy(true);
    try {
      const deck = await deckForMp();
      if (!deck) return;
      const r = await fetch("/api/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create", name: pname || "Host", deck }),
      });
      const j = await r.json();
      if (j.error) { toast(j.error); return; }
      mpSeq.current = 0;
      setMp({ phase: "waiting", code: j.code, token: j.token });
    } catch (e) { toast("Couldn't open a match — try again"); }
    finally { setBusy(false); }
  }

  async function mpJoin(codeInput) {
    if (busy) return;
    const code = String(codeInput || "").toUpperCase().trim();
    if (code.length !== 6) { toast("Enter the 6-letter match code"); return; }
    setBusy(true);
    try {
      const deck = await deckForMp();
      if (!deck) return;
      const r = await fetch("/api/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "join", code, name: pname || "Guest", deck }),
      });
      const j = await r.json();
      if (j.error) { toast(j.error); return; }
      const s = await (await fetch("/api/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "state", code, token: j.token, since: 0 }),
      })).json();
      if (s.error || !s.state) { toast("Couldn't load the match"); return; }
      mpSeq.current = s.seq;
      mpInfo.current = { code, token: j.token, side: "ai", names: { me: pname || "You", them: s.hostName || "Host" } };
      setMp(null);
      setDuel({ mode: "pvp", side: "ai", state: s.state, ext: { seq: s.seq, state: s.state } });
    } catch (e) { toast("Couldn't join — try again"); }
    finally { setBusy(false); }
  }

  async function pvpSync(state) {
    const info = mpInfo.current;
    if (!info) return;
    try {
      const r = await fetch("/api/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "move", code: info.code, token: info.token, state }),
      });
      const j = await r.json();
      if (j.seq) mpSeq.current = j.seq;
    } catch (e) {}
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
      recordMatch({
        mode: "skirmish", result: j.result, opp: "AI",
        log: j.lanes.map((l) =>
          `${l.player.name} (${l.player.bs[0]}⚔/${l.player.bs[1]}♥) vs ${l.ai.name} (${l.ai.bs[0]}⚔/${l.ai.bs[1]}♥) — ${l.winner === "player" ? "won" : l.winner === "ai" ? "lost" : "draw"}`),
      });
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
  // decks are creatures/characters only — spells and events spectate
  const eligibleBinder = Object.values(state.binder).filter((c) => Array.isArray(c.bs));
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

      {/* ---------- main screen (bottom-tab navigation) ---------- */}
      <div className="wrap">
        {tab === "home" && (
          <>
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
              </div>
              <div className="odds">
                Hit slot — <b className="ol">Legendary 8%</b> · <b className="oe">Epic 20%</b> · <b className="or">Rare 72%</b> · <b className="ol">⚡ God pack 0.5%</b>
              </div>
            </div>

            <div className="stats">
              <div className="stat"><b className="display">{state.pulls}</b><span>Cards</span></div>
              <div className="stat rar"><b className="display">{state.tiers.rare}</b><span>Rare</span></div>
              <div className="stat epi"><b className="display">{state.tiers.epic}</b><span>Epic</span></div>
              <div className="stat leg"><b className="display">{state.tiers.legendary}</b><span>Legendary</span></div>
            </div>

            <footer>
              Card effects © Simon Goellner — <a href="https://github.com/simeydotme/pokemon-cards-css" target="_blank" rel="noreferrer">simeydotme/pokemon-cards-css</a> (GPL-3.0) · <a href="https://github.com/jlgrimes/literally-every-ccg" target="_blank" rel="noreferrer">Source</a> · thanks, Simon ♥
            </footer>
          </>
        )}

        {tab === "cards" && (
          <div className="shelf tabshelf">
            <h2 className="display">Your cards <button onClick={clearAll}>Clear</button></h2>
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
            <div className="filters filters-scroll">
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
        )}

        {tab === "decks" && !editDeck && (
          <div className="shelf tabshelf">
            <h2 className="display">Your decks</h2>
            <div className="tabnote">
              {deckStore.decks.length
                ? <>Tap a deck to make it active — duels and matches use the active one.</>
                : <>No decks yet. A deck is 20 cards from your collection — duplicates up to the copies you own.</>}
            </div>
            <div className="deck-list">
              {deckStore.decks.map((d) => (
                <div key={d.id} className={`deckrow${d.id === deckStore.active ? " on" : ""}`}>
                  <button className="deckrow-main" onClick={() => setDeckStore((s) => ({ ...s, active: d.id }))}>
                    <span className="deckrow-dot">{d.id === deckStore.active ? "◉" : "○"}</span>
                    <span className="deckrow-name">{d.name}</span>
                    <span className={`deckrow-n${validDeck(d.keys, state.binder) ? "" : " bad"}`}>
                      {d.keys.length}/20{validDeck(d.keys, state.binder) ? "" : " ⚠"}
                    </span>
                  </button>
                  <button className="deckrow-btn" title="Edit" onClick={() => setEditDeck({ ...d })}>✎</button>
                  <button className="deckrow-btn" title="Delete" onClick={() => deleteDeck(d.id)}>✕</button>
                </div>
              ))}
            </div>
            {deckStore.decks.length < 12 && (
              <div className="actions"><button className="pull display" onClick={newDeck}>＋ NEW DECK</button></div>
            )}
          </div>
        )}

        {tab === "battle" && (
          <>
            <div className="shelf tabshelf">
              <h2 className="display">Battle</h2>
              <div className="tabnote">
                OMNIRULES — all 14 games, one merged rulebook: mana &amp; summoning sickness,
                Pokémon energy &amp; evolution, Yu-Gi-Oh tributes.
                {activeDeck ? <> Active deck: <b>{activeDeck.name}</b>.</> : <> Build a deck in the DECKS tab first.</>}
              </div>
              <div className="actions">
                <button className="pull display" disabled={busy} onClick={openDuel}>⚔ DUEL THE AI</button>
                <button className="pull10 display" disabled={busy} onClick={() => setMp({ phase: "menu", code: "" })}>🌐 VS FRIEND</button>
                <button className="pull10 display" disabled={busy} onClick={openArena}>🗡 QUICK SKIRMISH</button>
              </div>
              {(arenaRec.w + arenaRec.l + arenaRec.d) > 0 && (
                <div className="odds">Record — <b className="oe">{arenaRec.w}W</b> · {arenaRec.l}L · {arenaRec.d}D</div>
              )}
            </div>

            {history.length > 0 && (
              <div className="shelf">
                <h2 className="display">Match log <button onClick={() => { if (confirm("Clear match history?")) setHistory([]); }}>Clear</button></h2>
                <div className="mlog">
                  {history.slice(0, 20).map((m) => (
                    <details key={m.ts} className="mrow">
                      <summary>
                        <b className={`mres r-${m.result}`}>{m.result === "win" ? "W" : m.result === "loss" ? "L" : "D"}</b>
                        <span className="mmode" title={m.mode === "pvp" ? "multiplayer duel" : m.mode === "skirmish" ? "skirmish" : "AI duel"}>
                          {m.mode === "pvp" ? "🌐" : m.mode === "skirmish" ? "🗡" : "⚔"}
                        </span>
                        <span className="mopp">vs {m.opp || "AI"}</span>
                        {Number.isFinite(m.turns) && <span className="mmeta">{m.turns} turns</span>}
                        {Number.isFinite(m.myHp) && <span className="mmeta">{m.myHp}–{m.oppHp} hp</span>}
                        <span className="mtime">
                          {new Date(m.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
                          {new Date(m.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </summary>
                      {m.log && m.log.length > 0 && (
                        <div className="mlogbody">{m.log.map((l, i) => <div key={i}>{l}</div>)}</div>
                      )}
                    </details>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------- rules: ℹ corner button + full-page modal ---------- */}
      <button className="infobtn" title="How to play" aria-label="How to play" onClick={() => setRules(true)}>ℹ</button>
      {rules && <Rules onClose={() => setRules(false)} />}

      {/* ---------- bottom tab bar ---------- */}
      <nav className="tabbar">
        {[["home", "🎁", "PACKS"], ["cards", "🗂", "CARDS"], ["decks", "🃏", "DECKS"], ["battle", "⚔️", "BATTLE"]].map(([t, icon, label]) => (
          <button key={t} className={`tabbtn${tab === t ? " on" : ""}`} onClick={() => goTab(t)}>
            <span className="ticon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* ---------- fullscreen pack experience ---------- */}
      {screen && (
        <div className="packscreen" id="packscreen"
          onClick={screen.phase === "summary" ? closeScreen : undefined}>
          <div className="ps-portal" />

          {screen.phase === "wrapper" && (
            <PackWrapper onTorn={onTorn} universeLabel={screen.god ? "GOD PACK" : "Multiverse"} god={screen.god} />
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
              <div className="ps-title display">{screen.god ? "⚡ GOD PACK ⚡" : "Pack complete"}</div>
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
                  ? <>Pick 3 — every game's creatures &amp; characters fight on one shared ATK/HP scale: real printed stats where the game has them, rarity-derived power everywhere else.</>
                  : <>No fighters in your binder yet. Rip a pack — creatures and characters from any game can battle.</>}
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

      {/* ---------- multiplayer menu / waiting room ---------- */}
      {mp && !duel && !editDeck && (
        <div className="packscreen arenascreen">
          <div className="ps-portal" />
          {mp.phase === "menu" && (
            <>
              <div className="ps-title display">Duel a friend</div>
              <div className="arena-sub">Same rules, real opponent. You both bring your own 20-card deck.</div>
              <input className="mp-input" maxLength={20} placeholder="your name" value={pname}
                onChange={(e) => setName(e.target.value)} />
              <div className="arena-actions">
                <button className="pull display" disabled={busy} onClick={mpCreate}>CREATE MATCH</button>
              </div>
              <div className="mp-divider">— or join one —</div>
              <input className="mp-input mp-code-input" maxLength={6} placeholder="MATCH CODE" value={mp.code}
                onChange={(e) => setMp({ ...mp, code: e.target.value.toUpperCase() })} />
              <div className="arena-actions">
                <button className="pull display" disabled={busy || (mp.code || "").length !== 6} onClick={() => mpJoin(mp.code)}>JOIN MATCH</button>
                <button className="pull10 display" onClick={() => setMp(null)}>BACK</button>
              </div>
            </>
          )}
          {mp.phase === "waiting" && (
            <>
              <div className="ps-title display">Match created</div>
              <div className="arena-sub">Send this code to your friend — the duel starts the moment they join.</div>
              <div className="mp-code display">{mp.code}</div>
              <div className="ps-continue">waiting for your opponent…</div>
              <div className="arena-actions">
                <button className="pull10 display" onClick={() => setMp(null)}>CANCEL</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- deck builder: lives in the DECKS tab, above the tab bar; ----------
           stays mounted (edits survive) while you visit other tabs */}
      {editDeck && (
        <div className={tab === "decks" ? undefined : "offstage"}>
          <DeckBuilder pool={eligibleBinder} initial={editDeck.keys} deckName={editDeck.name} onSave={saveDeck}
            onClose={() => { duelAfterSave.current = false; setEditDeck(null); }} />
        </div>
      )}

      {/* ---------- merged-rules duel ---------- */}
      {duel && duel.mode !== "pvp" && <Duel playerDeck={duel.playerDeck} aiDeck={duel.aiDeck} onDone={duelDone} />}
      {duel && duel.mode === "pvp" && (
        <Duel mode="pvp" mySide={duel.side} initialState={duel.state} external={duel.ext}
          onSync={pvpSync} names={mpInfo.current ? mpInfo.current.names : null} onDone={duelDone} />
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

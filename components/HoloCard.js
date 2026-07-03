"use client";
import { useRef, useEffect, useCallback } from "react";

// React driver for the vendored pokemon-cards-css system by Simon Goellner
// (simeydotme, GPL-3.0 — see LICENSE / NOTICE.md). This component renders
// Simon's expected DOM (.card > .card__translater > .card__rotator >
// .card__front/.card__back) and feeds the CSS variables his styles consume.
// Variable formulas follow his Card.svelte interaction math.

const RARITY_ATTR = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare holo",
  epic: "rare rainbow",
  legendary: "rare secret",
};
const GLOW = {
  common: "#8e9bae",
  uncommon: "#4fc58a",
  rare: "#4d8dff",
  epic: "#b76bff",
  legendary: "#ffc24d",
};

const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const adjust = (v, fl, fh, tl, th) => tl + ((v - fl) * (th - tl)) / (fh - fl);

const INITIAL_VARS = {
  "--pointer-x": "50%",
  "--pointer-y": "50%",
  "--pointer-from-center": 0,
  "--pointer-from-top": 0.5,
  "--pointer-from-left": 0.5,
  "--card-opacity": 0,
  "--rotate-x": "0deg",
  "--rotate-y": "0deg",
  "--background-x": "50%",
  "--background-y": "50%",
  "--card-scale": 1,
  "--translate-x": "0px",
  "--translate-y": "0px",
};

export default function HoloCard({ card, flipped = true, active = true, onTap }) {
  const ref = useRef(null);
  const raf = useRef(0);

  const onMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    const rect = el.getBoundingClientRect();
    const ax = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const ay = clamp(((e.clientY - rect.top) / rect.height) * 100);
    raf.current = requestAnimationFrame(() => {
      const cx = ax - 50, cy = ay - 50;
      const s = el.style;
      s.setProperty("--pointer-x", `${ax}%`);
      s.setProperty("--pointer-y", `${ay}%`);
      s.setProperty("--background-x", `${adjust(ax, 0, 100, 37, 63)}%`);
      s.setProperty("--background-y", `${adjust(ay, 0, 100, 33, 67)}%`);
      s.setProperty("--pointer-from-center", clamp(Math.hypot(cy, cx) / 50, 0, 1));
      s.setProperty("--pointer-from-top", ay / 100);
      s.setProperty("--pointer-from-left", ax / 100);
      s.setProperty("--rotate-x", `${Math.round(-(cx / 3.5))}deg`);
      s.setProperty("--rotate-y", `${Math.round(cy / 2)}deg`);
      s.setProperty("--card-opacity", 1);
      el.classList.add("interacting");
    });
  }, []);

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.classList.remove("interacting");
    const s = el.style;
    s.setProperty("--pointer-x", "50%");
    s.setProperty("--pointer-y", "50%");
    s.setProperty("--background-x", "50%");
    s.setProperty("--background-y", "50%");
    s.setProperty("--pointer-from-center", 0);
    s.setProperty("--pointer-from-top", 0.5);
    s.setProperty("--pointer-from-left", 0.5);
    s.setProperty("--rotate-x", "0deg");
    s.setProperty("--rotate-y", "0deg");
    s.setProperty("--card-opacity", 0);
  }, []);

  // Kill any lingering interaction state when the card underneath changes.
  useEffect(() => { onLeave(); }, [card && card.img, onLeave]);

  const tier = card ? card.tier : "common";

  return (
    <div
      ref={ref}
      className={`card interactive${active ? " active" : ""}${flipped ? "" : " loading"}`}
      data-rarity={active ? RARITY_ATTR[tier] : "none"}
      style={{ ...INITIAL_VARS, "--card-glow": GLOW[tier], "--card-edge": GLOW[tier] }}
      onPointerMove={active ? onMove : undefined}
      onPointerLeave={active ? onLeave : undefined}
    >
      <div className="card__translater">
        <button
          className="card__rotator"
          onClick={onTap}
          aria-label={onTap ? "Next card" : card ? card.name : "Card"}
        >
          <div className="card__back od-back">
            <div className="ring"><div className="mono display">✦</div></div>
            <div className="lbl">Every CCG</div>
          </div>
          <div className="card__front">
            {card && <img className="card__img" src={card.img} alt={card.name} referrerPolicy="no-referrer" draggable={false} />}
            <div className="card__shine" aria-hidden="true" />
            <div className="card__glare" aria-hidden="true" />
          </div>
        </button>
      </div>
    </div>
  );
}

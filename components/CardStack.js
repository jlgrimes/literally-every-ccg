"use client";
import { useRef, useState, useCallback } from "react";
import HoloCard from "./HoloCard";

// Pocket-style stack: pivoted fan of cards, top card face-up with full holo
// and pointer tilt. Tap the top card and it flicks away, tucking to the back
// of the stack; the next card is waiting underneath. Every card stays
// mounted as the same element the whole time, so images never reload.
export default function CardStack({ cards, idx, onAdvance, onInspectTap }) {
  const n = cards.length;
  const dir = useRef(1);
  const [fly, setFly] = useState(false);

  const tap = useCallback(() => {
    if (onInspectTap) { onInspectTap(); return; }
    if (fly || !onAdvance) return;
    dir.current = Math.random() < 0.5 ? -1 : 1;
    setFly(true);
    setTimeout(() => { onAdvance(); setFly(false); }, 300);
  }, [fly, onAdvance, onInspectTap]);

  const flyX = typeof window !== "undefined" ? window.innerWidth * 0.75 : 520;

  return (
    <div className="cstack">
      {cards.map((c, i) => {
        const rel = i - idx; // no wrap: seen cards are gone for good
        const gone = rel < 0;
        const isTop = rel === 0;
        // the very next card (rel 1) sits at full size directly beneath the
        // top card, so promotion involves zero movement — no pop.
        const behind = Math.min(Math.max(rel - 1, 0), 4);
        const style = gone
          ? { zIndex: 0, visibility: "hidden", transition: "none" }
          : isTop
          ? {
              zIndex: n + 1,
              transform: fly
                ? `translate(${dir.current * flyX}px, -50px) rotate(${dir.current * 20}deg)`
                : "translate(0,0) rotate(0deg)",
              transition: fly ? "transform .3s ease-in" : "none",
            }
          : {
              zIndex: n - rel,
              transform: `translate(${behind * 3}px, ${behind * 5}px) rotate(${(rel % 2 ? 1 : -1) * behind * 1.4}deg) scale(${1 - behind * 0.015})`,
              transition: "transform .35s ease",
            };
        return (
          <div key={c.game + ":" + c.id + ":" + i} className={`cstack-card${isTop ? " top" : ""}`} style={style}>
            <HoloCard card={c} flipped={true} active={isTop} onTap={isTop && (onAdvance || onInspectTap) ? tap : undefined} />
          </div>
        );
      })}
    </div>
  );
}

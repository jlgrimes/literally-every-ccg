"use client";
import { useRef, useState, useCallback } from "react";

// Swipe horizontally across the pack to tear the strip off, Pocket-style.
// god: the golden 1-in-200 wrapper — you know before you tear.
export default function PackWrapper({ onTorn, universeLabel, god = false }) {
  const ref = useRef(null);
  const drag = useRef({ on: false, x0: 0 });
  const [prog, setProg] = useState(0);
  const [torn, setTorn] = useState(false);

  const down = useCallback((e) => {
    if (torn) return;
    drag.current = { on: true, x0: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [torn]);

  const move = useCallback((e) => {
    if (!drag.current.on || torn) return;
    const w = ref.current ? ref.current.offsetWidth : 260;
    setProg(Math.max(0, Math.min(1.2, (e.clientX - drag.current.x0) / (w * 0.75))));
  }, [torn]);

  const finish = useCallback(() => {
    if (!drag.current.on || torn) return;
    drag.current.on = false;
    setProg((p) => {
      if (p > 0.6) {
        setTorn(true);
        setTimeout(onTorn, 550);
        return 1.2;
      }
      return 0;
    });
  }, [torn, onTorn]);

  return (
    <div className={`pack${god ? " god" : ""}${torn ? " torn" : ""}`} ref={ref}
      onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
      <div className="pack-strip" style={{ transform: `translateX(${prog * 110}%) rotate(${prog * 8}deg)`, transition: drag.current.on ? "none" : undefined }}>
        <span className="tear-arrows">››››››››››</span>
      </div>
      <div className="pack-perf" />
      <div className="pack-body">
        <div className="pack-sheen" />
        <div className="pack-logo display">LITERALLY<br />EVERY<br /><em>CCG</em></div>
        <div className="pack-sub">{universeLabel} · 10 CARDS</div>
      </div>
      <button className="pack-a11y" onClick={() => { if (!torn) { setTorn(true); setProg(1.2); setTimeout(onTorn, 550); } }}>
        or tap here to open
      </button>
    </div>
  );
}

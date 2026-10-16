"use client";

import { useEffect, useRef } from "react";
import { fmtInt } from "@/lib/energy";
import { anchors, subscribe } from "../stage/anchors";
import s from "./home.module.css";

type Side = "left" | "right";
type Key = "mind" | "qin" | "qout";

const PAD = 14;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

// label side and vertical offset from its anchor
const LAYOUT: Record<Key, { side: Side; dy: number }> = {
  mind: { side: "right", dy: -58 },
  qin: { side: "left", dy: 26 },
  qout: { side: "right", dy: -64 },
};

/** Position a label in its side column and draw an elbow from the anchor to it. */
function place(host: HTMLElement, key: Key, top: number, bottom: number) {
  const el = host.querySelector<HTMLElement>(`[data-label="${key}"]`);
  const wire = host.querySelector<SVGGElement>(`[data-wire="${key}"]`);
  if (!el || !wire) return;
  const a = anchors[key];
  const { side, dy } = LAYOUT[key];
  const lw = el.offsetWidth;
  const lh = el.offsetHeight;
  const lx = side === "right" ? anchors.w - PAD - lw : PAD;
  const cy = clamp(a.y + dy, top + lh / 2, bottom - lh / 2);
  el.style.transform = `translate3d(${lx}px, ${cy - lh / 2}px, 0)`;

  const edge = side === "right" ? lx : lx + lw;
  const inside = side === "right" ? a.x > edge - 10 : a.x < edge + 10;
  let d: string;
  if (inside) {
    // anchor sits under/over the label column: drop a straight pin to it
    const yEdge = a.y > cy ? cy + lh / 2 : cy - lh / 2;
    d = `M${a.x},${a.y} L${a.x},${yEdge}`;
  } else {
    const elbow = edge + (side === "right" ? -18 : 18);
    d = `M${a.x},${a.y} L${elbow},${cy} L${edge},${cy}`;
  }
  wire.querySelector("path")?.setAttribute("d", d);
  for (const c of wire.querySelectorAll("circle")) {
    c.setAttribute("cx", `${a.x}`);
    c.setAttribute("cy", `${a.y}`);
  }
}

type Props = { intro: boolean; qin: number; qout: number; onOpen: (r: "diet" | "workout") => void };

/** HUD callouts: dot on the body, elbow line, label in a stable side column (easy to tap while the body turns). */
export default function Callouts({ intro, qin, qout, onOpen }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribe(() => {
        const host = root.current;
        if (!host || !anchors.ready) return;
        const top = 64;
        const bottom = anchors.h - 150;
        place(host, "mind", top, bottom);
        place(host, "qin", top, bottom);
        place(host, "qout", top, bottom);
        host.dataset.ready = "1";
      }),
    [],
  );

  const d = (n: number) => ({ ["--d" as string]: `${intro ? n : 0.05}s` });

  return (
    <div ref={root} className={s.callouts}>
      <svg className={s.svg} aria-hidden>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g data-wire="mind" className={`${s.wire} ${s.off}`} style={d(1.7)}>
          <path pathLength={1} />
          <circle r={7} className={s.halo} />
          <circle r={3} />
        </g>
        <g data-wire="qin" className={s.wire} style={{ ...d(1.95), ["--c" as string]: "var(--in)" }}>
          <path pathLength={1} filter="url(#glow)" />
          <circle r={8} className={s.halo} />
          <circle r={3.5} filter="url(#glow)" />
        </g>
        <g data-wire="qout" className={s.wire} style={{ ...d(2.2), ["--c" as string]: "var(--out)" }}>
          <path pathLength={1} filter="url(#glow)" />
          <circle r={8} className={s.halo} />
          <circle r={3.5} filter="url(#glow)" />
        </g>
      </svg>

      <div data-label="mind" className={`${s.label} ${s.labelOff}`} style={d(1.9)} aria-disabled="true">
        <div className={s.labelKey}>Mind</div>
        <div className={s.labelVal}>—</div>
      </div>

      <button
        data-label="qin"
        className={s.label}
        style={{ ...d(2.15), ["--c" as string]: "var(--in)" }}
        onClick={() => onOpen("diet")}
      >
        <div className={s.labelKey}>
          Q<sub>in</sub>
          <span className={s.labelHint}>intake</span>
        </div>
        <div className={s.labelVal}>
          {fmtInt(qin)}
          <small>kcal</small>
        </div>
      </button>

      <button
        data-label="qout"
        className={s.label}
        style={{ ...d(2.4), ["--c" as string]: "var(--out)" }}
        onClick={() => onOpen("workout")}
      >
        <div className={s.labelKey}>
          Q<sub>out</sub>
          <span className={s.labelHint}>output</span>
        </div>
        <div className={s.labelVal}>
          <span className={s.approx}>≈</span>
          {fmtInt(qout)}
          <small>kcal</small>
        </div>
      </button>
    </div>
  );
}

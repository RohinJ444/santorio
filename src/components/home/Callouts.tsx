"use client";

import { Brain, Dumbbell, Utensils } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Lock } from "../ui/icons";
import { anchors, subscribe } from "../stage/anchors";
import s from "./home.module.css";

type Side = "left" | "right";
type Key = "mind" | "qin" | "qout";

// No thousands separator: in mono the comma takes a full-width cell and opens a gap.
const kcal = (n: number | null) => n === null ? "—" : String(Math.round(n));

const PAD = 22; // inset of the callout columns from the screen edges
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

// label side and vertical offset from its anchor
const LAYOUT: Record<Key, { side: Side; dy: number; inset?: number }> = {
  mind: { side: "right", dy: 40, inset: 54 }, // by the shoulder line, in from the edge, clear of the greeting name
  qin: { side: "left", dy: 26 },
  qout: { side: "right", dy: -6 },
};

/** Position a label in its side column and draw an elbow from the anchor to it. */
function place(host: HTMLElement, key: Key, top: number, bottom: number) {
  const el = host.querySelector<HTMLElement>(`[data-label="${key}"]`);
  const wire = host.querySelector<SVGGElement>(`[data-wire="${key}"]`);
  if (!el || !wire) return;
  const a = anchors[key];
  const { side, dy, inset = PAD } = LAYOUT[key];
  const lw = el.offsetWidth;
  const lh = el.offsetHeight;
  const lx = side === "right" ? anchors.w - inset - lw : inset;
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

// Each callout alternates an icon (shown first on load) with its data: 8 s each, a quick ripple top to bottom.
const FLIP_STAGGER = 0.25;
const ICON = { size: 30, strokeWidth: 1.5 };

/** Data and icon stacked in the same box (the data sets the size, so nothing jumps). */
function Flip({ icon, delay, children }: { icon: ReactNode; delay: number; children: ReactNode }) {
  const style = { ["--fd" as string]: `${delay}s` };
  return (
    <>
      <div className={s.flipData} style={style}>
        {children}
      </div>
      <div className={s.flipIcon} style={style} aria-hidden>
        {icon}
      </div>
    </>
  );
}

type Props = { intro: boolean; qin: number | null; qout: number | null; qoutLabel?: string; qinEstimated?: boolean; onOpen: (r: "diet" | "workout") => void };

/** HUD callouts: dot on the body, elbow line, label in a stable side column (easy to tap while the body turns). */
export default function Callouts({ intro, qin, qout, qoutLabel = "TDEE est.", qinEstimated = false, onOpen }: Props) {
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
  const flip = (i: number) => (intro ? 2 : 0) + i * FLIP_STAGGER; // after the intro, then a ripple

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
        <g data-wire="mind" className={`${s.wire} ${s.locked}`} style={d(1.7)}>
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

      <div data-label="mind" className={`${s.label} ${s.labelLocked}`} style={d(1.9)} aria-label="Mind (locked)">
        <Flip icon={<Brain {...ICON} />} delay={flip(0)}>
          <div className={s.labelKey}>Mind</div>
          <div className={s.labelVal}>
            <Lock size={14} />
          </div>
        </Flip>
      </div>

      <button
        data-label="qin"
        className={s.label}
        style={{ ...d(2.15), ["--c" as string]: "var(--in)" }}
        onClick={() => onOpen("diet")}
      >
        <Flip icon={<Utensils {...ICON} />} delay={flip(1)}>
          <div className={s.labelKey}>
            Q<sub>in</sub>
            <span className={s.labelHint}>intake</span>
          </div>
          <div className={s.labelVal}>
            {qinEstimated && qin !== null ? <span className={s.approx}>≈</span> : null}
            {kcal(qin)}
            <small>kcal</small>
          </div>
        </Flip>
      </button>

      <button
        data-label="qout"
        className={s.label}
        style={{ ...d(2.4), ["--c" as string]: "var(--out)" }}
        onClick={() => onOpen("workout")}
      >
        <Flip icon={<Dumbbell {...ICON} />} delay={flip(2)}>
          <div className={s.labelKey}>
            Q<sub>out</sub>
            <span className={s.labelHint}>{qoutLabel}</span>
          </div>
          <div className={s.labelVal}>
            {qout !== null ? <span className={s.approx}>≈</span> : null}
            {kcal(qout)}
            <small>kcal</small>
          </div>
        </Flip>
      </button>
    </div>
  );
}

"use client";

import { useRef, type PointerEvent } from "react";
import * as THREE from "three";
import { anchors, rig, type Part } from "./anchors";

/**
 * Pointer handlers for a DOM layer sitting over the canvas: horizontal drags
 * spin the body (vertical pans stay native scrolling via touch-action: pan-y),
 * and a still tap is raycast into the scene to find the part under it.
 */
export function useBodyGestures(onTap: (part: Part) => void) {
  const d = useRef<{ x0: number; y0: number; lastX: number; lastT: number; moved: boolean } | null>(null);

  const end = () => {
    d.current = null;
    rig.dragging = false;
  };

  return {
    onPointerDown: (e: PointerEvent) => {
      d.current = { x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastT: performance.now(), moved: false };
    },
    onPointerMove: (e: PointerEvent) => {
      const s = d.current;
      if (!s) return;
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      if (Math.hypot(dx, dy) > 8) s.moved = true;
      if (!rig.dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) rig.dragging = true;
      if (!rig.dragging) return;
      const now = performance.now();
      const turn = (e.clientX - s.lastX) * 0.009;
      rig.dragDelta += turn;
      rig.velocity = THREE.MathUtils.clamp(turn / Math.max((now - s.lastT) / 1000, 0.008), -5, 5);
      s.lastX = e.clientX;
      s.lastT = now;
    },
    onPointerUp: (e: PointerEvent) => {
      const s = d.current;
      end();
      if (!s || s.moved || !anchors.canvas || !anchors.pick) return;
      const r = anchors.canvas.getBoundingClientRect();
      const part = anchors.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (part) onTap(part);
    },
    onPointerCancel: end,
  };
}

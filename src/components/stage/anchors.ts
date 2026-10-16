/**
 * Bridge between the 3D scene and the DOM overlay. The scene writes projected
 * screen positions every frame; the callouts read them and move SVG/DOM
 * directly through refs (no React re-render per frame).
 */
type Pt = { x: number; y: number };

export const anchors = {
  w: 0,
  h: 0,
  mind: { x: 0, y: 0 } as Pt,
  qin: { x: 0, y: 0 } as Pt,
  qout: { x: 0, y: 0 } as Pt,
  ready: false,
};

const listeners = new Set<() => void>();

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emit() {
  for (const fn of listeners) fn();
}

/** Drag-to-spin state, written by pointer handlers and read by the body each frame. */
export const rig = { dragging: false, dragDelta: 0, velocity: 0 };

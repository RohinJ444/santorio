/**
 * Bridge between the 3D scene and the DOM overlay. The scene writes projected
 * screen positions every frame; the callouts read them and move SVG/DOM
 * directly through refs (no React re-render per frame).
 */
type Pt = { x: number; y: number };
export type Part = "body" | "gut" | "brain";

export const anchors = {
  w: 0,
  h: 0,
  mind: { x: 0, y: 0 } as Pt,
  qin: { x: 0, y: 0 } as Pt,
  qout: { x: 0, y: 0 } as Pt,
  ready: false,
  /** Raycast the body at normalized device coords (set by the scene). */
  pick: null as null | ((ndcX: number, ndcY: number) => Part | null),
  canvas: null as HTMLCanvasElement | null,
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
type Shot = { pos: [number, number, number]; look: [number, number, number] };
export const rig = {
  dragging: false,
  dragDelta: 0,
  velocity: 0,
  lock: null as number | null,
  shot: null as Shot | null,
  jumpRequested: false,
  jumpScrub: null as number | null, // dev: freeze the jump at this many seconds in
};

// Dev only, for reviewing the figure from the console:
//   __rig.lock = -Math.PI / 2   freeze the turntable (radians; this angle faces the camera)
//   __rig.shot = { pos: [x, y, z], look: [x, y, z] }   override the camera (world space)
//   __rig.jumpScrub = 0.45                             hold the tap-to-jump at a moment (seconds)
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __rig: typeof rig }).__rig = rig;
}

"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef, type PointerEvent } from "react";
import * as THREE from "three";
import type { Route } from "../routes";
import { rig } from "./anchors";
import Body, { type Part } from "./Body";

type Shot = { pos: [number, number, number]; look: [number, number, number] };

// Camera per route. Leaving home pushes into the body region that owns the view.
const SHOTS: Record<Route, Shot> = {
  home: { pos: [0, 1.05, 6.1], look: [0, 0.86, 0] },
  workout: { pos: [0.15, 1.3, 2.3], look: [0, 1.18, 0] },
  diet: { pos: [0.05, 1.08, 1.05], look: [0, 1.06, 0] },
  settings: { pos: [0, 1.5, 9.5], look: [0, 1.2, 0] },
};

function CameraRig({ route }: { route: Route }) {
  const { camera, invalidate, size } = useThree();
  const look = useRef(new THREE.Vector3(...SHOTS[route].look));
  const goal = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() }), []);

  useFrame((_, dt) => {
    const shot = rig.shot ?? SHOTS[route];
    goal.pos.set(...shot.pos);
    goal.look.set(...shot.look);
    // narrow phones need a little more distance to fit the whole figure plus the HUD
    if (route === "home") {
      const aspect = size.width / size.height;
      goal.pos.z *= aspect < 0.5 ? 1.06 : 1;
    }
    const k = 1 - Math.exp(-dt * 2.4);
    camera.position.lerp(goal.pos, k);
    look.current.lerp(goal.look, k);
    camera.lookAt(look.current);
    if (camera.position.distanceTo(goal.pos) > 0.002 || look.current.distanceTo(goal.look) > 0.002) invalidate();
  });
  return null;
}

type Props = { route: Route; intro: boolean; onTap: (part: Part) => void };

export default function Stage({ route, intro, onTap }: Props) {
  const drag = useRef<{ startX: number; lastX: number; lastT: number } | null>(null);

  const onDown = (e: PointerEvent) => {
    if (route !== "home") return;
    drag.current = { startX: e.clientX, lastX: e.clientX, lastT: performance.now() };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!rig.dragging && Math.abs(e.clientX - d.startX) > 6) rig.dragging = true;
    if (!rig.dragging) return;
    const now = performance.now();
    const turn = (e.clientX - d.lastX) * 0.009;
    rig.dragDelta += turn;
    rig.velocity = THREE.MathUtils.clamp(turn / Math.max((now - d.lastT) / 1000, 0.008), -5, 5);
    d.lastX = e.clientX;
    d.lastT = now;
  };
  const onUp = () => {
    drag.current = null;
    rig.dragging = false;
  };

  return (
    <div
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 30, near: 0.05, far: 60, position: SHOTS[route].pos }}
        frameloop={route === "home" ? "always" : "demand"}
      >
        <Suspense fallback={null}>
          <Body route={route} intro={intro} onTap={onTap} />
        </Suspense>
        <CameraRig route={route} />
      </Canvas>
    </div>
  );
}

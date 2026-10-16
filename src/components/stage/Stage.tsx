"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import type { StageRoute } from "../routes";
import { rig } from "./anchors";
import Body from "./Body";

type Shot = { pos: [number, number, number]; look: [number, number, number] };

// Camera per route. Leaving home pushes into the body region that owns the view.
const SHOTS: Record<StageRoute, Shot> = {
  // first run: so close to the chest and shoulder that the mesh reads as pattern, not person
  onboarding: { pos: [0.22, 1.31, 0.74], look: [0.02, 1.3, 0] },
  home: { pos: [0, 1.11, 6.1], look: [0, 0.92, 0] },
  workout: { pos: [0.15, 1.3, 2.3], look: [0, 1.18, 0] },
  diet: { pos: [0.05, 1.08, 1.05], look: [0, 1.06, 0] },
  settings: { pos: [0, 1.5, 9.5], look: [0, 1.2, 0] },
};

function CameraRig({ route }: { route: StageRoute }) {
  const { camera, invalidate, size } = useThree();
  const look = useRef(new THREE.Vector3(...SHOTS[route].look));
  const goal = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() }), []);
  // Leaving onboarding is a slow pull-back that reveals the whole body; other moves stay brisk.
  const from = useRef(route);
  const rate = useRef(2.4);

  useFrame((state, dt) => {
    if (from.current !== route) {
      if (from.current === "onboarding") rate.current = 0.7;
      from.current = route;
    }
    const shot = rig.shot ?? SHOTS[route];
    goal.pos.set(...shot.pos);
    goal.look.set(...shot.look);
    if (route === "onboarding") {
      // a slow drift so the close-up feels alive
      const t = state.clock.elapsedTime;
      goal.pos.x += Math.sin(t * 0.13) * 0.09;
      goal.pos.y += Math.sin(t * 0.09) * 0.05;
    }
    rate.current = Math.min(2.4, rate.current + dt * 0.35);
    // narrow phones need a little more distance to fit the whole figure plus the HUD
    if (route === "home") {
      const aspect = size.width / size.height;
      goal.pos.z *= aspect < 0.5 ? 1.06 : 1;
    }
    const k = 1 - Math.exp(-dt * rate.current);
    camera.position.lerp(goal.pos, k);
    look.current.lerp(goal.look, k);
    camera.lookAt(look.current);
    if (camera.position.distanceTo(goal.pos) > 0.002 || look.current.distanceTo(goal.look) > 0.002) invalidate();
  });
  return null;
}

type Props = { route: StageRoute; intro: boolean };

/** The 3D layer. Gestures (spin, tap) come from the DOM layer above it via ./gestures. */
export default function Stage({ route, intro }: Props) {
  return (
    // --home-scroll dims the body as the home screen scrolls to insights
    <div style={{ position: "absolute", inset: 0, opacity: "calc(1 - var(--home-scroll, 0) * 0.78)" }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 30, near: 0.05, far: 60, position: SHOTS[route].pos }}
        frameloop={route === "home" || route === "onboarding" ? "always" : "demand"}
      >
        <Suspense fallback={null}>
          <Body route={route} intro={intro} />
        </Suspense>
        <CameraRig route={route} />
      </Canvas>
    </div>
  );
}

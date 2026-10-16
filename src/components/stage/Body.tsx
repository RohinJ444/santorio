"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Route } from "../routes";
import { anchors, emit, rig, type Part } from "./anchors";
import { createGlowMaterial, createHologramMaterial, createOrganMaterial } from "./materials";
import { buildBrain, buildGut } from "./organs";
import { createPoser, JUMP } from "./pose";
import { subdivideSkinned } from "./subdivide";

/**
 * CC0 base mesh (orange-juice-games via github.com/BoQsc/Godot-3D-Male-Base-Mesh):
 * one continuous skinned body on a Rigify-style metarig. GLTFLoader strips "."
 * from node names, so "spine.005" is "spine005".
 */
const MODEL = "/models/body.glb";
const BONES = { hips: "spine", chest: "spine002", head: "spine005" };
const HEIGHT = 1.8;
const SMOOTH_LEVELS = 1;
const RING = 0.44;
const COLORS = { body: "#3fe0ff", gut: "#9dff6a", brain: "#a49be0" };
// Heading at load, as the viewer sees it: 0 faces the camera, negative turns toward
// the viewer's left. -45° spawns a three-quarter view turned to the figure's right.
const SPAWN_HEADING = -Math.PI / 4;
// organ placement relative to the skeleton (tuned by eye)
const BRAIN_UP = 0.5; // fraction of skull-base→crown
const BRAIN_SCALE = 0.6;
const GUT_T = 0.62; // hips → chest
const GUT_SCALE = 0.86; // this body is slimmer than the gut was modeled for

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

// Tap-to-jump timeline (seconds): crouch, launch, airborne, land, recover.
const JUMP_KEYS = {
  crouch: [[0, 0], [0.2, 0.55], [0.3, 0.02], [0.68, 0], [0.76, 0.42], [1.2, 0]],
  arms: [[0, 0], [0.2, 32], [0.32, -62], [0.62, -24], [0.76, 8], [1.2, 0]], // + back, − forward/up
} as const;
const AIR = { start: 0.29, end: 0.7, height: 0.2 };
const LEG = { thigh: 0.365, shin: 0.46 }; // meters at 1.8 m

function keyed(keys: readonly (readonly [number, number])[], t: number) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return keys[keys.length - 1][1];
}
const noRaycast = () => null;

type Props = { route: Route; intro: boolean };

export default function Body({ route, intro }: Props) {
  const gltf = useGLTF(MODEL);
  const spin = useRef<THREE.Group>(null!);
  const model = useRef<THREE.Group>(null!);
  const brain = useRef<THREE.Group>(null!);
  const gut = useRef<THREE.Group>(null!);
  const pedestal = useRef<THREE.Group>(null!);
  const start = useRef<number | null>(null);
  const jumpAt = useRef<number | null>(null);
  const { camera, size, gl } = useThree();
  const proxies = useRef<THREE.Object3D[]>([]);
  const pose = useMemo(() => createPoser(gltf.scene), [gltf.scene]);
  // spin needed to turn the rig's measured forward onto the spawn heading (camera looks down -z)
  const spawnAngle = useMemo(() => {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(pose.bodyFrame);
    return SPAWN_HEADING - Math.atan2(f.x, f.z);
  }, [pose]);

  const mats = useMemo(
    () => ({
      holo: createHologramMaterial(COLORS.body),
      gut: createOrganMaterial(COLORS.gut, 1, 38),
      brain: createOrganMaterial(COLORS.brain, 0.95, 60),
      glow: createGlowMaterial(COLORS.body),
    }),
    [],
  );
  const geos = useMemo(() => ({ brain: buildBrain(), gut: buildGut(), ticks: buildTicks() }), []);

  // Normalize the model to HEIGHT meters, feet on the floor, centered on the axis.
  const fit = useMemo(() => {
    const scene = gltf.scene;
    let body: THREE.SkinnedMesh | undefined;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh;
    });
    // The base mesh is low-poly; subdivide once so the silhouette reads as fluid, not faceted.
    if (body && !body.userData.smoothed) {
      body.geometry = subdivideSkinned(body.geometry, SMOOTH_LEVELS);
      body.userData.smoothed = true;
    }
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if (body) box.setFromObject(body, true);
    box.applyMatrix4(scene.matrixWorld.clone().invert());
    const scale = HEIGHT / (box.max.y - box.min.y);
    const center = box.getCenter(new THREE.Vector3());
    const head = scene.getObjectByName(BONES.head);
    const headY = head ? head.getWorldPosition(new THREE.Vector3()).applyMatrix4(scene.matrixWorld.clone().invert()).y : box.max.y;
    return {
      scale,
      offset: new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale),
      headLen: (box.max.y - headY) * scale, // head bone (skull base) to crown, in meters
      bones: {
        head,
        hips: scene.getObjectByName(BONES.hips),
        chest: scene.getObjectByName(BONES.chest),
        shin: scene.getObjectByName("shinL"),
        foot: scene.getObjectByName("footL"),
      },
    };
  }, [gltf.scene]);

  useEffect(() => {
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!(m as THREE.SkinnedMesh).isSkinnedMesh) {
        m.visible = false; // the pack ships an axe and a pickaxe
        return;
      }
      m.material = mats.holo;
      m.frustumCulled = false;
      m.renderOrder = 2;
      m.raycast = noRaycast;
    });
  }, [gltf.scene, mats]);

  // Taps are picked here so the DOM layer above the canvas (scrolling home) can still hit the body.
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    anchors.canvas = gl.domElement;
    anchors.pick = (x, y) => {
      ray.setFromCamera(ndc.set(x, y), camera);
      const parts = ray.intersectObjects(proxies.current, false).map((h) => h.object.userData.part as Part);
      if (parts.includes("gut")) return "gut";
      if (parts.includes("brain")) return "brain";
      return parts.length ? "body" : null;
    };
    return () => {
      anchors.pick = null;
    };
  }, [camera, gl]);

  const tmp = useMemo(
    () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3() }),
    [],
  );
  const brainOffset = useMemo(() => new THREE.Vector3(0, 0, 0.008), []);
  // offsets in organ axes (+x left, +y up, +z forward)
  const gutOffset = useMemo(() => new THREE.Vector3(0, 0, 0.01), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (start.current === null) {
      start.current = t;
      spin.current.rotation.y = spawnAngle;
    }
    const since = t - start.current;
    const home = route === "home";

    // entrance: scan the body in from the floor, then organs, then the pedestal
    const reveal = intro ? ease(since / 2.4) * 1.08 : 1.08;
    const organIn = intro ? ease((since - 1.3) / 1.1) : 1;
    mats.holo.uniforms.uTime.value = t;
    mats.holo.uniforms.uReveal.value = reveal;
    mats.gut.uniforms.uTime.value = t;
    mats.brain.uniforms.uTime.value = t;
    mats.gut.uniforms.uOpacity.value = organIn;
    mats.brain.uniforms.uOpacity.value = organIn * 0.85;
    mats.glow.uniforms.uOpacity.value = intro ? ease(since / 1.2) : 1;
    const gutBoost = route === "diet" ? 1.7 : 1;
    mats.gut.uniforms.uBoost.value += (gutBoost - mats.gut.uniforms.uBoost.value) * Math.min(1, dt * 3);

    // spin: slow drift, drag to turn, inertia after release
    const g = spin.current;
    if (rig.lock !== null) {
      g.rotation.y = rig.lock;
    } else if (rig.dragging) {
      g.rotation.y += rig.dragDelta;
      rig.dragDelta = 0;
    } else {
      g.rotation.y += ((home ? 0.16 : 0.05) + rig.velocity) * dt;
      rig.velocity *= Math.exp(-dt * 2.2);
    }
    // tap-to-jump
    if (rig.jumpRequested) {
      rig.jumpRequested = false;
      if (jumpAt.current === null) jumpAt.current = t;
    }
    let motion: { crouch: number; arms: number } | undefined;
    g.position.y = 0;
    if (rig.jumpScrub !== null && jumpAt.current === null) jumpAt.current = t;
    if (jumpAt.current !== null) {
      const j = rig.jumpScrub ?? t - jumpAt.current;
      if (j > JUMP_KEYS.crouch[JUMP_KEYS.crouch.length - 1][0]) {
        jumpAt.current = null;
      } else {
        const crouch = keyed(JUMP_KEYS.crouch, j);
        motion = { crouch, arms: keyed(JUMP_KEYS.arms, j) };
        // bent legs are shorter: drop the body by exactly that so the feet stay planted
        const a = crouch * JUMP.thigh * (Math.PI / 180);
        const s = crouch * (JUMP.shin - JUMP.thigh) * (Math.PI / 180);
        const drop = LEG.thigh * (1 - Math.cos(a)) + LEG.shin * (1 - Math.cos(s));
        const air = j > AIR.start && j < AIR.end ? AIR.height * Math.sin((Math.PI * (j - AIR.start)) / (AIR.end - AIR.start)) : 0;
        g.position.y = air - drop;
      }
    }
    g.updateMatrixWorld();
    pose.update(t, motion);
    mats.holo.uniforms.uInvRoot.value.copy(g.matrixWorld).invert();
    pedestal.current.rotation.y = -t * 0.12;

    // organs ride the skeleton
    const { head, hips, chest } = fit.bones;
    if (head) {
      head.getWorldPosition(tmp.p);
      g.worldToLocal(tmp.p);
      tmp.p.y += fit.headLen * BRAIN_UP;
      brain.current.position.copy(tmp.p).add(tmp.q.copy(brainOffset).applyQuaternion(pose.bodyFrame));
      brain.current.scale.setScalar(fit.headLen * BRAIN_SCALE);
    }
    if (hips && chest) {
      hips.getWorldPosition(tmp.a);
      chest.getWorldPosition(tmp.b);
      tmp.p.lerpVectors(tmp.a, tmp.b, GUT_T);
      g.worldToLocal(tmp.p);
      gut.current.position.copy(tmp.p).add(tmp.q.copy(gutOffset).applyQuaternion(pose.bodyFrame));
      gut.current.scale.setScalar(GUT_SCALE);
    }

    if (!home) return;

    // project anchor points for the DOM callouts
    const project = (v: THREE.Vector3, out: { x: number; y: number }) => {
      tmp.q.copy(v).project(camera);
      out.x = ((tmp.q.x + 1) / 2) * size.width;
      out.y = ((1 - tmp.q.y) / 2) * size.height;
    };
    brain.current.getWorldPosition(tmp.p);
    project(tmp.p, anchors.mind);
    gut.current.getWorldPosition(tmp.p);
    tmp.p.y += 0.06;
    project(tmp.p, anchors.qin);
    // Q_out: just below the left knee, on the front of the shin
    const { shin, foot } = fit.bones;
    if (shin && foot) {
      shin.getWorldPosition(tmp.a);
      foot.getWorldPosition(tmp.b);
      tmp.p.lerpVectors(tmp.a, tmp.b, 0.1);
      tmp.b.set(0, 0, 1).applyQuaternion(pose.bodyFrame).applyQuaternion(g.quaternion);
      tmp.p.addScaledVector(tmp.b, 0.05);
      project(tmp.p, anchors.qout);
    }
    anchors.w = size.width;
    anchors.h = size.height;
    anchors.ready = true;
    emit();
  });

  return (
    <>
      <group ref={spin}>
        <group ref={model} scale={fit.scale} position={fit.offset}>
          <primitive object={gltf.scene} dispose={null} />
        </group>
        <group ref={brain} quaternion={pose.bodyFrame}>
          <mesh geometry={geos.brain} material={mats.brain} renderOrder={1} raycast={noRaycast} />
          <mesh userData={{ part: "brain" }} ref={(m) => void (m && (proxies.current[0] = m))}>
            <sphereGeometry args={[0.6, 12, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        </group>
        <group ref={gut} quaternion={pose.bodyFrame}>
          <mesh geometry={geos.gut} material={mats.gut} renderOrder={1} raycast={noRaycast} />
          <mesh userData={{ part: "gut" }} position={[0, -0.02, 0.03]} ref={(m) => void (m && (proxies.current[1] = m))}>
            <sphereGeometry args={[0.14, 12, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        </group>
        <mesh userData={{ part: "body" }} position={[0, HEIGHT / 2, 0]} ref={(m) => void (m && (proxies.current[2] = m))}>
          <cylinderGeometry args={[0.27, 0.2, HEIGHT, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>

      <group ref={pedestal} position={[0, 0.002, 0]}>
        <mesh rotation-x={-Math.PI / 2} material={mats.glow} raycast={noRaycast}>
          <planeGeometry args={[1.5, 1.5]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <ringGeometry args={[RING - 0.004, RING, 160]} />
          <meshBasicMaterial color={COLORS.body} transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <ringGeometry args={[RING + 0.05, RING + 0.056, 160, 1, 0.3, 2.2]} />
          <meshBasicMaterial color={COLORS.body} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <ringGeometry args={[RING + 0.05, RING + 0.056, 160, 1, 3.4, 1.4]} />
          <meshBasicMaterial color={COLORS.body} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <lineSegments geometry={geos.ticks} raycast={noRaycast}>
          <lineBasicMaterial color={COLORS.body} transparent opacity={0.45} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
      </group>
    </>
  );
}

function buildTicks() {
  const pts: number[] = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const long = i % 8 === 0;
    const r0 = RING + 0.012;
    const r1 = RING + (long ? 0.04 : 0.024);
    pts.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

useGLTF.preload(MODEL);

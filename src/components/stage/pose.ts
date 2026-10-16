/**
 * Procedural build and idle pose for the base mesh.
 *
 * Build (once): arm joints moved outward for slightly broader shoulders.
 *
 * Pose (every frame, from the rig's rest pose). Rather than hand-setting joint
 * angles, the posture measures itself and corrects toward targets:
 *   - Plumb line (side view): ankle → hip → neck → head stack near vertical,
 *     with a shallow S-curve in the spine. No arched back.
 *   - Soft joints: knees, elbows and spine never fully locked.
 *   - No twinning: left and right differ slightly (weight on one leg, different
 *     elbow bends, arm angles and finger curls).
 *   - Relaxed hands: palms toward the thighs, fingers curled progressively
 *     (pinky most, mostly at the first two joints), index floating a little.
 *   - Life: breathing, a slow weight shift, unhurried head, tiny finger drift.
 *
 * Body axes are measured from the skeleton: F (forward, from the toes), S (side,
 * right arm → left arm), U (up). `h` folds in the frame's handedness so signs
 * hold whichever way the rig faces. Sign guide: about F, +h raises the body's
 * left side and swings a hanging left limb outward; about S, +h swings a
 * hanging limb backward and tips an upright one forward.
 */
import * as THREE from "three";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// ---- build (model units; the rig is ~1.95 tall) ----
const SHOULDER_WIDEN = 0.042;

// ---- targets, degrees ----
const STANCE = { spread: 5.4, toeOut: 7 }; // spread: thigh abduction; feet ~0.31 apart in model units
// forward lean of each segment from vertical, side view
const PLUMB = { legs: 1.5, torso: 1, neck: 10, head: 0 };
// gentle S-curve before alignment: lumbar extends a touch, upper back rounds a touch
const CURVE = { lumbar: 0.5, thoracic: 2.5 };
const PELVIS_TUCK = 3.5; // posterior tilt: takes the sway out of the lower back
const SHOULDERS = { down: 4.5, roll: 1.5 }; // dropped and slightly rounded, never pinned back
const ARMS = {
  // elbow = forearm's forward angle from vertical (side view), measured, not added
  L: { out: 6.5, fwd: 3, elbow: 10, twist: 0 },
  R: { out: 8, fwd: 1.5, elbow: 13, twist: 0 },
};
// curl per joint [base, middle, tip]: more toward the pinky, little at the tip
const CURL: Record<"index" | "middle" | "ring" | "pinky", [number, number, number]> = {
  index: [5, 9, 4],
  middle: [9, 15, 6],
  ring: [13, 19, 8],
  pinky: [17, 23, 10],
};
const THUMB: [number, number, number] = [4, 10, 9];
const CURL_AXIS = new THREE.Vector3(1, 0, 0); // local hinge axis of the finger bones
const CURL_SIGN = 1;

export function createPoser(scene: THREE.Object3D) {
  const get = (n: string) => scene.getObjectByName(n) ?? undefined;
  const side = (s: "L" | "R") => ({
    shoulder: get(`shoulder${s}`),
    arm: get(`upper_arm${s}`),
    fore: get(`forearm${s}`),
    hand: get(`hand${s}`),
    thigh: get(`thigh${s}`),
    shin: get(`shin${s}`),
    foot: get(`foot${s}`),
    fingers: (["index", "middle", "ring", "pinky"] as const).map((f) => ({
      name: f,
      bones: [1, 2, 3].map((i) => get(`f_${f}0${i}${s}`)),
    })),
    thumb: [1, 2, 3].map((i) => get(`thumb0${i}${s}`)),
  });
  const b = {
    hips: get("spine"),
    spine1: get("spine001"),
    spine2: get("spine002"),
    chest: get("spine003"),
    neck: get("spine004"),
    head: get("spine005"),
    L: side("L"),
    R: side("R"),
  };
  const bones: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o);
  });

  // The rig's own bind pose is captured once and never written again, so
  // re-running this (hot reload, remount) rebuilds from scratch instead of compounding.
  for (const o of bones) {
    if (!o.userData.rest) o.userData.rest = o.quaternion.clone();
    if (!o.userData.bindPos) o.userData.bindPos = o.position.clone();
    o.userData.restPos = (o.userData.bindPos as THREE.Vector3).clone();
    o.quaternion.copy(o.userData.rest as THREE.Quaternion);
    o.position.copy(o.userData.restPos as THREE.Vector3);
  }

  // Body frame, measured once in the scene's own space.
  scene.updateMatrixWorld(true);
  const toScene = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const at = (o?: THREE.Object3D, out = new THREE.Vector3()) =>
    o ? o.getWorldPosition(out).applyMatrix4(toScene) : out.set(0, 0, 0);
  const U = new THREE.Vector3(0, 1, 0);
  const F = at(get("toeL")).sub(at(get("footL"))).setY(0).normalize();
  const S = at(b.L.arm).sub(at(b.R.arm)).setY(0);
  S.addScaledVector(F, -S.dot(F)).normalize();
  const h = Math.sign(new THREE.Vector3().crossVectors(S, U).dot(F)) || 1;

  /** A scene-space direction expressed in a bone's parent space (for moving joints). */
  const inParent = (bone: THREE.Object3D, dir: THREE.Vector3) => {
    const m = new THREE.Matrix4().multiplyMatrices(toScene, bone.parent!.matrixWorld);
    return dir.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(m).invert());
  };

  // Build: broader shoulders. Moving the arm joints drags the arm-weighted skin with them.
  for (const [bone, sign] of [
    [b.L.arm, 1],
    [b.R.arm, -1],
  ] as const) {
    if (!bone?.parent) continue;
    bone.userData.restPos = (bone.userData.bindPos as THREE.Vector3)
      .clone()
      .add(inParent(bone, S.clone().multiplyScalar(sign * SHOULDER_WIDEN)));
    bone.position.copy(bone.userData.restPos as THREE.Vector3);
  }
  const hipShift = b.hips?.parent ? inParent(b.hips, S) : new THREE.Vector3();

  /** Rotation taking organ-model axes (+x left, +y up, +z forward) onto this rig's body axes. */
  const bodyFrame = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(h > 0 ? S : S.clone().negate(), U, F),
  );

  // ---- per-frame helpers ----
  const qs = new THREE.Quaternion();
  const qsInv = new THREE.Quaternion();
  const qp = new THREE.Quaternion();
  const qr = new THREE.Quaternion();
  const qd = new THREE.Quaternion();
  const ql = new THREE.Quaternion();
  const ax = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const p4 = new THREE.Vector3();
  const v = new THREE.Vector3();

  /** Rotate a bone about a scene-space axis, applied in world space on top of its current pose. */
  const rot = (bone: THREE.Object3D | undefined, axis: THREE.Vector3, angle: number) => {
    if (!bone?.parent || !angle) return;
    bone.parent.getWorldQuaternion(qp);
    ax.copy(axis).applyQuaternion(qs);
    qr.setFromAxisAngle(ax, angle);
    qd.copy(qp).invert().multiply(qr).multiply(qp);
    bone.quaternion.premultiply(qd);
  };
  /** Rotate a bone about one of its own local axes. */
  const rotLocal = (bone: THREE.Object3D | undefined, axis: THREE.Vector3, angle: number) => {
    if (!bone || !angle) return;
    bone.quaternion.multiply(ql.setFromAxisAngle(axis, angle));
  };
  // side-view lean of a segment: + means its far end is ahead
  // corrections are measured each frame; cap them so a surprise can't fold a joint
  const cap = (a: number, max = 0.35) => Math.max(-max, Math.min(max, a));
  const leanUp = (d: THREE.Vector3) => Math.atan2(d.dot(F), d.dot(U));
  const leanDown = (d: THREE.Vector3) => Math.atan2(d.dot(F), -d.dot(U));
  const outward = (d: THREE.Vector3, sgn: number) => Math.atan2(sgn * d.dot(S), -d.dot(U));
  const boneAxis = (o: THREE.Object3D, out: THREE.Vector3) => {
    o.getWorldQuaternion(qr);
    return out.set(0, 1, 0).applyQuaternion(qr).applyQuaternion(qsInv);
  };

  const update = (t: number) => {
    for (const o of bones) o.quaternion.copy(o.userData.rest as THREE.Quaternion);
    scene.updateMatrixWorld();
    toScene.copy(scene.matrixWorld).invert();
    scene.getWorldQuaternion(qs);
    qsInv.copy(qs).invert();

    const wave = (period: number, phase = 0) => Math.sin((t * TAU) / period + phase);
    const breath = wave(5.2) * 0.8 + wave(2.6, 0.6) * 0.2;
    const sway = wave(14) * 0.75 + wave(6.1, 2) * 0.25; // + = weight onto the left leg
    const drift = wave(8.3, 0.8);
    const look = 0.65 * wave(17) + 0.35 * wave(6.7, 1.3);

    // ---- pelvis: light weight shift onto the left leg ----
    if (b.hips) {
      b.hips.position
        .copy(b.hips.userData.restPos as THREE.Vector3)
        .addScaledVector(hipShift, 0.006 + 0.008 * sway);
    }
    const tilt = (1.6 + 0.9 * sway) * DEG;
    rot(b.hips, F, h * tilt);
    rot(b.hips, S, -h * PELVIS_TUCK * DEG);

    // ---- legs: shoulder-width, turned out a little, knees soft (the unweighted one more) ----
    const spread = STANCE.spread * DEG;
    const knee = { L: 3 * DEG, R: (5 + 4 * Math.max(0, sway)) * DEG };
    for (const [L, s] of [
      [b.L, 1],
      [b.R, -1],
    ] as const) {
      const k = s > 0 ? knee.L : knee.R;
      rot(L.thigh, F, s * h * spread - h * tilt);
      rot(L.thigh, U, s * h * STANCE.toeOut * DEG);
      rot(L.thigh, S, -h * k * 0.5);
      rot(L.shin, S, h * k);
    }
    // plumb: hips just ahead of the ankles; swing both legs together, keep feet flat
    at(b.L.thigh, p1).add(at(b.R.thigh, p2)).multiplyScalar(0.5);
    at(b.L.foot, p3).add(at(b.R.foot, p4)).multiplyScalar(0.5);
    const legFix = cap(PLUMB.legs * DEG - leanUp(v.subVectors(p1, p3)));
    for (const L of [b.L, b.R]) rot(L.thigh, S, h * legFix);
    for (const [L, s] of [
      [b.L, 1],
      [b.R, -1],
    ] as const) {
      const k = s > 0 ? knee.L : knee.R;
      rot(L.foot, F, -s * h * spread);
      rot(L.foot, S, -h * (legFix + k * 0.5));
    }

    // ---- spine: shallow S-curve, then stack the chest over the pelvis ----
    rot(b.spine1, F, -h * tilt * 0.6);
    rot(b.chest, F, -h * tilt * 0.3);
    rot(b.spine1, S, h * CURVE.lumbar * DEG);
    rot(b.chest, S, h * CURVE.thoracic * DEG);
    at(b.L.thigh, p1).add(at(b.R.thigh, p2)).multiplyScalar(0.5);
    const torsoFix = cap(PLUMB.torso * DEG - leanUp(v.subVectors(at(b.neck, p3), p1)));
    rot(b.spine1, S, h * torsoFix * 0.45);
    rot(b.spine2, S, h * torsoFix * 0.35);
    rot(b.chest, S, h * torsoFix * 0.2);
    // breathing: the ribcage lifts a little
    rot(b.spine2, S, -h * 0.7 * breath * DEG);

    // ---- shoulders: dropped, slightly rounded, rising with the breath ----
    for (const [L, s] of [
      [b.L, 1],
      [b.R, -1],
    ] as const) {
      rot(L.shoulder, F, -s * h * (SHOULDERS.down - 1.1 * breath) * DEG);
      rot(L.shoulder, U, -s * h * SHOULDERS.roll * DEG);
    }

    // ---- neck & head: neck leans forward naturally, head level, gaze wanders ----
    const neckFix = cap(PLUMB.neck * DEG - leanUp(v.subVectors(at(b.head, p2), at(b.neck, p1))));
    rot(b.neck, S, h * neckFix);
    rot(b.neck, F, h * tilt * 0.35);
    if (b.head) {
      const headFix = cap(PLUMB.head * DEG - leanUp(boneAxis(b.head, v)));
      rot(b.head, S, h * (headFix + (1 + 1.2 * wave(11.3)) * DEG));
      rot(b.head, U, 10 * look * DEG);
      rot(b.head, F, (1.5 + 1 * wave(13.7, 2)) * DEG * h);
    }

    // ---- arms: hang by measured angle (out from the body, a touch forward), soft elbows ----
    for (const [L, s, A] of [
      [b.L, 1, ARMS.L],
      [b.R, -1, ARMS.R],
    ] as const) {
      if (!L.arm || !L.fore) continue;
      const swing = s * 0.8 * sway + 0.5 * breath;
      v.subVectors(at(L.fore, p2), at(L.arm, p1));
      rot(L.arm, F, s * h * cap((A.out + swing) * DEG - outward(v, s), 0.75)); // starts ~33° out (A-pose)
      v.subVectors(at(L.fore, p2), at(L.arm, p1));
      rot(L.arm, S, -h * cap((A.fwd + 0.8 * drift * s) * DEG - leanDown(v)));
      v.subVectors(at(L.hand, p2), at(L.fore, p1));
      rot(L.fore, S, -h * cap((A.elbow + 1.5 * drift * s) * DEG - leanDown(v)));
      if (L.hand && A.twist) {
        v.subVectors(at(L.hand, p2), at(L.fore, p1)).normalize();
        rot(L.fore, v, A.twist * DEG * s);
      }
      // wrist: a little flexed, fingers trailing
      rot(L.hand, S, h * 4 * DEG);
      // fingers: progressive curl, slightly different per hand, tiny drift
      L.fingers.forEach((f, i) => {
        const c = CURL[f.name];
        f.bones.forEach((bone, j) => {
          const extra = (s > 0 ? 0 : 3) + 1.5 * wave(3.7 + i * 0.6, i + j + (s > 0 ? 0 : 1.7));
          rotLocal(bone, CURL_AXIS, CURL_SIGN * (c[j] + (j < 2 ? extra : 0)) * DEG);
        });
      });
      L.thumb.forEach((bone, j) => rotLocal(bone, CURL_AXIS, CURL_SIGN * THUMB[j] * DEG));
    }
  };

  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    // Dev: bone directions in body axes (f = forward, s = toward the left side, u = up).
    const dir = (o?: THREE.Object3D) => {
      if (!o) return null;
      const d = boneAxis(o, new THREE.Vector3());
      const r = (n: number) => Math.round(n * 100) / 100;
      return { f: r(d.dot(F)), s: r(d.dot(S)), u: r(d.dot(U)) };
    };
    const localAxes = (o?: THREE.Object3D) => {
      if (!o) return null;
      o.getWorldQuaternion(qr);
      const r = (n: number) => Math.round(n * 100) / 100;
      return (["x", "y", "z"] as const).map((k) => {
        const d = new THREE.Vector3(k === "x" ? 1 : 0, k === "y" ? 1 : 0, k === "z" ? 1 : 0)
          .applyQuaternion(qr)
          .applyQuaternion(qsInv);
        return `${k}: f${r(d.dot(F))} s${r(d.dot(S))} u${r(d.dot(U))}`;
      });
    };
    const deg = (a: number) => Math.round((a / DEG) * 10) / 10;
    (window as unknown as Record<string, unknown>).__pose = () => ({
      lean: (() => {
        const hip = at(b.L.thigh).add(at(b.R.thigh)).multiplyScalar(0.5);
        const ankle = at(b.L.foot).add(at(b.R.foot)).multiplyScalar(0.5);
        const neck = at(b.neck);
        const head = at(b.head);
        const shoulder = at(b.L.arm).add(at(b.R.arm)).multiplyScalar(0.5);
        return {
          legs: deg(leanUp(hip.clone().sub(ankle))),
          torso: deg(leanUp(neck.clone().sub(hip))),
          neck: deg(leanUp(head.clone().sub(neck))),
          // plumb offsets along forward, in cm at 1.8 m scale (+ = ahead of the ankle)
          plumbCm: Object.fromEntries(
            Object.entries({ hip, shoulder, head }).map(([k, p]) => [k, Math.round((p.clone().sub(ankle).dot(F) / 1.945) * 180)]),
          ),
        };
      })(),
      foreL: dir(b.L.fore),
      armR: dir(b.R.arm),
      foreR: dir(b.R.fore),
      handR: dir(b.R.hand),
      handRaxes: localAxes(b.R.hand),
      indexR: b.R.fingers[0].bones.map(dir),
      indexR1axes: localAxes(b.R.fingers[0].bones[0]),
      thumbR: b.R.thumb.map(dir),
      head: dir(b.head),
    });
  }

  return { update, bodyFrame };
}

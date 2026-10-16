/**
 * Procedural build and idle pose for the base mesh.
 *
 * Build (once): arm joints moved outward for broader shoulders.
 * Pose (every frame, from rest): feet about shoulder-width apart and slightly
 * turned out, tall posture (chest up, shoulders down and back, long neck),
 * relaxed arms with soft elbows, a light weight shift between legs, breathing,
 * and an unhurried head.
 *
 * Rotations use body axes measured from the skeleton itself: F (forward, from
 * the toes), S (side, from the right arm to the left), U (up). `h` folds in the
 * handedness of that frame so the signs below hold whichever way the rig faces.
 * Sign guide: about F, +h raises the body's left side (and swings a hanging
 * left limb outward); about S, +h swings a hanging limb backward and tips an
 * upright one forward; about U, +h turns the front toward the left.
 */
import * as THREE from "three";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// ---- build (model units; the rig is ~1.95 tall) ----
const SHOULDER_WIDEN = 0.042; // each side: a little broader than the stock mesh, still normal proportions

// ---- stance & posture (degrees) ----
const ARM_DROP = 28.5; // down from the rig's A-pose; arms hang close, just clearing the hips
const LEG_SPREAD = 6.8; // thigh abduction: feet land about shoulder-width apart
const TOE_OUT = 7;
const CHEST_UP = 1.8;
const SHOULDERS_DOWN = 4.5; // dropped and loose, not shrugged or pinned back
const SHOULDERS_BACK = 1;

export function createPoser(scene: THREE.Object3D) {
  const get = (n: string) => scene.getObjectByName(n) ?? undefined;
  const b = {
    hips: get("spine"),
    spine1: get("spine001"),
    spine2: get("spine002"),
    chest: get("spine003"),
    neck: get("spine004"),
    head: get("spine005"),
    shoulderL: get("shoulderL"),
    shoulderR: get("shoulderR"),
    armL: get("upper_armL"),
    armR: get("upper_armR"),
    foreL: get("forearmL"),
    foreR: get("forearmR"),
    handL: get("handL"),
    handR: get("handR"),
    thighL: get("thighL"),
    thighR: get("thighR"),
    shinL: get("shinL"),
    shinR: get("shinR"),
    footL: get("footL"),
    footR: get("footR"),
  };
  const bones = Object.values(b).filter((o): o is THREE.Object3D => !!o);
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
  const local = (o?: THREE.Object3D) => (o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toScene) : new THREE.Vector3());
  const U = new THREE.Vector3(0, 1, 0);
  const F = local(get("toeL")).sub(local(get("footL"))).setY(0).normalize();
  const S = local(b.armL).sub(local(b.armR)).setY(0);
  S.addScaledVector(F, -S.dot(F)).normalize();
  const h = Math.sign(new THREE.Vector3().crossVectors(S, U).dot(F)) || 1;

  /** A scene-space direction expressed in a bone's parent space (for moving joints). */
  const inParent = (bone: THREE.Object3D, dir: THREE.Vector3) => {
    const m = new THREE.Matrix4().multiplyMatrices(toScene, bone.parent!.matrixWorld);
    return dir.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(m).invert());
  };

  // Build: broader shoulders. Moving the arm joints drags the arm-weighted skin with them.
  const widen = (bone: THREE.Object3D | undefined, sign: number) => {
    if (!bone?.parent) return;
    const d = inParent(bone, S.clone().multiplyScalar(sign * SHOULDER_WIDEN));
    bone.userData.restPos = (bone.userData.bindPos as THREE.Vector3).clone().add(d);
    bone.position.copy(bone.userData.restPos as THREE.Vector3);
  };
  widen(b.armL, 1);
  widen(b.armR, -1);
  // Weight shift moves the pelvis sideways; precompute that direction in the hips' parent space.
  const hipShift = b.hips?.parent ? inParent(b.hips, S) : new THREE.Vector3();

  const qs = new THREE.Quaternion();
  const qp = new THREE.Quaternion();
  const qr = new THREE.Quaternion();
  const qd = new THREE.Quaternion();
  const ax = new THREE.Vector3();

  /** Rotate a bone about a body axis, applied in world space on top of its current pose. */
  const rot = (bone: THREE.Object3D | undefined, axis: THREE.Vector3, angle: number) => {
    if (!bone?.parent || angle === 0) return;
    bone.parent.getWorldQuaternion(qp);
    ax.copy(axis).applyQuaternion(qs);
    qr.setFromAxisAngle(ax, angle);
    qd.copy(qp).invert().multiply(qr).multiply(qp);
    bone.quaternion.premultiply(qd);
  };

  /** Rotation taking organ-model axes (+x left, +y up, +z forward) onto this rig's body axes. */
  const bodyFrame = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(h > 0 ? S : S.clone().negate(), U, F),
  );

  const update = (t: number) => {
    for (const o of bones) o.quaternion.copy(o.userData.rest as THREE.Quaternion);
    scene.getWorldQuaternion(qs);

    // slow, layered motion: nothing loops on an obvious beat
    const breath = Math.sin((t * TAU) / 5.2) * 0.8 + Math.sin((t * TAU) / 5.2 * 2 + 0.6) * 0.2;
    const sway = Math.sin((t * TAU) / 14) * 0.75 + Math.sin((t * TAU) / 6.1 + 2) * 0.25;
    const drift = Math.sin((t * TAU) / 8.3 + 0.8);
    const look = 0.65 * Math.sin((t * TAU) / 17) + 0.35 * Math.sin((t * TAU) / 6.7 + 1.3);

    // weight: a light shift toward the left leg and back, pelvis follows
    if (b.hips) {
      b.hips.position
        .copy(b.hips.userData.restPos as THREE.Vector3)
        .addScaledVector(hipShift, 0.008 + 0.01 * sway);
    }
    const tilt = (1.4 + 1 * sway) * DEG;
    rot(b.hips, F, h * tilt);
    rot(b.spine1, F, -h * tilt * 0.6);
    rot(b.chest, F, -h * tilt * 0.35);

    // legs: shoulder-width stance, feet flat and a little turned out
    const spread = LEG_SPREAD * DEG;
    rot(b.thighL, F, h * spread - h * tilt);
    rot(b.thighR, F, -h * spread - h * tilt);
    rot(b.thighL, U, h * TOE_OUT * DEG);
    rot(b.thighR, U, -h * TOE_OUT * DEG);
    rot(b.footL, F, -h * spread);
    rot(b.footR, F, h * spread);
    // the unweighted leg softens as weight comes off it
    const soft = (2 + 4 * Math.max(0, sway)) * DEG;
    rot(b.thighR, S, -h * soft * 0.5);
    rot(b.shinR, S, h * soft);
    rot(b.thighL, S, -h * 1 * DEG);
    rot(b.shinL, S, h * 2 * DEG);

    // posture: chest up, long neck, shoulders down and back; breathing on top
    rot(b.spine2, S, -h * (CHEST_UP * 0.6 + 0.9 * breath) * DEG);
    rot(b.chest, S, -h * CHEST_UP * 0.4 * DEG);
    rot(b.shoulderL, F, -h * (SHOULDERS_DOWN - 1.2 * breath) * DEG);
    rot(b.shoulderR, F, h * (SHOULDERS_DOWN - 1.2 * breath) * DEG);
    rot(b.shoulderL, U, h * SHOULDERS_BACK * DEG);
    rot(b.shoulderR, U, -h * SHOULDERS_BACK * DEG);

    // arms: relaxed at the sides, a touch forward, soft elbows, drifting slightly with the weight shift
    const drop = ARM_DROP * DEG - 0.8 * breath * DEG;
    rot(b.armL, F, -h * (drop - 1.2 * sway * DEG));
    rot(b.armR, F, h * (drop + 1.2 * sway * DEG));
    rot(b.armL, S, -h * (3 + 1.2 * drift) * DEG);
    rot(b.armR, S, -h * (2.5 - 1.2 * drift) * DEG);
    rot(b.foreL, S, -h * (10 + 1.5 * drift) * DEG);
    rot(b.foreR, S, -h * (12 - 1.5 * drift) * DEG);
    rot(b.handL, F, h * 4 * DEG);
    rot(b.handR, F, -h * 4 * DEG);

    // head: long neck, chin level, unhurried look-around that levels against the hip tilt
    rot(b.neck, S, -h * 2.5 * DEG);
    rot(b.neck, F, h * tilt * 0.3);
    rot(b.head, U, 11 * look * DEG);
    rot(b.head, S, h * (1.5 + 1.5 * Math.sin((t * TAU) / 11.3)) * DEG);
  };

  return { update, bodyFrame };
}

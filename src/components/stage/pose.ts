/**
 * Procedural idle pose. The base mesh is rigged in a stiff A-pose; every frame
 * we reset the touched bones to rest and layer a relaxed stance on top:
 * arms hanging with soft elbows, weight on one leg (contrapposto), breathing,
 * a slow weight sway and an unhurried head that looks around.
 *
 * Rotations use body axes measured from the skeleton itself: F (forward, from
 * the toes), S (side, from the right arm to the left), U (up). `h` folds in the
 * handedness of that frame so the signs below hold whichever way the rig faces.
 */
import * as THREE from "three";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// How far to bring the arms down from the rig's A-pose.
const ARM_DROP = 33;

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
    shinR: get("shinR"),
  };
  const bones = Object.values(b).filter((o): o is THREE.Object3D => !!o);
  // Rest pose lives on the bone so hot reloads never compound offsets.
  for (const o of bones) if (!o.userData.rest) o.userData.rest = o.quaternion.clone();
  for (const o of bones) o.quaternion.copy(o.userData.rest as THREE.Quaternion);

  // Body frame, measured once in the scene's own space.
  scene.updateMatrixWorld(true);
  const local = (o?: THREE.Object3D) => (o ? scene.worldToLocal(o.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3());
  const U = new THREE.Vector3(0, 1, 0);
  const F = local(get("toeL")).sub(local(get("footL"))).setY(0).normalize();
  const S = local(b.armL).sub(local(b.armR)).setY(0);
  S.addScaledVector(F, -S.dot(F)).normalize();
  const h = Math.sign(new THREE.Vector3().crossVectors(S, U).dot(F)) || 1;

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

  // Sign guide (h folded in): about F, +h raises the body's left side;
  // about S, +h swings a hanging limb backward and tips the head forward.
  return function update(t: number) {
    for (const o of bones) o.quaternion.copy(o.userData.rest as THREE.Quaternion);
    scene.getWorldQuaternion(qs);

    const breath = Math.sin((t * TAU) / 4.6);
    const sway = Math.sin((t * TAU) / 11);
    const drift = Math.sin((t * TAU) / 7.3 + 0.8);
    const look = 0.7 * Math.sin((t * TAU) / 13) + 0.3 * Math.sin((t * TAU) / 5.3 + 1);

    // contrapposto: weight on the left leg, left hip up, torso counters
    const tilt = (3 + 1.1 * sway) * DEG;
    rot(b.hips, F, h * tilt);
    rot(b.spine1, F, -h * tilt * 0.55);
    rot(b.chest, F, -h * tilt * 0.4);
    rot(b.thighL, F, -h * tilt * 0.9);
    rot(b.thighR, F, -h * tilt * 0.5);
    // relaxed right leg: knee eased forward
    const knee = (10 + 2.5 * sway) * DEG;
    rot(b.thighR, S, -h * knee * 0.45);
    rot(b.shinR, S, h * knee);

    // breathing: chest opens, shoulders rise
    rot(b.spine2, S, -h * 1.1 * breath * DEG);
    rot(b.shoulderL, F, h * 1.4 * breath * DEG);
    rot(b.shoulderR, F, -h * 1.4 * breath * DEG);

    // arms: down from the A-pose, hanging a little forward, soft elbows
    const drop = ARM_DROP * DEG - 1.2 * breath * DEG;
    rot(b.armL, F, -h * drop);
    rot(b.armR, F, h * (drop - 1.5 * DEG));
    rot(b.armL, S, -h * (4 + 1.5 * drift) * DEG);
    rot(b.armR, S, -h * (3 - 1.5 * drift) * DEG);
    rot(b.foreL, S, -h * (13 + 2 * drift) * DEG);
    rot(b.foreR, S, -h * (16 - 2 * drift) * DEG);
    rot(b.handL, F, -h * 5 * DEG);
    rot(b.handR, F, h * 5 * DEG);

    // head: unhurried look-around, chin slightly down
    rot(b.neck, F, h * tilt * 0.25);
    rot(b.head, U, 10 * look * DEG);
    rot(b.head, S, h * (3 + 2 * Math.sin((t * TAU) / 9.7)) * DEG);
  };
}

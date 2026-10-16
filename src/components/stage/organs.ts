/**
 * Procedural organ geometry, so the only downloaded asset is the body.
 * Brain is built in "head units" (scaled to the head bone length at runtime);
 * gut is built in meters around the abdomen center. +x is the body's left,
 * +z is forward.
 */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ---------- noise ---------- */

function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = l(c(0, 0, 0), c(1, 0, 0), u);
  const x10 = l(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = l(c(0, 0, 1), c(1, 0, 1), u);
  const x11 = l(c(0, 1, 1), c(1, 1, 1), u);
  return l(l(x00, x10, v), l(x01, x11, v), w) * 2 - 1;
}

function clean(g: THREE.BufferGeometry) {
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  if (g.getAttribute("normal")) g.deleteAttribute("normal");
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
}

/* ---------- brain ---------- */

export function buildBrain() {
  const cortex = mergeVertices(
    (() => {
      const g = new THREE.IcosahedronGeometry(1, 22);
      g.deleteAttribute("uv");
      g.deleteAttribute("normal");
      return g;
    })(),
  );
  const pos = cortex.getAttribute("position") as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize();
    // folded ridges (gyri) from ridged noise, plus a little fine detail
    const n1 = 1 - Math.abs(noise3(p.x * 4.6 + 3.1, p.y * 4.6 + 1.7, p.z * 4.6));
    const n2 = 1 - Math.abs(noise3(p.x * 9.5 + 11, p.y * 9.5, p.z * 9.5 + 5));
    let r = 1 + 0.07 * n1 * n1 + 0.03 * n2 * n2;
    // longitudinal fissure between hemispheres
    const groove = Math.exp(-Math.pow(p.x / 0.085, 2)) * THREE.MathUtils.smoothstep(p.y, -0.3, 0.45);
    r *= 1 - 0.17 * groove;
    // flatter underside
    if (p.y < -0.2) r *= 1 - 0.4 * (-0.2 - p.y);
    pos.setXYZ(i, p.x * r * 0.36, p.y * r * 0.3, p.z * r * 0.46);
  }
  cortex.computeVertexNormals();

  const cere = clean(new THREE.SphereGeometry(1, 40, 24));
  const cp = cere.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) {
    p.fromBufferAttribute(cp, i);
    const r = 1 + 0.05 * Math.sin(p.y * 26);
    cp.setXYZ(i, p.x * r * 0.24, p.y * r * 0.13 - 0.2, p.z * r * 0.16 - 0.3);
  }
  cere.computeVertexNormals();

  const stem = clean(new THREE.CylinderGeometry(0.065, 0.05, 0.32, 16, 1, true));
  stem.rotateX(0.35);
  stem.translate(0, -0.33, -0.15);

  return mergeGeometries([cortex, cere, stem]) ?? cortex;
}

/* ---------- gut ---------- */

/** Tube along a curve with a radius that varies along its length. */
function variableTube(curve: THREE.Curve<THREE.Vector3>, segments: number, radial: number, radius: (t: number) => number) {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, P);
    const r = radius(t);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const s = Math.sin(a);
      const c = -Math.cos(a);
      N.set(c * n.x + s * b.x, c * n.y + s * b.y, c * n.z + s * b.z).normalize();
      positions.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      normals.push(N.x, N.y, N.z);
    }
  }
  for (let i = 1; i <= segments; i++) {
    for (let j = 1; j <= radial; j++) {
      const a = (radial + 1) * (i - 1) + (j - 1);
      const b = (radial + 1) * i + (j - 1);
      const c = (radial + 1) * i + j;
      const d = (radial + 1) * (i - 1) + j;
      indices.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const taper = (t: number, k = 0.06) => Math.min(1, t / k, (1 - t) / k);

export function buildGut() {
  const esophagus = variableTube(
    new THREE.CatmullRomCurve3([V(0, 0.4, -0.045), V(0.004, 0.28, -0.03), V(0.01, 0.16, -0.012)]),
    40,
    10,
    (t) => 0.0065 * Math.min(1, t / 0.15 + 0.3),
  );

  const stomach = variableTube(
    new THREE.CatmullRomCurve3([
      V(0.01, 0.165, -0.012),
      V(0.045, 0.145, 0.008),
      V(0.075, 0.112, 0.024),
      V(0.082, 0.072, 0.034),
      V(0.062, 0.04, 0.04),
      V(0.026, 0.03, 0.042),
      V(-0.01, 0.04, 0.036),
      V(-0.032, 0.056, 0.03),
    ]),
    80,
    18,
    (t) => 0.007 + 0.03 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.12)), 0.75),
  );

  const smallPts: THREE.Vector3[] = [V(-0.032, 0.056, 0.03), V(-0.056, 0.038, 0.022), V(-0.058, 0.006, 0.018)];
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y0 = -0.03 - r * 0.021;
    for (let k = 0; k <= 6; k++) {
      const kk = r % 2 === 0 ? k : 6 - k;
      const xx = -0.066 + (kk / 6) * 0.132;
      smallPts.push(V(xx, y0 + 0.006 * Math.sin(k * 2.3 + r), 0.026 + 0.017 * Math.sin(k * 1.9 + r * 1.3)));
    }
  }
  const small = variableTube(new THREE.CatmullRomCurve3(smallPts, false, "catmullrom", 0.4), 520, 10, (t) => 0.0082 * Math.min(1, taper(t, 0.01)));

  const colon = variableTube(
    new THREE.CatmullRomCurve3([
      V(-0.082, -0.155, 0.022),
      V(-0.09, -0.09, 0.026),
      V(-0.09, -0.025, 0.03),
      V(-0.076, 0.01, 0.04),
      V(-0.03, -0.002, 0.056),
      V(0.03, -0.002, 0.056),
      V(0.076, 0.01, 0.04),
      V(0.09, -0.025, 0.03),
      V(0.092, -0.09, 0.026),
      V(0.08, -0.155, 0.022),
      V(0.042, -0.182, 0.02),
      V(0.006, -0.19, 0.002),
      V(0, -0.225, -0.02),
    ]),
    360,
    14,
    (t) => 0.0135 * (1 + 0.16 * Math.sin(t * Math.PI * 2 * 30)) * Math.min(1, taper(t, 0.04) * 0.6 + 0.4),
  );

  return mergeGeometries([esophagus, stomach, small, colon]) ?? stomach;
}

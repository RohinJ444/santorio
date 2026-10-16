/**
 * Loop subdivision for a skinned, indexed triangle mesh. Each level splits every
 * triangle in four and relaxes positions toward a smooth limit surface; skin
 * weights on new edge vertices blend their endpoints (top 4 influences kept).
 * Used to turn the low-poly base mesh into a fluid silhouette at load time.
 */
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Skin = { idx: number[]; w: number[] };

function blendSkin(parts: [Skin, number][]): Skin {
  const acc = new Map<number, number>();
  for (const [s, k] of parts) {
    for (let i = 0; i < 4; i++) if (s.w[i] > 0) acc.set(s.idx[i], (acc.get(s.idx[i]) ?? 0) + s.w[i] * k);
  }
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((a, [, w]) => a + w, 0) || 1;
  const idx = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  top.forEach(([bone, weight], i) => {
    idx[i] = bone;
    w[i] = weight / sum;
  });
  return { idx, w };
}

function loopOnce(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const si = g.getAttribute("skinIndex") as THREE.BufferAttribute;
  const sw = g.getAttribute("skinWeight") as THREE.BufferAttribute;
  const index = g.getIndex()!;
  const nv = pos.count;
  const tris = index.count / 3;

  const P = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i);
  const S = (i: number): Skin => ({
    idx: [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)],
    w: [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)],
  });

  // edges → opposite vertices
  const edges = new Map<number, { a: number; b: number; opp: number[]; mid: number }>();
  const key = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  const neighbors: Set<number>[] = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < tris; t++) {
    const v = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      const c = v[(e + 2) % 3];
      const k = key(a, b);
      const edge = edges.get(k) ?? { a, b, opp: [], mid: -1 };
      edge.opp.push(c);
      edges.set(k, edge);
      neighbors[a].add(b);
      neighbors[b].add(a);
    }
  }
  const boundary = new Uint8Array(nv);
  for (const e of edges.values()) if (e.opp.length !== 2) boundary[e.a] = boundary[e.b] = 1;

  const outPos: number[] = [];
  const outIdx: number[] = [];
  const outW: number[] = [];
  const push = (p: THREE.Vector3, s: Skin) => {
    outPos.push(p.x, p.y, p.z);
    outIdx.push(...s.idx);
    outW.push(...s.w);
    return outPos.length / 3 - 1;
  };

  // even (original) vertices, relaxed with Loop's vertex rule
  for (let i = 0; i < nv; i++) {
    const p = P(i);
    if (!boundary[i]) {
      const n = neighbors[i].size;
      const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      const sum = new THREE.Vector3();
      for (const j of neighbors[i]) sum.add(P(j));
      p.multiplyScalar(1 - n * beta).addScaledVector(sum, beta);
    }
    push(p, S(i));
  }
  // odd (edge) vertices
  for (const e of edges.values()) {
    const pa = P(e.a);
    const pb = P(e.b);
    let p: THREE.Vector3;
    if (e.opp.length === 2) {
      p = pa.add(pb).multiplyScalar(3 / 8).addScaledVector(P(e.opp[0]).add(P(e.opp[1])), 1 / 8);
    } else {
      p = pa.add(pb).multiplyScalar(0.5);
    }
    e.mid = push(p, blendSkin([[S(e.a), 0.5], [S(e.b), 0.5]]));
  }

  const faces: number[] = [];
  for (let t = 0; t < tris; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);
    const ab = edges.get(key(a, b))!.mid;
    const bc = edges.get(key(b, c))!.mid;
    const ca = edges.get(key(c, a))!.mid;
    faces.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
  out.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(outIdx, 4));
  out.setAttribute("skinWeight", new THREE.Float32BufferAttribute(outW, 4));
  out.setIndex(faces);
  return out;
}

export function subdivideSkinned(source: THREE.BufferGeometry, levels = 1) {
  let g = source.clone();
  for (const name of Object.keys(g.attributes)) {
    if (!["position", "skinIndex", "skinWeight"].includes(name)) g.deleteAttribute(name);
  }
  g = mergeVertices(g, 1e-5); // weld UV seams so the surface subdivides as one piece
  for (let i = 0; i < levels; i++) g = loopOnce(g);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

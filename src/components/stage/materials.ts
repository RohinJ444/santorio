import * as THREE from "three";

/* Hologram body: horizontal scan rings + faint meridians + fresnel rim, additive.
   Works on the skinned mesh by pulling in three's skinning chunks. */

const holoVertex = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform mat4 uInvRoot;
varying vec3 vBody;
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vBody = (uInvRoot * world).xyz;
  vec4 mv = viewMatrix * world;
  vV = -mv.xyz;
  vN = normalize(transformedNormal);
  gl_Position = projectionMatrix * mv;
}
`;

const holoFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uReveal;
uniform float uOpacity;
uniform float uHeight;
uniform float uRings;
varying vec3 vBody;
varying vec3 vN;
varying vec3 vV;

float gridLine(float coord, float width) {
  float fw = fwidth(coord);
  float f = fract(coord);
  float d = min(f, 1.0 - f);
  return 1.0 - smoothstep(width * fw, (width + 1.0) * fw, d);
}

void main() {
  float h = vBody.y / uHeight;
  if (h > uReveal) discard;

  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float facing = abs(dot(n, v));
  float rim = pow(1.0 - facing, 2.0);

  float rings = gridLine(vBody.y * uRings, 0.3);
  float ang = atan(vBody.x, vBody.z) * 0.15915494;
  float meridians = gridLine(ang * 44.0, 0.3) * 0.5 * step(fwidth(ang), 0.04);
  float grid = max(rings, meridians);

  float scanPos = fract(uTime * 0.085) * 1.3 - 0.15;
  float scan = exp(-pow((h - scanPos) / 0.016, 2.0));
  float edge = exp(-pow((h - uReveal) / 0.01, 2.0)) * step(uReveal, 1.02);

  float side = gl_FrontFacing ? 1.0 : 0.32;
  float a = (0.025 + rim * 0.55 + grid * (0.3 + rim * 0.55)) * side;
  a += scan * (0.12 + grid * 0.6) + edge * 1.4;

  vec3 col = mix(uColor, vec3(1.0), clamp(edge * 0.75 + scan * 0.25 + rim * 0.12, 0.0, 1.0));
  gl_FragColor = vec4(col, a * uOpacity);
}
`;

export function createHologramMaterial(color = "#3fe0ff") {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uOpacity: { value: 1 },
      uHeight: { value: 1.8 },
      uRings: { value: 46 },
      uInvRoot: { value: new THREE.Matrix4() },
    },
    vertexShader: holoVertex,
    fragmentShader: holoFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/* Organs: denser, glowing solids with a slow travelling pulse. */

const organVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const organFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uBoost;
uniform float uFlowScale;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float facing = abs(dot(n, v));
  float rim = pow(1.0 - facing, 1.7);
  float flow = 0.5 + 0.5 * sin(uTime * 1.5 - (vP.x * 0.7 + vP.y * 1.6 + vP.z * 0.4) * uFlowScale);
  vec3 col = uColor * (0.2 + 0.32 * facing + rim * 1.2 + flow * 0.16) * uBoost;
  float a = (0.5 + rim * 0.5) * uOpacity;
  gl_FragColor = vec4(col, a);
}
`;

export function createOrganMaterial(color: string, boost = 1, flowScale = 38) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uBoost: { value: boost },
      uFlowScale: { value: flowScale },
    },
    vertexShader: organVertex,
    fragmentShader: organFragment,
    transparent: true,
    depthWrite: true,
  });
}

/* Pedestal: soft radial glow on the floor. */

const glowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.4) * 0.55 + smoothstep(0.02, 0.0, abs(d - 0.66)) * 0.15;
  gl_FragColor = vec4(uColor, a * uOpacity);
}
`;

export function createGlowMaterial(color = "#3fe0ff") {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: glowFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

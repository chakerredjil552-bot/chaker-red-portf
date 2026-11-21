/*
 * Dust in the air of the well, as in the reel: small white specks, sparse, a few brighter than the rest. They are
 * real points in the room, so when the camera moves (you scroll) they slide past it at their own depth, near ones
 * fast and far ones slow; when it rests on the man they just float, each one wandering slowly its own way. Most hang
 * in the room at his height, the rest up the well, where the camera passes them on the way down.
 */

import * as THREE from "three";
import { WALL, WALL_TOP } from "./wall.ts";

/** How far a speck wanders from its place, metres (it never reaches the wall or the floor). */
export const WANDER = 0.55;
/** The specks stay this far inside the wall. */
const MARGIN = 1.2;

/** Same seed, same dust: a small, even random number generator. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the specks rest (x, y, z each) and four random numbers per speck for its own drift, size and twinkle. */
export function scatter(count: number, seed = 7): { pos: Float32Array; seed: Float32Array } {
  const rnd = random(seed);
  const pos = new Float32Array(count * 3), out = new Float32Array(count * 4);
  const R = WALL.radius - MARGIN - WANDER;
  for (let i = 0; i < count; i++) {
    // even over the floor's area: the radius goes as the square root
    const r = R * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
    // seven in ten in the room, up to the height the camera looks from; the rest up the well
    const y = rnd() < 0.7 ? 0.35 + WANDER + rnd() * 6.5 : 7.5 + rnd() * (WALL_TOP + 2 - 7.5);
    pos.set([r * Math.sin(a), y, r * Math.cos(a)], i * 3);
    out.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  return { pos, seed: out };
}

const VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uPixel;  // device pixels per CSS pixel
  varying float vLight;
  const float TAU = 6.2831853;
  void main() {
    vec3 p = position;
    // its own slow wander: three slow sines, a different speed and start for every speck and every direction
    p.x += sin(uTime * (0.07 + 0.12 * aSeed.x) + aSeed.y * TAU) * ${WANDER.toFixed(3)};
    p.z += cos(uTime * (0.06 + 0.11 * aSeed.z) + aSeed.w * TAU) * ${WANDER.toFixed(3)};
    p.y += sin(uTime * (0.05 + 0.08 * aSeed.w) + aSeed.x * TAU) * ${(WANDER * 0.6).toFixed(3)};
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    float d = -view.z;
    // a few CSS pixels across, a little bigger close up, never a blob
    gl_PointSize = uPixel * clamp(2.9 * pow(3.0 / max(d, 0.1), 0.5) * (0.7 + 0.6 * aSeed.y), 1.4, 5.0);
    // a slow twinkle; gone right in front of the lens, fading far away; one in eight shines brighter
    float twinkle = 0.78 + 0.22 * sin(uTime * (0.5 + 0.8 * aSeed.z) + aSeed.x * 40.0);
    float bright = aSeed.w > 0.875 ? 1.8 : 1.0;
    vLight = twinkle * bright * smoothstep(0.35, 1.4, d) * (1.0 - smoothstep(22.0, 48.0, d));
    gl_Position = projectionMatrix * view;
  }
`;
const FRAG = /* glsl */ `
  varying float vLight;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, r) * vLight;
    if (a < 0.004) discard;
    // a touch over white, so the brightest catch the glow
    gl_FragColor = vec4(vec3(1.0, 0.98, 0.95) * 1.7 * a, 1.0);
  }
`;

export class Dust {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(count: number) {
    const { pos, seed } = scatter(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    // after everything else: hidden behind him and the screens, glowing over the floor
    this.points.renderOrder = 3;
  }

  update(time: number, pixelRatio: number) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uPixel.value = pixelRatio;
  }
}

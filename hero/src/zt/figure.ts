/*
 * The figure on the floor: a man in a long coat, a dark silhouette lit at the edges by the blue floor. He has joints
 * (hips, knees, shoulders, elbows, head), so he can walk, turn, sway and reach up for a screen. The same rig is built
 * twice: once to draw him, once flattened on the floor as his shadow.
 */

import * as THREE from "three";

const RIM = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRim;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.4);
    // the floor lights him from below: the rim is strongest low down
    float low = 0.4 + 0.6 * smoothstep(1.9, 0.1, vY);
    gl_FragColor = vec4(uBase + uRim * f * low * 0.6, 1.0);
    #include <colorspace_fragment>
  }
`;
const VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vY = world.y;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export interface Rig {
  root: THREE.Group;   // on the floor, turned to face where he goes
  body: THREE.Group;   // bobs and sways above the hips
  coat: THREE.Object3D;
  head: THREE.Group;
  legs: [THREE.Group, THREE.Group];   // hip joints
  shins: [THREE.Group, THREE.Group];  // knee joints
  arms: [THREE.Group, THREE.Group];   // shoulder joints
  forearms: [THREE.Group, THREE.Group]; // elbow joints
}

export interface Pose {
  phase: number;  // walk cycle, radians: one step of each leg per 2 PI
  walk: number;   // 0 standing .. 1 full stride
  reach: number;  // 0 .. 1 the right arm up and forward, taking a screen off the wall
  time: number;   // seconds, for breathing and weight shifts
  look: number;   // head turn, radians
}

const bone = (parent: THREE.Object3D, x: number, y: number, z: number) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

function build(mat: THREE.Material): Rig {
  const root = new THREE.Group();
  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  };
  // legs: hip at 0.62, knee at 0.33, under the coat to the shins
  const thigh = new THREE.CylinderGeometry(0.078, 0.068, 0.3, 12);
  const shin = new THREE.CylinderGeometry(0.067, 0.058, 0.31, 12);
  const shoe = new THREE.CapsuleGeometry(0.05, 0.15, 4, 10);
  const legs: Rig["legs"] = [bone(root, -0.095, 0.62, 0), bone(root, 0.095, 0.62, 0)];
  const shins = legs.map((hip) => {
    mesh(hip, thigh, 0, -0.15, 0);
    const knee = bone(hip, 0, -0.29, 0);
    mesh(knee, shin, 0, -0.155, 0);
    const foot = mesh(knee, shoe, 0, -0.29, 0.035);
    foot.rotation.x = Math.PI / 2;
    return knee;
  }) as Rig["shins"];
  // the body above the hips, so it can bob and sway on its own
  const body = bone(root, 0, 0, 0);
  const coat = mesh(body, new THREE.LatheGeometry(
    [[0.0, 0.36], [0.265, 0.36], [0.243, 0.6], [0.215, 0.86], [0.205, 1.05], [0.222, 1.25], [0.25, 1.38], [0.232, 1.46], [0.13, 1.525], [0.0, 1.535]]
      .map(([r, y]) => new THREE.Vector2(r, y)), 32), 0, 0, 0, 1, 1, 0.6);
  mesh(body, new THREE.SphereGeometry(1, 20, 12), 0, 1.44, 0, 0.262, 0.075, 0.15);
  mesh(body, new THREE.CylinderGeometry(0.068, 0.105, 0.085, 16), 0, 1.535, 0);
  // arms: shoulder at 1.41, elbow 0.29 lower, hand at the end of the forearm
  const upper = new THREE.CapsuleGeometry(0.054, 0.22, 4, 10);
  const lower = new THREE.CapsuleGeometry(0.048, 0.22, 4, 10);
  const hand = new THREE.SphereGeometry(0.045, 12, 10);
  const arms: Rig["arms"] = [bone(body, -0.255, 1.41, 0), bone(body, 0.255, 1.41, 0)];
  const forearms = arms.map((shoulder, i) => {
    shoulder.rotation.z = i ? 0.06 : -0.06;
    mesh(shoulder, upper, 0, -0.15, 0);
    const elbow = bone(shoulder, 0, -0.29, 0);
    mesh(elbow, lower, 0, -0.14, 0);
    mesh(elbow, hand, 0, -0.32, 0.01, 0.85, 1.2, 0.8);
    return elbow;
  }) as Rig["forearms"];
  // head and hair, on a neck that can turn
  const head = bone(body, 0, 1.585, 0);
  mesh(head, new THREE.CylinderGeometry(0.045, 0.05, 0.07, 10), 0, 0, 0);
  mesh(head, new THREE.SphereGeometry(0.1, 20, 16), 0, 0.095, 0, 0.9, 1.12, 1);
  mesh(head, new THREE.SphereGeometry(0.104, 20, 16), 0, 0.125, -0.014, 0.93, 0.95, 1.0);
  return { root, body, coat, head, legs, shins, arms, forearms };
}

/** Puts a rig in a pose. A walk is a smooth cycle: legs swing from the hips, the knee of the leg in the air bends,
 *  the arms swing against the legs, the body dips at each step and the coat swings a little behind. */
export function pose(r: Rig, p: Pose) {
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  const w = p.walk;
  // standing still he breathes and shifts his weight now and then
  const idle = 1 - w;
  const shift = Math.sin(p.time * 0.55) * 0.5 + Math.sin(p.time * 0.23 + 1.3) * 0.5;
  r.legs[0].rotation.x = 0.42 * w * s;
  r.legs[1].rotation.x = -0.42 * w * s;
  r.shins[0].rotation.x = w * 0.62 * Math.max(0, -Math.sin(p.phase - 0.6)) + idle * 0.04 * Math.max(0, shift);
  r.shins[1].rotation.x = w * 0.62 * Math.max(0, Math.sin(p.phase - 0.6)) + idle * 0.04 * Math.max(0, -shift);
  r.body.position.y = -w * 0.028 * Math.abs(c) + idle * 0.006 * Math.sin(p.time * 1.4);
  r.body.position.x = idle * 0.012 * shift;
  r.body.rotation.z = w * 0.035 * s + idle * 0.012 * shift;
  r.body.rotation.y = w * 0.06 * s;
  r.coat.rotation.x = w * 0.05 * Math.sin(p.phase * 2 - 0.8) + w * 0.04;
  // arms: swing against the legs; the right one can rise to take a screen
  const swing = 0.36 * w;
  r.arms[0].rotation.x = -swing * s + idle * 0.02 * Math.sin(p.time * 0.8);
  r.forearms[0].rotation.x = -0.15 * w - 0.08;
  const rise = p.reach;
  r.arms[1].rotation.x = swing * s * (1 - rise) - 2.35 * rise;
  r.arms[1].rotation.z = 0.06 + 0.12 * rise;
  r.forearms[1].rotation.x = (-0.15 * w - 0.08) * (1 - rise) - 0.35 * rise;
  r.head.rotation.y = p.look + w * 0.04 * s;
  r.head.rotation.x = -0.1 * rise;
}

export interface Figure { rig: Rig; shadow: Rig; shadowRoot: THREE.Group }

/** The figure and his shadow: the shadow is the same rig, flattened onto the floor along the light. */
export function makeFigure(light: THREE.Vector3): Figure & { group: THREE.Group } {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: RIM,
    uniforms: { uBase: { value: new THREE.Color("#040508") }, uRim: { value: new THREE.Color("#3f6dff") } },
  });
  const rig = build(mat);
  const dark = new THREE.MeshBasicMaterial({ color: "#00030f", transparent: true, opacity: 0.5, depthWrite: false });
  const shadow = build(dark);
  const shadowRoot = new THREE.Group();
  shadowRoot.matrixAutoUpdate = false;
  // flatten onto y = 0.003 along the light: x' = x - lx/ly (y - h), y' = h, z' = z - lz/ly (y - h)
  const d = light.clone().normalize(), h = 0.003;
  shadowRoot.matrix.set(
    1, -d.x / d.y, 0, (d.x / d.y) * h,
    0, 0, 0, h,
    0, -d.z / d.y, 1, (d.z / d.y) * h,
    0, 0, 0, 1,
  );
  shadowRoot.add(shadow.root);
  shadow.root.renderOrder = 1;
  const group = new THREE.Group();
  group.add(shadowRoot, rig.root);
  return { group, rig, shadow, shadowRoot };
}

/** The figure on the floor: a man in a long coat, a dark silhouette lit at the edges by the blue floor. */

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

export function makeFigure(): THREE.Group {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: RIM,
    uniforms: { uBase: { value: new THREE.Color("#040508") }, uRim: { value: new THREE.Color("#3f6dff") } },
  });
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.z = rz;
    g.add(m);
    return m;
  };
  // legs and shoes, below the hem of the coat
  const leg = new THREE.CylinderGeometry(0.074, 0.062, 0.52, 12);
  add(leg, -0.095, 0.27, 0); add(leg, 0.095, 0.27, 0);
  const shoe = new THREE.CapsuleGeometry(0.052, 0.15, 4, 10);
  for (const x of [-0.1, 0.1]) { const m = add(shoe, x, 0.052, 0.035); m.rotation.x = Math.PI / 2; }
  // the long coat: a lathe, flattened front to back, down to the shins
  const coat = new THREE.LatheGeometry(
    [[0.0, 0.36], [0.265, 0.36], [0.243, 0.6], [0.215, 0.86], [0.205, 1.05], [0.222, 1.25], [0.25, 1.38], [0.232, 1.46], [0.13, 1.525], [0.0, 1.535]]
      .map(([r, y]) => new THREE.Vector2(r, y)), 32);
  add(coat, 0, 0, 0, 1, 1, 0.6);
  // shoulders and collar; arms close to the body, hands at the hem of the sleeves
  add(new THREE.SphereGeometry(1, 20, 12), 0, 1.44, 0, 0.262, 0.075, 0.15);
  add(new THREE.CylinderGeometry(0.068, 0.105, 0.085, 16), 0, 1.535, 0);
  const arm = new THREE.CapsuleGeometry(0.052, 0.55, 4, 12);
  add(arm, -0.255, 1.11, 0, 1, 1, 1, -0.06); add(arm, 0.255, 1.11, 0, 1, 1, 1, 0.06);
  const hand = new THREE.SphereGeometry(0.045, 12, 10);
  add(hand, -0.275, 0.79, 0.01, 0.85, 1.2, 0.8); add(hand, 0.275, 0.79, 0.01, 0.85, 1.2, 0.8);
  // head and hair
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 10), 0, 1.585, 0);
  add(new THREE.SphereGeometry(0.1, 20, 16), 0, 1.68, 0, 0.9, 1.12, 1);
  add(new THREE.SphereGeometry(0.104, 20, 16), 0, 1.71, -0.014, 0.93, 0.95, 1.0);
  return g;
}

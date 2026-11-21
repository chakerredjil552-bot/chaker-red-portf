/*
 * The man on the floor: a real human figure (the CC0 mannequin of Quaternius' Universal Animation Library, dressed by
 * tools/man.ts in a long coat with a raised collar and short hair), drawn all black, the floor's light and the screen
 * in front of him catching his edges.
 *
 * Like the man in the reel he stands on one spot: he breathes and shifts his weight (the idle clip, with the arms
 * hanging the way they do mid-stride) and turns his head slowly from one side to the other and back, holding each
 * look, now and then up at the wall, like someone wondering where he is. His shoulders and upper body follow the
 * head a moment later and a little less, quietly, as a real turn does.
 *
 * He can also walk (the hero does not use it now): a motion-captured cycle played by the distance he moves, never by
 * the clock, so his feet stay planted.
 *
 * The same skinned mesh is drawn a second time, flattened onto the floor along the light: his shadow.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clamp01, smoother } from "./plan.ts";

/** Metres covered by one cycle of the walk clip (two steps): its planted foot moves back 1.05 m/s for 1.333 s. */
export const STRIDE = 1.4;
/** The clips in man.glb. */
export const CLIP = { idle: "Idle_Loop", walk: "Walk_Formal_Loop", reach: "Interact" } as const;
/** Where in the reach clip his arm is furthest out. */
export const REACH_PEAK = 0.82;
/** The walk clip's two passing moments, half a cycle apart: the arms hang straight between them. */
const PASSING = [0.333, 1.0];
const ARM = /^DEF-(shoulder|upper_arm|forearm|hand|f_[a-z]+\d*|thumb\d*)([LR])\.(quaternion|position)$/;

export interface Drive {
  dist: number;  // metres walked so far: where the legs are in the stride
  walk: number;  // 0 standing .. 1 walking
  reach: number; // 0 .. 1 his left arm out toward the screen
  look: number;  // head turn, radians, + to his left
  lift: number;  // head up, radians
  dt: number;    // seconds since the last frame; 0 holds him still
}

/** Where he looks while he stands and wonders where he is, [seconds, turn, lift]: a slow turn to his left and a
 *  hold, all the way across to his right and a hold, back toward the middle and up at the wall, a glance left, back.
 *  Every turn takes one and a half to two seconds. The pattern repeats. */
const WONDER: [number, number, number][] = [
  [0, -0.1, 0.08], [1.2, -0.1, 0.08], [3.0, 0.75, 0.05], [4.7, 0.78, 0.09], [6.7, -0.8, 0.1], [8.3, -0.82, 0.07],
  [9.8, -0.3, 0.24], [11.4, -0.25, 0.27], [12.9, 0.3, 0.12], [13.9, 0.26, 0.1], [15, -0.1, 0.08],
];
/** Seconds before the pattern repeats. */
export const WONDER_PERIOD = WONDER[WONDER.length - 1][0];
/** Seconds the shoulders and upper body take to catch up with the head. */
const FOLLOW = 0.55;

export function wonder(t: number): { look: number; lift: number } {
  const T = WONDER[WONDER.length - 1][0];
  const u = ((t % T) + T) % T;
  let i = 0;
  while (i < WONDER.length - 2 && WONDER[i + 1][0] <= u) i++;
  const [t0, l0, p0] = WONDER[i], [t1, l1, p1] = WONDER[i + 1];
  const k = smoother((u - t0) / (t1 - t0));
  return { look: l0 + (l1 - l0) * k, lift: p0 + (p1 - p0) * k };
}

/** The idle clip with the arms (and hands) taken from the walk as they pass the body: hanging, relaxed. */
export function standing(idle: THREE.AnimationClip, walk: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = idle.tracks.map((tr) => {
    const w = ARM.test(tr.name) ? walk.tracks.find((x) => x.name === tr.name) : undefined;
    if (!w) return tr;
    // every track has its own interpolant (linear, or slerp for rotations); three.js leaves it out of the types
    const lerp = (w as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
    const at = (t: number): number[] => Array.from(lerp.evaluate(t) as ArrayLike<number>);
    const a = at(PASSING[0]), b = at(PASSING[1]);
    const v = a.slice();
    if (tr instanceof THREE.QuaternionKeyframeTrack) THREE.Quaternion.slerpFlat(v, 0, a, 0, b, 0, 0.5);
    else for (let i = 0; i < v.length; i++) v[i] = (a[i] + b[i]) / 2;
    const Track = tr.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
    return new Track(tr.name, [0], v);
  });
  return new THREE.AnimationClip("stand", idle.duration, tracks);
}

/** Only his left arm of the reach clip: the rest of him keeps standing. */
export function reachArm(reach: THREE.AnimationClip): THREE.AnimationClip {
  return new THREE.AnimationClip("reach", reach.duration, reach.tracks.filter((t) => ARM.exec(t.name)?.[2] === "L"));
}

const VERT = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 world = modelMatrix * vec4(transformed, 1.0);
    vY = world.y;
    vN = normalize(mat3(modelMatrix) * objectNormal);
    vV = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform vec3 uGlow;
  uniform vec3 uGlowDir;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    float edge = 1.0 - abs(dot(n, normalize(vV)));
    // the floor lights him from below: its rim is strongest low down
    float low = 0.4 + 0.6 * smoothstep(1.9, 0.1, vY);
    // the screen in front catches the edges that face it, in its colour
    float lit = pow(edge, 3.0) * max(0.0, dot(n, uGlowDir));
    gl_FragColor = vec4(uBase + uRim * pow(edge, 3.4) * low * 0.6 + uGlow * lit, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Man {
  /** Add this to the scene. */
  readonly group = new THREE.Group();
  /** His place and facing on the floor (yaw 0 faces +z). */
  readonly root = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  ready = false;
  private mixer?: THREE.AnimationMixer;
  private acts?: { stand: THREE.AnimationAction; walk: THREE.AnimationAction; reach: THREE.AnimationAction };
  private bones?: {
    waist: THREE.Bone; back: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone; armL: THREE.Bone; armR: THREE.Bone;
  };
  /** The upper body's share of the turn, a moment behind the head. */
  private follow = 0;
  private walkLength = 1;
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  /** The clip's own pose of the bones moved on top of it (head turn, arms), from the last frame. */
  private readonly clipPose = [0, 1, 2, 3, 4, 5, 6].map(() => new THREE.Quaternion());
  private readonly forward = new THREE.Vector3();

  /** `prepare` gets the model before it is shown, to build its shaders without a hitch (the page passes
   *  renderer.compileAsync). */
  constructor(url: string | null, light: THREE.Vector3, prepare?: (model: THREE.Object3D) => Promise<unknown>) {
    this.group.add(this.root);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uBase: { value: new THREE.Color("#040508") },
        uRim: { value: new THREE.Color("#3f6dff") },
        uGlow: { value: new THREE.Color(0, 0, 0) },
        uGlowDir: { value: new THREE.Vector3(0, 0, -1) },
      },
    });
    this.shadowMaterial = shadowOf(light);
    if (!url) return;
    new GLTFLoader().load(url, (g) => {
      if (!this.dress(g.scene, g.animations, false)) return;
      (prepare ? prepare(g.scene).catch(() => undefined) : Promise.resolve()).then(() => this.show(g.scene));
    }, undefined, () => { /* no model: the hero goes on without him */ });
  }

  private show(model: THREE.Object3D) {
    this.root.add(model);
    this.ready = true;
  }

  /** Puts the loaded model together and, unless `show` is false, puts him on the floor (the tests call this with a
   *  model parsed by hand). */
  dress(model: THREE.Object3D, clips: THREE.AnimationClip[], show = true): boolean {
    let body: THREE.SkinnedMesh | undefined;
    model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
    const clip = (n: string) => clips.find((c) => c.name === n);
    const idle = clip(CLIP.idle), walk = clip(CLIP.walk), reach = clip(CLIP.reach);
    if (!body || !idle || !walk || !reach) return false;
    body.material = this.material;
    body.frustumCulled = false;
    // the shadow: the same mesh on the same bones, flattened by its material; a child of the body, so it is skinned
    // exactly like him
    const shadow = new THREE.SkinnedMesh(body.geometry, this.shadowMaterial);
    shadow.bind(body.skeleton, body.bindMatrix);
    shadow.frustumCulled = false;
    shadow.renderOrder = 1;
    body.add(shadow);
    const find = (n: string) => model.getObjectByName(n) as THREE.Bone;
    this.bones = {
      waist: find("DEF-spine001"), back: find("DEF-spine002"), chest: find("DEF-spine003"), neck: find("DEF-neck"),
      head: find("DEF-head"), armL: find("DEF-upper_armL"), armR: find("DEF-upper_armR"),
    };
    this.mixer = new THREE.AnimationMixer(model);
    this.acts = {
      stand: this.mixer.clipAction(standing(idle, walk)),
      walk: this.mixer.clipAction(walk),
      reach: this.mixer.clipAction(reachArm(reach)),
    };
    for (const a of Object.values(this.acts)) a.play();
    // the walk and the reach are placed by hand: by the distance walked and by how far he reaches
    this.acts.walk.timeScale = 0;
    this.acts.reach.timeScale = 0;
    // breathing a little slower than the clip: calmer
    this.acts.stand.timeScale = 0.85;
    this.walkLength = walk.duration;
    this.mixer.update(0);
    this.moved().forEach((b, i) => this.clipPose[i].copy(b.quaternion));
    if (show) this.show(model);
    return true;
  }

  /** The screen's light on his edges: its colour times how bright, and the way to it (world). */
  light(color: THREE.Color, strength: number, toward: THREE.Vector3) {
    this.material.uniforms.uGlow.value.copy(color).multiplyScalar(strength);
    this.material.uniforms.uGlowDir.value.copy(toward).normalize();
  }

  update(d: Drive) {
    const { mixer, acts, bones } = this;
    if (!mixer || !acts || !bones) return;
    const w = clamp01(d.walk), r = Math.min(0.995, clamp01(d.reach));
    acts.walk.time = ((((d.dist / STRIDE) % 1) + 1) % 1) * this.walkLength;
    acts.reach.time = r * REACH_PEAK;
    acts.stand.setEffectiveWeight(1 - w);
    acts.walk.setEffectiveWeight(w);
    // the arm's share of the pose is r: the other two always add up to 1
    acts.reach.setEffectiveWeight(r / (1 - r));
    // the mixer only writes a bone when its value changed, so the last frame's head turn is taken off first, or
    // the turns would pile up while he stands still
    const turned = this.moved();
    turned.forEach((b, i) => b.quaternion.copy(this.clipPose[i]));
    mixer.update(d.dt);
    turned.forEach((b, i) => this.clipPose[i].copy(b.quaternion));

    // the head on top of the clip: up toward the wall about his own right, then round about the vertical. The head
    // and neck lead; the chest, back and waist follow a moment later and less, so the shoulders turn quietly with it
    if (d.dt > 0) this.follow += (d.look - this.follow) * (1 - Math.exp(-d.dt / FOLLOW));
    this.root.updateWorldMatrix(true, true);
    this.root.getWorldQuaternion(this.q);
    this.right.set(-1, 0, 0).applyQuaternion(this.q);
    this.forward.set(0, 0, 1).applyQuaternion(this.q);
    // the mannequin holds his arms a little out from his sides: closer in, they hang like a slim man's in a coat
    this.turn(bones.armL, this.forward, -0.1 * (1 - r));
    this.turn(bones.armR, this.forward, 0.1);
    this.turn(bones.neck, this.right, d.lift * 0.4);
    this.turn(bones.head, this.right, d.lift * 0.6);
    const up = THREE.Object3D.DEFAULT_UP;
    this.turn(bones.waist, up, this.follow * 0.05);
    this.turn(bones.back, up, this.follow * 0.09);
    this.turn(bones.chest, up, this.follow * 0.16);
    this.turn(bones.neck, up, d.look * 0.3);
    this.turn(bones.head, up, d.look * 0.4);
  }

  private moved() {
    const b = this.bones!;
    return [b.waist, b.back, b.chest, b.neck, b.head, b.armL, b.armR];
  }

  /** Turns a bone by `angle` about a world axis through its joint. */
  private turn(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
    if (!angle || !bone.parent) return;
    bone.parent.getWorldQuaternion(this.q);
    this.v.copy(axis).applyQuaternion(this.q.invert());
    bone.quaternion.premultiply(this.q.setFromAxisAngle(this.v, angle));
    bone.updateWorldMatrix(false, true);
  }
}

/** A dark, see-through copy of him pressed flat onto the floor along the light. Each pixel of it is darkened once,
 *  however many layers of him (coat over legs over arms) land there: the stencil keeps count. */
function shadowOf(light: THREE.Vector3): THREE.MeshBasicMaterial {
  const d = light.clone().normalize(), h = 0.003;
  // x' = x - lx/ly (y - h), y' = h, z' = z - lz/ly (y - h)
  const flat = new THREE.Matrix4().set(
    1, -d.x / d.y, 0, (d.x / d.y) * h,
    0, 0, 0, h,
    0, -d.z / d.y, 1, (d.z / d.y) * h,
    0, 0, 0, 1,
  );
  const m = new THREE.MeshBasicMaterial({
    color: "#00030f", transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uFlat = { value: flat };
    s.vertexShader = "uniform mat4 uFlat;\n" + s.vertexShader.replace("#include <project_vertex>", /* glsl */ `
      vec4 mvPosition = viewMatrix * (uFlat * (modelMatrix * vec4(transformed, 1.0)));
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}

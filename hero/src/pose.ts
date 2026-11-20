/*
 * Geometry of the reel ring. Every card on the hero is placed by these functions and nothing else: the deal, every
 * beat of the scroll story and the moves between them are all just different inputs to reelPose.
 *
 * Angles are in degrees. 0 is the far centre of the ring, ±180 is the slot nearest the camera.
 * Ring space: x to the right, y down, z toward the camera (the CSS convention). Card faces look outward, away from
 * the ring's axis, so the card at the front shows its video to the camera.
 */

export interface Scene {
  radius: number;      // px
  tilt: number;        // deg, rotateX of the ring (negative: seen from above)
  roll: number;        // deg, rotateZ of the ring (dutch angle)
  perspective: number; // px, camera distance from the ring centre when dolly is 0
  dolly: number;       // px, the ring centre moved toward the camera (negative: away)
  scale: number;       // card scale
  explode: number;     // 0..1, the teardown: the ring opens and its cards lift apart in layers
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;           // deg, rotateY of the card
  scale: number;
  appear: number;        // 0..1 opacity while the card is being dealt
  behindCamera: boolean; // some part of the card is at or behind the camera plane
}

export const SLOTS = 16;
export const STEP = 360 / SLOTS;
export const CARD_W = 270;
export const CARD_H = 480;

/** Share of the formation one card spends swinging out; the rest of the timeline staggers the start times. */
export const SWING = 0.36;
/** How high a card lifts at the middle of its swing, in card heights. */
export const LIFT = 0.12;
/** The deal starts each card slightly smaller and grows it to full size as it lands. */
export const DEAL_SCALE = 0.84;
/** At full explode the ring is this much wider and alternate cards rise or drop this many card heights. */
export const SPREAD = 0.15;
export const RISE = 0.7;

const DEG = Math.PI / 180;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mod = (a: number, n: number): number => ((a % n) + n) % n;
/** Wraps an angle into [-180, 180). */
export const wrap = (a: number): number => mod(a + 180, 360) - 180;
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Degrees a card travels from the stack at the front to its resting angle, going round the ring: [0, 360). */
export function dealTravel(angle: number): number {
  return mod(wrap(angle) - 180, 360);
}

/** Where a card's swing starts on the formation timeline. Ordered by angle, so the deal travels round the ring. */
export function dealStart(angle: number): number {
  return (dealTravel(angle) / 360) * (1 - SWING);
}

/**
 * How far one card has come apart at the scene's explode. Parts lift apart in order: the cards at the front first,
 * the far ones last, and all of them are fully apart at explode 1.
 */
export function cardExplode(angle: number, explode: number): number {
  const order = 1 - Math.abs(wrap(angle)) / 180; // 0 at the front, 1 at the far centre
  return smooth(clamp01(clamp01(explode) * 1.6 - order * 0.6));
}

/**
 * Pose of the card whose resting angle is `angle`, at `formation` (0: every card stacked at the front,
 * 1: every card dealt to its angle), in `scene`. `side` (+1 or -1) is the layer the card goes to in the teardown:
 * neighbours take opposite sides.
 */
export function reelPose(angle: number, formation: number, scene: Scene, side = 1): Pose {
  const travel = dealTravel(angle);
  const t = clamp01((clamp01(formation) - dealStart(angle)) / SWING);
  const e = easeOutCubic(t);

  const yaw = wrap(180 + travel * e);
  const ex = cardExplode(yaw, scene.explode);
  const radius = scene.radius * (1 + SPREAD * ex);
  const a = yaw * DEG;
  const x = -Math.sin(a) * radius;
  const z = -Math.cos(a) * radius;
  const scale = scene.scale * lerp(DEAL_SCALE, 1, e);
  const y = -Math.sin(Math.PI * t) * LIFT * CARD_H * scale + side * ex * RISE * CARD_H * scene.scale;

  // depth after the ring's tilt (the roll turns about the view axis and leaves depth alone) and the dolly, plus the
  // card's own reach toward the camera from its width (turned by yaw) and its height (turned by tilt)
  const tl = scene.tilt * DEG;
  const depth = y * Math.sin(tl) + z * Math.cos(tl) + scene.dolly;
  const reach = (CARD_W / 2) * scale * Math.abs(Math.sin(a)) * Math.cos(tl) + (CARD_H / 2) * scale * Math.abs(Math.sin(tl));
  const behindCamera = depth + reach >= scene.perspective * 0.96;

  return { x, y, z, yaw, scale, appear: smooth(clamp01(t / 0.3)), behindCamera };
}

/** Screen position of a card's centre relative to the ring's centre on screen, in px, and its perspective factor. */
export function project(pose: Pose, scene: Scene): { x: number; y: number; k: number } {
  const tl = scene.tilt * DEG, rl = scene.roll * DEG;
  const y1 = pose.y * Math.cos(tl) - pose.z * Math.sin(tl);
  const z1 = pose.y * Math.sin(tl) + pose.z * Math.cos(tl) + scene.dolly;
  const x2 = pose.x * Math.cos(rl) - y1 * Math.sin(rl);
  const y2 = pose.x * Math.sin(rl) + y1 * Math.cos(rl);
  const k = scene.perspective / Math.max(1e-6, scene.perspective - z1);
  return { x: x2 * k, y: y2 * k, k };
}

/** True when the card's face, not its back, is turned toward the camera. */
export function facing(pose: Pose, scene: Scene): boolean {
  const a = pose.yaw * DEG, tl = scene.tilt * DEG;
  const y1 = pose.y * Math.cos(tl) - pose.z * Math.sin(tl);
  const z1 = pose.y * Math.sin(tl) + pose.z * Math.cos(tl) + scene.dolly;
  // the face normal points away from the ring's axis: (-sin a, 0, -cos a), turned by the tilt
  const n = [-Math.sin(a), Math.cos(a) * Math.sin(tl), -Math.cos(a) * Math.cos(tl)];
  return -pose.x * n[0] - y1 * n[1] + (scene.perspective - z1) * n[2] > 0;
}

/** Current angle of a DOM slot when the ring has turned by `ring` degrees. */
export function slotAngle(slot: number, ring: number): number {
  return wrap(slot * STEP + ring);
}

/**
 * Which reel a DOM slot holds. The 16 slots form a window onto an endless strip of reels: a slot's strip position is
 * (angle - ring) / STEP, so neighbours always hold consecutive reels, and a slot only changes reel when it wraps
 * through 0, the far centre of the ring, where only its back can be seen. The first reel starts at the front, and
 * turning the ring forward (a growing angle, the cards moving right) brings the next one round.
 */
export function slotReel(slot: number, ring: number, reelCount: number): number {
  const lap = Math.floor((slot * STEP + ring) / 360);
  return mod(SLOTS * lap + SLOTS / 2 - slot, reelCount);
}

/** The slot at the front of the ring (nearest the camera) when the ring has turned by `ring` degrees. */
export function frontSlot(ring: number): number {
  return mod(Math.round((180 - ring) / STEP), SLOTS);
}

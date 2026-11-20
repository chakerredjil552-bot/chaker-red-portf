import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_H, RISE, SLOTS, SPREAD, STEP, SWING, type Scene,
  cardExplode, dealStart, dealTravel, facing, frontSlot, mod, project, reelPose, slotAngle, slotReel, wrap,
} from "./pose.ts";

const near = (a: number, b: number, eps = 1e-6, msg?: string) =>
  assert.ok(Math.abs(a - b) <= eps, msg ?? `expected ${a} to be within ${eps} of ${b}`);
const angles = Array.from({ length: SLOTS }, (_, i) => wrap(i * STEP + 7));

/** The camera outside the ring, seeing it from above. */
const OUT: Scene = Object.freeze({ radius: 560, tilt: -12, roll: -6, perspective: 1700, dolly: 0, scale: 0.64, explode: 0 });
/** The ring pushed back, the front card close to the camera. */
const CLOSE: Scene = Object.freeze({ radius: 2000, tilt: 0, roll: 0, perspective: 1500, dolly: -1250, scale: 0.83, explode: 0 });

test("0 degrees is the far centre, ±180 the card nearest the camera", () => {
  const far = reelPose(0, 1, OUT);
  near(far.x, 0); near(far.z, -OUT.radius); near(far.yaw, 0);
  const front = reelPose(180, 1, OUT);
  near(front.x, 0, 1e-6); near(front.z, OUT.radius);
  const side = reelPose(90, 1, OUT);
  near(side.x, -OUT.radius); near(side.z, 0, 1e-6);
});

test("x = -sin(a) * radius, z = -cos(a) * radius, yaw = a, once dealt", () => {
  for (const a of angles) {
    const p = reelPose(a, 1, CLOSE), r = (a * Math.PI) / 180;
    near(p.x, -Math.sin(r) * CLOSE.radius); near(p.z, -Math.cos(r) * CLOSE.radius);
    near(wrap(p.yaw - a), 0, 1e-9); near(p.y, 0, 1e-9);
    near(p.scale, CLOSE.scale); assert.equal(p.appear, 1);
  }
});

test("the pose is what the CSS transform rotateY(yaw) translate3d(0, y, -radius) draws", () => {
  // CSS rotateY(t) maps (x, y, z) to (x cos t + z sin t, y, -x sin t + z cos t)
  for (const f of [0.2, 0.5, 1]) for (const a of angles) {
    const p = reelPose(a, f, OUT), t = (p.yaw * Math.PI) / 180, z = -OUT.radius;
    near(p.x, z * Math.sin(t), 1e-9); near(p.z, z * Math.cos(t), 1e-9);
  }
});

test("at formation 0 every card waits, invisible, in one stack at the front", () => {
  for (const a of angles) {
    const p = reelPose(a, 0, OUT);
    near(wrap(p.yaw - 180), 0, 1e-9); near(p.x, 0, 1e-9); near(p.z, OUT.radius, 1e-9);
    assert.equal(p.appear, 0);
  }
});

test("the deal travels round the ring in order of angle", () => {
  const order = [...angles].sort((a, b) => dealStart(a) - dealStart(b));
  for (let i = 1; i < order.length; i++) near(mod(order[i] - order[i - 1], 360), STEP, 1e-9);
  assert.ok(dealStart(order[order.length - 1]) <= 1 - SWING);
  for (let f = 0; f <= 1; f += 0.01) {
    const done = order.map((a) => {
      const travel = dealTravel(a);
      return travel < 1 ? 1 : mod(reelPose(a, f, OUT).yaw - 180, 360) / travel;
    });
    for (let i = 2; i < done.length; i++) assert.ok(done[i] <= done[i - 1] + 1e-9, `card ${i} ahead of ${i - 1} at ${f}`);
  }
});

test("cards fade in as they are dealt and are fully there when they land", () => {
  for (const a of angles) {
    let last = 0;
    for (let f = 0; f <= 1.0001; f += 0.01) {
      const p = reelPose(a, f, OUT);
      assert.ok(p.appear >= last - 1e-12); last = p.appear;
    }
    assert.equal(last, 1);
  }
});

test("the deal never jumps: small steps in formation make small moves", () => {
  for (const a of angles) {
    let prev = reelPose(a, 0, OUT);
    for (let f = 0.002; f <= 1; f += 0.002) {
      const p = reelPose(a, f, OUT);
      const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      assert.ok(d < 2 * Math.PI * OUT.radius * 0.03, `jump of ${d.toFixed(1)}px at ${f.toFixed(3)} for ${a}`);
      prev = p;
    }
  }
});

test("a card lifts during its swing and is back on the ring when it lands", () => {
  const mid = reelPose(0, dealStart(0) + SWING / 2, OUT);
  assert.ok(mid.y < -0.05 * CARD_H * OUT.scale);
  near(reelPose(0, 1, OUT).y, 0, 1e-9);
});

test("the teardown: the front comes apart first, everything is apart at explode 1", () => {
  near(cardExplode(180, 0), 0); near(cardExplode(0, 0), 0);
  near(cardExplode(180, 1), 1); near(cardExplode(0, 1), 1);
  assert.ok(cardExplode(180, 0.4) > cardExplode(0, 0.4));
  const open = reelPose(90, 1, { ...OUT, explode: 1 }, 1), shut = reelPose(90, 1, OUT, 1);
  near(Math.abs(open.x), Math.abs(shut.x) * (1 + SPREAD), 1e-6, "the ring opens");
  near(open.y, RISE * CARD_H * OUT.scale, 1e-6, "one layer drops...");
  near(reelPose(90, 1, { ...OUT, explode: 1 }, -1).y, -RISE * CARD_H * OUT.scale, 1e-6, "...the other rises");
});

test("fit scales the projected picture and nothing else", () => {
  const half = (s: Scene): Scene => ({ ...s, radius: s.radius / 2, perspective: s.perspective / 2, dolly: s.dolly / 2, scale: s.scale / 2 });
  for (const s of [OUT, CLOSE, { ...OUT, explode: 0.6 }]) for (const a of angles) {
    const p1 = reelPose(a, 1, s), p2 = reelPose(a, 1, half(s));
    assert.equal(p1.behindCamera, p2.behindCamera);
    if (p1.behindCamera) continue;
    const q1 = project(p1, s), q2 = project(p2, half(s));
    near(q2.x, q1.x * 0.5, 1e-6); near(q2.y, q1.y * 0.5, 1e-6);
  }
});

test("behind the camera: only once the ring is pulled through it", () => {
  for (const a of angles) assert.equal(reelPose(a, 1, OUT).behindCamera, false, `angle ${a}`);
  for (const a of angles) assert.equal(reelPose(a, 1, CLOSE).behindCamera, false, `angle ${a}`);
  // close up, the cards round the side are far off the screen
  const side = project(reelPose(110, 1, CLOSE), CLOSE);
  assert.ok(Math.abs(side.x) > 1000);
  const through: Scene = { ...CLOSE, dolly: 0 };
  assert.equal(reelPose(180, 1, through).behindCamera, true);
  assert.equal(reelPose(0, 1, through).behindCamera, false);
});

test("faces look outward: the near side faces the camera, the far side shows its back", () => {
  assert.ok(facing(reelPose(180, 1, OUT), OUT));
  assert.ok(facing(reelPose(150, 1, OUT), OUT));
  assert.ok(facing(reelPose(180, 1, CLOSE), CLOSE));
  assert.ok(!facing(reelPose(0, 1, OUT), OUT));
  assert.ok(!facing(reelPose(30, 1, OUT), OUT));
});

test("projection: the front card sits in the middle, grown by its nearness", () => {
  const p = project(reelPose(180, 1, CLOSE), CLOSE);
  near(p.x, 0, 1e-9); near(p.y, 0, 1e-9);
  near(p.k, CLOSE.perspective / (CLOSE.perspective - CLOSE.radius - CLOSE.dolly));
  // turning forward moves the near side right
  assert.ok(project(reelPose(170, 1, OUT), OUT).x < project(reelPose(wrap(190), 1, OUT), OUT).x);
});

test("recycling: neighbours hold consecutive reels", () => {
  for (const n of [5, 16, 19, 40]) for (let ring = -900; ring <= 900; ring += 13.7) {
    const slots = Array.from({ length: SLOTS }, (_, s) => s).sort((a, b) => mod(slotAngle(a, ring), 360) - mod(slotAngle(b, ring), 360));
    for (let i = 1; i < SLOTS; i++)
      assert.equal(slotReel(slots[i - 1], ring, n), (slotReel(slots[i], ring, n) + 1) % n, `n=${n} ring=${ring}`);
  }
});

test("recycling: a slot only swaps its reel at the far centre, where its back is turned", () => {
  for (let s = 0; s < SLOTS; s++) {
    let prev = slotReel(s, -720, 19), prevA = slotAngle(s, -720);
    for (let ring = -720; ring <= 720; ring += 0.5) {
      const r = slotReel(s, ring, 19), a = slotAngle(s, ring);
      if (r !== prev) assert.ok(Math.abs(a) < 10 && Math.abs(prevA) < 10, `slot ${s} swapped at ${a}`);
      prev = r; prevA = a;
    }
  }
});

test("recycling: the first reel starts at the front, and each step forward brings the next one", () => {
  const front = (ring: number) => slotReel(frontSlot(ring), ring, 19);
  assert.equal(front(0), 0);
  assert.equal(front(STEP), 1);
  assert.equal(front(STEP * 18), 18);
  assert.equal(front(STEP * 19), 0);
  assert.equal(front(-STEP), 18);
  for (let k = -40; k <= 40; k++) near(Math.abs(slotAngle(frontSlot(k * STEP), k * STEP)), 180, 1e-9);
});

test("pure: same input, same output, and the scene is not touched", () => {
  assert.deepEqual(reelPose(42, 0.6, OUT, -1), reelPose(42, 0.6, OUT, -1));
  assert.deepEqual(reelPose(42 + 360, 0.6, OUT), reelPose(42, 0.6, OUT));
});

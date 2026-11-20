import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_H, CARD_W, STEP, frontSlot, mod, project, reelPose, slotAngle, wrap } from "./pose.ts";
import { CUES, beatAt, beatTarget, beatWeight, fitOf, loopDelta, shotAt } from "./story.ts";

const near = (a: number, b: number, eps = 1e-6, msg?: string) =>
  assert.ok(Math.abs(a - b) <= eps, msg ?? `expected ${a} to be within ${eps} of ${b}`);

test("five beats, in order, the first at 0", () => {
  assert.deepEqual(CUES.map((c) => c.id), ["hero", "craft", "inside", "work", "talk"]);
  assert.equal(CUES[0].at, 0);
  for (let i = 1; i < CUES.length; i++) assert.ok(CUES[i].at > CUES[i - 1].at);
  assert.ok(CUES[CUES.length - 1].at < 1);
});

test("on a beat, the shot is exactly that cue", () => {
  for (const c of CUES) {
    const s = shotAt(c.at);
    for (const k of ["radius", "tilt", "roll", "perspective", "dolly", "scale", "explode", "turn", "label", "focus"] as const) near(s[k], c[k], 1e-9, `${c.id}.${k}`);
  }
});

test("the loop ends where it starts, one full turn later, so it never jumps", () => {
  for (const loop of [-2, -1, 0, 1, 5]) {
    const end = shotAt(loop + 1 - 1e-9), start = shotAt(loop + 1);
    for (const k of ["radius", "tilt", "roll", "perspective", "dolly", "scale", "explode", "label", "focus", "turn"] as const)
      near(end[k], start[k], 1e-4, `${k} at loop ${loop}`);
    near(start.turn, 360 * (loop + 1), 1e-9);
  }
});

test("the ring rests on every beat and turns between them, always the same way", () => {
  for (const c of CUES) {
    const v = (shotAt(c.at + 1e-4).turn - shotAt(c.at - 1e-4).turn) / 2e-4;
    near(v, 0, 1e-3, `turn speed at ${c.id}`);
  }
  let last = shotAt(0).turn;
  for (let u = 0.001; u <= 3; u += 0.001) {
    const turn = shotAt(u).turn;
    assert.ok(turn >= last - 1e-9, `the ring turned back at ${u}`);
    last = turn;
  }
});

test("every value moves smoothly: no jump anywhere on the loop", () => {
  for (let u = 0; u < 1; u += 0.0005) {
    const a = shotAt(u), b = shotAt(u + 0.0005);
    assert.ok(Math.abs(a.radius - b.radius) < 12, `radius jumps at ${u}`);
    assert.ok(Math.abs(a.dolly - b.dolly) < 12, `dolly jumps at ${u}`);
    assert.ok(Math.abs(a.turn - b.turn) < 1.5, `turn jumps at ${u}`);
  }
});

test("on the craft beat a card sits dead centre at the front and fills most of the screen", () => {
  const craft = CUES.find((c) => c.id === "craft")!;
  const s = frontSlot(craft.turn);
  near(Math.abs(slotAngle(s, craft.turn)), 180, 1e-9);
  near(mod(craft.turn, STEP), 0, 1e-9);
  const q = project(reelPose(180, 1, craft), craft);
  near(q.x, 0, 1e-6);
  const h = CARD_H * craft.scale * q.k, w = CARD_W * craft.scale * q.k;
  assert.ok(h > 0.8 * craft.boxH && h < craft.boxH, `card is ${h}px tall in a ${craft.boxH}px shot`);
  // its neighbours are pushed off to the sides, clear of it
  const n = project(reelPose(180 - STEP, 1, craft), craft);
  assert.ok(Math.abs(n.x) - (CARD_W / 2) * craft.scale * n.k > w / 2, "a neighbour overlaps the card");
  // and nothing else on the ring is in front of it
  for (let a = -180 + STEP; a < 180; a += STEP) {
    const p = reelPose(a, 1, craft);
    if (!p.behindCamera) assert.ok(project(p, craft).k <= q.k + 1e-9, `card at ${a} is closer than the front card`);
  }
});

test("the hero shot holds the whole ring inside its frame", () => {
  const hero = CUES[0];
  for (let a = -180; a < 180; a += STEP) {
    const p = reelPose(a, 1, hero), q = project(p, hero);
    assert.equal(p.behindCamera, false);
    const hw = (CARD_W / 2) * p.scale * q.k, hh = (CARD_H / 2) * p.scale * q.k;
    assert.ok(Math.abs(q.x) + hw < hero.boxW / 2, `card at ${a} leaves the frame sideways`);
    const top = hero.cy * hero.boxH + q.y - hh, bottom = hero.cy * hero.boxH + q.y + hh;
    assert.ok(top > 0 && bottom < hero.boxH, `card at ${a} leaves the frame: ${top}..${bottom}`);
  }
});

test("the teardown splits neighbours into two layers", () => {
  const inside = CUES.find((c) => c.id === "inside")!;
  const up = reelPose(wrap(-160), 1, inside, -1), down = reelPose(wrap(-160 + STEP), 1, inside, 1);
  assert.ok(up.y < -50 && down.y > 50);
  const together = reelPose(wrap(-160), 1, { ...inside, explode: 0 }, -1);
  near(together.y, 0, 1e-9);
});

test("beats: the nearest one, the short way to it, and their words", () => {
  assert.equal(beatAt(0.02), 0);
  assert.equal(beatAt(0.97), 0);
  assert.equal(beatAt(3.23), 1);
  near(loopDelta(0.9, 0.1), 0.2, 1e-12);
  near(loopDelta(0.1, 0.9), -0.2, 1e-12);
  near(beatTarget(4.95, 0), 5, 1e-12);
  near(beatTarget(4.95, 4), 4.86, 1e-12);
  CUES.forEach((c, i) => {
    near(beatWeight(c.at + 2, i), 1);
    CUES.forEach((_, j) => { if (j !== i) near(beatWeight(c.at, j), 0, 1e-12, `beat ${j} shows on beat ${i}`); });
  });
});

test("a shot fits the screen it is shown on", () => {
  const hero = CUES[0];
  near(fitOf(hero, 1440, 900), 1);
  near(fitOf(hero, 390, 844), 390 / hero.boxWTall);
  assert.ok(fitOf(hero, 4000, 3000) <= 1.5);
});

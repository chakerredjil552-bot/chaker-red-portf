import { test } from "node:test";
import assert from "node:assert/strict";
import { marks, planFor, snapPoints, stageAt, stopOf } from "./plan.ts";
import { WALL, WALL_TOP, angleGap, cellFor, nearestSlot, rowDir, rowTurn, rowY, slotAngle, slotPose } from "./wall.ts";
import { BOTTOM_Y, ROLL, ROOM_YAW, roomShot, rotY, shotAt, topHeight, type Shot } from "./cam.ts";
import { SPOT, markAt } from "./choreo.ts";

const near = (a: number, b: number, eps = 1e-6, msg?: string) =>
  assert.ok(Math.abs(a - b) <= eps, msg ?? `expected ${a} to be within ${eps} of ${b}`);
const plan = planFor(19);

test("the stages follow each other in order and cover the whole scroll", () => {
  const m = marks(plan);
  const order = ["intro", "descent", "land", "room", "exit", "end"];
  let last = 0;
  for (let s = 0; s <= m.total; s += 0.01) {
    const i = order.indexOf(stageAt(plan, s).name);
    assert.ok(i >= last, `went back to ${order[i]} at ${s}`);
    last = i;
  }
  assert.equal(stageAt(plan, m.total).name, "end");
  assert.equal(stageAt(plan, m.total).t, 1);
});

test("in the room every video gets its own stop, in order", () => {
  for (let k = 0; k < plan.count; k++) {
    const st = stageAt(plan, stopOf(plan, k));
    assert.equal(st.name, "room");
    assert.equal(st.active, k);
    near(st.room, k, 1e-9);
  }
  const snaps = snapPoints(plan);
  assert.equal(snaps.length, plan.count + 2);
  assert.equal(snaps[0], 0);
  for (let i = 1; i < snaps.length; i++) assert.ok(snaps[i] > snaps[i - 1]);
});

test("one video works too", () => {
  const one = planFor(1);
  assert.equal(stageAt(one, stopOf(one, 0)).active, 0);
  assert.equal(stageAt(one, stopOf(one, 5)).active, 0);
});

test("rows: the wall rises from the floor, row above row, neighbours turn opposite ways", () => {
  near(rowY(0) - WALL.panelH / 2, WALL.floorGap);
  for (let r = 1; r < WALL.rows; r++) near(rowY(r) - rowY(r - 1), WALL.panelH + WALL.rowGap);
  near(WALL_TOP, rowY(WALL.rows - 1) + WALL.panelH / 2);
  for (let r = 1; r < WALL.rows; r++) assert.equal(rowDir(r), -rowDir(r - 1));
  const a = rowTurn(2, 1, 0) - rowTurn(2, 0, 0), b = rowTurn(3, 1, 0) - rowTurn(3, 0, 0);
  assert.ok(a * b < 0, "scrolling turns neighbouring rows opposite ways");
});

test("panels sit on the wall and face the axis", () => {
  for (const turn of [0, 37, -400]) for (let c = 0; c < WALL.cols; c += 5) {
    const p = slotPose(3, c, turn);
    near(Math.hypot(p.x, p.z), WALL.radius, 1e-9);
    // the plane's normal (+z turned by yaw) points back at the axis
    const n = [Math.sin(p.yaw), Math.cos(p.yaw)];
    near(n[0] * -p.x + n[1] * -p.z, WALL.radius, 1e-9);
  }
  // they fit round the ring without overlapping
  assert.ok((2 * Math.PI * WALL.radius) / WALL.cols > WALL.panelW);
});

test("the panel nearest a direction is found whatever the turn", () => {
  for (const turn of [0, 10, 200, -75.5]) for (const dir of [0, 1, Math.PI, 5]) {
    const c = nearestSlot(turn, dir);
    assert.ok(angleGap(slotAngle(c, turn), dir) <= Math.PI / WALL.cols + 1e-9);
  }
  const cells = new Set<number>();
  for (let c = 0; c < 10; c++) cells.add(cellFor(0, c, 55));
  assert.equal(cells.size, 10, "neighbours show different pictures");
});

const dist = (a: Shot, b: Shot) => Math.max(
  Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]),
  Math.hypot(a.target[0] - b.target[0], a.target[1] - b.target[1], a.target[2] - b.target[2]),
);

for (const aspect of [16 / 9, 390 / 664]) {
  test(`the camera never jumps along the whole scroll (aspect ${aspect.toFixed(2)})`, () => {
    const m = marks(plan);
    let prev = shotAt(stageAt(plan, 0), plan, aspect);
    for (let s = 0.002; s <= m.total; s += 0.002) {
      const cur = shotAt(stageAt(plan, s), plan, aspect);
      assert.ok(dist(prev, cur) < 1.2, `jump of ${dist(prev, cur).toFixed(2)} at ${s.toFixed(3)}`);
      assert.ok(Math.abs(prev.fov - cur.fov) < 1, `fov jump at ${s}`);
      prev = cur;
    }
  });

  test(`the camera's up is never along its view (aspect ${aspect.toFixed(2)})`, () => {
    const m = marks(plan);
    for (let s = 0; s <= m.total; s += 0.01) {
      const sh = shotAt(stageAt(plan, s), plan, aspect);
      const d = [sh.target[0] - sh.pos[0], sh.target[1] - sh.pos[1], sh.target[2] - sh.pos[2]];
      const l = Math.hypot(d[0], d[1], d[2]);
      const cos = Math.abs((d[0] * sh.up[0] + d[1] * sh.up[1] + d[2] * sh.up[2]) / l);
      assert.ok(cos < 0.9, `up nearly along the view at ${s}`);
    }
  });
}

test("from above the well is seen whole at the end, larger at the start", () => {
  for (const aspect of [16 / 9, 0.5]) {
    const intro = shotAt(stageAt(plan, 0), plan, aspect), end = shotAt(stageAt(plan, marks(plan).total), plan, aspect);
    assert.ok(intro.pos[1] > WALL_TOP && end.pos[1] > intro.pos[1]);
    assert.ok(topHeight(aspect, 0.5) > topHeight(aspect, 1));
  }
  near(shotAt(stageAt(plan, marks(plan).land), plan, 16 / 9).pos[1], BOTTOM_Y, 1e-9);
});

test("in the room the camera stands inside the well, behind him, facing the wall, and stays there", () => {
  const sh = roomShot(ROOM_YAW, 16 / 9);
  assert.ok(Math.hypot(sh.pos[0], sh.pos[2]) < WALL.radius * 0.8);
  // the man is between the camera and the wall it looks at
  const toHim = [SPOT[0] - sh.pos[0], SPOT[2] - sh.pos[2]], view = [sh.target[0] - sh.pos[0], sh.target[2] - sh.pos[2]];
  assert.ok(toHim[0] * view[0] + toHim[1] * view[1] > 0);
  // the same shot for every video: the screens change, the camera does not go round the room
  for (let k = 0; k < plan.count; k++) assert.deepEqual(shotAt(stageAt(plan, stopOf(plan, k)), plan, 16 / 9), shotAt(stageAt(plan, stopOf(plan, 0)), plan, 16 / 9));
  const a = rotY([1, 2, 3], 0.7), b = rotY(a, -0.7);
  near(b[0], 1, 1e-9); near(b[1], 2, 1e-9); near(b[2], 3, 1e-9);
});

test("he stands on one spot the whole way, on the floor inside the well, like the man in the reel", () => {
  const m = marks(plan);
  for (let s = 0; s <= m.total; s += 0.01) {
    const mk = markAt(stageAt(plan, s));
    assert.equal(mk.x, SPOT[0]);
    assert.equal(mk.z, SPOT[2]);
    assert.ok(Math.hypot(mk.x, mk.z) < WALL.radius - 1.5);
    assert.ok(mk.reach >= 0 && mk.reach <= 1);
  }
});

test("he reaches up for the first screen only, standing with his back to the camera, facing the wall", () => {
  const m = marks(plan);
  let reached = 0;
  for (let s = 0; s <= m.total; s += 0.01) {
    const r = markAt(stageAt(plan, s)).reach;
    if (s < m.land || s >= m.room) assert.equal(r, 0, `reaching at ${s.toFixed(2)}`);
    reached = Math.max(reached, r);
  }
  near(reached, 1, 0.02);
  const mk = markAt(stageAt(plan, stopOf(plan, 0))), cam = roomShot(ROOM_YAW, 16 / 9);
  const view = [cam.target[0] - cam.pos[0], cam.target[2] - cam.pos[2]];
  const toHim = [mk.x - cam.pos[0], mk.z - cam.pos[2]];
  const len = Math.hypot(view[0], view[1]) * Math.hypot(toHim[0], toHim[1]);
  assert.ok((view[0] * toHim[0] + view[1] * toHim[1]) / len > 0.97, "he is in front of the camera");
  const f = [Math.sin(mk.face), Math.cos(mk.face)];
  assert.ok((f[0] * view[0] + f[1] * view[1]) / Math.hypot(view[0], view[1]) > 0.99, "he faces the wall");
});

test("the camera spirals down: screen-up turns by ROLL on the way down, and the room starts there", () => {
  const m = marks(plan);
  const top = shotAt(stageAt(plan, m.descent), plan, 16 / 9), bottom = shotAt(stageAt(plan, m.land), plan, 16 / 9);
  near(Math.atan2(-top.up[0], -top.up[2]), 0, 1e-9);
  near(Math.atan2(-bottom.up[0], -bottom.up[2]), ROLL, 1e-6);
  near(ROOM_YAW, ROLL, 1e-12);
});

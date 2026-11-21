import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CLIP, Man, STRIDE, WONDER_PACE, WONDER_PERIOD, wonder, type Drive } from "./man.ts";

const LIGHT = new THREE.Vector3(-0.55, -1, 0.42);
/** Long enough for his upper body to catch up with his head, and a whole number of breaths (the idle clip is 2.5 s,
 *  played at 0.85), so the clip is back where it was. */
const SETTLE = (4 * 2.5) / 0.85;

function load(): Promise<GLTF> {
  const b = readFileSync(new URL("../../../hero-assets/man.glb", import.meta.url));
  return new Promise((ok, fail) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, fail));
}

async function dressed() {
  const g = await load();
  const man = new Man(null, LIGHT);
  man.dress(g.scene, g.animations);
  const bone = (n: string) => g.scene.getObjectByName(n)!;
  const at = (n: string) => { man.group.updateMatrixWorld(true); return bone(n).getWorldPosition(new THREE.Vector3()); };
  const drive = (d: Partial<Drive>) => man.update({ dist: 0, walk: 0, reach: 0, look: 0, lift: 0, dt: 0, ...d });
  return { g, man, bone, at, drive };
}

test("the model is one dressed, skinned mesh with the three clips", async () => {
  const g = await load();
  const meshes: THREE.SkinnedMesh[] = [];
  g.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  assert.equal(meshes.length, 1, "one mesh: one draw call for him, one for his shadow");
  // the bare body has 8547 vertices; the coat, collar, hair, ears and nose come on top of it
  assert.ok(meshes[0].geometry.attributes.position.count > 12000);
  for (const name of Object.values(CLIP)) assert.ok(g.animations.some((a) => a.name === name), `clip ${name}`);
});

test("his walk is played by the distance he moves, so the planted foot stays put", async () => {
  const { man, at, drive } = await dressed();
  assert.ok(man.ready);
  // walking straight ahead (+z): through the first third of a cycle the left foot is on the floor
  const zs: number[] = [];
  for (let d = 0.02; d <= 0.34; d += 0.04) {
    man.root.position.set(0, 0, d);
    drive({ dist: d, walk: 1 });
    zs.push(at("DEF-footL").z);
  }
  const slide = Math.max(...zs) - Math.min(...zs);
  assert.ok(slide < 0.03, `the planted foot slid ${slide.toFixed(3)} m over 0.32 m walked (stride ${STRIDE})`);
  // and the other foot swings through
  man.root.position.set(0, 0, 0.02); drive({ dist: 0.02, walk: 1 });
  const r0 = at("DEF-footR").z;
  man.root.position.set(0, 0, 0.34); drive({ dist: 0.34, walk: 1 });
  assert.ok(at("DEF-footR").z - r0 > 0.45, "the swinging foot moves on");
});

test("standing, his arms hang at his sides", async () => {
  const { at, drive } = await dressed();
  drive({});
  for (const s of ["L", "R"]) {
    const hand = at(`DEF-hand${s}`), arm = at(`DEF-upper_arm${s}`);
    assert.ok(hand.y < 1.0 && hand.y > 0.7, `${s} hand at ${hand.y.toFixed(2)} m`);
    assert.ok(Math.abs(hand.x) < 0.36 && Math.abs(hand.x - arm.x) < 0.17, `${s} hand ${hand.x.toFixed(2)} out from the body`);
    assert.ok(Math.abs(hand.z - arm.z) < 0.16, `${s} hand hangs, not held forward`);
  }
});

test("reaching, his left hand goes up and out toward the screen", async () => {
  const { at, drive } = await dressed();
  drive({ reach: 1 });
  const hand = at("DEF-handL");
  assert.ok(hand.y > 1.15 && hand.z > 0.3, `left hand at ${hand.toArray().map((v) => v.toFixed(2))}`);
  assert.ok(at("DEF-handR").y < 1.0, "the right one stays down");
});

test("his head turns left and right, and up, on top of the clip", async () => {
  const { bone, drive, man } = await dressed();
  const facing = () => {
    man.group.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(bone("DEF-head").getWorldQuaternion(new THREE.Quaternion()));
  };
  drive({});
  const q0 = bone("DEF-head").getWorldQuaternion(new THREE.Quaternion()).invert();
  const turned = (d: Partial<Drive>) => {
    drive(d);
    man.group.updateMatrixWorld(true);
    // the change of the head's turn against looking straight ahead, applied to straight ahead
    const q = bone("DEF-head").getWorldQuaternion(new THREE.Quaternion()).multiply(q0);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  };
  // given time, the whole of him turns the full amount: head and neck at once, the upper body a moment later
  const left = turned({ look: 0.8, dt: SETTLE });
  assert.ok(Math.abs(Math.atan2(left.x, left.z) - 0.8) < 0.06, `turned ${Math.atan2(left.x, left.z).toFixed(2)} to his left`);
  const right = turned({ look: -0.8, dt: SETTLE });
  assert.ok(Math.abs(Math.atan2(right.x, right.z) + 0.8) < 0.06, "and to his right");
  const up = turned({ lift: 0.3, dt: SETTLE });
  assert.ok(Math.abs(Math.asin(up.y) - 0.3) < 0.05, `looks up ${Math.asin(up.y).toFixed(2)}`);
  // held for many frames, the turn stays the same (it does not pile up while the clip stands still)
  const once = turned({ look: 0.5 });
  for (let i = 0; i < 30; i++) drive({ look: 0.5 });
  const after = turned({ look: 0.5 });
  assert.ok(once.distanceTo(after) < 1e-6, "the turn does not pile up");
  // turned the same way when he faces elsewhere on the floor
  man.root.rotation.y = 2;
  drive({});
  const base = facing();
  drive({ look: 0.5, dt: SETTLE });
  const now = facing();
  assert.ok(Math.abs(Math.atan2(now.x, now.z) - Math.atan2(base.x, base.z) - 0.5) < 0.06);
});

test("he wonders where he is: slow turns both ways with holds, smooth and repeating", () => {
  let maxL = 0, maxR = 0, last = wonder(0), held = 0;
  for (let t = 0.01; t < WONDER_PERIOD; t += 0.01) {
    const w = wonder(t);
    // never faster than about 1.8 radians a second times his pace: quick but smooth
    assert.ok(Math.abs(w.look - last.look) < 0.019 * WONDER_PACE && Math.abs(w.lift - last.lift) < 0.019 * WONDER_PACE, `jump at ${t.toFixed(2)}`);
    // he never looks up at the screens
    assert.ok(w.lift >= 0 && w.lift <= 0.05, `looks up ${w.lift.toFixed(2)}`);
    if (Math.abs(w.look - last.look) < 1e-4) held += 0.01;
    maxL = Math.max(maxL, w.look); maxR = Math.min(maxR, w.look);
    last = w;
  }
  // to both sides, and round over each shoulder
  assert.ok(maxL > 1.7 && maxR < -1.7, "looks behind him over both shoulders");
  assert.ok(held > 0.5, `holds his look for ${held.toFixed(1)} s of every ${WONDER_PERIOD}`);
  const again = wonder(3.3 + WONDER_PERIOD), first = wonder(3.3);
  assert.ok(Math.abs(again.look - first.look) < 1e-9 && Math.abs(again.lift - first.lift) < 1e-9, "repeats");
});

test("his shoulders follow his head a moment later and a little less, then catch up", async () => {
  const { bone, drive, man } = await dressed();
  const yawOf = (n: string) => {
    man.group.updateMatrixWorld(true);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(bone(n).getWorldQuaternion(new THREE.Quaternion()));
    return Math.atan2(f.x, f.z);
  };
  drive({ dt: SETTLE });
  const head0 = yawOf("DEF-head"), chest0 = yawOf("DEF-spine003");
  // a tenth of a second into a turn: the head is well on its way, the chest has barely moved
  drive({ look: 0.8, dt: 0.1 });
  const head1 = yawOf("DEF-head") - head0, chest1 = yawOf("DEF-spine003") - chest0;
  assert.ok(head1 > 0.45, `head ${head1.toFixed(2)}`);
  assert.ok(chest1 > 0 && chest1 < 0.24, `chest ${chest1.toFixed(3)}`);
  // held: the chest has turned its share, a little under half the way, and no more
  for (let i = 0; i < 60; i++) drive({ look: 0.8, dt: 1 / 30 });
  const chest2 = yawOf("DEF-spine003") - chest0;
  assert.ok(chest2 > 0.3 && chest2 < 0.38, `chest ${chest2.toFixed(2)}`);
});

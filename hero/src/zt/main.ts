/*
 * The zoetrope: the page is one long scroll over a fixed WebGL scene. The scroll is read every frame, eased, and
 * turned into a stage (plan.ts), a camera (cam.ts) and the turn of every row of screens (wall.ts).
 */

import * as THREE from "three";
import { VIDEOS, firstPicture, isWide, wallPictures } from "./data.ts";
import { clamp01, lerp, marks, planFor, smoother, snapPoints, stageAt, stopOf, type Stage } from "./plan.ts";
import { WALL, nearestSlot, rowTurn, slotPose } from "./wall.ts";
import { frontScreen, rotY, shotAt, type V3 } from "./cam.ts";
import { markAt } from "./choreo.ts";
import { Atlas, Featured, Wall, coverFit, makeFloor } from "./scene.ts";
import { Man, cover, wonder } from "./man.ts";
import { Dust } from "./dust.ts";
import { Post } from "./post.ts";
import { UI, type Weights } from "./ui.ts";

const html = document.documentElement;
const host = document.getElementById("deal");
const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const BG = new THREE.Color("#0c0a0b");
const BG_END = new THREE.Color("#1d0d11");
/** The light that throws his long shadow: from high up, behind and to the right, so it falls toward the front left. */
const LIGHT = new THREE.Vector3(-0.55, -1, 0.42);
/** Where this script was loaded from: the model of the man sits next to it. */
const HERE = (document.currentScript as HTMLScriptElement | null)?.src || location.href;

/** Smooth, never-repeating wobble: three sines at odd rates. */
const wobble = (t: number, a: number, b: number, c: number, o: number) =>
  Math.sin(t * a + o) * 0.5 + Math.sin(t * b + o * 2.1) * 0.3 + Math.sin(t * c + o * 3.7) * 0.2;

function webgl(): THREE.WebGLRenderer | null {
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    return r.getContext() ? r : null;
  } catch { return null; }
}

/** A video's glow: its cover's average colour, made vivid. */
function glowOf(src: string, done: (c: THREE.Color) => void) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 12;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, 12, 12);
    const d = x.getImageData(0, 0, 12, 12).data;
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      // vivid pixels count more than grey ones
      const s = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) + 8;
      r += d[i] * s; g += d[i + 1] * s; b += d[i + 2] * s; w += s;
    }
    const col = new THREE.Color().setRGB(r / w / 255, g / w / 255, b / w / 255, THREE.SRGBColorSpace);
    const hsl = { h: 0, s: 0, l: 0 };
    col.getHSL(hsl);
    done(new THREE.Color().setHSL(hsl.h, Math.max(0.75, hsl.s), 0.55));
  };
  img.src = src;
}

function start() {
  if (!host) return;
  const renderer = webgl();
  if (!renderer || !VIDEOS.length) { html.classList.add("zt-fallback"); return; }
  html.classList.add("zt-on");
  try { history.scrollRestoration = "manual"; } catch { /* old browsers */ }

  const plan = planFor(VIDEOS.length);
  const m = marks(plan);
  const phone = Math.min(screen.width, screen.height) < 700;

  // the scroll: a tall, empty page; the scene and the words stay fixed over it
  host.classList.add("zt");
  host.insertAdjacentHTML("afterbegin", `<div class="zt-scroll" aria-hidden="true">${snapPoints(plan).map((s) => `<i class="zt-snap" style="top:calc(var(--vh) * ${s.toFixed(3)})"></i>`).join("")}</div>`);
  const scroller = host.querySelector<HTMLElement>(".zt-scroll")!;
  renderer.domElement.className = "zt-canvas";
  host.prepend(renderer.domElement);
  // the grain and glow hide the difference between 1.5 and 2 pixels a point; the frame rate does not
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(BG);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);
  const pictures = wallPictures(VIDEOS);
  const atlas = new Atlas(pictures, phone ? 1024 : 2048, renderer.capabilities.maxTextureSize);
  const fog = BG.clone();
  const wall = new Wall(atlas, fog);
  // his shaders are built before he appears, off the main thread where the browser can, so he never costs a frame
  const man = new Man(new URL("man.glb?v=1", HERE).href, LIGHT, (model) => renderer.compileAsync(model, camera, scene));
  const floor = makeFloor();
  const floorU = (floor.material as THREE.ShaderMaterial).uniforms;
  // white specks floating in the air of the well
  const dust = new Dust(phone ? 340 : 680);
  scene.add(wall.mesh, floor, man.group, dust.points);
  const post = new Post(renderer, phone ? 0.22 : 0.3, phone);

  // two video elements: the one on the screen, and the next one, loaded during the swap
  const mkVideo = () => {
    const v = document.createElement("video");
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
    v.setAttribute("playsinline", "");
    return v;
  };
  let vA = mkVideo(), vB = mkVideo();
  let tA = new THREE.VideoTexture(vA), tB = new THREE.VideoTexture(vB);
  tA.colorSpace = tB.colorSpace = THREE.SRGBColorSpace;
  const featured = new Featured(atlas, tA, tB);
  scene.add(featured.group);
  const U = featured.uniforms;
  // nothing is built or sent to the GPU in the middle of a move: the wall's picture sheet goes up once now (new
  // pictures then only send their own cell), and every shader, the screen's too, is built before it is first seen
  atlas.upload(renderer);
  featured.group.visible = true;
  renderer.compileAsync(scene, camera).catch(() => undefined);
  featured.group.visible = false;

  const colors = VIDEOS.map(() => new THREE.Color("#ff7a1a"));
  VIDEOS.forEach((v, k) => glowOf(firstPicture(v), (c) => { colors[k] = c; if (k === shown) U.uColA.value.copy(c); }));
  // the pictures of the wall: video k's first picture is cell k (the videos take turns, first pictures first)
  const pictureVideo = pictures.map((p) => VIDEOS.findIndex((v) => p.includes(`/${v.id}-`) || p === v.thumb));

  const sizeOf = (k: number, tall: boolean): [number, number] => {
    const s = tall ? 0.62 : 1;
    return isWide(VIDEOS[k]) ? [6.2 * s, 3.49 * s] : [2.42 * s * 1.15, 4.3 * s * 1.15];
  };

  let sound = false;
  let shown = 0, readyA = 0;
  let swap: null | { k: number; asked: number; t0: number } = null;
  const load = (el: HTMLVideoElement, k: number) => {
    const src = new URL(VIDEOS[k].file, location.href).href;
    if (el.src !== src) { el.src = src; el.load(); }
  };
  // the first video loads only once the camera is on its way down, so the intro stays light
  let primed = false;
  U.uCellA.value.set(...atlas.cell(0));

  const ui = new UI(host, VIDEOS, {
    enter: (withSound) => {
      setSound(withSound);
      scrollTo({ top: m.descent * vh + 2, behavior: reduced ? "auto" : "smooth" });
    },
    goTo: (k) => scrollTo({ top: stopOf(plan, k) * vh, behavior: reduced ? "auto" : "smooth" }),
    play: (k) => { vA.pause(); window.openVideo?.(VIDEOS[k].id); },
    sound: () => setSound(!sound),
  });
  function setSound(on: boolean) {
    sound = on;
    vA.muted = !on;
    if (on) vA.play()?.catch(() => {});
    ui.setSound(on);
  }

  // size: the page's viewport height is fixed between rotations, so the mobile address bar never shifts the story
  let vh = innerHeight, vw = innerWidth;
  const resize = () => {
    if (Math.abs(innerHeight - vh) > 140 || innerWidth !== vw || !scroller.style.height) vh = innerHeight;
    vw = innerWidth;
    host.style.setProperty("--vh", vh + "px");
    scroller.style.height = `${(m.total + 1) * vh}px`;
    renderer.setSize(innerWidth, innerHeight);
    post.resize();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize);

  // a click on a screen: the one in front plays, one on the wall comes forward
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pick = (e: PointerEvent | MouseEvent) => {
    ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects([featured.group, wall.mesh], true)[0];
    if (!hit) return null;
    if (hit.object !== wall.mesh) return { front: true, k: shown };
    const id = hit.instanceId ?? -1;
    const cell = wall.cellOf(id);
    return { front: false, k: pictureVideo[cell] ?? -1 };
  };
  renderer.domElement.addEventListener("click", (e) => {
    const p = pick(e);
    if (!p || p.k < 0) return;
    if (p.front && featured.group.visible) ui_play(p.k);
    else if (stage.name === "room" || stage.name === "land") scrollTo({ top: stopOf(plan, p.k) * vh, behavior: reduced ? "auto" : "smooth" });
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const p = pick(e);
    renderer.domElement.style.cursor = p && p.k >= 0 && (p.front || stage.name === "room") ? "pointer" : "";
  });
  const ui_play = (k: number) => { vA.pause(); window.openVideo?.(VIDEOS[k].id); };

  let eased = scrollY / vh;
  let stage: Stage = stageAt(plan, eased);
  let slot = 0;                // the panel of the bottom row the screen comes off
  let flying = false;
  let last = performance.now();
  const clock = { t: 0 };
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), dummy = new THREE.Object3D();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  // the man stands on one spot the whole way, facing the wall
  const spot = markAt();
  const fig = { x: spot.x, z: spot.z };
  man.root.position.set(spot.x, 0, spot.z);
  man.root.rotation.y = spot.face;
  floorU.uFig.value.set(spot.x, spot.z);
  // the camera's own motion, for the streaks; a push-in each time a new video comes forward
  const prevPos = new THREE.Vector3(), prevDir = new THREE.Vector3(), dir = new THREE.Vector3();
  let pushAt = -1e9;
  // a slow device gives up sharpness first, then the glow, so it keeps moving smoothly
  const perf = { sum: 0, n: 0, ratio: renderer.getPixelRatio(), glow: true };

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    const dt = Math.min(0.064, raw);
    last = now;
    if (!document.hidden && raw < 1) {
      perf.sum += raw; perf.n++;
      if (perf.sum > 2.5) {
        const avg = perf.sum / perf.n;
        perf.sum = 0; perf.n = 0;
        if (avg > 1 / 40 && perf.ratio > 1) { perf.ratio = Math.max(1, perf.ratio - 0.25); renderer.setPixelRatio(perf.ratio); resize(); }
        else if (avg > 1 / 40 && perf.glow) perf.glow = false;
      }
    }
    if (!reduced) clock.t += dt;
    const aspect = innerWidth / innerHeight, tall = aspect < 1;

    // the scroll, eased: the camera glides, it never snaps
    const s = scrollY / vh;
    const before = eased;
    eased = reduced ? s : eased + (s - eased) * (1 - Math.exp(-9 * dt));
    if (Math.abs(s - eased) < 1e-4) eased = s;
    const speed = dt > 0 ? Math.abs(eased - before) / dt : 0; // viewport heights a second
    stage = stageAt(plan, eased);
    // the page settles on each video only in the room: on the way down nothing pulls the scroll, so the camera
    // stays exactly where you leave it
    const snapping = s > m.room - 0.04 && s < m.exit;
    if (snapping !== html.classList.contains("zt-snapping")) html.classList.toggle("zt-snapping", snapping);
    const shot = shotAt(stage, plan, aspect);
    const yaw = Math.atan2(-(shot.target[0] - shot.pos[0]), -(shot.target[2] - shot.pos[2]));

    // the man: he stands where he is and looks round slowly, left, right, over one shoulder and the other, his
    // upper body turning with his head, wondering where he is; he never looks at the screens
    // now and then he lifts a hand in front of his face, the right, then the left, as if against a wind or a glare
    const w = wonder(clock.t), hands = cover(clock.t);
    man.update({
      dist: 0, walk: 0, reach: 0, look: reduced ? 0 : w.look, lift: reduced ? 0 : w.lift, dt: reduced ? 0 : dt,
      coverL: reduced ? 0 : hands.left, coverR: reduced ? 0 : hands.right,
    });

    // the camera: it keeps him in view as it comes down to him, sways like it is held by hand (more when it moves),
    // and leans in a little each time a new video comes forward
    const follow = stage.name === "land" ? band(stage.t, 0, 0.1, 0.55, 0.82)
      : stage.name === "exit" ? 0.85 * band(stage.t, 0.02, 0.1, 0.3, 0.45) : 0;
    const target: V3 = [lerp(shot.target[0], fig.x, follow), lerp(shot.target[1], 1.1, follow), lerp(shot.target[2], fig.z, follow)];
    const low = stage.name === "land" || stage.name === "room" || (stage.name === "exit" && stage.t < 0.45);
    const amp = reduced ? 0 : (0.02 + 0.05 * Math.min(1, speed)) * (low ? 1 : Math.max(1, shot.pos[1] * 0.045));
    const push = Math.sin(Math.PI * clamp01((now - pushAt) / 1100));
    const t = clock.t;
    v1.set(...shot.pos).add(v2.set(wobble(t, 0.9, 1.7, 2.9, 0), wobble(t, 1.1, 2.3, 3.7, 1) * 0.6, wobble(t, 0.7, 1.9, 3.1, 2)).multiplyScalar(amp));
    v2.set(...target).add(dir.set(wobble(t, 0.6, 1.3, 2.2, 3), wobble(t, 0.8, 1.6, 2.6, 4), wobble(t, 0.5, 1.2, 2.4, 5)).multiplyScalar(amp * 2.2));
    v1.lerp(v2, 0.04 * push);
    camera.position.copy(v1);
    // up follows the camera's own pitch: looking straight down, screen-up is the way it is heading along the floor
    // (the spiral's turn); looking level, it is the sky. So following him never flips the picture.
    dir.subVectors(v2, v1).normalize();
    const flat = Math.hypot(dir.x, dir.z);
    const head = flat > 0.2 ? q1.set(dir.x / flat, 0, dir.z / flat, 0) : q1.set(shot.up[0], 0, shot.up[2], 0);
    const level = clamp01((1 - Math.abs(dir.y)) * 1.7);
    camera.up.set(head.x * (1 - level), level, head.z * (1 - level)).normalize();
    camera.lookAt(v2);
    camera.rotateZ(wobble(t, 0.5, 1.1, 1.9, 6) * amp * 0.18);
    if (Math.abs(camera.fov - shot.fov) > 0.01) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
    // how fast the camera rushes and turns: that is what streaks the picture
    camera.getWorldDirection(dir);
    const rush = dt > 0 ? prevPos.distanceTo(camera.position) / dt : 0;
    const turnRate = dt > 0 ? prevDir.angleTo(dir) / dt : 0;
    prevPos.copy(camera.position); prevDir.copy(dir);

    // the rows turn while you descend and rise; in the room they only drift
    const rowScroll = eased < m.room ? eased : eased > m.exit ? m.room + (eased - m.exit) : m.room;
    wall.place(rowScroll, clock.t);

    // the end is lit warmer: the set fades to a deep maroon as the camera rises out
    const warm = stage.name === "end" ? 1 : stage.name === "exit" ? smoother((stage.t - 0.4) / 0.6) : 0;
    fog.copy(BG).lerp(BG_END, warm);
    renderer.setClearColor(fog);

    // the screen in front: as the camera comes level in the room, a screen of the bottom row flares white, comes off
    // the wall and floats forward, high enough that his head never covers it; on the way out it goes back
    const flash = stage.name === "land" ? band(stage.t, 0.5, 0.6, 0.64, 0.72) : 0;
    const fly = stage.name === "land" ? smoother((stage.t - 0.62) / 0.33) : stage.name === "room" ? 1 : stage.name === "exit" ? 1 - smoother(stage.t / 0.38) : 0;
    const turn0 = rowTurn(0, rowScroll, clock.t);
    if (fly <= 0 && flash <= 0) {
      if (flying) { wall.setDim(0, slot, 1); wall.restoreCell(0, slot); flying = false; }
      slot = nearestSlot(turn0, Math.PI + yaw);
    } else if (!flying) {
      flying = true;
      wall.setCellPicture(0, slot, atlas.cell(shown));
    }
    if (flying) wall.setDim(0, slot, fly > 0.04 ? 0.08 : 1 + 3.2 * flash);
    wall.uniforms.uTime.value = clock.t;
    dust.update(clock.t, renderer.getPixelRatio());
    featured.group.visible = fly > 0.001;
    if (!featured.group.visible) man.light(U.uColA.value, 0, v1.set(0, 0, -1));
    if (featured.group.visible) {
      const from = slotPose(0, slot, turn0);
      const swapT = swap && swap.t0 ? clamp01((now - swap.t0) / 700) : 0;
      const a = sizeOf(shown, tall), b = swap ? sizeOf(swap.k, tall) : a;
      const sh = lerp(a[1], b[1], smoother(swapT));
      const place = frontScreen(aspect, sh);
      const w = lerp(a[0], b[0], smoother(swapT)) * place.scale, h = sh * place.scale;
      const front = rotY([0, place.y, place.z], yaw);
      v1.set(from.x, from.y, from.z);
      v2.set(...front);
      dummy.position.copy(v2);
      dummy.lookAt(camera.position);
      q2.copy(dummy.quaternion);
      q1.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, from.yaw);
      featured.group.position.lerpVectors(v1, v2, fly);
      featured.group.position.y += Math.sin(Math.PI * fly) * 0.9;
      featured.group.quaternion.slerpQuaternions(q1, q2, fly);
      featured.size(lerp(WALL.panelW, w, fly), lerp(WALL.panelH, h, fly));
      featured.uniforms.uFrame.value = 0.045 * fly;
      featured.glowOpacity(fly);
      // its light on him, in its colour
      man.light(U.uColA.value, 0.9 * fly + 2.5 * flash, v1.set(featured.group.position.x - fig.x, featured.group.position.y - 1.4, featured.group.position.z - fig.z));
      U.uFitA.value.copy(coverFit(isWide(VIDEOS[shown]) ? 16 / 9 : 9 / 16, w / h));
      if (swap) U.uFitB.value.copy(coverFit(isWide(VIDEOS[swap.k]) ? 16 / 9 : 9 / 16, w / h));
    }

    if (!primed && stage.name !== "intro" && !(stage.name === "descent" && stage.t < 0.4)) { primed = true; load(vA, shown); }

    // play the video in front only while it is out
    const want = fly > 0.25 && !document.querySelector(".player.open");
    if (want && vA.paused) vA.play()?.catch(() => {});
    if (!want && !vA.paused) vA.pause();
    readyA = vA.readyState >= 2 ? Math.min(1, readyA + dt * 4) : 0;
    U.uReadyA.value = readyA;

    // another video's turn: load it, then swap through the strips
    const next = stage.active;
    if (!swap && next !== shown) {
      swap = { k: next, asked: now, t0: 0 };
      if (stage.name === "room") pushAt = now;
      load(vB, next);
      vB.muted = !sound;
      vB.play()?.catch(() => {});
      U.uCellB.value.set(...atlas.cell(next));
      U.uColB.value.copy(colors[next]);
      U.uReadyB.value = 0;
    }
    if (swap) {
      if (!swap.t0 && (vB.readyState >= 2 || now - swap.asked > 450 || reduced)) swap.t0 = now;
      U.uReadyB.value = vB.readyState >= 2 ? 1 : 0;
      const t = swap.t0 ? (reduced ? 1 : clamp01((now - swap.t0) / 700)) : 0;
      U.uMix.value = t;
      if (t >= 1) {
        // the next video is now the one on the screen
        [vA, vB] = [vB, vA];
        [tA, tB] = [tB, tA];
        U.uA.value = tA; U.uB.value = tB;
        U.uCellA.value.copy(U.uCellB.value);
        U.uColA.value.copy(U.uColB.value);
        U.uFitA.value.copy(U.uFitB.value);
        readyA = U.uReadyB.value;
        U.uMix.value = 0;
        vB.pause();
        vA.muted = !sound;
        shown = swap.k;
        if (flying) wall.setCellPicture(0, slot, atlas.cell(shown));
        swap = null;
      }
    }

    ui.setActive(stage.active, `#${colors[stage.active].getHexString()}`);
    ui.frame(weights(stage));
    atlas.flush(renderer, now);
    const zoom = reduced ? 0 : Math.min(0.08, rush * 0.0026 + turnRate * 0.0075);
    post.render(scene, camera, { bloom: perf.glow ? 0.85 : 0, zoom, chroma: 0.012 + zoom * 0.3, vignette: 0.5 + 0.12 * warm, time: clock.t });
  };
  requestAnimationFrame(frame);
}

const band = (t: number, a: number, b: number, c: number, d: number) =>
  Math.max(0, Math.min(1, smoother((t - a) / (b - a)), 1 - smoother((t - c) / (d - c))));

/** Which words show at a stage. */
function weights(s: Stage): Weights {
  const w: Weights = { intro: 0, hint: 0, b1: 0, b2: 0, b3: 0, room: 0, end: 0 };
  if (s.name === "intro") { w.intro = 1 - smoother((s.t - 0.55) / 0.45); w.hint = 1 - smoother(s.t / 0.4); }
  if (s.name === "descent") { w.b1 = band(s.t, 0.08, 0.2, 0.42, 0.52); w.b2 = band(s.t, 0.5, 0.6, 0.86, 0.97); }
  if (s.name === "land") { w.b3 = band(s.t, 0.02, 0.15, 0.62, 0.78); w.room = smoother((s.t - 0.82) / 0.18); }
  if (s.name === "room") w.room = 1;
  if (s.name === "exit") { w.room = 1 - smoother(s.t / 0.2); w.end = smoother((s.t - 0.72) / 0.28); }
  if (s.name === "end") w.end = 1;
  return w;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();

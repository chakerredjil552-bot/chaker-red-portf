import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { useAnimationFrame, type MotionValue } from "framer-motion";
import { CARD_H, CARD_W, SLOTS, STEP, facing, frontSlot, project, reelPose, slotAngle, slotReel, type Scene } from "./pose.ts";
import { CUES, beatAt, beatTarget, beatWeight, fitOf, shotAt } from "./story.ts";
import type { Reel } from "./reels.ts";

/** Idle turn on the hero and talk beats, deg/s: the front cards drift right. */
const SPIN = 3.2;
/** At most this many previews play at once: the cards facing the camera, nearest first. */
const MAX_PLAY = 6;
/** Wheel travel for one whole loop of the story, px; finger travel is shorter. */
const LOOP_PX = 4600;
const SWIPE_PX = 2400;
/** Once the visitor stops, the camera settles on the nearest beat after this long. */
const SETTLE_MS = 650;
/** Part names pinned to the cards on the work beat. */
const CALLOUTS = 6;

/** Where the story is heading. The rail, the keys, the wheel and swipes all move `target`; the camera follows it. */
export interface Timeline { target: number; lastInput: number }

interface WallProps {
  reels: Reel[];
  formation: MotionValue<number>; // the deal, 0..1
  reveal: MotionValue<number>;    // the entrance settling into the first beat, 0..1
  progress: MotionValue<number>;  // where the camera is on the story, written here every frame
  timeline: MutableRefObject<Timeline>;
  locked: boolean;                // the entrance is playing: no input
  reduced: boolean;
  preload: Set<string>;           // reels whose cover and preview the loader waits for
  onAsset: (key: string) => void;
  onOpen: (reel: Reel) => void;
  onFront: (reel: number) => void; // the reel at the front of the ring changed
  section: RefObject<HTMLElement | null>;
  playLabel: string;
}

interface Written { yaw: number; y: number; r: number; d: number; o: number; vis: boolean; play: boolean }
interface Seen { s: number; k: number; x: number; y: number }

const nextBeat = (u: number, dir: 1 | -1): number => {
  const i = beatAt(u), here = beatTarget(u, i);
  // already past the nearest beat in this direction: that one is next
  if ((here - u) * dir > 0.004) return here;
  const j = (i + dir + CUES.length) % CUES.length;
  const p = ((u % 1) + 1) % 1;
  let d = CUES[j].at - p;
  if (dir > 0 && d <= 0) d += 1;
  if (dir < 0 && d >= 0) d -= 1;
  return u + d;
};

export function Wall(props: WallProps) {
  const { reels, formation, reveal, progress, timeline, locked, reduced, preload, onAsset, onOpen, onFront, section, playLabel } = props;
  const n = reels.length;
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLAnchorElement | null)[]>([]);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const tags = useRef<HTMLDivElement>(null);
  const tagEls = useRef<(HTMLDivElement | null)[]>([]);
  const lines = useRef<(SVGPolylineElement | null)[]>([]);
  const dots = useRef<(SVGCircleElement | null)[]>([]);

  const [slots, setSlots] = useState(() => Array.from({ length: SLOTS }, (_, s) => slotReel(s, 0, n)));
  const held = useRef(slots);
  held.current = slots;

  const written = useRef<Written[]>(Array.from({ length: SLOTS }, () => ({ yaw: NaN, y: NaN, r: NaN, d: NaN, o: NaN, vis: true, play: false })));
  const shared = useRef<Record<string, number>>({});
  const view = useRef({ w: 1440, h: 900 });
  const turn = useRef({ target: 0, shown: 0, degPerPx: 0.1 });
  const pointer = useRef({ x: -1, y: -1, on: false });
  const hover = useRef(-1);
  const front = useRef(-1);
  const frontSlotOn = useRef(-1);
  const frame = useRef(0);
  const inView = useRef(true);
  const tagState = useRef({ shown: false, keys: [] as string[] });
  const drag = useRef<null | { id: number; x0: number; y0: number; t0: number; o0: number; moved: boolean; lp: number; lt: number; v: number; axis: 0 | 1 | 2 }>(null);
  const swallowClick = useRef(false);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useLayoutEffect(() => {
    const size = () => { view.current = { w: window.innerWidth, h: window.innerHeight }; };
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; }, { threshold: 0 });
    io.observe(el);
    // hover is for a mouse: a finger that swipes across a card must not leave it lit up
    const move = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY, on: e.pointerType === "mouse" }; };
    const out = () => { pointer.current.on = false; };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", out);
    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", out);
    };
  }, [section]);

  useAnimationFrame((_, delta) => {
    const sec = section.current, ringEl = ring.current, stageEl = stage.current;
    if (!sec || !ringEl || !stageEl) return;
    // off screen or in a hidden tab: rest, and stop every preview
    if (!inView.current || document.hidden) {
      written.current.forEach((w, s) => { if (w.play) { w.play = false; videos.current[s]?.pause(); } });
      return;
    }
    const { w: vw, h: vh } = view.current;
    const dt = Math.min(delta, 64) / 1000;
    const tl = timeline.current, tr = turn.current;
    const now = performance.now();
    const rv = reveal.get(), f = formation.get();

    // the camera follows the target, and settles on the nearest beat once the visitor stops
    if (!drag.current && !lockedRef.current && now - tl.lastInput > SETTLE_MS) {
      const goal = beatTarget(tl.target, beatAt(tl.target));
      tl.target = Math.abs(goal - tl.target) < 1e-5 ? goal : tl.target + (goal - tl.target) * (1 - Math.exp(-3 * dt));
    }
    let u = progress.get();
    u = Math.abs(tl.target - u) < 1e-6 ? tl.target : u + (tl.target - u) * (1 - Math.exp(-(reduced ? 16 : 5) * dt));
    if (u !== progress.get()) progress.set(u);
    const shot = shotAt(u);

    // the touch: a sideways drag turns the ring. On the hero and talk beats it also drifts on its own; on every other
    // beat it settles on a whole step, so a card faces the front
    const calm = Math.max(beatWeight(u, 0), beatWeight(u, CUES.length - 1));
    if (!drag.current) {
      if (!reduced && calm > 0) tr.target += SPIN * calm * rv * (hover.current >= 0 ? 0.25 : 1) * dt;
      if (calm < 1) {
        const step = Math.round(tr.target / STEP) * STEP;
        tr.target += (step - tr.target) * (1 - Math.exp(-4 * dt)) * (1 - calm);
      }
    }
    tr.shown += (tr.target - tr.shown) * (1 - Math.exp(-(drag.current ? 18 : 7) * dt));
    const R = shot.turn + tr.shown;

    // the entrance settles into the first beat: the ring grows a little and levels out
    const wide = !(vh > vw * 1.2);
    const k = fitOf(shot, vw, vh) * (1 - 0.16 * (1 - rv));
    const scene: Scene = {
      radius: shot.radius * k, perspective: shot.perspective * k, dolly: shot.dolly * k, scale: shot.scale * k,
      tilt: shot.tilt - 14 * (1 - rv), roll: shot.roll - 9 * (1 - rv), explode: shot.explode,
    };
    const cx = wide ? shot.cx * vw : 0, cy = (wide ? shot.cy : shot.cyTall) * vh;
    // a sideways drag of one pixel turns the card at the front by one pixel
    const kFront = scene.perspective / Math.max(1, scene.perspective - scene.radius * Math.cos((scene.tilt * Math.PI) / 180) - scene.dolly);
    tr.degPerPx = 180 / (Math.PI * Math.max(40, scene.radius * kFront));

    const sh = shared.current;
    const put = (key: string, el: HTMLElement, v: number) => {
      if (sh[key] !== v) { sh[key] = v; el.style.setProperty("--" + key, String(v)); }
    };
    put("persp", stageEl, Math.round(scene.perspective * 10) / 10);
    put("cx", stageEl, Math.round(cx * 10) / 10);
    put("cy", stageEl, Math.round(cy * 10) / 10);
    put("s", ringEl, Math.round(scene.scale * 1e4) / 1e4);
    put("tilt", ringEl, Math.round(scene.tilt * 100) / 100);
    put("roll", ringEl, Math.round(scene.roll * 100) / 100);
    put("dolly", ringEl, Math.round(scene.dolly * 10) / 10);

    let swap: number[] | null = null;
    const seen: Seen[] = [];
    // on the craft beat everything but the card at the front goes quiet
    const fs = frontSlot(R), hush = 1 - 0.88 * shot.focus;
    for (let s = 0; s < SLOTS; s++) {
      const el = cards.current[s];
      if (!el) continue;
      const a = slotAngle(s, R);
      const p = reelPose(a, f, scene, s % 2 ? 1 : -1);
      const w = written.current[s];
      // in the teardown the backs step back, so the two layers of videos read clearly
      const face = facing(p, scene);
      const dim = (s === fs ? 1 : hush) * (face ? 1 : 1 - 0.6 * shot.explode);
      const o = p.behindCamera ? 0 : Math.round(p.appear * dim * 1000) / 1000;
      const vis = o > 0;
      if (vis !== w.vis) { w.vis = vis; el.style.visibility = vis ? "" : "hidden"; }
      if (vis) {
        const yaw = Math.round(p.yaw * 100) / 100, y = Math.round(p.y * 10) / 10, r = Math.round(Math.hypot(p.x, p.z) * 10) / 10;
        const d = Math.round((p.scale / scene.scale) * 1e4) / 1e4;
        if (yaw !== w.yaw) { w.yaw = yaw; el.style.setProperty("--yaw", String(yaw)); }
        if (y !== w.y) { w.y = y; el.style.setProperty("--y", String(y)); }
        if (r !== w.r) { w.r = r; el.style.setProperty("--r", String(r)); }
        if (d !== w.d) { w.d = d; el.style.setProperty("--d", String(d)); }
        if (o !== w.o) { w.o = o; el.style.setProperty("--o", String(o)); }
        if (o > 0.5 && face) {
          const q = project(p, scene), X = vw / 2 + cx + q.x, Y = cy + q.y;
          const hw = (CARD_W / 2) * p.scale * q.k, hh = (CARD_H / 2) * p.scale * q.k;
          if (X + hw > 0 && X - hw < vw && Y + hh > 0 && Y - hh < vh) seen.push({ s, k: q.k, x: X, y: Y });
        }
      }
      const reel = slotReel(s, R, n);
      if (reel !== held.current[s]) {
        (swap ??= [...held.current])[s] = reel;
        w.play = false; // its video becomes a new, paused element
      }
    }
    seen.sort((p, q) => q.k - p.k);

    // only the cards facing the camera play, nearest first
    const on = new Set(reduced ? [] : seen.slice(0, MAX_PLAY).map((p) => p.s));
    for (let s = 0; s < SLOTS; s++) {
      const w = written.current[s], v = videos.current[s], want = on.has(s);
      if (!v || want === w.play) continue;
      w.play = want;
      if (want) v.play()?.catch(() => { w.play = false; });
      else v.pause();
    }
    if (swap) { held.current = swap; setSlots(swap); }

    // the card at the front: its reel is named on the craft beat, and there it shows its play button
    const fr = slotReel(fs, R, n);
    if (fr !== front.current) { front.current = fr; onFront(fr); }
    const lit = shot.focus > 0.5 ? fs : -1;
    if (lit !== frontSlotOn.current) {
      cards.current[frontSlotOn.current]?.classList.remove("is-front");
      cards.current[lit]?.classList.add("is-front");
      frontSlotOn.current = lit;
    }

    drawTags(shot.label * rv, wide, seen, vw, vh);

    // hover: hit-test every third frame, so cards turning under a still pointer are caught too
    if (++frame.current % 3 === 0) {
      const pt = pointer.current;
      let hit = -1;
      if (pt.on && !drag.current && !lockedRef.current) {
        const card = (document.elementFromPoint(pt.x, pt.y) as HTMLElement | null)?.closest<HTMLElement>(".reel");
        if (card && stageEl.contains(card)) hit = Number(card.dataset.slot);
      }
      if (hit !== hover.current) {
        cards.current[hover.current]?.classList.remove("is-hover");
        cards.current[hit]?.classList.add("is-hover");
        hover.current = hit;
      }
    }
  });

  /** Part names pinned to the cards, placed again every frame: a column each side, a line to each card. */
  function drawTags(weight: number, wide: boolean, seen: Seen[], vw: number, vh: number) {
    const layer = tags.current, st = tagState.current;
    if (!layer) return;
    const show = weight > 0.01 && wide;
    if (show !== st.shown) { st.shown = show; layer.style.visibility = show ? "visible" : "hidden"; }
    if (!show) return;
    layer.style.opacity = String(Math.round(weight * 1000) / 1000);
    const pick = seen.slice(0, CALLOUTS);
    const mid = vw / 2 + (shared.current.cx ?? 0);
    const cols: [Seen[], Seen[]] = [pick.filter((p) => p.x < mid).sort((a, b) => a.y - b.y), pick.filter((p) => p.x >= mid).sort((a, b) => a.y - b.y)];
    const pad = Math.max(24, vw * 0.035), width = Math.min(230, vw * 0.17), gap = 62;
    let i = 0;
    cols.forEach((col, c) => {
      // labels follow their cards up and down, but never overlap
      const ys = col.map((p) => Math.min(vh - 150, Math.max(150, p.y)));
      for (let j = 1; j < ys.length; j++) ys[j] = Math.max(ys[j], ys[j - 1] + gap);
      for (let j = ys.length - 2; j >= 0; j--) ys[j] = Math.min(ys[j], ys[j + 1] - gap);
      col.forEach((p, j) => {
        const el = tagEls.current[i], line = lines.current[i], dot = dots.current[i];
        if (!el || !line || !dot) return;
        const reel = reels[held.current[p.s]];
        if (st.keys[i] !== reel.key) {
          st.keys[i] = reel.key;
          el.dataset.side = c ? "r" : "l";
          const [no, title] = Array.from(el.children[0].children) as HTMLElement[];
          no.textContent = String(held.current[p.s] + 1).padStart(2, "0");
          title.textContent = reel.title;
          (el.children[1] as HTMLElement).textContent = reel.client;
        }
        const x = c ? vw - pad - width : pad, y = ys[j];
        el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y - 12)}px, 0)`;
        el.style.width = width + "px";
        el.style.visibility = "";
        const ax = c ? x - 10 : x + width + 10, bx = ax + (c ? -36 : 36);
        line.setAttribute("points", `${ax},${y} ${bx},${y} ${Math.round(p.x)},${Math.round(p.y)}`);
        line.style.visibility = "";
        dot.setAttribute("cx", String(Math.round(p.x)));
        dot.setAttribute("cy", String(Math.round(p.y)));
        dot.style.visibility = "";
        i++;
      });
    });
    for (; i < CALLOUTS; i++) {
      st.keys[i] = "";
      if (tagEls.current[i]) tagEls.current[i]!.style.visibility = "hidden";
      if (lines.current[i]) lines.current[i]!.style.visibility = "hidden";
      if (dots.current[i]) dots.current[i]!.style.visibility = "hidden";
    }
  }

  // input: the wheel, a vertical swipe and the keys play the story either way, with no end; a sideways drag turns the ring
  useEffect(() => {
    // the whole hero takes the gestures, the words included: a swipe that starts on them still plays the story
    const el = section.current, st = stage.current;
    if (!el || !st) return;
    const tl = () => timeline.current;
    const playerOpen = () => !!document.querySelector(".player.open");
    const touched = () => { tl().lastInput = performance.now(); };
    const down = (e: PointerEvent) => {
      if (lockedRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
      drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: tl().target, o0: turn.current.target, moved: false, lp: 0, lt: e.timeStamp, v: 0, axis: 0 };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (!d.moved) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
        d.axis = Math.abs(dx) >= Math.abs(dy) ? 1 : 2;
        d.moved = true;
        el.setPointerCapture(e.pointerId);
        st.classList.add("is-dragging");
      }
      const p = d.axis === 1 ? dx : dy, dt = Math.max(1, e.timeStamp - d.lt);
      d.v = d.v * 0.6 + ((p - d.lp) / dt) * 0.4;
      d.lp = p; d.lt = e.timeStamp;
      if (d.axis === 1) turn.current.target = d.o0 + dx * turn.current.degPerPx; // the cards follow the finger
      else tl().target = d.t0 - dy / SWIPE_PX; // like scrolling: a swipe up plays forward
      touched();
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      drag.current = null;
      if (!d.moved) return;
      st.classList.remove("is-dragging");
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // flick
      if (d.axis === 1) turn.current.target += d.v * 320 * turn.current.degPerPx;
      else tl().target -= (d.v * 300) / SWIPE_PX;
      touched();
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 0);
    };
    const wheel = (e: WheelEvent) => {
      if (playerOpen()) return;
      e.preventDefault();
      if (lockedRef.current) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const step = (e.deltaY + e.deltaX * 0.5) * unit;
      tl().target += Math.max(-600, Math.min(600, step)) / LOOP_PX;
      touched();
    };
    const key = (e: KeyboardEvent) => {
      if (lockedRef.current || playerOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === " " && (e.target as HTMLElement | null)?.closest?.("a, button")) return;
      const t = tl();
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) t.target = nextBeat(t.target, 1);
      else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) t.target = nextBeat(t.target, -1);
      else if (e.key === "Home") t.target = beatTarget(t.target, 0);
      else return;
      e.preventDefault();
      touched();
    };
    const click = (e: MouseEvent) => { if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); } };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
      el.removeEventListener("click", click, true);
    };
  }, [section, timeline]);

  // a card reached with the keyboard turns to the front
  const focusCard = (s: number, e: React.FocusEvent<HTMLAnchorElement>) => {
    if (!e.currentTarget.matches(":focus-visible")) return;
    const a = slotAngle(s, shotAt(progress.get()).turn + turn.current.shown);
    turn.current.target += (a > 0 ? 180 - a : -180 - a);
  };

  return (
    <>
      <div className="dw-stage" ref={stage}>
        <div className="dw-ring" ref={ring}>
          {slots.map((ri, s) => {
            const reel = reels[ri];
            const no = String(ri + 1).padStart(2, "0");
            return (
              <a
                key={s}
                className="reel"
                data-slot={s}
                href={`#${reel.videoId}`}
                ref={(el) => { cards.current[s] = el; }}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onOpen(reel);
                }}
                onFocus={(e) => focusCard(s, e)}
                draggable={false}
              >
                <span className="reel-face">
                  <img
                    key={"c" + reel.key}
                    className="reel-cover"
                    src={reel.cover}
                    alt=""
                    draggable={false}
                    onLoad={() => onAsset("c:" + reel.key)}
                    onError={() => onAsset("c:" + reel.key)}
                  />
                  <video
                    key={"v" + reel.key}
                    ref={(el) => { videos.current[s] = el; }}
                    className="reel-video"
                    src={reel.src}
                    muted
                    loop
                    playsInline
                    preload={preload.has(reel.key) ? "auto" : "metadata"}
                    disablePictureInPicture
                    aria-hidden="true"
                    tabIndex={-1}
                    onLoadedData={(e) => { e.currentTarget.classList.add("is-ready"); onAsset("v:" + reel.key); }}
                    onError={() => onAsset("v:" + reel.key)}
                  />
                  <span className="reel-no" aria-hidden="true">{no}/{String(n).padStart(2, "0")}</span>
                  <span className="reel-meta" aria-hidden="true">
                    <b>{reel.client}</b>
                    <span>{reel.title}</span>
                    <i>▶ {playLabel}</i>
                  </span>
                </span>
                <span className="reel-back" aria-hidden="true"><span>武</span></span>
                <span className="sr-only">{`${playLabel}: ${reel.title}`}</span>
              </a>
            );
          })}
        </div>
      </div>
      <div className="dw-tags" ref={tags} aria-hidden="true">
        <svg className="dw-lines">
          {Array.from({ length: CALLOUTS }, (_, i) => (
            <g key={i}>
              <polyline ref={(el) => { lines.current[i] = el; }} />
              <circle ref={(el) => { dots.current[i] = el; }} r="4" />
            </g>
          ))}
        </svg>
        {Array.from({ length: CALLOUTS }, (_, i) => (
          <div key={i} className="dw-tag" ref={(el) => { tagEls.current[i] = el; }}>
            <p><i /><b /></p>
            <span />
          </div>
        ))}
      </div>
    </>
  );
}

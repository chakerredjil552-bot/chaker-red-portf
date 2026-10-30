import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useAnimationFrame, useMotionValue, useSpring, type MotionValue } from "framer-motion";
import { CARD_H, CARD_W, SLOTS, STEP, facing, project, reelPose, sceneAt, slotAngle, slotReel } from "./pose.ts";
import type { Reel } from "./reels.ts";

/** Idle spin, deg/s. Negative, so the next reel in the list keeps arriving at the centre. */
const SPIN = -3.4;
/** At most this many previews play at once: the cards facing the camera, nearest the centre first. */
const MAX_PLAY = 7;
/** Scrolling the page turns the ring: down sends the cards right, up sends them left. The whole page is one full turn. */
const SCROLL_TURNS = 1;
/** The backdrop pans with the ring, slower than the cards on the far wall (about a third), px per degree at fit 1. */
const SKY_PAN = 2.2;

/** How big the scene is drawn on this screen, at the start and at the end of the reveal. */
export function fitFor(w: number, h: number): { a: number; b: number } {
  if (h > w * 1.2) return { a: Math.min(w / 1000, 1), b: Math.min(h / 700, 1.35) }; // phones held upright
  return { a: Math.min(w / 1450, h / 980, 1), b: Math.min(Math.max(h / 920, w / 1750), 1.3) };
}

interface WallProps {
  reels: Reel[];
  formation: MotionValue<number>;
  expansion: MotionValue<number>;
  locked: boolean;       // the entrance is playing: no input
  reduced: boolean;
  preload: Set<string>;  // reels whose cover and preview the loader waits for
  onAsset: (key: string) => void;
  onOpen: (reel: Reel) => void;
  section: RefObject<HTMLElement | null>;
  playLabel: string;
  sky?: RefObject<HTMLElement | null>; // the backdrop strip, panned with the ring
}

interface Written { yaw: number; y: number; d: number; o: number; vis: boolean; play: boolean }

export function Wall({ reels, formation, expansion, locked, reduced, preload, onAsset, onOpen, section, playLabel, sky }: WallProps) {
  const n = reels.length;
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLAnchorElement | null)[]>([]);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);

  // drag, swipe and wheel move the target; the visible angle follows it through a spring
  const target = useMotionValue(0);
  const angle = useSpring(target, { stiffness: 70, damping: 22, mass: 1, restDelta: 0.0005 });

  const [slots, setSlots] = useState(() => Array.from({ length: SLOTS }, (_, s) => slotReel(s, 0, n)));
  const held = useRef(slots);
  held.current = slots;

  const written = useRef<Written[]>(Array.from({ length: SLOTS }, () => ({ yaw: NaN, y: NaN, d: NaN, o: NaN, vis: true, play: false })));
  const shared = useRef({ r: NaN, s: NaN, tilt: NaN, roll: NaN, persp: NaN });
  const view = useRef({ w: 1, h: 1, fit: fitFor(1440, 900), strip: 0, turn: 0 });
  const skyAt = useRef(NaN);
  const pointer = useRef({ x: -1, y: -1, on: false });
  const hover = useRef(-1);
  const frame = useRef(0);
  const inView = useRef(true);
  const lastScroll = useRef(-1);
  const drag = useRef<null | { id: number; x0: number; y0: number; a0: number; moved: boolean; lx: number; lt: number; v: number }>(null);
  const swallowClick = useRef(false);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useLayoutEffect(() => {
    const size = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const range = document.documentElement.scrollHeight - h;
      view.current = { w, h, fit: fitFor(w, h), strip: sky?.current?.querySelector("img")?.offsetWidth ?? 0, turn: range > 0 ? (360 * SCROLL_TURNS) / range : 0 };
    };
    size();
    window.addEventListener("resize", size);
    const img = sky?.current?.querySelector("img");
    img?.addEventListener("load", size);
    return () => { window.removeEventListener("resize", size); img?.removeEventListener("load", size); };
  }, [sky]);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; }, { threshold: 0 });
    io.observe(el);
    const move = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY, on: true }; };
    const out = () => { pointer.current.on = false; };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", out);
    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", out);
    };
  }, [section]);

  const degPerPx = () => {
    const f = view.current.fit, e = expansion.get();
    return 0.154 / Math.max(0.25, f.a + (f.b - f.a) * e);
  };

  useAnimationFrame((_, delta) => {
    const sec = section.current, ringEl = ring.current, stageEl = stage.current;
    if (!sec || !ringEl || !stageEl) return;
    const { w: vw, h: vh, fit } = view.current;
    const box = stageEl.getBoundingClientRect();
    // gone, or nearly gone, from the screen: rest, and stop every preview
    if (!inView.current || Math.min(box.bottom, vh) - Math.max(box.top, 0) < vh * 0.3) {
      lastScroll.current = -1;
      written.current.forEach((w, s) => { if (w.play) { w.play = false; videos.current[s]?.pause(); } });
      return;
    }

    const ex = expansion.get(), f = formation.get();
    if (!reduced && !drag.current) {
      const gain = Math.min(1, ex * 1.4) * (hover.current >= 0 ? 0.25 : 1);
      if (gain > 0) target.set(target.get() + SPIN * gain * Math.min(delta, 64) / 1000);
    }
    // the page's scroll turns the ring, whichever way it comes: wheel, touch, keys or the scrollbar
    const sy = window.scrollY;
    if (lastScroll.current >= 0 && sy !== lastScroll.current && !lockedRef.current) target.set(target.get() - (sy - lastScroll.current) * view.current.turn);
    lastScroll.current = sy;
    const R = angle.get();
    const fitNow = fit.a + (fit.b - fit.a) * ex;
    const scene = sceneAt(ex, fitNow);
    const strip = view.current.strip, skyEl = sky?.current;
    if (skyEl && strip > 0) {
      const x = Math.round(((((-R * SKY_PAN * fitNow) % strip) + strip) % strip - strip) * 10) / 10;
      if (x !== skyAt.current) { skyAt.current = x; skyEl.style.setProperty("--pan", x + "px"); }
    }

    // the ring's shared values live on the ring element as CSS variables
    const sh = shared.current;
    const put = (key: keyof typeof sh, name: string, v: number, el: HTMLElement) => {
      if (sh[key] !== v) { sh[key] = v; el.style.setProperty(name, String(v)); }
    };
    put("r", "--r", Math.round(scene.radius * 10) / 10, ringEl);
    put("s", "--s", Math.round(scene.scale * 1e4) / 1e4, ringEl);
    put("tilt", "--tilt", Math.round(scene.tilt * 100) / 100, ringEl);
    put("roll", "--roll", Math.round(scene.roll * 100) / 100, ringEl);
    put("persp", "--persp", Math.round(scene.perspective * 10) / 10, stageEl);

    let swap: number[] | null = null;
    const playable: [number, number][] = [];
    for (let s = 0; s < SLOTS; s++) {
      const el = cards.current[s];
      if (!el) continue;
      const a = slotAngle(s, R);
      const p = reelPose(a, f, scene);
      const w = written.current[s];
      const o = p.behindCamera ? 0 : Math.round(p.appear * 1000) / 1000;
      const vis = o > 0;
      if (vis !== w.vis) { w.vis = vis; el.style.visibility = vis ? "" : "hidden"; }
      if (vis) {
        const yaw = Math.round(p.yaw * 100) / 100, y = Math.round(p.y * 10) / 10, d = Math.round((p.scale / scene.scale) * 1e4) / 1e4;
        if (yaw !== w.yaw) { w.yaw = yaw; el.style.setProperty("--yaw", String(yaw)); }
        if (y !== w.y) { w.y = y; el.style.setProperty("--y", String(y)); }
        if (d !== w.d) { w.d = d; el.style.setProperty("--d", String(d)); }
        if (o !== w.o) { w.o = o; el.style.setProperty("--o", String(o)); }
        if (o > 0.6 && facing(p, scene)) {
          const q = project(p, scene), hw = (CARD_W / 2) * p.scale * q.k, hh = (CARD_H / 2) * p.scale * q.k;
          if (Math.abs(q.x) - hw < vw / 2 && Math.abs(q.y) - hh < vh / 2) playable.push([s, Math.abs(a)]);
        }
      }
      const r = slotReel(s, R, n);
      if (r !== held.current[s]) {
        (swap ??= [...held.current])[s] = r;
        w.play = false; // its video becomes a new, paused element
      }
    }

    // only the cards facing the camera play
    const on = new Set(reduced ? [] : playable.sort((p, q) => p[1] - q[1]).slice(0, MAX_PLAY).map((p) => p[0]));
    for (let s = 0; s < SLOTS; s++) {
      const w = written.current[s], v = videos.current[s], want = on.has(s);
      if (!v || want === w.play) continue;
      w.play = want;
      if (want) v.play()?.catch(() => { w.play = false; });
      else v.pause();
    }
    if (swap) { held.current = swap; setSlots(swap); }

    // hover: hit-test every third frame, so cards turning under a still pointer are caught too
    if (++frame.current % 3 === 0) {
      const pt = pointer.current;
      let hit = -1;
      if (pt.on && !drag.current && !lockedRef.current && pt.y >= box.top && pt.y <= box.bottom) {
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

  // input: drag and swipe sideways, wheel; vertical swipes stay with the page
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      if (lockedRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
      drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, a0: target.get(), moved: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (!d.moved) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
        if (Math.abs(dx) < 6) return;
        d.moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add("is-dragging");
      }
      const dt = Math.max(1, e.timeStamp - d.lt);
      d.v = d.v * 0.6 + ((e.clientX - d.lx) / dt) * 0.4;
      d.lx = e.clientX; d.lt = e.timeStamp;
      target.set(d.a0 - dx * degPerPx());
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      drag.current = null;
      if (!d.moved) return;
      el.classList.remove("is-dragging");
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      target.set(target.get() - d.v * 320 * degPerPx()); // flick
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 0);
    };
    const wheel = (e: WheelEvent) => {
      if (lockedRef.current) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        target.set(target.get() + e.deltaX * degPerPx() * 0.6);
      }
    };
    const click = (e: MouseEvent) => { if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); } };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("click", click, true);
    };
  }, [target]);

  // a card reached with the keyboard turns to the centre
  const focusCard = (s: number, e: React.FocusEvent<HTMLAnchorElement>) => {
    if (!e.currentTarget.matches(":focus-visible")) return;
    target.set(target.get() - slotAngle(s, angle.get()));
  };

  return (
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
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, m, useMotionValue, useMotionValueEvent, useTransform, type AnimationPlaybackControls, type MotionValue } from "framer-motion";
import { SLOTS, facing, reelPose, slotAngle, slotReel, type Scene } from "./pose.ts";
import { CUES, beatAt, beatTarget, beatWeight, shotAt } from "./story.ts";
import { REELS, type Reel } from "./reels.ts";
import { COPY } from "./copy.ts";
import { Loader } from "./Loader.tsx";
import { Wall, type Timeline } from "./Wall.tsx";

const FORMATION_S = 2.6;
const REVEAL_S = 1.5;
const REVEAL_EASE = [0.5, 0, 0.15, 1] as const;
/** If the network never delivers, the reveal goes ahead this long after the deal has finished. */
const PATIENCE_MS = 4500;

const html = document.documentElement;
const SCROLL_KEYS = new Set([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);

/** The reels the loader waits for: the covers and previews on the cards that face the camera when the deal lands. */
function frontReels(): Set<string> {
  const ids = new Set<string>();
  if (!REELS.length) return ids;
  const hero = shotAt(0);
  const scene: Scene = { ...hero };
  for (let s = 0; s < SLOTS; s++)
    if (facing(reelPose(slotAngle(s, 0), 1, scene), scene)) ids.add(REELS[slotReel(s, 0, REELS.length)].key);
  return ids;
}

const play = (reel: Reel) => {
  if (window.openVideo) window.openVideo(reel.videoId, reel.at);
  else location.hash = reel.videoId;
};

/** How much beat `i`'s words show: on the beat, once the entrance is over. */
function useBeat(progress: MotionValue<number>, reveal: MotionValue<number>, i: number) {
  const w = useTransform([progress, reveal], ([u, r]: number[]) => beatWeight(u, i) * Math.min(1, Math.max(0, (r - 0.35) / 0.65)));
  const y = useTransform(w, (v) => `${(1 - v) * 22}px`);
  const visibility = useTransform(w, (v) => (v > 0.001 ? "visible" : "hidden"));
  const pointerEvents = useTransform(w, (v) => (v > 0.5 ? "auto" : "none"));
  return { opacity: w, y, visibility, pointerEvents } as const;
}

/** A headline in the brush face: the middle part glows red. */
function Head({ parts, n }: { parts: string[]; n?: number }) {
  const fill = (s: string) => s.replace("{n}", String(n ?? ""));
  return (
    <h2 className="dh-head">
      {fill(parts[0])}<em>{fill(parts[1])}</em>{fill(parts[2])}
    </h2>
  );
}

function Beat({ i, progress, reveal, className, children }: { i: number; progress: MotionValue<number>; reveal: MotionValue<number>; className: string; children: ReactNode }) {
  const style = useBeat(progress, reveal, i);
  return <m.div className={"dh-beat " + className} style={style}>{children}</m.div>;
}

function Eyebrow({ no, label }: { no: string; label: string }) {
  return <p className="dh-eyebrow"><b>{no}</b>{label}</p>;
}

export function DealHero() {
  const reduced = useMemo(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  // a shared link to one video (#video-id) goes straight to it, so does the reduced-motion visitor
  const instant = reduced || (location.hash.length > 1 && location.hash !== "#top");

  const formation = useMotionValue(instant ? 1 : 0);
  const reveal = useMotionValue(instant ? 1 : 0);
  const progress = useMotionValue(0);
  const timeline = useRef<Timeline>({ target: 0, lastInput: 0 });

  const [entering, setEntering] = useState(!instant);
  const [formed, setFormed] = useState(instant);
  const [late, setLate] = useState(false);
  const [beat, setBeat] = useState(0);
  const [frontReel, setFrontReel] = useState(0);
  const pin = useRef<HTMLDivElement>(null);
  const runs = useRef<AnimationPlaybackControls[]>([]);
  const started = useRef(instant);

  // real progress: which of the front covers and previews have arrived
  const preload = useMemo(frontReels, []);
  const total = preload.size * 2;
  const got = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(0);
  const onAsset = useCallback((key: string) => {
    if (got.current.has(key) || !preload.has(key.slice(2))) return;
    got.current.add(key);
    setLoaded(got.current.size);
  }, [preload]);
  const ready = loaded >= total || late;

  const finish = useCallback(() => {
    if (!html.classList.contains("deal-entering")) return;
    html.classList.remove("deal-entering");
    setEntering(false);
  }, []);

  const skip = useCallback(() => {
    runs.current.forEach((r) => r.stop());
    started.current = true;
    formation.set(1);
    reveal.set(1);
    setFormed(true);
    finish();
  }, [reveal, finish, formation]);

  // --ex on <html> lets the page's top bar arrive with the reveal
  useLayoutEffect(() => {
    const put = (v: number) => html.style.setProperty("--ex", v.toFixed(3));
    put(reveal.get());
    return reveal.on("change", put);
  }, [reveal]);

  useMotionValueEvent(progress, "change", (u) => {
    const b = beatAt(u);
    if (b !== beat) setBeat(b);
  });

  // formation: the deal, linear
  useEffect(() => {
    if (instant) { html.classList.remove("deal-entering"); return; }
    html.classList.add("deal-entering");
    try { history.scrollRestoration = "manual"; } catch { /* old browsers */ }
    window.scrollTo(0, 0);
    const run = animate(formation, 1, { duration: FORMATION_S, ease: "linear" });
    runs.current.push(run);
    run.then(() => setFormed(true));
    return () => run.stop();
  }, [formation, instant]);

  useEffect(() => {
    if (!formed || ready || instant) return;
    const t = setTimeout(() => setLate(true), PATIENCE_MS);
    return () => clearTimeout(t);
  }, [formed, ready, instant]);

  // reveal: only once the deal is done AND the assets are in, whichever is later
  useEffect(() => {
    if (!formed || !ready || started.current) return;
    started.current = true;
    const run = animate(reveal, 1, { duration: REVEAL_S, ease: REVEAL_EASE });
    runs.current.push(run);
    run.then(finish);
  }, [reveal, finish, formed, ready]);

  // while the entrance plays: no scrolling; Escape and Tab end it at once
  useEffect(() => {
    if (!entering) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { skip(); return; }
      if (e.key === "Tab") {
        e.preventDefault();
        skip();
        requestAnimationFrame(() => document.querySelector<HTMLElement>(".topbar a[href]:not([tabindex='-1']), .topbar button")?.focus());
        return;
      }
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
    };
    const block = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", key);
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
    };
  }, [entering, skip]);

  const goTo = (i: number) => {
    const t = timeline.current;
    t.target = beatTarget(t.target, i);
    t.lastInput = performance.now();
  };

  // the name behind the ring, and the rail's fill
  const titleOn = useTransform([progress, reveal], ([u, r]: number[]) => beatWeight(u, 0, 0.05, 0.08) * Math.min(1, r * 1.6));
  const titleY = useTransform(titleOn, (v) => `${(1 - v) * 6}%`);
  const fill = useTransform(progress, (u) => `${(((u % 1) + 1) % 1) * 100}%`);
  const chrome = useTransform(reveal, [0.4, 1], [0, 1]);

  const wa = window.CONTACT?.whatsapp;
  const email = window.CONTACT?.email;
  const videos = window.VIDEOS ?? [];
  const now = REELS[frontReel];
  const B = COPY.beats;
  const watchFirst = () => { if (videos[0]) window.openVideo?.(videos[0].id); };

  return (
    <>
      <div ref={pin} id="top" className="dh-pin">
        <section className="dh" aria-label={COPY.name}>
          <div className="dh-set" aria-hidden="true" />
          <m.div className="dh-title" style={{ opacity: titleOn, y: titleY }} aria-hidden="true">
            <span>{COPY.first}</span> <em>{COPY.last}</em>
          </m.div>
          <Wall
            reels={REELS} formation={formation} reveal={reveal} progress={progress} timeline={timeline}
            locked={entering} reduced={reduced} preload={preload} onAsset={onAsset} onOpen={play} onFront={setFrontReel}
            section={pin} playLabel={COPY.play}
          />
          <div className="dh-shade" aria-hidden="true" />

          <m.div className="dh-frame" style={{ opacity: chrome }} aria-hidden="true">
            <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
            <span className="dh-section"><i />{B[CUES[beat].id].label}</span>
          </m.div>

          <Beat i={0} progress={progress} reveal={reveal} className="b-hero">
            <h1 className="sr-only">{COPY.name} — {COPY.portfolio}</h1>
            <p className="dh-eyebrow"><b>■</b>{COPY.role}</p>
            <p className="dh-lead">{COPY.lead}</p>
            <p className="dh-hint"><span className="dh-mouse" aria-hidden="true" />{COPY.hint}<span className="dh-hint-touch"> · {COPY.touch}</span></p>
          </Beat>

          <Beat i={1} progress={progress} reveal={reveal} className="b-craft">
            <Eyebrow no={B.craft.no} label={B.craft.label} />
            <Head parts={B.craft.head} />
            <p className="dh-body">{B.craft.body}</p>
            {now && (
              <button type="button" className="dh-now" onClick={() => play(now)}>
                <i aria-hidden="true">▶</i>
                <span><small>{B.craft.now}</small>{now.title}</span>
              </button>
            )}
          </Beat>

          <Beat i={2} progress={progress} reveal={reveal} className="b-inside">
            <Eyebrow no={B.inside.no} label={B.inside.label} />
            <Head parts={B.inside.head} />
            <ol className="dh-steps">
              {B.inside.steps.map((s, i) => <li key={s}><b>{String(i + 1).padStart(2, "0")}</b>{s}</li>)}
            </ol>
          </Beat>

          <Beat i={3} progress={progress} reveal={reveal} className="b-work">
            <Eyebrow no={B.work.no} label={B.work.label} />
            <Head parts={B.work.head} n={videos.length} />
            <p className="dh-body">{B.work.body}</p>
          </Beat>

          <Beat i={4} progress={progress} reveal={reveal} className="b-talk">
            <Eyebrow no={B.talk.no} label={B.talk.label} />
            <Head parts={B.talk.head} />
            <p className="dh-body">{B.talk.body}</p>
            <div className="dh-ctas">
              {wa && <a className="btn primary" href={`https://wa.me/${wa}`} target="_blank" rel="noopener">{COPY.whatsapp}</a>}
              {email && <a className="btn" href={`mailto:${email}`}>{COPY.email}</a>}
              {videos.length > 0 && <button type="button" className="btn ghost" onClick={watchFirst}>▶ {COPY.watch}</button>}
            </div>
          </Beat>

          <m.nav className="dh-rail" style={{ opacity: chrome }} aria-label="Story">
            <span className="dh-rail-cap">Scroll</span>
            <div className="dh-track">
              <m.i className="dh-fill" style={{ width: fill }} />
              {CUES.map((c, i) => (
                <button
                  key={c.id} type="button" className={"dh-stop" + (i === beat ? " on" : "")} style={{ left: `${c.at * 100}%` }}
                  onClick={() => goTo(i)} aria-label={B[c.id].label} aria-current={i === beat ? "step" : undefined}
                >
                  <i /><span>{c.name}</span>
                </button>
              ))}
            </div>
            <span className="dh-count"><b>{String(beat + 1).padStart(2, "0")}</b> / {String(CUES.length).padStart(2, "0")}</span>
          </m.nav>
        </section>
      </div>

      {entering && (
        <Loader
          expansion={reveal} progress={total ? loaded / total : 1} loaded={loaded} total={total}
          brand={COPY.brand} caption={COPY.loading} skipLabel={COPY.skip} onSkip={skip}
        />
      )}
    </>
  );
}

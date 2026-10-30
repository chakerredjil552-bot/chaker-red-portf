import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, m, useMotionValue, useTransform, type AnimationPlaybackControls, type MotionValue } from "framer-motion";
import { SLOTS, SMALL, facing, reelPose, slotAngle, slotReel } from "./pose.ts";
import { REELS, type Reel } from "./reels.ts";
import { COPY } from "./copy.ts";
import { Loader } from "./Loader.tsx";
import { Wall } from "./Wall.tsx";

const FORMATION_S = 2.6;
const EXPANSION_S = 1.9;
const EXPANSION_EASE = [0.5, 0, 0.15, 1] as const;
/** If the network never delivers, the reveal goes ahead this long after the deal has finished. */
const PATIENCE_MS = 4500;
const BACKDROP = "hero-assets/musashi-bg.mp4", BACKDROP_POSTER = "hero-assets/musashi-bg.jpg";

const html = document.documentElement;
const SCROLL_KEYS = new Set([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);

/** The reels the loader waits for: the covers and previews on the cards that face the camera when the deal lands. */
function frontReels(): Set<string> {
  const ids = new Set<string>();
  if (!REELS.length) return ids;
  for (let s = 0; s < SLOTS; s++)
    if (facing(reelPose(slotAngle(s, 0), 1, SMALL), SMALL)) ids.add(REELS[slotReel(s, 0, REELS.length)].key);
  return ids;
}

/** A line of the headline that rises out of a mask as `mv` goes from `from` to `to`. */
function Rise({ mv, from, to, children, className }: { mv: MotionValue<number>; from: number; to: number; children: ReactNode; className?: string }) {
  const t = useTransform(mv, [from, to], [0, 1]);
  const y = useTransform(t, (v) => `${(1 - v) * 105}%`);
  return (
    <span className={"dh-mask " + (className ?? "")}>
      <m.span className="dh-line" style={{ y, opacity: t }}>{children}</m.span>
    </span>
  );
}

const play = (reel: Reel) => {
  if (window.openVideo) window.openVideo(reel.videoId, reel.at);
  else location.hash = reel.videoId;
};

export function DealHero() {
  const reduced = useMemo(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  // a shared link to one video (#video-id) goes straight to it, so does the reduced-motion visitor
  const instant = reduced || (location.hash.length > 1 && location.hash !== "#top");

  // the two values that drive everything
  const formation = useMotionValue(instant ? 1 : 0);
  const expansion = useMotionValue(instant ? 1 : 0);

  const [entering, setEntering] = useState(!instant);
  const [formed, setFormed] = useState(instant);
  const [late, setLate] = useState(false);
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
    expansion.set(1);
    setFormed(true);
    finish();
  }, [expansion, finish, formation]);

  // --ex on <html> lets the page's top bar arrive with the reveal
  useLayoutEffect(() => {
    const put = (v: number) => html.style.setProperty("--ex", v.toFixed(3));
    put(expansion.get());
    return expansion.on("change", put);
  }, [expansion]);

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

  // expansion: only once the deal is done AND the assets are in, whichever is later
  useEffect(() => {
    if (!formed || !ready || started.current) return;
    started.current = true;
    const run = animate(expansion, 1, { duration: EXPANSION_S, ease: EXPANSION_EASE });
    runs.current.push(run);
    run.then(finish);
  }, [expansion, finish, formed, ready]);

  // while the entrance plays: no scrolling; Escape and Tab end it at once
  useEffect(() => {
    if (!entering) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { skip(); return; }
      if (e.key === "Tab") {
        // the skip button goes away with the loader: start the visitor's tabbing at the top of the page
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

  // the reveal, all read off expansion so nothing is queued: it overlaps the cards still settling
  const white = useTransform(expansion, [0, 0.42], [1, 0]);
  const shade = useTransform(expansion, [0.25, 0.9], [0, 1]);
  const skyScale = useTransform(expansion, [0, 1], [1.16, 1]);
  const frameX = useTransform(expansion, [0.3, 0.8], [0, 1]);
  const frameY = useTransform(expansion, [0.4, 0.9], [0, 1]);
  const labels = useTransform(expansion, [0.7, 1], [0, 1]);

  const wa = window.CONTACT?.whatsapp;
  const videos = window.VIDEOS?.length ?? 0;
  const email = window.CONTACT?.email;

  return (
    <>
      <div ref={pin} id="top" className="dh-pin">
        <section className="dh" aria-label={COPY.name}>
          <m.div className="dh-sky" style={{ scale: skyScale }} aria-hidden="true">
            <video className="dh-bgvid" src={BACKDROP} poster={BACKDROP_POSTER} muted loop playsInline autoPlay={!reduced} preload="auto" disablePictureInPicture tabIndex={-1} />
          </m.div>
          <m.div className="dh-white" style={{ opacity: white }} aria-hidden="true" />
          <Wall
            reels={REELS} formation={formation} expansion={expansion} locked={entering} reduced={reduced}
            preload={preload} onAsset={onAsset} onOpen={play} section={pin} playLabel={COPY.play}
          />
          <m.div className="dh-shade" style={{ opacity: shade }} aria-hidden="true" />

          <div className="dh-frame" aria-hidden="true">
            <m.i className="dh-fx t" style={{ scaleX: frameX }} />
            <m.i className="dh-fx b" style={{ scaleX: frameX }} />
            <m.i className="dh-fy l" style={{ scaleY: frameY }} />
            <m.i className="dh-fy r" style={{ scaleY: frameY }} />
            <m.span className="dh-tag l" style={{ opacity: labels }}>{COPY.tagLeft} — {videos} videos</m.span>
            <m.span className="dh-tag r" style={{ opacity: labels }}>{COPY.tagRight}</m.span>
          </div>

          <div className="dh-copy">
            <Rise mv={expansion} from={0.42} to={0.8} className="dh-status-wrap"><span className="dh-status"><i />{COPY.nick}</span></Rise>
            <h1 className="dh-name">
              {COPY.name.split(" ").map((w, i) => (
                <Rise key={i + w} mv={expansion} from={0.45 + i * 0.07} to={0.88 + i * 0.05}>{w}</Rise>
              ))}
            </h1>
            <Rise mv={expansion} from={0.58} to={0.95} className="dh-role-wrap"><span className="dh-role">{COPY.lead}</span></Rise>
            <Rise mv={expansion} from={0.64} to={1} className="dh-ctas-wrap">
              <span className="dh-ctas">
                {email && <a className="btn primary" href={`mailto:${email}`}>{COPY.email}</a>}
                {wa && <a className="btn" href={`https://wa.me/${wa}`} target="_blank" rel="noopener">{COPY.whatsapp}</a>}
              </span>
            </Rise>
          </div>
          <m.div className="dh-hint" style={{ opacity: labels }} aria-hidden="true"><span>←</span>{COPY.drag}<span>→</span></m.div>
        </section>
      </div>

      {entering && (
        <Loader
          expansion={expansion} progress={total ? loaded / total : 1} loaded={loaded} total={total}
          brand={COPY.brand} caption={COPY.loading} skipLabel={COPY.skip} onSkip={skip}
        />
      )}
    </>
  );
}

/*
 * The page as one scroll. Every stage is measured in viewport heights of scrolling:
 *
 *   intro    the well seen from above, the title over it
 *   descent  the camera sinks down the well; the rows of screens turn as you scroll
 *   land     the camera tilts up into the round room; the first video comes off the wall
 *   room     one stop per video: each one steps forward in turn
 *   exit     the camera rises out of the well
 *   end      the well, far below, a medallion under the last line
 */

export interface Plan {
  intro: number;
  descent: number;
  land: number;
  per: number;   // one video's stop in the room
  count: number; // videos
  exit: number;
  end: number;
}

export type StageName = "intro" | "descent" | "land" | "room" | "exit" | "end";

export interface Stage {
  name: StageName;
  t: number;      // 0..1 through the stage
  room: number;   // continuous position among the videos: 0 = first, count - 1 = last
  active: number; // the video in front
}

export const planFor = (count: number): Plan => ({ intro: 0.9, descent: 2.6, land: 1.3, per: 0.8, count: Math.max(1, count), exit: 1.7, end: 1 });

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoother = (t: number): number => { const x = clamp01(t); return x * x * x * (x * (x * 6 - 15) + 10); };
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Where each stage starts, in viewport heights. */
export function marks(p: Plan) {
  const descent = p.intro;
  const land = descent + p.descent;
  const room = land + p.land;
  const exit = room + p.per * (p.count - 1) + p.per * 0.5;
  const end = exit + p.exit;
  const total = end + p.end;
  return { descent, land, room, exit, end, total };
}

/** The stage at `s` viewport heights of scrolling. */
export function stageAt(p: Plan, s: number): Stage {
  const m = marks(p);
  const last = p.count - 1;
  const span = (a: number, b: number) => clamp01((s - a) / (b - a));
  if (s < m.descent) return { name: "intro", t: span(0, m.descent), room: 0, active: 0 };
  if (s < m.land) return { name: "descent", t: span(m.descent, m.land), room: 0, active: 0 };
  if (s < m.room) return { name: "land", t: span(m.land, m.room), room: 0, active: 0 };
  if (s < m.exit) {
    const room = Math.min(last, (s - m.room) / p.per);
    return { name: "room", t: span(m.room, m.exit), room, active: Math.min(last, Math.max(0, Math.round(room))) };
  }
  if (s < m.end) return { name: "exit", t: span(m.exit, m.end), room: last, active: last };
  return { name: "end", t: span(m.end, m.total), room: last, active: last };
}

/** Scroll positions the page settles on: the top, each video in the room, the end. */
export function snapPoints(p: Plan): number[] {
  const m = marks(p);
  return [0, ...Array.from({ length: p.count }, (_, k) => m.room + k * p.per), m.total];
}

/** The scroll position of one video's stop. */
export function stopOf(p: Plan, k: number): number {
  return marks(p).room + Math.min(p.count - 1, Math.max(0, k)) * p.per;
}

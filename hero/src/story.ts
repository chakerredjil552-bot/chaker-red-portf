/*
 * The scroll story. The scroll is the timeline: one loop of it plays five beats, and each beat is a cue, a complete
 * shot of the ring (camera, layers, labels). Between cues every value blends on a smooth curve, so the ring rests on
 * each beat and moves between them. The last beat ends where the first starts, so the loop never stops, either way.
 */

import { lerp, mod, type Scene } from "./pose.ts";

export interface Shot extends Scene {
  turn: number;   // deg the ring has turned; growing, the front cards move right
  cx: number;     // the ring's centre on screen, from the middle, as a share of the width (wide screens only)
  cy: number;     // the ring's centre on screen, from the top, as a share of the height (wide screens)
  cyTall: number; // the same on screens held upright
  boxW: number;   // the shot is composed for a viewport this wide...
  boxH: number;   // ...and this tall, in px; the scene is scaled to fit the real one
  boxWTall: number; // on screens held upright, framed by width (pull the camera back)
  label: number;  // 0..1, part names pinned to the cards
  focus: number;  // 0..1, the card at the front fills the screen and plays
}

export interface Cue extends Shot {
  id: "hero" | "craft" | "inside" | "work" | "talk";
  name: string; // shown on the scroll rail
  at: number;   // where the cue sits on the loop, 0..1
}

const base = { roll: 0, dolly: 0, explode: 0, label: 0, focus: 0, boxW: 1440, boxH: 900, cx: 0 };

/** One row per beat: what the camera does, what the ring does. The words for each beat are in copy.ts. */
export const CUES: readonly Cue[] = Object.freeze([
  // wide, centred: the whole ring, a slow turn
  { ...base, id: "hero", name: "Hero", at: 0, radius: 480, tilt: -12, perspective: 2400, scale: 0.56, turn: 0, cy: 0.56, cyTall: 0.44, boxWTall: 820 },
  // push in close: one video fills the screen
  { ...base, id: "craft", name: "Craft", at: 0.22, radius: 2000, tilt: 0, perspective: 1500, dolly: -1250, scale: 0.83, turn: 90, cx: 0.12, cy: 0.5, cyTall: 0.34, boxWTall: 860, focus: 1 },
  // pull back: the ring splits into layers
  { ...base, id: "inside", name: "Inside", at: 0.44, radius: 440, tilt: -7, roll: 4, perspective: 2600, scale: 0.4, turn: 180, cx: 0.18, cy: 0.5, cyTall: 0.33, boxWTall: 920, explode: 1 },
  // slow orbit from above: every card named
  { ...base, id: "work", name: "Work", at: 0.66, radius: 500, tilt: -28, roll: -4, perspective: 2400, scale: 0.5, turn: 270, cy: 0.52, cyTall: 0.36, boxW: 1500, boxWTall: 980, label: 1 },
  // back to the start: whole again, the ask
  { ...base, id: "talk", name: "Talk", at: 0.86, radius: 480, tilt: -16, perspective: 2400, scale: 0.44, turn: 337.5, cy: 0.33, cyTall: 0.3, boxWTall: 900 },
]);

const KEYS = ["radius", "tilt", "roll", "perspective", "dolly", "scale", "explode", "turn", "cx", "cy", "cyTall", "boxW", "boxH", "boxWTall", "label", "focus"] as const;

/** Smootherstep: zero speed and zero acceleration at both ends, so the camera eases into and out of every beat. */
export const smoother = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** The cue after the last one is the first one again, one full turn later. */
function cueAfter(i: number): Cue {
  if (i + 1 < CUES.length) return CUES[i + 1];
  return { ...CUES[0], at: 1, turn: CUES[0].turn + 360 };
}

/**
 * The shot at `u`, a point on the endless timeline: each whole number is one more loop. The turn keeps counting, so
 * the ring never jumps when a loop ends.
 */
export function shotAt(u: number): Shot {
  const loop = Math.floor(u), p = u - loop;
  let i = CUES.length - 1;
  while (i > 0 && CUES[i].at > p) i--;
  const a = CUES[i], b = cueAfter(i);
  const t = smoother((p - a.at) / (b.at - a.at));
  const out = {} as Shot;
  for (const k of KEYS) out[k] = lerp(a[k], b[k], t);
  out.turn += 360 * loop;
  return out;
}

/** Shortest way round the loop from p to q, in loops: (-0.5, 0.5]. */
export function loopDelta(p: number, q: number): number {
  const d = mod(q - p, 1);
  return d > 0.5 ? d - 1 : d;
}

/** The beat nearest to `u` on the loop. */
export function beatAt(u: number): number {
  const p = mod(u, 1);
  let best = 0, dist = Infinity;
  CUES.forEach((c, i) => {
    const d = Math.abs(loopDelta(p, c.at));
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

/** How much a beat's words show at `u`: 1 on the beat, fading out before the camera reaches the next one. */
export function beatWeight(u: number, beat: number, hold = 0.035, fade = 0.06): number {
  const d = Math.abs(loopDelta(mod(u, 1), CUES[beat].at));
  if (d <= hold) return 1;
  if (d >= hold + fade) return 0;
  return 1 - smoother((d - hold) / fade);
}

/** The timeline position of `beat` nearest to `u`, going the short way round. */
export function beatTarget(u: number, beat: number): number {
  return u + loopDelta(mod(u, 1), CUES[beat].at);
}

/** How big to draw a shot on this viewport. */
export function fitOf(shot: Shot, vw: number, vh: number): number {
  const tall = vh > vw * 1.2;
  return Math.min(vw / (tall ? shot.boxWTall : shot.boxW), vh / shot.boxH, 1.5);
}

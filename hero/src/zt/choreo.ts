/*
 * Where the figure is at every point of the scroll. It only depends on the scroll, so scrolling back plays it
 * backward. He stands off-centre while you look down the well, walks across the floor as the camera sinks, walks to
 * the middle of the room as it tilts up, turns to the wall and reaches up for the first screen. In the room he moves
 * to a new spot for each video; on the way out he walks off to the right.
 */

import { lerp, smoother, type Plan, type Stage } from "./plan.ts";
import { roomYaw, rotY, ROLL, type V3 } from "./cam.ts";

export interface Mark {
  x: number;
  z: number;
  face: number;  // where he faces when standing, as the figure's yaw (0 faces +z)
  reach: number; // 0..1 the right arm up
}

/** In the room's own frame, before it is turned: the wall he faces is at -z. */
const START: V3 = [-3.4, 0, -1.4];
const CROSS: V3 = [-2.7, 0, 2.3];
const CENTRE: V3 = [0, 0, 0.7];
const AWAY: V3 = [2.8, 0, -1.3];

/** The figure's yaw to face along (dx, dz). */
export const faceAlong = (dx: number, dz: number): number => Math.atan2(dx, dz);

const band = (t: number, a: number, b: number, c: number, d: number) =>
  Math.max(0, Math.min(1, smoother((t - a) / (b - a)), 1 - smoother((t - c) / (d - c))));

/** His side step for video k, in metres, left or right of the middle; the first video is dead centre. */
export function sideOf(k: number): number {
  return k === 0 ? 0 : (((k * 7919) % 5) - 2) * 0.22;
}

const along = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), 0, lerp(a[2], b[2], t)];

export function markAt(stage: Stage, plan: Plan): Mark {
  const base = ROLL; // the room is turned so its wall faces where the camera's screen-up pointed on the way down
  const wallFace = (yaw: number) => faceAlong(...dirOf(yaw));
  const at = (p: V3, yaw: number, reach = 0, face?: number): Mark => {
    const w = rotY(p, yaw);
    return { x: w[0], z: w[2], face: face ?? wallFace(yaw), reach };
  };
  switch (stage.name) {
    case "intro": return at(START, base, 0, faceAlong(...dirBetween(START, CROSS, base)));
    case "descent": {
      const t = smoother((stage.t - 0.38) / 0.62);
      return at(along(START, CROSS, t), base, 0, faceAlong(...dirBetween(START, CROSS, base)));
    }
    case "land": {
      const t = smoother(stage.t / 0.52);
      return at(along(CROSS, CENTRE, t), base, band(stage.t, 0.48, 0.6, 0.74, 0.88));
    }
    case "room": {
      const k = Math.floor(stage.room), f = smoother(stage.room - k);
      const side = lerp(sideOf(k), sideOf(Math.min(plan.count - 1, k + 1)), f);
      return at([side, 0, CENTRE[2]], roomYaw(stage.room, plan.count));
    }
    default: {
      const yaw = roomYaw(plan.count - 1, plan.count);
      const from: V3 = [sideOf(plan.count - 1), 0, CENTRE[2]];
      const t = stage.name === "exit" ? smoother(stage.t / 0.5) : 1;
      return at(along(from, AWAY, t), yaw, 0, faceAlong(...dirBetween(from, AWAY, yaw)));
    }
  }
}

/** The direction (x, z) of the wall in front when the room is turned by `yaw`. */
function dirOf(yaw: number): [number, number] {
  const d = rotY([0, 0, -1], yaw);
  return [d[0], d[2]];
}

function dirBetween(a: V3, b: V3, yaw: number): [number, number] {
  const d = rotY([b[0] - a[0], 0, b[2] - a[2]], yaw);
  return [d[0], d[2]];
}

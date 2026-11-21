/*
 * The camera for every point of the scroll. Looking straight down the well (screen-up is world -z), then tilting up
 * into the room, where it stays behind him while the videos change, then rising high above the well.
 */

import { lerp, smoother, type Plan, type Stage } from "./plan.ts";
import { WALL, WALL_TOP } from "./wall.ts";

export type V3 = [number, number, number];
export interface Shot { pos: V3; target: V3; up: V3; fov: number }

const DEG = Math.PI / 180;
const DOWN_UP: V3 = [0, 0, -1];
const LEVEL_UP: V3 = [0, 1, 0];

export const rotY = (v: V3, phi: number): V3 => {
  const c = Math.cos(phi), s = Math.sin(phi);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};
const mix = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Field of view, vertical, in degrees. */
export const fovFor = (room: boolean, aspect: number): number => (room ? (aspect < 1 ? 66 : 50) : 60);

/** Camera height that shows the top rim of the well at `fill` times the smaller half of the screen. */
export function topHeight(aspect: number, fill: number): number {
  const half = Math.tan((fovFor(false, aspect) / 2) * DEG) * Math.min(1, aspect);
  return WALL_TOP + WALL.radius / (fill * half);
}

/** The camera turns this far round the axis as it sinks down the well: a slow spiral. */
export const ROLL = Math.PI / 3;

/** The way the room looks: where the spiral down left the camera. It stays there for every video, like the reel:
 *  he stands still and the screens change in front of him. */
export const ROOM_YAW = ROLL;

/** The camera in the room, behind the figure, facing the wall at `yaw`. */
export function roomShot(yaw: number, aspect: number): Shot {
  const tall = aspect < 1;
  return { pos: rotY([0, 2.15, tall ? 8.4 : 6.4], yaw), target: rotY([0, 3.1, -10], yaw), up: LEVEL_UP, fov: fovFor(true, aspect) };
}

/** Looking straight down the well; `roll` turns the picture round the axis. Screen-up points along the floor at the
 *  wall the room view would face at the same yaw, so tilting up from it never twists. */
const down = (y: number, aspect: number, roll = 0): Shot =>
  ({ pos: [0, y, 0], target: [0, 0, 0], up: rotY(DOWN_UP, roll), fov: fovFor(false, aspect) });

const blend = (a: Shot, b: Shot, t: number): Shot => ({
  pos: mix(a.pos, b.pos, t), target: mix(a.target, b.target, t), up: norm(mix(a.up, b.up, t)), fov: lerp(a.fov, b.fov, t),
});

export const BOTTOM_Y = 15;

/** The camera at a stage of the scroll. */
export function shotAt(stage: Stage, plan: Plan, aspect: number): Shot {
  const tall = aspect < 1;
  const yIntro = topHeight(aspect, tall ? 1.6 : 1.35);
  const yEnd = topHeight(aspect, tall ? 0.52 : 0.42);
  switch (stage.name) {
    case "intro": return down(yIntro - 1.5 * smoother(stage.t), aspect);
    case "descent": return down(lerp(yIntro - 1.5, BOTTOM_Y, smoother(stage.t)), aspect, ROLL * smoother(stage.t));
    case "land": {
      // halfway, the camera is behind him and above, looking down at about 40 degrees, the wall rising at the top
      const mid: Shot = {
        pos: rotY([-0.8, 6.2, tall ? 9.2 : 7.4], ROLL), target: rotY([-0.6, 0.8, -1], ROLL),
        up: norm(mix(rotY(DOWN_UP, ROLL), LEVEL_UP, 0.5)), fov: lerp(fovFor(false, aspect), fovFor(true, aspect), 0.5),
      };
      if (stage.t < 0.38) return blend(down(BOTTOM_Y, aspect, ROLL), mid, smoother(stage.t / 0.38));
      return blend(mid, roomShot(ROOM_YAW, aspect), smoother((stage.t - 0.38) / 0.62));
    }
    case "room": return roomShot(ROOM_YAW, aspect);
    case "exit": {
      const yaw = ROOM_YAW;
      const leave = roomShot(yaw, aspect);
      if (stage.t < 0.45) return blend(leave, down(BOTTOM_Y, aspect, yaw), smoother(stage.t / 0.45));
      const rise = smoother((stage.t - 0.45) / 0.55);
      return down(lerp(BOTTOM_Y, yEnd, rise), aspect, yaw + 0.7 * rise);
    }
    default: return down(yEnd, aspect, ROOM_YAW + 0.7);
  }
}

/*
 * Where the man is at every point of the scroll: on one spot the whole way, like the man in the reel. He stands a
 * little in front of the middle of the floor, facing the wall the room looks at: seen from above while the camera
 * sinks, from behind once it tilts up, small in the middle as it rises out. He never walks; he stands and looks round
 * (man.ts), and only reaches up once, for the first screen.
 */

import { smoother, type Stage } from "./plan.ts";
import { ROOM_YAW, rotY, type V3 } from "./cam.ts";

export interface Mark {
  x: number;
  z: number;
  face: number;  // where he faces, as the figure's yaw (0 faces +z)
  reach: number; // 0..1 his arm up to the wall
}

/** His spot on the floor. */
export const SPOT: V3 = rotY([0, 0, 0.7], ROOM_YAW);

/** The figure's yaw to face along (dx, dz). */
export const faceAlong = (dx: number, dz: number): number => Math.atan2(dx, dz);

const WALL_AHEAD = rotY([0, 0, -1], ROOM_YAW);
const FACE = faceAlong(WALL_AHEAD[0], WALL_AHEAD[2]);

const band = (t: number, a: number, b: number, c: number, d: number) =>
  Math.max(0, Math.min(1, smoother((t - a) / (b - a)), 1 - smoother((t - c) / (d - c))));

export function markAt(stage: Stage): Mark {
  // as the camera comes level in the room he reaches up, and the first screen comes off the wall
  const reach = stage.name === "land" ? band(stage.t, 0.48, 0.6, 0.74, 0.88) : 0;
  return { x: SPOT[0], z: SPOT[2], face: FACE, reach };
}

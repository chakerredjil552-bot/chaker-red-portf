/*
 * Where the man is at every point of the scroll: on one spot the whole way, like the man in the reel. He stands a
 * little in front of the middle of the floor, facing the wall the room looks at: seen from above while the camera
 * sinks, from behind once it tilts up, small in the middle as it rises out. He never walks and never reaches for the
 * screens: he stands and looks round (man.ts).
 */

import { MAN_AT, ROOM_YAW, rotY, type V3 } from "./cam.ts";

export interface Mark {
  x: number;
  z: number;
  face: number; // where he faces, as the figure's yaw (0 faces +z)
}

/** His spot on the floor. */
export const SPOT: V3 = rotY(MAN_AT, ROOM_YAW);

/** The figure's yaw to face along (dx, dz). */
export const faceAlong = (dx: number, dz: number): number => Math.atan2(dx, dz);

const WALL_AHEAD = rotY([0, 0, -1], ROOM_YAW);
const FACE = faceAlong(WALL_AHEAD[0], WALL_AHEAD[2]);

/** Where he is and which way he faces. The same at every stage of the scroll. */
export function markAt(): Mark {
  return { x: SPOT[0], z: SPOT[2], face: FACE };
}

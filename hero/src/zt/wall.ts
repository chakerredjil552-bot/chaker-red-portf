/*
 * The well: a round wall of screens, ROWS rings of COLS panels each, facing the axis, on a blue floor.
 * World units, y up, the floor at y = 0 and the axis through the origin. Each row turns on its own, the
 * neighbouring rows the other way, as you scroll.
 */

export const WALL = Object.freeze({
  radius: 10,
  rows: 8,
  cols: 28,
  panelW: 2,
  panelH: 3.56, // 9:16, like the videos
  rowGap: 0.34,
  floorGap: 0.5,
});

/** A 16:9 picture on the wall takes the place of two 9:16 panels side by side: as wide as both and the gap between,
 *  16:9 tall, so the wall stays one tidy grid and nothing is cropped. */
const SLOT = (2 * Math.PI * 10) / 28; // the width of one place on the ring (radius 10, 28 places)
export const WIDE_PANEL: [number, number] = [2 * SLOT - (SLOT - 2), ((2 * SLOT - (SLOT - 2)) * 9) / 16];
/** A 16:9 picture shown for a moment on a single place (the one that comes off the wall): as wide as that place. */
export const WIDE_SMALL: [number, number] = [2.16, (2.16 * 9) / 16];

export interface Panel { r: number; c: number; span: 1 | 2; picture: number }

/** The panels of every row: each 9:16 picture takes one place, each 16:9 picture two, and every row is filled exactly.
 *  Pictures are spread so neighbours differ. */
export function layout(count: number, wide: (picture: number) => boolean): Panel[] {
  const out: Panel[] = [];
  for (let r = 0; r < WALL.rows; r++) {
    let c = 0;
    while (c < WALL.cols) {
      let pic = cellFor(r, c, count), tries = 0;
      // a wide picture needs two places; at the end of a row, take the next tall one instead
      while (wide(pic) && c === WALL.cols - 1 && tries++ < count) pic = (pic + 1) % Math.max(1, count);
      const span: 1 | 2 = wide(pic) && c < WALL.cols - 1 ? 2 : 1;
      out.push({ r, c, span, picture: pic });
      c += span;
    }
  }
  return out;
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Height of the centre of row `r` (0 is the bottom row). */
export const rowY = (r: number): number => WALL.floorGap + WALL.panelH / 2 + r * (WALL.panelH + WALL.rowGap);
/** Height of the top edge of the wall. */
export const WALL_TOP = rowY(WALL.rows - 1) + WALL.panelH / 2;

/** +1 or -1: neighbouring rows turn opposite ways. */
export const rowDir = (r: number): number => (r % 2 ? 1 : -1);

/**
 * How far row `r` has turned, in degrees: it turns with the scroll (`scroll` in viewport heights) and drifts a little
 * on its own (`time` in seconds). Each row starts a little offset, so the columns never line up.
 */
export function rowTurn(r: number, scroll: number, time: number): number {
  return rowDir(r) * (scroll * 16 + time * 1.5) + r * 6.43;
}

/** Angle round the axis of panel `c` of a row turned by `turnDeg`, in radians. 0 points to +z, PI to -z. */
export function slotAngle(c: number, turnDeg: number): number {
  return (c / WALL.cols) * TAU + turnDeg * DEG;
}

/** Where a panel's centre is, and its yaw: the panel faces the axis. */
export function slotPose(r: number, c: number, turnDeg: number): { x: number; y: number; z: number; yaw: number } {
  const a = slotAngle(c, turnDeg);
  return { x: Math.sin(a) * WALL.radius, y: rowY(r), z: Math.cos(a) * WALL.radius, yaw: a + Math.PI };
}

/** Smallest difference between two angles, in radians: [0, PI]. */
export function angleGap(a: number, b: number): number {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return d > Math.PI ? TAU - d : d;
}

/** The panel of a row that is nearest to the direction `angle` (radians round the axis). */
export function nearestSlot(turnDeg: number, angle: number): number {
  let best = 0, gap = Infinity;
  for (let c = 0; c < WALL.cols; c++) {
    const g = angleGap(slotAngle(c, turnDeg), angle);
    if (g < gap) { gap = g; best = c; }
  }
  return best;
}

/** Which picture a panel shows, spread so neighbours (side by side and above) differ. */
export function cellFor(r: number, c: number, cells: number): number {
  if (cells <= 0) return 0;
  return (c * 3 + r * 7) % cells;
}

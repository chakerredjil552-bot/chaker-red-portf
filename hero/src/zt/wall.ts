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

/** A panel showing a 16:9 picture keeps that shape: as wide as a slot allows, 16:9 tall. The others are 9:16. */
export const WIDE_PANEL: [number, number] = [2.16, (2.16 * 9) / 16];

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

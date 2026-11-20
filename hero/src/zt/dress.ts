/*
 * The man's clothes and hair, cut to fit the body they go on: a long coat to the calves with sleeves to the wrist,
 * a raised collar, short hair with some volume on top, ears and a nose for the profile. Everything is built in the
 * body's rest pose (a T-pose, 1.83 m tall, facing +z, his left at +x) and skinned to the same bones, so it moves with
 * him. The coat follows the shape of the body (measured all round at every height) a few centimetres out; below the
 * hips it hangs free and flares, and it swings with the thighs. Plain arrays in, plain arrays out: the build tool
 * writes the result into the model file.
 */

export interface Body {
  pos: ArrayLike<number>;
  joints: ArrayLike<number>;
  weights: ArrayLike<number>;
  index: ArrayLike<number>;
  bones: string[]; // joint names, in the order the joint indices refer to
}

export interface Part {
  pos: number[];
  nrm: number[];
  joints: number[]; // four per vertex
  weights: number[]; // four per vertex, summing to 1
  index: number[];
}

/** Rest-pose measurements the cut depends on (metres). */
export const FIT = {
  hem: 0.34,          // the coat ends at mid-calf
  top: 1.52,          // where the coat meets the collar
  hips: 1.0,          // below this it hangs free of the body
  ease: 0.022,        // how far the coat stands off the body
  axisZ: -0.015,      // the body's vertical axis, front to back
  arm: { y: 1.441, z: -0.065, from: 0.19, to: 0.75 },
  head: [0, 1.69, 0] as const,
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

type Inf = Map<number, number>;

/** A ring-by-angle table of how far the body reaches out from an axis. */
class Grid {
  readonly v: Float32Array;
  readonly rows: number;
  readonly cols: number;
  constructor(rows: number, cols: number) { this.rows = rows; this.cols = cols; this.v = new Float32Array(rows * cols); }
  at(r: number, c: number) { return this.v[Math.max(0, Math.min(this.rows - 1, r)) * this.cols + (((c % this.cols) + this.cols) % this.cols)]; }
  put(r: number, c: number, x: number) {
    if (r < 0 || r >= this.rows) return;
    const i = r * this.cols + (((c % this.cols) + this.cols) % this.cols);
    if (x > this.v[i]) this.v[i] = x;
  }
  /** Empty cells take the value between their filled neighbours round the ring. */
  fill() {
    const { rows, cols, v } = this;
    for (let r = 0; r < rows; r++) {
      const full: number[] = [];
      for (let c = 0; c < cols; c++) if (v[r * cols + c] > 0) full.push(c);
      if (!full.length || full.length === cols) continue;
      for (let c = 0; c < cols; c++) {
        if (v[r * cols + c] > 0) continue;
        let a = full[full.length - 1], b = full[0];
        for (const f of full) { if (f < c) a = f; else { b = f; break; } }
        const da = (c - a + cols) % cols, db = (b - c + cols) % cols;
        v[r * cols + c] = lerp(v[r * cols + a], v[r * cols + b], da / (da + db));
      }
    }
  }
  blur(round: number, along: number) {
    const { rows, cols } = this;
    const tmp = new Float32Array(this.v.length);
    for (let p = 0; p < round; p++) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tmp[r * cols + c] = (this.at(r, c - 1) + 2 * this.at(r, c) + this.at(r, c + 1)) / 4;
      this.v.set(tmp);
    }
    for (let p = 0; p < along; p++) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const a = this.at(r - 1, c), b = this.at(r, c), d = this.at(r + 1, c);
        // an empty ring (past the end of the body) does not pull its neighbours in
        tmp[r * cols + c] = b > 0 ? ((a > 0 ? a : b) + 2 * b + (d > 0 ? d : b)) / 4 : 0;
      }
      this.v.set(tmp);
    }
  }
  /** Value at a fractional row and column, wrapping round the ring. */
  sample(r: number, c: number) {
    const r0 = Math.floor(r), c0 = Math.floor(c), fr = r - r0, fc = c - c0;
    return lerp(lerp(this.at(r0, c0), this.at(r0, c0 + 1), fc), lerp(this.at(r0 + 1, c0), this.at(r0 + 1, c0 + 1), fc), fr);
  }
}

export function boneIndex(body: Body, name: string): number {
  const i = body.bones.indexOf(name);
  if (i < 0) throw new Error(`no bone ${name}`);
  return i;
}

function dominant(body: Body, v: number): number {
  let best = 0, bw = -1;
  for (let k = 0; k < 4; k++) {
    const w = body.weights[v * 4 + k];
    if (w > bw) { bw = w; best = body.joints[v * 4 + k]; }
  }
  return best;
}

/** Points spread over every triangle of the body whose corners all belong to `keep` bones, about a centimetre apart. */
function surface(body: Body, keep: Set<number>, visit: (x: number, y: number, z: number) => void) {
  const P = body.pos, I = body.index;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!keep.has(dominant(body, a)) || !keep.has(dominant(body, b)) || !keep.has(dominant(body, c))) continue;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const edge = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(ux - vx, uy - vy, uz - vz));
    const n = Math.max(1, Math.ceil(edge / 0.01));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const s = i / n, q = j / n;
      visit(ax + ux * s + vx * q, ay + uy * s + vy * q, az + uz * s + vz * q);
    }
  }
}

/** Skin weights for a point, borrowed from the nearest body vertices of `keep` bones. */
function borrow(body: Body, keep: Set<number>, k = 6) {
  const verts: number[] = [];
  for (let v = 0; v < body.pos.length / 3; v++) if (keep.has(dominant(body, v))) verts.push(v);
  return (x: number, y: number, z: number): Inf => {
    const near: [number, number][] = [];
    for (const v of verts) {
      const d = (body.pos[v * 3] - x) ** 2 + (body.pos[v * 3 + 1] - y) ** 2 + (body.pos[v * 3 + 2] - z) ** 2;
      if (near.length < k || d < near[near.length - 1][1]) {
        near.push([v, d]);
        near.sort((p, q) => p[1] - q[1]);
        if (near.length > k) near.pop();
      }
    }
    const inf: Inf = new Map();
    for (const [v, d] of near) {
      const s = 1 / (d + 1e-4);
      for (let j = 0; j < 4; j++) {
        const w = body.weights[v * 4 + j];
        if (w > 0) inf.set(body.joints[v * 4 + j], (inf.get(body.joints[v * 4 + j]) ?? 0) + w * s);
      }
    }
    return inf;
  };
}

class Builder {
  readonly part: Part = { pos: [], nrm: [], joints: [], weights: [], index: [] };
  private start = 0;
  begin() { this.start = this.part.pos.length / 3; return this.start; }
  vertex(x: number, y: number, z: number, inf: Inf) {
    const top = [...inf].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
    this.part.pos.push(x, y, z);
    for (let k = 0; k < 4; k++) {
      this.part.joints.push(top[k]?.[0] ?? 0);
      this.part.weights.push(top[k] ? top[k][1] / sum : 0);
    }
  }
  /** A sheet of `rows` by `cols` vertices (added row by row since begin()), closed round its columns. */
  sheet(rows: number, cols: number, closed = true) {
    const s = this.start;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < (closed ? cols : cols - 1); c++) {
      const a = s + r * cols + c, b = s + r * cols + ((c + 1) % cols), d = s + (r + 1) * cols + c, e = s + (r + 1) * cols + ((c + 1) % cols);
      this.part.index.push(a, d, e, a, e, b);
    }
  }
  /** Smooth normals for everything since begin(), facing away from `centre` of each vertex; triangles are wound
   *  the same way (counter-clockwise seen from outside), so the outside is the front face. */
  normals(centre: (i: number) => [number, number, number]) {
    const P = this.part.pos, N = new Float32Array(P.length);
    const from = this.start;
    const idx = this.part.index;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (a < from) continue;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const [cx, cy, cz] = centre(a);
      if (nx * (P[a * 3] - cx) + ny * (P[a * 3 + 1] - cy) + nz * (P[a * 3 + 2] - cz) < 0) {
        idx[t + 1] = c; idx[t + 2] = b;
        nx = -nx; ny = -ny; nz = -nz;
      }
      for (const v of [a, b, c]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; }
    }
    for (let v = from; v < P.length / 3; v++) {
      let nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
      const [cx, cy, cz] = centre(v);
      if (nx * (P[v * 3] - cx) + ny * (P[v * 3 + 1] - cy) + nz * (P[v * 3 + 2] - cz) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      this.part.nrm.push(nx / l, ny / l, nz / l);
    }
  }
}

/** An ellipsoid, for ears and the nose. Its normals lean toward `face`, the way the skin under it faces, so it
 *  shows in the outline without a ring of light round it. */
function blob(out: Builder, c: [number, number, number], r: [number, number, number], inf: Inf, face: [number, number, number]) {
  out.begin();
  const rows = 9, cols = 12;
  for (let i = 0; i < rows; i++) {
    const e = -Math.PI / 2 + (Math.PI * i) / (rows - 1);
    for (let j = 0; j < cols; j++) {
      const a = (TAU * j) / cols;
      out.vertex(c[0] + r[0] * Math.cos(e) * Math.sin(a), c[1] + r[1] * Math.sin(e), c[2] + r[2] * Math.cos(e) * Math.cos(a), inf);
    }
  }
  out.sheet(rows, cols);
  const from = out.part.nrm.length;
  out.normals(() => c);
  const N = out.part.nrm;
  for (let i = from; i < N.length; i += 3) {
    const x = N[i] * 0.35 + face[0] * 0.65, y = N[i + 1] * 0.35 + face[1] * 0.65, z = N[i + 2] * 0.35 + face[2] * 0.65;
    const l = Math.hypot(x, y, z) || 1;
    N[i] = x / l; N[i + 1] = y / l; N[i + 2] = z / l;
  }
}

export function dress(body: Body): Part {
  const B = (n: string) => boneIndex(body, n);
  const hips = B("DEF-hips"), chest = B("DEF-spine.003"), neck = B("DEF-neck"), head = B("DEF-head");
  const thighL = B("DEF-thigh.L"), thighR = B("DEF-thigh.R");
  const trunk = new Set([hips, B("DEF-spine.001"), B("DEF-spine.002"), chest, B("DEF-shoulder.L"), B("DEF-shoulder.R"), neck]);
  const out = new Builder();

  // ---- the coat: rings from the hem to the shoulders --------------------------------------------------------
  const COLS = 48, DY = 0.02, P0 = 0.3;
  const prof = new Grid(Math.round((1.62 - P0) / DY) + 1, COLS);
  const angleOf = (x: number, z: number) => Math.atan2(x, z - FIT.axisZ);
  surface(body, new Set([...trunk, thighL, thighR]), (x, y, z) => {
    const c = Math.floor(((angleOf(x, z) + Math.PI) / TAU) * COLS);
    prof.put(Math.round((y - P0) / DY), c, Math.hypot(x, z - FIT.axisZ));
  });
  prof.fill();
  prof.blur(2, 2);
  // over the waist the coat hangs straight down from the chest, it does not follow the body in
  const hang = new Grid(prof.rows, COLS);
  for (let r = 0; r < prof.rows; r++) for (let c = 0; c < COLS; c++) {
    const y = P0 + r * DY;
    let m = prof.at(r, c);
    if (y < 1.3) for (let d = -4; d <= 4; d++) if (P0 + (r + d) * DY < 1.38) m = Math.max(m, prof.at(r + d, c) * (1 - Math.abs(d) * 0.012));
    hang.v[r * COLS + c] = m;
  }
  hang.blur(1, 1);
  const angle = (c: number) => -Math.PI + ((c + 0.5) * TAU) / COLS;
  const rows = Math.round((FIT.top - FIT.hem) / DY) + 1;
  const radius = new Grid(rows, COLS);
  for (let i = 0; i < rows; i++) {
    const y = FIT.hem + i * DY;
    for (let c = 0; c < COLS; c++) {
      const th = angle(c);
      const p = hang.at(Math.round((y - P0) / DY), c);
      let r = p > 0 ? p + FIT.ease : 0;
      if (y < FIT.hips + 0.04) {
        // below the hips: an oval that widens to the hem, a little deeper at the back where the coat hangs off
        const t = Math.max(0, (FIT.hips - y) / (FIT.hips - FIT.hem));
        const rx = lerp(0.178, 0.245, t), rz = lerp(0.145, 0.195, t) * (Math.cos(th) < 0 ? 1.04 : 1);
        r = Math.max(r, (rx * rz) / Math.hypot(rz * Math.sin(th), rx * Math.cos(th)));
      }
      radius.v[i * COLS + c] = r;
    }
  }
  radius.blur(1, 2);
  const trunkInf = borrow(body, trunk);
  out.begin();
  for (let i = 0; i < rows; i++) {
    const y = FIT.hem + i * DY;
    for (let c = 0; c < COLS; c++) {
      const th = angle(c), r = radius.at(i, c);
      const x = r * Math.sin(th), z = FIT.axisZ + r * Math.cos(th);
      // round the hips the coat moves with the body; lower down, more and more with the thigh on its side
      const legs = 0.62 * smooth(0.97, 0.62, y);
      const left = smooth(-0.7, 0.7, Math.sin(th));
      const free: Inf = new Map([[hips, 1 - legs], [thighL, legs * left], [thighR, legs * (1 - left)]]);
      const m = smooth(1.03, 0.93, y);
      let inf = free;
      if (m < 1) {
        inf = new Map();
        const worn = trunkInf(x * 0.9, y, FIT.axisZ + (z - FIT.axisZ) * 0.9);
        const ws = [...worn.values()].reduce((s, w) => s + w, 0) || 1;
        for (const [j, w] of worn) inf.set(j, (w / ws) * (1 - m));
        for (const [j, w] of free) inf.set(j, (inf.get(j) ?? 0) + w * m);
      }
      out.vertex(x, y, z, inf);
    }
  }
  out.sheet(rows, COLS);
  out.normals((v) => [0, out.part.pos[v * 3 + 1], FIT.axisZ]);

  // ---- sleeves: tubes round each arm from the shoulder to the wrist -------------------------------------------
  for (const side of [1, -1]) {
    const s = side > 0 ? "L" : "R";
    const arm = new Set([B(`DEF-upper_arm.${s}`), B(`DEF-forearm.${s}`)]);
    const AC = 20, DU = 0.02, U0 = 0.1;
    const ap = new Grid(Math.round((0.8 - U0) / DU) + 1, AC);
    const phiOf = (y: number, z: number) => Math.atan2(z - FIT.arm.z, y - FIT.arm.y);
    surface(body, arm, (x, y, z) => {
      ap.put(Math.round((x * side - U0) / DU), Math.floor(((phiOf(y, z) + Math.PI) / TAU) * AC), Math.hypot(y - FIT.arm.y, z - FIT.arm.z));
    });
    ap.fill();
    ap.blur(2, 3);
    const armInf = borrow(body, new Set([...arm, B(`DEF-shoulder.${s}`)]));
    const n = Math.round((FIT.arm.to - FIT.arm.from) / DU) + 1;
    out.begin();
    for (let i = 0; i < n; i++) {
      const u = FIT.arm.from + i * DU;
      for (let c = 0; c < AC; c++) {
        const phi = -Math.PI + ((c + 0.5) * TAU) / AC;
        // a little narrower where it meets the shoulder, so it does not stand up like a pad
        const r = (Math.max(0.04, ap.at(Math.round((u - U0) / DU), c) + 0.012) + 0.006 * smooth(0.66, 0.75, u)) * (0.86 + 0.14 * smooth(0.19, 0.27, u));
        const y = FIT.arm.y + r * Math.cos(phi), z = FIT.arm.z + r * Math.sin(phi);
        out.vertex(side * u, y, z, armInf(side * u, FIT.arm.y + (y - FIT.arm.y) * 0.7, FIT.arm.z + (z - FIT.arm.z) * 0.7));
      }
    }
    out.sheet(n, AC);
    out.normals((v) => [out.part.pos[v * 3], FIT.arm.y, FIT.arm.z]);
  }

  // ---- the collar, turned up, open at the front -----------------------------------------------------------------
  {
    const NC = 32, NR = 7, zc = -0.02;
    const np = new Grid(Math.round((1.64 - 1.44) / 0.02) + 1, NC);
    surface(body, new Set([neck, head]), (x, y, z) => {
      np.put(Math.round((y - 1.44) / 0.02), Math.floor(((Math.atan2(x, z - zc) + Math.PI) / TAU) * NC), Math.hypot(x, z - zc));
    });
    np.fill();
    np.blur(2, 1);
    out.begin();
    for (let j = 0; j < NR; j++) {
      const f = j / (NR - 1);
      for (let c = 0; c < NC; c++) {
        const th = -Math.PI + ((c + 0.5) * TAU) / NC;
        const front = smooth(0.5, 1, Math.cos(th));
        const y = lerp(1.47, 1.598 - 0.075 * front, f);
        const r = Math.max(0.07, np.at(Math.round((y - 1.44) / 0.02), c) + 0.016) + 0.02 * f ** 1.4 + 0.008 * (1 - f);
        const up = 0.65 * smooth(0.25, 1, f);
        out.vertex(r * Math.sin(th), y, zc + r * Math.cos(th), new Map([[chest, 1 - up], [neck, up]]));
      }
    }
    out.sheet(NR, NC);
    out.normals((v) => [0, out.part.pos[v * 3 + 1], zc]);
  }

  // ---- hair: short, fuller on top, a little lift at the front -----------------------------------------------------
  const [hx, hy, hz] = FIT.head;
  const ER = 31, EC = 48, E0 = -60, DE = 5;
  const hp = new Grid(ER, EC);
  const dirOf = (x: number, y: number, z: number) => {
    const dx = x - hx, dy = y - hy, dz = z - hz, r = Math.hypot(dx, dy, dz);
    return { e: (Math.asin(dy / r) * 180) / Math.PI, a: Math.atan2(dx, dz), r };
  };
  surface(body, new Set([head]), (x, y, z) => {
    const d = dirOf(x, y, z);
    hp.put(Math.round((d.e - E0) / DE), Math.floor(((d.a + Math.PI) / TAU) * EC), d.r);
  });
  hp.fill();
  hp.blur(1, 1);
  const scalp = (e: number, a: number) => hp.sample((e - E0) / DE, ((a + Math.PI) / TAU) * EC - 0.5);
  {
    const R = 32, C = 48;
    out.begin();
    for (let i = 0; i < R; i++) {
      const e = lerp(-48, 90, i / (R - 1));
      for (let c = 0; c < C; c++) {
        const a = -Math.PI + (c * TAU) / C;
        const back = smooth(0, 1, (1 - Math.cos(a)) / 2);
        const line = lerp(24, -42, back);                       // the hairline, in degrees of elevation
        const grow = smooth(line, line + 14, e);
        const side = smooth(0.55, 1, Math.abs(Math.sin(a))) * (1 - smooth(8, 40, e));
        const front = smooth(0.4, 1, Math.cos(a));
        let t = 0.012 + 0.02 * smooth(22, 78, e) + 0.013 * front * smooth(18, 52, e) * (1 - smooth(70, 90, e)) + 0.004 * back;
        t *= 1 - 0.4 * side;
        t += 0.0035 * Math.sin(a * 9 + e * 0.23) * Math.sin(e * 0.37 + a * 4) * smooth(10, 40, e);  // tousled
        // where there is no hair the sheet tucks just under the skin, so the hairline is clean
        const r = scalp(e, a) + lerp(-0.004, 0.0015, smooth(0, 0.15, grow)) + Math.max(0, t) * grow;
        const ce = Math.cos((e * Math.PI) / 180), se = Math.sin((e * Math.PI) / 180);
        out.vertex(hx + r * ce * Math.sin(a), hy + r * se, hz + r * ce * Math.cos(a), new Map([[head, 1]]));
      }
    }
    out.sheet(R, C);
    out.normals(() => [hx, hy, hz]);
  }

  // ---- ears and nose, so his profile reads ------------------------------------------------------------------------
  const one: Inf = new Map([[head, 1]]);
  for (const side of [1, -1]) {
    const r = scalp(-4, (side * Math.PI) / 2);
    blob(out, [side * (r + 0.001), hy - 0.014, hz - 0.024], [0.008, 0.028, 0.016], one, [side, 0, 0]);
  }
  const face = scalp(-8, 0);
  blob(out, [hx, hy - 0.03, hz + face - 0.002], [0.008, 0.026, 0.014], one, [0, 0, 1]);
  return out.part;
}

// A strip of original manga panels about Miyamoto Musashi, drawn procedurally: brush strokes, ink wash,
// screentone, focus lines and lettering. Musashi's words are his own (Dokkodo and Gorin no Sho, 1645).
// The strip tiles horizontally: half a gutter at each end.
const C = document.getElementById("c"), X = C.getContext("2d");
const W = C.width, H = C.height;
const INK = "#121014", PAPER = "#f4f0e7";
const MINCHO = '"Shippori Mincho B1"', BRUSH = '"Yuji Syuku"', LETTER = '"Bangers"';

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let R = mulberry(1645);
const rand = (a = 0, b = 1) => a + (b - a) * R();
function noise1(seed) {
  const r = mulberry(seed), g = Array.from({ length: 512 }, () => r() * 2 - 1);
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return g[i & 511] * (1 - u) + g[(i + 1) & 511] * u; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// one reusable layer, so dry-brush gaps can be cut out of each stroke
const L = document.createElement("canvas"); L.width = W; L.height = H; const LX = L.getContext("2d");

/** A brush stroke along pts: tapered ends, wobbling width, dry bristle gaps toward the end. */
function brush(ctx, pts, w, o = {}) {
  const n = pts.length; if (n < 2) return;
  const nz = noise1(o.seed ?? (R() * 1e6 | 0)), nz2 = noise1((o.seed ?? 3) + 99);
  const len = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len[n - 1] || 1, t0 = o.t0 ?? 0.08, t1 = o.t1 ?? 0.3;
  const left = [], right = [], hw = [];
  for (let i = 0; i < n; i++) {
    const t = len[i] / total, a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const prof = o.profile ? o.profile(t) : Math.pow(Math.min(smooth(0, t0, t), smooth(1, 1 - t1, t)), 0.6);
    const h = Math.max(0.3, (w / 2) * prof * (1 + (o.wobble ?? 0.22) * nz(len[i] / 40)));
    hw.push(h);
    left.push([pts[i][0] - dy * h, pts[i][1] + dx * h]);
    right.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
  }
  const g = LX;
  g.save(); g.setTransform(ctx.getTransform()); g.clearRect(-W * 2, -H * 2, W * 6, H * 6);
  g.globalCompositeOperation = "source-over";
  g.fillStyle = o.color ?? INK;
  g.beginPath(); g.moveTo(left[0][0], left[0][1]);
  for (const p of left) g.lineTo(p[0], p[1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath(); g.fill();
  const dry = o.dry ?? 0.35;
  if (dry > 0) {
    g.globalCompositeOperation = "destination-out";
    const bristles = Math.max(4, Math.round(w / 3));
    for (let k = 0; k < bristles; k++) {
      const off = (k / (bristles - 1)) * 2 - 1, bn = noise1((o.seed ?? 7) * 31 + k);
      g.lineWidth = Math.max(0.6, w / bristles * 0.55); g.lineCap = "round";
      g.beginPath(); let on = false;
      for (let i = 0; i < n; i++) {
        const t = len[i] / total, a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const gap = bn(len[i] / 25) + (t - (1 - dry)) * 2.2 + Math.abs(off) * 0.5 - 0.55 + 0.25 * nz2(len[i] / 60);
        const x = pts[i][0] - dy * hw[i] * off * 0.92, y = pts[i][1] + dx * hw[i] * off * 0.92;
        if (gap > 0) { if (!on) { g.moveTo(x, y); on = true; } else g.lineTo(x, y); } else on = false;
      }
      g.stroke();
    }
  }
  g.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = o.alpha ?? 1; ctx.drawImage(L, 0, 0); ctx.restore();
}

/** Sample a cubic bezier (or a chain of them) into points. */
function bez(p0, p1, p2, p3, steps = 60) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}

/** Screentone: dots on a rotated grid, sized by density(x, y) in 0..1. */
function tone(ctx, x0, y0, w, h, density, sp = 9, ang = 45) {
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip(); ctx.fillStyle = INK;
  const a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cx = x0 + w / 2, cy = y0 + h / 2, rr = Math.hypot(w, h) / 2 + sp;
  for (let gy = -rr; gy <= rr; gy += sp) for (let gx = -rr; gx <= rr; gx += sp) {
    const x = cx + gx * ca - gy * sa, y = cy + gx * sa + gy * ca;
    if (x < x0 - sp || x > x0 + w + sp || y < y0 - sp || y > y0 + h + sp) continue;
    const d = density(x, y); if (d <= 0.02) continue;
    ctx.beginPath(); ctx.arc(x, y, sp * 0.62 * Math.sqrt(Math.min(1, d)), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Manga focus lines: tapered spikes from far outside toward an inner ellipse. */
function focus(ctx, cx, cy, rx, ry, count, o = {}) {
  ctx.save(); ctx.fillStyle = o.color ?? INK;
  const far = Math.hypot(W, H);
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), k = rand(0.85, 1.5), base = rand(o.w0 ?? 1.5, o.w1 ?? 7);
    const ix = cx + Math.cos(a) * rx * k, iy = cy + Math.sin(a) * ry * k;
    const ox = cx + Math.cos(a) * far, oy = cy + Math.sin(a) * far, px = -Math.sin(a) * base, py = Math.cos(a) * base;
    ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ox + px, oy + py); ctx.lineTo(ox - px, oy - py); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** Horizontal speed lines. */
function speed(ctx, x0, y0, w, h, count, o = {}) {
  ctx.save(); ctx.fillStyle = o.color ?? INK;
  for (let i = 0; i < count; i++) {
    const y = rand(y0, y0 + h), len = rand(w * 0.25, w * 0.9), x = o.fromRight ? x0 + w - len : x0, th = rand(0.6, 3.2);
    ctx.beginPath();
    if (o.fromRight) { ctx.moveTo(x0 + w + 10, y - th); ctx.lineTo(x0 + w + 10, y + th); ctx.lineTo(x, y); }
    else { ctx.moveTo(x - 10, y - th); ctx.lineTo(x - 10, y + th); ctx.lineTo(x + len, y); }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function splatter(ctx, cx, cy, r, count) {
  ctx.save(); ctx.fillStyle = INK;
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), d = r * Math.pow(rand(), 0.6), s = rand(0.8, 5) * (1 - d / r * 0.6);
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Vertical Japanese text, top to bottom, columns right to left. */
function vtext(ctx, cols, x, y, size, font, o = {}) {
  if (o.card) {
    const n = Math.max(...cols.map((c) => [...c].length)), cw = size * (o.colGap ?? 1.25);
    ctx.save(); ctx.fillStyle = PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    const bx = x - (cols.length - 1) * cw - size * 0.75, bw = (cols.length - 1) * cw + size * 1.5, bh = n * size * (o.lead ?? 1.06) + size * 0.8;
    ctx.fillRect(bx, y - size * 0.4, bw, bh); ctx.strokeRect(bx, y - size * 0.4, bw, bh); ctx.restore();
  }
  ctx.save(); ctx.fillStyle = o.color ?? INK; ctx.font = `${o.weight ?? 800} ${size}px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  cols.forEach((col, ci) => {
    const cx = x - ci * size * (o.colGap ?? 1.25);
    [...col].forEach((ch, i) => {
      const cy = y + i * size * (o.lead ?? 1.06) + size / 2;
      if ("、。".includes(ch)) ctx.fillText(ch, cx + size * 0.32, cy - size * 0.32);
      else if (ch === "ー") { ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore(); }
      else ctx.fillText(ch, cx, cy);
    });
  });
  ctx.restore();
}

/** A speech bubble or a narration box with lettering. */
function bubble(ctx, cx, cy, rw, rh, lines, o = {}) {
  ctx.save();
  const size = o.size ?? 30;
  ctx.font = `${o.weight ?? 800} ${size}px ${o.font ?? MINCHO}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = (o.track ?? 0.04) * size + "px";
  const tw = Math.max(...lines.map((ln) => ctx.measureText(ln).width)), th = lines.length * size * (o.lh ?? 1.18);
  if (o.box) { rw = Math.max(rw, tw / 2 + size * 0.7); rh = Math.max(rh, th / 2 + size * 0.45); }
  else { rw = Math.max(rw, tw / 2 * 1.32 + size * 0.5); rh = Math.max(rh, th / 2 * 1.32 + size * 0.4); }
  ctx.fillStyle = o.fill ?? "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = o.lw ?? 4;
  ctx.beginPath();
  if (o.box) ctx.rect(cx - rw, cy - rh, rw * 2, rh * 2);
  else {
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    if (o.tail) {
      const [tx, ty] = o.tail, a = Math.atan2(ty - cy, tx - cx), s = 0.22;
      ctx.moveTo(cx + Math.cos(a - s) * rw * 0.92, cy + Math.sin(a - s) * rh * 0.92);
      ctx.quadraticCurveTo(cx + Math.cos(a) * rw * 1.05, cy + Math.sin(a) * rh * 1.05, tx, ty);
      ctx.quadraticCurveTo(cx + Math.cos(a + s * 0.4) * rw * 1.02, cy + Math.sin(a + s * 0.4) * rh * 1.02, cx + Math.cos(a + s) * rw * 0.92, cy + Math.sin(a + s) * rh * 0.92);
    }
  }
  ctx.fill(); ctx.stroke();
  if (o.tail && !o.box) { // hide the seam between the tail and the ellipse
    ctx.beginPath(); ctx.ellipse(cx, cy, rw - ctx.lineWidth, rh - ctx.lineWidth, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const lh = size * (o.lh ?? 1.18), top = cy - (lines.length - 1) * lh / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, cx, top + i * lh));
  ctx.restore();
}

function source(ctx, text, x, y, align = "left", color = INK) {
  ctx.save(); ctx.font = `600 19px ${MINCHO}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillText(text, x, y); ctx.restore();
}

/** Draw one panel: clip to it, call fn in local coordinates, then the border. */
function panel(x0, y0, x1, y1, fn) {
  const w = x1 - x0, h = y1 - y0;
  X.save(); X.translate(x0, y0); X.beginPath(); X.rect(0, 0, w, h); X.clip();
  X.fillStyle = PAPER; X.fillRect(0, 0, w, h);
  fn(X, w, h);
  X.restore();
  X.save(); X.strokeStyle = INK; X.lineWidth = 7; X.strokeRect(x0 + 3.5, y0 + 3.5, w - 7, h - 7); X.restore();
}

function grass(ctx, x0, x1, y, hmin, hmax, count, lean = 0.3) {
  for (let i = 0; i < count; i++) {
    const x = rand(x0, x1), h = rand(hmin, hmax), l = rand(-lean, lean) + 0.35;
    brush(ctx, bez([x, y], [x + h * l * 0.2, y - h * 0.4], [x + h * l * 0.6, y - h * 0.8], [x + h * l, y - h], 14), rand(3, 7), { t0: 0.02, t1: 0.9, dry: 0.2, wobble: 0.1 });
  }
}

/* ---------------- the panels ---------------- */

// 1. Musashi stands with both swords drawn, against a white sun
function pMusashi(c, w, h) {
  tone(c, 0, 0, w, h, (x, y) => 0.75 - y / h * 0.65 + 0.04 * Math.sin(x / 30), 10);
  const cx = w * 0.5, gy = h - 120, sunY = gy - 620;
  c.fillStyle = PAPER; c.beginPath(); c.arc(cx, sunY, 238, 0, Math.PI * 2); c.fill();
  c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(cx, sunY, 238, 0, Math.PI * 2); c.stroke();
  // ground
  c.fillStyle = INK; c.beginPath(); c.moveTo(0, gy + 6);
  for (let x = 0; x <= w; x += 20) c.lineTo(x, gy + 6 + Math.sin(x / 70) * 6 + rand(-3, 3));
  c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
  grass(c, 0, w, gy + 10, 30, 90, 70, 0.5);
  // wind through the sky, behind him
  for (let i = 0; i < 9; i++) { const y = rand(80, gy - 300); brush(c, bez([-20, y], [w * 0.3, y - 10], [w * 0.6, y + 14], [w + 20, y - 6], 30), rand(2, 4), { t0: 0.3, t1: 0.4, dry: 0.5, color: PAPER }); }
  c.fillStyle = INK; c.beginPath(); c.ellipse(cx + 16, gy + 12, 170, 14, 0, 0, Math.PI * 2); c.fill();
  // the figure, feet at (cx, gy): drawn twice, a paper halo first, then the ink
  c.save(); c.translate(cx, gy); c.scale(0.8, 0.8);
  const body = new Path2D(`
    M-56 -332 C-80 -250 -110 -120 -138 -8 L-92 2 C-68 -40 -40 -110 -16 -164 L16 -164 C40 -110 68 -40 92 2 L138 -8 C110 -120 80 -250 56 -332 Z
    M-124 -6 L-58 -10 L-52 6 L-130 8 Z M58 -10 L124 -6 L130 8 L52 6 Z
    M-58 -330 C-64 -400 -84 -470 -104 -536 C-80 -568 -44 -590 -18 -598 L18 -598 C44 -590 80 -568 104 -536 C84 -470 64 -400 58 -330 Z
    M92 -548 C130 -552 170 -500 228 -404 L232 -380 C228 -330 224 -292 216 -262 C190 -270 158 -276 130 -280 C120 -330 108 -400 92 -470 Z
    M-92 -548 C-130 -552 -170 -500 -228 -404 L-232 -380 C-228 -330 -224 -292 -216 -262 C-190 -270 -158 -276 -130 -280 C-120 -330 -108 -400 -92 -470 Z
    M-18 -592 L18 -592 L16 -616 L-16 -616 Z
    M0 -708 C30 -708 46 -684 46 -654 C46 -622 26 -600 0 -600 C-26 -600 -46 -622 -46 -654 C-46 -684 -30 -708 0 -708 Z`);
  const hands = new Path2D("M232 -404 a18 18 0 1 0 0.1 0 Z M-232 -404 a18 18 0 1 0 0.1 0 Z");
  const blade = (x0, y0, x1, y1, w0, curve) => {
    const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny), ux = nx / l, uy = ny / l;
    const m = [(x0 + x1) / 2 + ux * curve, (y0 + y1) / 2 + uy * curve], sp = bez([x0, y0], m, m, [x1, y1], 40), p = new Path2D();
    sp.forEach((q, i) => { const ww = w0 * (1 - Math.pow(i / 40, 5)); i ? p.lineTo(q[0] + ux * ww, q[1] + uy * ww) : p.moveTo(q[0] + ux * ww, q[1] + uy * ww); });
    for (let i = 40; i >= 0; i--) { const ww = w0 * 0.35 * (1 - Math.pow(i / 40, 5)); p.lineTo(sp[i][0] - ux * ww, sp[i][1] - uy * ww); }
    p.closePath(); return p;
  };
  const long = blade(244, -380, 318, 10, 12, -16), short = blade(-244, -380, -318, -120, 11, 12);
  c.strokeStyle = PAPER; c.lineJoin = "round"; c.lineWidth = 10;
  for (const p of [body, hands]) c.stroke(p);
  c.lineWidth = 16; for (const p of [long, short]) c.stroke(p);
  c.fillStyle = INK; for (const p of [body, hands, long, short]) c.fill(p);
  // the steel catches the sun
  c.strokeStyle = PAPER; c.lineWidth = 2;
  c.lineWidth = 3; c.beginPath(); c.moveTo(256, -366); c.quadraticCurveTo(290, -180, 314, 0); c.moveTo(-256, -366); c.quadraticCurveTo(-290, -250, -312, -128); c.stroke();
  // wild hair, swept back by the wind
  for (let i = 0; i < 9; i++) {
    const a = -2.5 + i * 0.24, r0 = 40, x0 = Math.cos(a) * r0, y0 = -660 + Math.sin(a) * r0;
    const len = 46 + rand(0, 34), x1 = x0 + 30 + len * 0.7, y1 = y0 - len * 0.6 + i * 3;
    brush(c, bez([x0, y0], [x0 + 10, y0 - 20], [x1 - 20, y1 + 6], [x1, y1], 16), 26, { t0: 0.02, t1: 0.85, dry: 0.15, wobble: 0.1 });
  }
  // folds of the hakama, the collar and the belt
  c.strokeStyle = PAPER; c.lineWidth = 2.5;
  [[-30, -320, -70, -20], [26, -318, 74, -22], [-8, -320, -10, -180], [50, -300, 110, -30], [-52, -300, -112, -28]].forEach(([a, b, x, y]) => { c.beginPath(); c.moveTo(a, b); c.quadraticCurveTo((a + x) / 2 + 6, (b + y) / 2, x, y); c.stroke(); });
  c.lineWidth = 3; c.beginPath(); c.moveTo(-60, -336); c.lineTo(60, -336); c.moveTo(-61, -356); c.lineTo(61, -356); c.stroke();
  c.restore();
  vtext(c, ["我、事において", "後悔をせず"], w - 62, 70, 44, MINCHO, { colGap: 1.3, card: true });
  bubble(c, 170, 140, 140, 92, ["I DO NOT", "REGRET WHAT", "I HAVE DONE."], { size: 27, tail: [cx - 44, gy - 590] });
  source(c, "独行道 · DOKKODO", 28, h - 30, "left", PAPER);
}

// 2. Ink mountains in mist, a traveller far below
function pMountains(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#e9e4d8"); g.addColorStop(1, PAPER); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = "rgba(18,16,20,.16)"; c.beginPath(); c.arc(w * 0.76, 120, 58, 0, Math.PI * 2); c.fill();
  const layers = [[0.38, 0.12, 95, 0.2], [0.5, 0.2, 80, 0.32], [0.63, 0.32, 60, 0.5], [0.78, 0.5, 40, 0.8]];
  layers.forEach(([base, alpha, amp, dark], li) => {
    const nz = noise1(40 + li), yb = h * base;
    const top = [];
    for (let x = -10; x <= w + 10; x += 6) top.push([x, yb - amp * (0.6 + nz(x / 140)) - amp * 0.8 * Math.max(0, nz(x / 60 + 9)) * (li < 2 ? 1.6 : 0.6)]);
    const gr = c.createLinearGradient(0, yb - amp * 2, 0, yb + 140);
    gr.addColorStop(0, `rgba(18,16,20,${dark})`); gr.addColorStop(0.55, `rgba(18,16,20,${dark * 0.45})`); gr.addColorStop(1, "rgba(244,240,231,0)");
    c.fillStyle = gr; c.beginPath(); c.moveTo(top[0][0], top[0][1]); top.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(w + 10, h); c.lineTo(-10, h); c.closePath(); c.fill();
    brush(c, top, 2 + li * 1.6, { t0: 0.02, t1: 0.05, dry: 0.6, alpha: 0.35 + li * 0.15, wobble: 0.5 });
  });
  // the traveller with a straw hat on a path
  const tx = w * 0.58, ty = h * 0.86;
  brush(c, bez([w * 0.2, h + 10], [w * 0.4, h * 0.95], [w * 0.5, h * 0.9], [tx + 40, ty + 8], 40), 6, { t0: 0.1, t1: 0.6, dry: 0.6, alpha: 0.6 });
  c.fillStyle = INK; c.beginPath(); c.moveTo(tx - 14, ty - 34); c.lineTo(tx, ty - 46); c.lineTo(tx + 14, ty - 34); c.closePath(); c.fill();
  c.fillRect(tx - 6, ty - 34, 12, 26); c.beginPath(); c.moveTo(tx - 8, ty - 10); c.lineTo(tx - 12, ty + 4); c.lineTo(tx - 6, ty + 4); c.lineTo(tx, ty - 6); c.lineTo(tx + 6, ty + 4); c.lineTo(tx + 12, ty + 4); c.lineTo(tx + 8, ty - 10); c.fill();
  brush(c, [[tx + 6, ty - 26], [tx + 26, ty - 44]], 3, { dry: 0 });
  vtext(c, ["千里の道も", "ひと足宛はこぶなり"], w - 52, 40, 36, MINCHO, { colGap: 1.28, card: true });
  bubble(c, 250, 90, 100, 40, ["A THOUSAND-MILE ROAD IS", "WALKED ONE STEP AT A TIME."], { box: true, size: 23 });
  source(c, "五輪書 · 水の巻", 24, h - 22);
}

// 3. The enso: see with the mind's eye
function pEnso(c, w, h) {
  const cx = w / 2, cy = h * 0.42, r = 150, pts = [];
  for (let i = 0; i <= 160; i++) { const a = -2.1 + i / 160 * 5.6, rr = r * (1 + 0.035 * Math.sin(i / 9)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  brush(c, pts, 46, { t0: 0.04, t1: 0.35, dry: 0.55, seed: 21, profile: (t) => Math.pow(Math.min(smooth(0, 0.05, t), 1 - t * 0.55), 0.7) });
  splatter(c, pts[0][0] - 10, pts[0][1], 40, 26);
  vtext(c, ["観の目つよく", "見の目よわく"], cx + 30, cy - 120, 33, MINCHO, { colGap: 1.6 });
  bubble(c, cx, h - 86, w / 2 - 40, 50, ["PERCEIVE STRONGLY.", "LOOK LIGHTLY."], { box: true, size: 24 });
  source(c, "五輪書 · 水の巻", 22, 34);
}

// 4. Two swords cross: Niten Ichi-ryu
function pSwords(c, w, h) {
  c.fillStyle = INK; c.fillRect(0, 0, w, h);
  focus(c, w / 2, h * 0.42, 40, 40, 160, { color: "#3a363d", w0: 1, w1: 4 });
  const katana = (x0, y0, x1, y1, curve) => {
    const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny), ux = nx / l, uy = ny / l;
    const m = [(x0 + x1) / 2 + ux * curve, (y0 + y1) / 2 + uy * curve];
    const spine = bez([x0, y0], m, m, [x1, y1], 50);
    c.save(); c.fillStyle = "#f8f6f1"; c.strokeStyle = PAPER; c.lineWidth = 2; c.beginPath();
    spine.forEach((p, i) => { const t = i / 50, ww = 20 * (1 - Math.pow(t, 6)); i ? c.lineTo(p[0] + ux * ww, p[1] + uy * ww) : c.moveTo(p[0] + ux * ww, p[1] + uy * ww); });
    for (let i = 50; i >= 0; i--) c.lineTo(spine[i][0], spine[i][1]);
    c.closePath(); c.fill();
    c.strokeStyle = "#8d8892"; c.lineWidth = 2; c.beginPath(); // hamon, the temper line
    spine.forEach((p, i) => { const t = i / 50, ww = 20 * (1 - Math.pow(t, 6)) * (0.45 + 0.12 * Math.sin(i * 1.3)); i ? c.lineTo(p[0] + ux * ww, p[1] + uy * ww) : c.moveTo(p[0] + ux * ww, p[1] + uy * ww); });
    c.stroke();
    // guard and wrapped grip, behind the start of the blade
    const dx = (x0 - m[0]), dy = (y0 - m[1]), dl = Math.hypot(dx, dy), bx = dx / dl, by = dy / dl;
    c.fillStyle = "#cfcac2"; c.beginPath(); c.ellipse(x0, y0, 30, 12, Math.atan2(uy, ux), 0, Math.PI * 2); c.fill();
    c.fillStyle = "#f8f6f1";
    for (let k = 0; k < 4; k++) { const px = x0 + bx * (18 + k * 22), py = y0 + by * (18 + k * 22); c.save(); c.translate(px, py); c.rotate(Math.atan2(by, bx)); c.fillRect(-9, -11, 18, 22); c.fillStyle = INK; c.beginPath(); c.moveTo(-9, -11); c.lineTo(9, 11); c.moveTo(9, -11); c.lineTo(-9, 11); c.lineWidth = 3; c.strokeStyle = INK; c.stroke(); c.restore(); }
    c.restore();
  };
  katana(w * 0.22, h * 0.66, w * 0.94, h * 0.1, -36);
  katana(w * 0.78, h * 0.66, w * 0.06, h * 0.14, 36);
  c.save(); c.fillStyle = PAPER; c.font = `400 100px ${BRUSH}`; c.textAlign = "center"; c.fillText("二天一流", w / 2, h - 36); c.restore();
  bubble(c, w / 2, 64, 100, 30, ["TWO SWORDS. ONE MIND."], { box: true, size: 22 });
}

// 5. The eye: today, defeat who you were yesterday
function pEye(c, w, h) {
  const cx = w * 0.46, cy = h * 0.47;
  focus(c, cx, cy, 380, 250, 420, { w0: 1, w1: 6 });
  c.fillStyle = PAPER; c.beginPath(); c.ellipse(cx, cy, 395, 260, 0, 0, Math.PI * 2); c.fill();
  tone(c, cx - 420, cy - 280, 840, 560, (x, y) => { const d = Math.hypot((x - cx) / 395, (y - cy) / 260); return d < 1 ? smooth(0.55, 1, d) * 0.5 : 0; }, 8, 30);
  // eye shape
  const L0 = [cx - 330, cy + 30], Rr = [cx + 320, cy - 10];
  const upper = bez(L0, [cx - 230, cy - 150], [cx + 150, cy - 175], Rr, 80);
  const lower = bez(Rr, [cx + 170, cy + 120], [cx - 180, cy + 140], L0, 80);
  c.save(); c.beginPath(); upper.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); lower.forEach((p) => c.lineTo(p[0], p[1])); c.closePath();
  c.fillStyle = "#fbf9f4"; c.fill(); c.clip();
  // iris and pupil
  const ix = cx + 10, iy = cy - 6;
  tone(c, ix - 150, iy - 150, 300, 300, (x, y) => { const d = Math.hypot(x - ix, y - iy) / 142; return d < 1 ? 0.35 + 0.65 * smooth(0.35, 1, d) + 0.25 * (y < iy ? 1 - (iy - y) / 140 : 0.6) : 0; }, 6, 15);
  c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.arc(ix, iy, 142, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2 + rand(-0.04, 0.04); brush(c, [[ix + Math.cos(a) * 62, iy + Math.sin(a) * 62], [ix + Math.cos(a) * rand(100, 138), iy + Math.sin(a) * rand(100, 138)]], rand(2, 4), { dry: 0.2 }); }
  c.fillStyle = INK; c.beginPath(); c.arc(ix, iy, 60, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fff"; c.beginPath(); c.ellipse(ix + 52, iy - 52, 30, 22, -0.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(ix - 50, iy + 56, 11, 0, Math.PI * 2); c.fill();
  // the shadow of the upper lid across the eyeball
  c.fillStyle = "rgba(18,16,20,.28)"; c.beginPath(); upper.forEach((p, i) => (i ? c.lineTo(p[0], p[1] + 34) : c.moveTo(p[0], p[1] + 34))); for (let i = upper.length - 1; i >= 0; i--) c.lineTo(upper[i][0], upper[i][1] - 4); c.fill();
  c.restore();
  brush(c, upper, 30, { t0: 0.06, t1: 0.2, dry: 0.15, wobble: 0.15, seed: 4 });
  brush(c, lower.slice(8, 72), 7, { t0: 0.2, t1: 0.3, dry: 0.45, seed: 5 });
  brush(c, bez([cx - 300, cy - 70], [cx - 180, cy - 210], [cx + 160, cy - 230], [cx + 300, cy - 130], 60), 8, { t0: 0.2, t1: 0.3, dry: 0.5, seed: 8 }); // crease
  for (let i = 0; i < 9; i++) { const p = upper[56 + i * 3]; brush(c, [[p[0], p[1]], [p[0] + 30 + i * 6, p[1] - 40 + i * 4]], 5, { t0: 0.02, t1: 0.9, dry: 0.1 }); } // lashes
  // the brow, low and hard
  brush(c, bez([cx - 360, cy - 210], [cx - 200, cy - 300], [cx + 120, cy - 330], [cx + 360, cy - 250], 70), 58, { t0: 0.03, t1: 0.5, dry: 0.45, seed: 11 });
  for (let i = 0; i < 26; i++) { const x = cx - 340 + i * 24; brush(c, [[x, cy + 170 + rand(-6, 6)], [x + 30, cy + 196]], 2.5, { dry: 0.2 }); } // hatching under the eye
  vtext(c, ["今日は", "昨日の我に勝ち"], w - 64, 64, 60, MINCHO, { colGap: 1.25, card: true });
  bubble(c, 300, h - 150, 250, 96, ["TODAY,", "DEFEAT WHO YOU", "WERE YESTERDAY."], { size: 34, tail: [cx - 120, cy + 190] });
  source(c, "五輪書 · 水の巻", 28, h - 28);
}

// 6. A shrike on a dead branch (Musashi painted this himself), under the moon
function pShrike(c, w, h) {
  const mx = w * 0.58, my = h * 0.34;
  tone(c, 0, 0, w, h, (x, y) => { const d = Math.hypot(x - mx, y - my); return d < 180 ? 0 : 0.18 + 0.25 * smooth(180, 520, d); }, 9, 45);
  c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(mx, my, 180, 0, Math.PI * 2); c.stroke();
  const bx = w * 0.44;
  const branch = bez([bx - 30, h + 10], [bx + 20, h * 0.7], [bx - 40, h * 0.45], [bx + 30, h * 0.2], 70);
  brush(c, branch, 24, { t0: 0.01, t1: 0.5, dry: 0.5, seed: 33, profile: (t) => 1 - t * 0.7 });
  [[0.3, 1], [0.55, -1], [0.75, 1]].forEach(([t, sgn]) => { const p = branch[Math.round(t * 70)]; brush(c, [[p[0], p[1]], [p[0] + sgn * 26, p[1] - 18]], 8, { t1: 0.9, dry: 0.3 }); });
  brush(c, bez([bx - 20, h * 0.55], [bx + 40, h * 0.5], [bx + 90, h * 0.47], [bx + 140, h * 0.42], 30), 7, { t1: 0.8, dry: 0.5, seed: 34 });
  // the shrike at the tip
  const sx = bx + 30, sy = h * 0.2;
  c.save(); c.translate(sx, sy); c.fillStyle = INK;
  c.beginPath(); c.ellipse(0, -20, 18, 26, 0.3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(-8, -48, 13, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(-18, -50); c.lineTo(-32, -46); c.lineTo(-18, -44); c.fill();
  c.beginPath(); c.moveTo(8, -4); c.lineTo(34, 40); c.lineTo(22, 44); c.lineTo(0, 4); c.fill();
  c.fillStyle = PAPER; c.beginPath(); c.arc(-11, -51, 2.5, 0, Math.PI * 2); c.fill();
  c.restore();
  vtext(c, ["常に兵法の", "道をはなれず"], 132, 56, 38, MINCHO, { colGap: 1.3, card: true });
  bubble(c, w - 150, h - 80, 80, 40, ["NEVER STRAY", "FROM THE WAY."], { box: true, size: 25 });
  source(c, "独行道 · DOKKODO", 24, h - 26);
}

// 7. Forge and polish
function pForge(c, w, h) {
  speed(c, 0, 0, w, h, 140, { fromRight: true });
  c.fillStyle = "rgba(244,240,231,.86)"; c.fillRect(0, h * 0.18, w, h * 0.5);
  c.save(); c.font = `400 250px ${BRUSH}`; c.textAlign = "center"; c.textBaseline = "middle";
  c.lineWidth = 14; c.strokeStyle = PAPER; c.strokeText("鍛錬", w * 0.5, h * 0.42); c.fillStyle = INK; c.fillText("鍛錬", w * 0.5, h * 0.42); c.restore();
  splatter(c, w * 0.8, h * 0.25, 70, 40);
  bubble(c, w / 2, h - 66, w / 2 - 34, 46, ["A THOUSAND DAYS TO FORGE.", "TEN THOUSAND TO POLISH."], { box: true, size: 23 });
  source(c, "千日の稽古を鍛とし、万日の稽古を練とす", 24, 36);
}

// 8. Water takes the shape of its vessel: a drop, its ripples, and seigaiha waves
function pWater(c, w, h) {
  const top = h * 0.52, r = 44;
  for (let row = 0, y = top; y < h + r; row++, y += r * 0.5) {
    for (let x = (row % 2) * r - r; x < w + r; x += r * 2) {
      c.fillStyle = PAPER; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = INK;
      for (let k = 0; k < 4; k++) { c.lineWidth = k ? 2.4 : 3.4; c.beginPath(); c.arc(x, y, r * (1 - k * 0.22), Math.PI, Math.PI * 2); c.stroke(); }
      c.fillStyle = INK; c.beginPath(); c.arc(x, y, r * 0.18, Math.PI, Math.PI * 2); c.fill();
    }
  }
  // the still surface and the ripples of one drop
  const px = w * 0.46, py = top - 60;
  tone(c, 0, 0, w, top - 10, (x, y) => 0.06 + 0.32 * smooth(0, top, y) * (1 - 0.8 * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / 26000)), 9, 20);
  for (let k = 0; k < 5; k++) {
    const rx = 40 + k * 52, ry = rx * 0.22, pts = [];
    for (let i = 0; i <= 90; i++) { const a = -0.2 + i / 90 * (Math.PI * 2 - 0.5) + k * 0.7; pts.push([px + Math.cos(a) * rx, py + Math.sin(a) * ry]); }
    brush(c, pts, 7 - k, { t0: 0.1, t1: 0.3, dry: 0.4 + k * 0.08, seed: 90 + k });
  }
  c.fillStyle = INK; c.beginPath(); c.moveTo(px, py - 250); c.bezierCurveTo(px + 22, py - 196, px + 26, py - 170, px, py - 160); c.bezierCurveTo(px - 26, py - 170, px - 22, py - 196, px, py - 250); c.fill();
  c.fillStyle = PAPER; c.beginPath(); c.ellipse(px - 7, py - 182, 4, 8, 0.3, 0, Math.PI * 2); c.fill();
  splatter(c, px, py - 22, 34, 14);
  vtext(c, ["水は方円の", "器に随ふ"], w - 56, 50, 40, MINCHO, { colGap: 1.3, card: true });
  bubble(c, 170, 120, 100, 60, ["WATER TAKES", "THE SHAPE OF", "ITS VESSEL."], { box: true, size: 26 });
  source(c, "五輪書", w - 56, 392, "center");
}

async function main() {
  const need = "我、事において後悔をせず千里の道もひと足宛はこぶなり観の目つよく見の目よわく今日は昨日の我に勝ち常に兵法の道をはなれず水は方円の器に随ふ千日の稽古を鍛とし、万日の稽古を練とす独行道五輪書水の巻·DOKKOGRINSH";
  await Promise.all([
    document.fonts.load(`800 40px ${MINCHO}`, need), document.fonts.load(`600 20px ${MINCHO}`, need),
    document.fonts.load(`400 100px ${BRUSH}`, "二天一流鍛錬"), document.fonts.load(`400 40px ${LETTER}`, "ABC"),
  ]);
  X.fillStyle = PAPER; X.fillRect(0, 0, W, H);
  const P = [[15, 40, 575, 1160, pMusashi], [605, 40, 1525, 560, pMountains], [605, 590, 1045, 1160, pEnso], [1075, 590, 1525, 1160, pSwords],
    [1555, 40, 2405, 1160, pEye], [2435, 40, 3010, 700, pShrike], [2435, 730, 3010, 1160, pForge], [3040, 40, 3585, 1160, pWater]];
  for (const [x0, y0, x1, y1, fn] of P) { R = mulberry(x0 * 7 + y0); panel(x0, y0, x1, y1, fn); }
  // paper grain over everything
  const img = X.getImageData(0, 0, W, H), d = img.data, gr = mulberry(9);
  for (let i = 0; i < d.length; i += 4) { const n = (gr() - 0.5) * 5; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  X.putImageData(img, 0, 0);
  window.DONE = true;
}
main().catch((e) => { window.ERR = String(e && e.stack || e); });

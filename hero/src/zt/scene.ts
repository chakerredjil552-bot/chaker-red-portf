/** The 3D scene: the wall of screens (one draw call), the blue floor and the screen that comes off the wall. */

import * as THREE from "three";
import { WALL, WIDE_PANEL, WIDE_SMALL, layout, rowTurn, slotPose, type Panel } from "./wall.ts";

const ROUND_BOX = /* glsl */ `
  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
`;

/** Every picture of the wall in one texture, filled in as the pictures arrive. */
export class Atlas {
  readonly texture: THREE.CanvasTexture;
  readonly count: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cols: number;
  private readonly cw: number;
  private readonly ch: number;
  /** Pictures drawn on the canvas but not yet on the GPU. */
  private readonly pending: number[] = [];
  /** One picture, copied into its place in the texture on the GPU (a 9:16 cell, or two side by side for 16:9). */
  private readonly piece: THREE.Texture[];
  private readonly pieceCtx: CanvasRenderingContext2D[];
  /** Where each picture sits in the sheet, in cells; a 16:9 picture takes two cells side by side. */
  private readonly slot: number[] = [];
  private last = 0;
  /** Which pictures are 16:9: they sit at the top of their cell at their own shape, never cropped to 9:16. */
  private readonly wide: boolean[];

  constructor(urls: string[], width: number, maxTexture: number, wide: boolean[] = []) {
    this.count = Math.max(1, urls.length);
    this.wide = urls.map((_, i) => !!wide[i]);
    this.cols = 8;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.wide[i] && n % this.cols === this.cols - 1) n++; // both cells on one line
      this.slot.push(n);
      n += this.wide[i] ? 2 : 1;
    }
    const rows = Math.ceil(n / this.cols);
    let cw = Math.floor(width / this.cols);
    while (Math.round((cw * 16) / 9) * rows > maxTexture) cw = Math.floor(cw * 0.8);
    this.cw = cw;
    this.ch = Math.round((cw * 16) / 9);
    const canvas = document.createElement("canvas");
    canvas.width = this.cols * this.cw;
    canvas.height = rows * this.ch;
    this.ctx = canvas.getContext("2d")!;
    // until a picture arrives its cell is a dim screen, never a hole
    for (let i = 0; i < this.count; i++) {
      const [x, y] = this.at(i);
      const g = this.ctx.createLinearGradient(x, y, x, y + this.hOf(i));
      g.addColorStop(0, "#2a2226"); g.addColorStop(1, "#151013");
      this.ctx.fillStyle = g;
      this.ctx.fillRect(x, y, this.wOf(i), this.hOf(i));
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.pieceCtx = [1, 2].map((k) => {
      const cell = document.createElement("canvas");
      cell.width = this.cw * k;
      cell.height = k === 1 ? this.ch : this.hOf(-1);
      return cell.getContext("2d")!;
    });
    this.piece = this.pieceCtx.map((c) => new THREE.Texture(c.canvas));
    urls.forEach((url, i) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { this.draw(img, i); this.pending.push(i); };
      img.src = url;
    });
  }

  private at(i: number): [number, number] {
    const n = this.slot[i] ?? i;
    return [(n % this.cols) * this.cw, Math.floor(n / this.cols) * this.ch];
  }

  /** The size of picture i's part of the sheet: a 9:16 cell, or two cells wide and 16:9 tall for a wide picture
   *  (i = -1: the wide size). */
  private wOf(i: number) { return i < 0 || this.wide[i] ? this.cw * 2 : this.cw; }
  private hOf(i: number) { return i < 0 || this.wide[i] ? Math.round((this.cw * 2 * 9) / 16) : this.ch; }

  /** Whether picture i is 16:9. */
  isWide(i: number): boolean { return this.wide[((i % this.count) + this.count) % this.count]; }

  private draw(img: HTMLImageElement, i: number) {
    const [x, y] = this.at(i);
    const cw = this.wOf(i), ch = this.hOf(i);
    // cover: fill its part of the sheet, crop what spills over (nothing, when the shapes match)
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    this.ctx.save();
    this.ctx.beginPath(); this.ctx.rect(x, y, cw, ch); this.ctx.clip();
    this.ctx.drawImage(img, x + (cw - w) / 2, y + (ch - h) / 2, w, h);
    this.ctx.restore();
  }

  /** The cell of picture `i` in texture coordinates: u, v (bottom left), width, height. */
  cell(i: number): [number, number, number, number] {
    const W = this.ctx.canvas.width, H = this.ctx.canvas.height;
    const k = ((i % this.count) + this.count) % this.count, cw = this.wOf(k), ch = this.hOf(k);
    const [x, y] = this.at(k);
    return [x / W, 1 - (y + ch) / H, cw / W, ch / H];
  }

  /** Sends the whole sheet to the GPU once, at the start, before anything moves. */
  upload(renderer: THREE.WebGLRenderer) {
    this.pending.length = 0;
    renderer.initTexture(this.texture);
  }

  /** Copies the pictures that arrived into their cells on the GPU, a few at a time: only their own pixels, never the
   *  whole sheet again (that froze the picture while the wall filled in). */
  flush(renderer: THREE.WebGLRenderer, now: number) {
    if (!this.pending.length || now - this.last < 90) return;
    this.last = now;
    const H = this.ctx.canvas.height;
    const batch = this.pending.splice(0, 6);
    const at = new THREE.Vector2();
    batch.forEach((i, n) => {
      const [x, y] = this.at(i);
      const k = this.wide[i] ? 1 : 0, cw = this.wOf(i), ch = this.hOf(i);
      this.pieceCtx[k].drawImage(this.ctx.canvas, x, y, cw, ch, 0, 0, cw, ch);
      // the small mip levels are rebuilt once, after the last picture of the batch
      this.texture.generateMipmaps = n === batch.length - 1;
      renderer.copyTextureToTexture(this.piece[k], this.texture, null, at.set(x, H - y - ch));
    });
    this.texture.generateMipmaps = true;
  }
}

/** The wall: every panel of every row, one instanced mesh. */
export class Wall {
  readonly mesh: THREE.InstancedMesh;
  private readonly cells: THREE.InstancedBufferAttribute;
  private readonly dims: THREE.InstancedBufferAttribute;
  private readonly m = new THREE.Matrix4();
  private readonly picture: Int32Array; // which picture of the atlas each panel shows
  private readonly panels: Panel[];
  private readonly at: Int32Array[];     // row, place -> panel
  private readonly shown: Uint8Array;    // 1 where a panel shows a 16:9 picture
  private readonly scale = new THREE.Vector3();
  readonly uniforms;

  constructor(private readonly atlas: Atlas, fog: THREE.Color) {
    // every row filled with panels: one place for a 9:16 picture, two side by side for a 16:9 one
    this.panels = layout(atlas.count, (k) => atlas.isWide(k));
    const n = this.panels.length;
    this.at = Array.from({ length: WALL.rows }, () => new Int32Array(WALL.cols));
    this.panels.forEach((p, i) => { for (let k = 0; k < p.span; k++) this.at[p.r][p.c + k] = i; });
    const geo = new THREE.PlaneGeometry(WALL.panelW, WALL.panelH);
    this.cells = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.dims = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
    geo.setAttribute("aCell", this.cells);
    geo.setAttribute("aDim", this.dims);
    this.uniforms = {
      uAtlas: { value: atlas.texture },
      uFog: { value: fog },
      uFogRange: { value: new THREE.Vector2(60, 220) },
      uGlow: { value: new THREE.Color("#2f62ff") },
      uAspect: { value: WALL.panelW / WALL.panelH }, // of the unscaled panel; each panel's own comes from its scale
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aCell;
        attribute float aDim;
        uniform float uTime;
        varying vec2 vUv;
        varying vec4 vCell;
        varying float vDim;
        varying float vY;
        varying float vDepth;
        varying float vShape;
        uniform float uAspect;
        void main() {
          vUv = uv; vCell = aCell;
          // the panel's own shape: 9:16, or 16:9 for a wide picture
          vShape = uAspect * length(instanceMatrix[0].xyz) / length(instanceMatrix[1].xyz);
          // every screen breathes a little, each at its own pace, like footage playing
          float id = float(gl_InstanceID);
          float flick = 0.93 + 0.07 * sin(uTime * (1.1 + fract(id * 0.618) * 2.3) + id * 1.7);
          vDim = aDim * flick;
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vY = world.y;
          vec4 mv = viewMatrix * world;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        uniform vec3 uFog;
        uniform vec2 uFogRange;
        uniform vec3 uGlow;
        varying vec2 vUv;
        varying vec4 vCell;
        varying float vDim;
        varying float vY;
        varying float vDepth;
        varying float vShape;
        ${ROUND_BOX}
        void main() {
          vec2 p = (vUv - 0.5) * vec2(vShape, 1.0);
          float d = roundBox(p, vec2(0.5 * vShape, 0.5), 0.03 * max(1.0, vShape));
          if (d > 0.0) discard;
          vec3 col = texture2D(uAtlas, vCell.xy + vUv * vCell.zw).rgb;
          col *= 1.0 - 0.32 * smoothstep(-0.05, 0.0, d);
          col *= vDim;
          col += uGlow * 0.2 * exp(-vY * 0.2) * clamp(vDim, 0.25, 1.0);
          gl_FragColor = vec4(mix(col, uFog, smoothstep(uFogRange.x, uFogRange.y, vDepth)), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.picture = new Int32Array(n);
    this.shown = new Uint8Array(n);
    this.panels.forEach((p, i) => { this.picture[i] = p.picture; this.restoreCell(i); });
  }

  /** The panel that covers place c of row r. */
  panelAt(r: number, c: number): number { return this.at[r][((c % WALL.cols) + WALL.cols) % WALL.cols]; }

  /** Where panel i's centre is now (the middle of its places) and its yaw. */
  poseOf(i: number, turnDeg: number) {
    const p = this.panels[i];
    return slotPose(p.r, p.c + (p.span - 1) / 2, turnDeg);
  }

  /** The picture a panel (by instance id) normally shows. */
  cellOf(instance: number): number { return instance >= 0 && instance < this.picture.length ? this.picture[instance] : -1; }

  /** Shows another picture on a panel for a while, at that picture's shape. */
  setCellPicture(i: number, cell: [number, number, number, number], wide = false) {
    this.cells.setXYZW(i, ...cell);
    this.cells.needsUpdate = true;
    this.shown[i] = wide ? 1 : 0;
  }

  /** Puts a panel's own picture back. */
  restoreCell(i: number) {
    const k = this.picture[i];
    this.setCellPicture(i, this.atlas.cell(k), this.atlas.isWide(k));
  }

  /** The size of panel i as it is now: 9:16, or 16:9 across its two places while it shows a wide picture. */
  sizeOf(i: number): [number, number] {
    if (!this.shown[i]) return [WALL.panelW, WALL.panelH];
    return this.panels[i].span === 2 ? WIDE_PANEL : WIDE_SMALL;
  }

  /** A panel's brightness: 1 lit, 0 an empty slot. */
  setDim(i: number, v: number) {
    if (this.dims.getX(i) !== v) { this.dims.setX(i, v); this.dims.needsUpdate = true; }
  }

  /** Turns every row: `scroll` in viewport heights, `time` in seconds. */
  place(scroll: number, time: number) {
    const turns = Array.from({ length: WALL.rows }, (_, r) => rowTurn(r, scroll, time));
    this.panels.forEach((p, i) => {
      const pose = slotPose(p.r, p.c + (p.span - 1) / 2, turns[p.r]);
      const [w, h] = this.sizeOf(i);
      this.m.makeRotationY(pose.yaw).scale(this.scale.set(w / WALL.panelW, h / WALL.panelH, 1));
      this.m.setPosition(pose.x, pose.y, pose.z);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** The floor: a disc of blue light, a soft shadow under the figure. */
export function makeFloor(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: new THREE.Color("#3c74ff") }, uOuter: { value: new THREE.Color("#0b2bb0") }, uEdge: { value: new THREE.Color("#04082a") },
      uFig: { value: new THREE.Vector2() }, uRadius: { value: WALL.radius },
    },
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vXZ = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uInner; uniform vec3 uOuter; uniform vec3 uEdge; uniform vec2 uFig; uniform float uRadius;
      varying vec2 vXZ;
      void main() {
        float r = length(vXZ) / uRadius;
        vec3 col = mix(uInner, uOuter, smoothstep(0.0, 0.95, r));
        col = mix(col, uEdge, smoothstep(0.86, 1.0, r));
        // soft contact shadow round his feet (his long shadow is drawn separately)
        vec2 s = (vXZ - uFig) / 0.45;
        col *= 1.0 - 0.55 * exp(-dot(s, s));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(WALL.radius + 0.05, 128), mat);
  floor.rotation.x = -Math.PI / 2;
  return floor;
}

/** Cover-fit of a picture of aspect `ta` in a panel of aspect `pa`: scale and offset of the texture coordinates. */
export function coverFit(ta: number, pa: number): THREE.Vector4 {
  return ta > pa ? new THREE.Vector4(pa / ta, 1, (1 - pa / ta) / 2, 0) : new THREE.Vector4(1, ta / pa, 0, (1 - ta / pa) / 2);
}

/** The screen taken off the wall: plays a video in a glowing frame and swaps videos through vertical strips. */
export class Featured {
  readonly group = new THREE.Group();
  readonly uniforms;
  private readonly glowUniforms;
  private readonly screen: THREE.Mesh;
  private readonly glow: THREE.Mesh;

  constructor(atlas: Atlas, a: THREE.Texture, b: THREE.Texture) {
    this.uniforms = {
      uA: { value: a }, uB: { value: b }, uAtlas: { value: atlas.texture },
      uCellA: { value: new THREE.Vector4() }, uCellB: { value: new THREE.Vector4() },
      uReadyA: { value: 0 }, uReadyB: { value: 0 },
      uFitA: { value: new THREE.Vector4(1, 1, 0, 0) }, uFitB: { value: new THREE.Vector4(1, 1, 0, 0) },
      uColA: { value: new THREE.Color("#ff7a1a") }, uColB: { value: new THREE.Color("#ff7a1a") },
      uMix: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uFrame: { value: 0.045 },
    };
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uA; uniform sampler2D uB; uniform sampler2D uAtlas;
        uniform vec4 uCellA; uniform vec4 uCellB; uniform float uReadyA; uniform float uReadyB;
        uniform vec4 uFitA; uniform vec4 uFitB; uniform vec3 uColA; uniform vec3 uColB;
        uniform float uMix; uniform vec2 uSize; uniform float uFrame;
        varying vec2 vUv;
        ${ROUND_BOX}
        float hash(float n) { return fract(sin(n * 91.345) * 47453.21); }
        vec3 pickA(vec2 uv) {
          vec3 v = texture2D(uA, uv * uFitA.xy + uFitA.zw).rgb;
          return mix(texture2D(uAtlas, uCellA.xy + uv * uCellA.zw).rgb, v, uReadyA);
        }
        vec3 pickB(vec2 uv) {
          vec3 v = texture2D(uB, uv * uFitB.xy + uFitB.zw).rgb;
          return mix(texture2D(uAtlas, uCellB.xy + uv * uCellB.zw).rgb, v, uReadyB);
        }
        void main() {
          vec2 p = (vUv - 0.5) * uSize;
          float d = roundBox(p, uSize * 0.5, 0.07);
          if (d > 0.0) discard;
          // the swap: the screen is cut in vertical strips that flip one after another, each sliding a little
          float i = floor(vUv.x * 18.0);
          float local = clamp((uMix - hash(i) * 0.55) / 0.45, 0.0, 1.0);
          float bump = sin(local * 3.14159);
          vec2 uv = clamp(vUv + vec2(0.0, (hash(i + 7.0) - 0.5) * 0.22 * bump), 0.0, 1.0);
          vec3 frame = mix(uColA, uColB, smoothstep(0.15, 0.85, uMix));
          vec3 col = local > 0.5 ? pickB(uv) : pickA(uv);
          col += bump * 0.9 * frame;
          col = mix(col, frame, smoothstep(-uFrame - 0.008, -uFrame, d));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.glowUniforms = { uCol: this.uniforms.uColA, uColB: this.uniforms.uColB, uMix: this.uniforms.uMix, uSize: { value: new THREE.Vector2(1, 1) }, uPad: { value: 1.6 }, uOpacity: { value: 1 } };
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.glowUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; uniform vec3 uColB; uniform float uMix; uniform vec2 uSize; uniform float uPad; uniform float uOpacity;
        varying vec2 vUv;
        ${ROUND_BOX}
        void main() {
          vec2 outer = uSize + vec2(uPad);
          float d = roundBox((vUv - 0.5) * outer, uSize * 0.5, 0.07);
          float a = d > 0.0 ? exp(-d * 3.2) * 0.5 : 0.0;
          vec3 col = mix(uCol, uColB, smoothstep(0.15, 0.85, uMix));
          gl_FragColor = vec4(col * a * uOpacity, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.glow.position.z = -0.01;
    this.group.add(this.glow, this.screen);
  }

  /** Sets the screen's size in world units (the frame and the glow follow). */
  size(w: number, h: number) {
    this.uniforms.uSize.value.set(w, h);
    this.screen.scale.set(w, h, 1);
    const pad = this.glowUniforms.uPad.value;
    this.glowUniforms.uSize.value.set(w, h);
    this.glow.scale.set(w + pad, h + pad, 1);
  }

  glowOpacity(v: number) { this.glowUniforms.uOpacity.value = v; }
}

/*
 * The light after the scene is drawn: bright screens bloom, fast moves streak toward the centre (a zoom blur), the
 * colours split a little toward the edges, the corners darken and a fine grain runs over everything.
 * The scene is drawn into an HDR target, so a screen pushed above white (the flash) glows hard.
 */

import * as THREE from "three";

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export interface Look {
  bloom: number;  // strength of the glow
  zoom: number;   // 0..~0.08, streaks toward the centre while the camera rushes
  chroma: number; // colour split at the edges
  vignette: number;
  time: number;
}

export class Post {
  private readonly scene: THREE.WebGLRenderTarget;
  private readonly a: THREE.WebGLRenderTarget;
  private readonly b: THREE.WebGLRenderTarget;
  private readonly quad: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly stage = new THREE.Scene();
  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly final: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scale: number, light = false) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    // a phone gets fewer samples and shorter streaks: the same look for less work
    // with a stencil, so his shadow darkens each pixel once
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: light ? 2 : 4, stencilBuffer: true });
    this.a = new THREE.WebGLRenderTarget(1, 1, opts);
    this.b = new THREE.WebGLRenderTarget(1, 1, opts);
    this.bright = new THREE.ShaderMaterial({
      vertexShader: VERT, depthTest: false,
      uniforms: { tMap: { value: null }, uThreshold: { value: 0.78 } },
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform float uThreshold; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tMap, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.45, l), 1.0);
        }`,
    });
    this.blur = new THREE.ShaderMaterial({
      vertexShader: VERT, depthTest: false,
      uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() } },
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tMap, vUv).rgb * 0.227;
          c += (texture2D(tMap, vUv + uDir * 1.385).rgb + texture2D(tMap, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tMap, vUv + uDir * 3.231).rgb + texture2D(tMap, vUv - uDir * 3.231).rgb) * 0.07;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.final = new THREE.ShaderMaterial({
      vertexShader: VERT, depthTest: false, defines: { TAPS: light ? 5 : 10 },
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.9 }, uZoom: { value: 0 },
        uChroma: { value: 0 }, uVignette: { value: 0.5 }, uTime: { value: 0 },
      },
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene; uniform sampler2D tBloom;
        uniform float uBloom; uniform float uZoom; uniform float uChroma; uniform float uVignette; uniform float uTime;
        varying vec2 vUv;
        vec3 pick(vec2 uv) {
          vec2 d = uv - 0.5;
          float k = uChroma * dot(d, d);
          return vec3(texture2D(tScene, uv - d * k).r, texture2D(tScene, uv).g, texture2D(tScene, uv + d * k).b);
        }
        void main() {
          vec3 col;
          if (uZoom < 0.0005) col = pick(vUv);
          else {
            // streaks toward the centre: the faster the camera, the longer
            vec2 dir = (vec2(0.5) - vUv) * uZoom;
            col = vec3(0.0);
            for (int i = 0; i < TAPS; i++) col += pick(vUv + dir * (float(i) / float(TAPS - 1)));
            col /= float(TAPS);
          }
          col += texture2D(tBloom, vUv).rgb * uBloom;
          float v = smoothstep(1.05, 0.28, length((vUv - 0.5) * vec2(1.2, 1.0)));
          col *= mix(1.0 - uVignette, 1.0, v);
          float g = fract(sin(dot(vUv * 913.17 + uTime * 7.31, vec2(12.9898, 78.233))) * 43758.5453);
          col += (g - 0.5) * 0.028;
          gl_FragColor = vec4(max(col, 0.0), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.stage.add(this.quad);
  }

  resize() {
    this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x), h = Math.max(1, this.size.y);
    this.scene.setSize(w, h);
    const bw = Math.max(1, Math.round(w * this.scale)), bh = Math.max(1, Math.round(h * this.scale));
    this.a.setSize(bw, bh);
    this.b.setSize(bw, bh);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.stage, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, look: Look) {
    const r = this.renderer;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    // glow: the bright parts, small, blurred twice each way (skipped when the glow is off)
    this.bright.uniforms.tMap.value = this.scene.texture;
    this.pass(this.bright, this.a);
    const px = 1 / this.a.width, py = 1 / this.a.height;
    for (let i = 0; i < (look.bloom > 0 ? 2 : 0); i++) {
      const spread = 1 + i;
      this.blur.uniforms.tMap.value = this.a.texture; this.blur.uniforms.uDir.value.set(px * spread, 0);
      this.pass(this.blur, this.b);
      this.blur.uniforms.tMap.value = this.b.texture; this.blur.uniforms.uDir.value.set(0, py * spread);
      this.pass(this.blur, this.a);
    }
    const u = this.final.uniforms;
    u.tScene.value = this.scene.texture;
    u.tBloom.value = this.a.texture;
    u.uBloom.value = look.bloom;
    u.uZoom.value = look.zoom;
    u.uChroma.value = look.chroma;
    u.uVignette.value = look.vignette;
    u.uTime.value = look.time % 100;
    this.pass(this.final, null);
  }
}

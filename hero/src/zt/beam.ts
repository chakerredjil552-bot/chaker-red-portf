/*
 * The light from above: as the camera locks onto him, a beam of white light comes down from high in the well onto the
 * man, a cone of light in the air, brightest low down, and a pool of light on the floor round his feet. It flares
 * when it arrives, then stays, softer, while he stands in the room.
 */

import * as THREE from "three";

const HEIGHT = 16;

export class Beam {
  readonly group = new THREE.Group();
  private readonly cone: THREE.ShaderMaterial;
  private readonly pool: THREE.ShaderMaterial;

  constructor() {
    this.cone = new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: 0 }, uTime: { value: 0 } },
      // only the far side of the cone: the light is behind him, he stands dark against it, never washed over
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying float vH;
        varying float vFace;
        void main() {
          vH = uv.y; // 0 at the floor, 1 at the top
          vec4 world = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vFace = abs(dot(n, normalize(cameraPosition - world.xyz)));
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        uniform float uTime;
        varying float vH;
        varying float vFace;
        void main() {
          // brightest in the middle of the cone (seen face on), soft at its edges, fading up into the dark
          float a = pow(vFace, 2.2) * pow(1.0 - vH, 1.3) * smoothstep(0.0, 0.04, vH);
          a *= 0.9 + 0.1 * sin(uTime * 1.7 + vH * 9.0);
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * uStrength * 0.55, 1.0);
        }`,
    });
    const coneGeo = new THREE.CylinderGeometry(0.2, 1.25, HEIGHT, 48, 1, true);
    coneGeo.translate(0, HEIGHT / 2, 0);
    const cone = new THREE.Mesh(coneGeo, this.cone);
    cone.renderOrder = 4;
    this.pool = new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        varying vec2 vP;
        void main() {
          float r = length(vP) / 1.7;
          float a = smoothstep(1.0, 0.0, r) * (0.55 + 0.45 * smoothstep(0.7, 0.0, r));
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.88) * a * uStrength * 0.7, 1.0);
        }`,
    });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), this.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.006;
    pool.renderOrder = 2;
    this.group.add(pool, cone);
    this.group.visible = false;
  }

  /** Puts the beam on him at (x, z), `strength` 0 off .. 1 full, more for the flare as it arrives. */
  update(x: number, z: number, strength: number, time: number) {
    this.group.visible = strength > 0.003;
    this.group.position.set(x, 0, z);
    this.cone.uniforms.uStrength.value = strength;
    this.cone.uniforms.uTime.value = time;
    this.pool.uniforms.uStrength.value = strength;
  }
}

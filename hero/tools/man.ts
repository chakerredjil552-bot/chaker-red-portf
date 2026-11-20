/*
 * Builds hero-assets/man.glb, the man on the floor of the hero, from the Universal Animation Library by Quaternius
 * (CC0): its mannequin and three of its clips. The tool dresses him (src/zt/dress.ts), makes him one black surface and
 * drops everything the hero does not use.
 *
 *   git clone --depth 1 https://github.com/j-ponzo/gltf-universal-animation-library /tmp/ual
 *   npm run man -- /tmp/ual/glTF/AnimationLibrary_Godot_Standard.gltf
 */
import { NodeIO } from "@gltf-transform/core";
import { dedup, joinPrimitives, prune, quantize, resample } from "@gltf-transform/functions";
import { dress } from "../src/zt/dress.ts";

export const CLIPS = ["Idle_Loop", "Walk_Formal_Loop", "Interact"];

const src = process.argv[2];
if (!src) throw new Error("usage: npm run man -- <AnimationLibrary_Godot_Standard.gltf>");
const out = new URL("../../hero-assets/man.glb", import.meta.url).pathname;

const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
for (const a of root.listAnimations()) {
  if (CLIPS.includes(a.getName())) continue;
  for (const s of a.listSamplers()) s.dispose(); // their keyframes go with prune() when no clip we keep shares them
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}
for (const t of root.listTextures()) t.dispose();

const mesh = root.listMeshes().find((m) => m.getName() === "Mannequin");
const skin = root.listSkins()[0];
if (!mesh || !skin) throw new Error("no Mannequin mesh or skin in " + src);
const material = doc.createMaterial("Silhouette").setBaseColorFactor([0, 0, 0, 1]).setDoubleSided(true);
const prims = mesh.listPrimitives();
for (const p of prims) {
  p.setAttribute("TEXCOORD_0", null);
  p.setAttribute("TEXCOORD_1", null);
  p.setMaterial(material);
}

// the coat, collar, hair, ears and nose, cut to the body (the first primitive is the body, the second its joints)
const body = prims[0];
const part = dress({
  pos: body.getAttribute("POSITION")!.getArray()!,
  joints: body.getAttribute("JOINTS_0")!.getArray()!,
  weights: body.getAttribute("WEIGHTS_0")!.getArray()!,
  index: body.getIndices()!.getArray()!,
  bones: skin.listJoints().map((j) => j.getName()),
});
const acc = (type: "VEC3" | "VEC4" | "SCALAR", arr: Float32Array | Uint8Array | Uint16Array) =>
  doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
const clothes = doc.createPrimitive()
  .setAttribute("POSITION", acc("VEC3", new Float32Array(part.pos)))
  .setAttribute("NORMAL", acc("VEC3", new Float32Array(part.nrm)))
  .setAttribute("JOINTS_0", acc("VEC4", new Uint8Array(part.joints)))
  .setAttribute("WEIGHTS_0", acc("VEC4", new Float32Array(part.weights)))
  .setIndices(acc("SCALAR", new Uint16Array(part.index)))
  .setMaterial(material);
// one primitive: one draw call for him and one for his shadow
const all = [...prims, clothes];
const one = joinPrimitives(all);
for (const p of mesh.listPrimitives()) mesh.removePrimitive(p);
mesh.addPrimitive(one);

// smaller numbers (KHR_mesh_quantization, which three.js reads without a decoder): a third of the size
await doc.transform(resample({ tolerance: 2e-4 }), dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeWeight: 8 }));
await io.write(out, doc);
const n = root.listMeshes()[0].listPrimitives().map((p) => p.getAttribute("POSITION")!.getCount());
console.log(`wrote ${out}: ${n.join(" + ")} vertices, clips ${root.listAnimations().map((a) => a.getName()).join(", ")}`);

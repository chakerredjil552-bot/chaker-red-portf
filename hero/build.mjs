// Bundles the hero into hero-assets/: one script (with three.js) and one stylesheet that index.html loads.
import { build } from "esbuild";

await build({
  entryPoints: ["src/zt/main.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari15"],
  legalComments: "none",
  outfile: "../hero-assets/zoetrope.js",
  logLevel: "info",
});
await build({ entryPoints: ["src/zt/zt.css"], bundle: true, minify: true, outfile: "../hero-assets/zoetrope.css", logLevel: "info" });

// bun tools/fish-rotation/generate.ts [output-directory]
// Produces a standalone comparison and measured estimates. Does not change src/.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FISH_KINDS, FISH_SET_ATLASES, fishKindSet } from "../../src/fish";
import { cellBBox, copyRect, shearSheet, SWIM_FRAMES } from "../../src/fishbake";
import { dataUrlToBuffer, decodePng, encodePng } from "../png";
import { bakePoses, angles3, angles7, scale2x } from "./bake";

const output = resolve(Bun.argv[2] ?? "experiments/fish-rotation");
mkdirSync(output, { recursive: true });
const selected = ["mourning_veil_witch", "midnight_coven_witch", "grim_reaper_fish", "neon_tetra", "koi"];
const decoded = FISH_SET_ATLASES.map(a => ({ ...a, image: decodePng(dataUrlToBuffer(a.src)) }));
const rows: Record<string, any>[] = [];
const examples: Record<string, any>[] = [];
const begin = performance.now();
for (const kind of FISH_KINDS) {
  const atlas = decoded.find(a => kind.name in a.layout)!;
  const { row, col } = atlas.layout[kind.name];
  const bb = cellBBox(atlas.image.rgba, atlas.image.w, col * atlas.cell, row * atlas.cell, atlas.cell);
  const sheet = shearSheet(copyRect(atlas.image.rgba, atlas.image.w, bb.x, bb.y, bb.bw, bb.bh), kind.motion);
  const start3 = performance.now();
  const three = bakePoses(sheet, SWIM_FRAMES, angles3);
  const ms3 = performance.now() - start3;
  const start7 = performance.now();
  const seven = bakePoses(sheet, SWIM_FRAMES, angles7);
  const ms7 = performance.now() - start7;
  const originalPng = encodePng(sheet.data, sheet.w, sheet.h);
  const threePng = encodePng(three.data, three.w, three.h);
  const sevenPng = encodePng(seven.data, seven.w, seven.h);
  // Transparent gutters protect both filtering and subpixel supersampling at sprite edges.
  const filteredW = sheet.w + SWIM_FRAMES * 4;
  const filteredH = sheet.h + 4;
  const filtered = new Uint8Array(filteredW * filteredH * 4);
  const frameW = sheet.w / SWIM_FRAMES;
  for (let frame = 0; frame < SWIM_FRAMES; frame++) for (let y = 0; y < sheet.h; y++) {
    const source = (y * sheet.w + frame * frameW) * 4;
    const target = ((y + 2) * filteredW + frame * (frameW + 4) + 2) * 4;
    filtered.set(sheet.data.subarray(source, source + frameW * 4), target);
  }
  const filteredPng = encodePng(filtered, filteredW, filteredH);
  rows.push({ name: kind.name, set: fishKindSet(kind.name), ms3, ms7,
    current: { w: sheet.w, h: sheet.h, bytes: sheet.w * sheet.h * 4, pngBytes: originalPng.length },
    filtered: { w: filteredW, h: filteredH, bytes: filteredW * filteredH * 4, pngBytes: filteredPng.length },
    baked3: { w: three.w, h: three.h, bytes: three.w * three.h * 4, pngBytes: threePng.length },
    baked7: { w: seven.w, h: seven.h, bytes: seven.w * seven.h * 4, pngBytes: sevenPng.length } });
  if (selected.includes(kind.name)) {
    const url = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
    // Upscale each padded animation frame independently to avoid atlas bleed
    // and oversized four-frame GPU textures. Rotation happens in the viewer.
    const pixelAware = Array.from({ length: SWIM_FRAMES }, (_, frame) => {
      const padded = copyRect(filtered, filteredW, frame * (frameW + 4), 0, frameW + 4, filteredH);
      const high = scale2x(scale2x(scale2x(padded)));
      return url(encodePng(high.data, high.w, high.h));
    });
    // WebGL 1 mipmaps need power-of-two textures. Separate animation frames
    // prevent the mip chain from mixing adjacent swim poses.
    const mipW = 2 ** Math.ceil(Math.log2(frameW + 8));
    const mipH = 2 ** Math.ceil(Math.log2(filteredH + 4));
    const mipX = Math.floor((mipW - frameW - 4) / 2);
    const mipY = Math.floor((mipH - filteredH) / 2);
    const mipFrames = Array.from({ length: SWIM_FRAMES }, (_, frame) => {
      const rgba = new Uint8Array(mipW * mipH * 4);
      for (let y = 0; y < filteredH; y++) {
        const start = (y * filteredW + frame * (frameW + 4)) * 4;
        rgba.set(filtered.subarray(start, start + (frameW + 4) * 4), ((y + mipY) * mipW + mipX) * 4);
      }
      return url(encodePng(rgba, mipW, mipH));
    });
    examples.push({ name: kind.name, scale: Math.max(0.72, Math.min(1, 24 * Math.sqrt(kind.length) / bb.bw)),
      original: url(originalPng), filtered: url(filteredPng), pixelAware, textureWidth: filteredW, textureHeight: filteredH, mipFrames, mipW, mipH, mipX, mipY });
    writeFileSync(`${output}/${kind.name}-baked3.png`, threePng);
  }
}
examples.sort((a, b) => selected.indexOf(a.name) - selected.indexOf(b.name));
// Simulate the installed KAPLAY next-fit shelf packer, on fish-only pages.
// Real tank allocation also includes props/backdrop/other creatures and load order.
function shelfPages(input: { w: number; h: number }[], padding = 0) {
  let x = 0, y = 0, shelf = 0, pages = 1;
  for (const image of input) {
    const w = image.w + padding * 2, h = image.h + padding * 2;
    if (w > 2048 || h > 2048) throw new Error("Page overflow");
    if (x + w > 2048) { x = 0; y += shelf; shelf = 0; }
    if (y + h > 2048) { pages++; x = 0; y = 0; shelf = 0; }
    x += w; shelf = Math.max(shelf, h);
  }
  return pages;
}
function summarize(scope: typeof rows) {
  const summary: Record<string, any> = { species: scope.length, extraAuthoredPoses3: scope.length * 2,
    extraAuthoredPoses7: scope.length * 6, ms3: scope.reduce((n, r) => n + r.ms3, 0), ms7: scope.reduce((n, r) => n + r.ms7, 0) };
  for (const [name, count] of [["current", 1], ["filtered", 1], ["baked3", 3], ["baked7", 7]] as const) {
    const images = scope.map(r => r[name]);
    summary[name] = { frames: scope.length * SWIM_FRAMES * count,
      rgbaMiB: images.reduce((n, image) => n + image.bytes, 0) / 2 ** 20,
      pngMiB: images.reduce((n, image) => n + image.pngBytes, 0) / 2 ** 20,
      fishOnlyShelfPages: shelfPages(images),
      fishOnlySortedShelfPages: shelfPages([...images].sort((a, b) => b.h - a.h)),
      fishOnlyPoseRowPages: shelfPages(images.flatMap(image => Array.from({ length: count }, () => ({ w: image.w, h: image.h / count }))).sort((a, b) => b.h - a.h)) };
  }
  return summary;
}
const metrics = { generatedAt: new Date().toISOString(), elapsedSeconds: (performance.now() - begin) / 1000,
  assumptions: "RGBA8, no mipmaps; 4 swim frames; three angles -14/0/+14 or seven angles -21..+21 by 7; common padded frame per fish; mirror for right-facing. Shelf estimates are fish-only, 2048px pages, padding 0; exclude other tank textures, CPU copies and browser overhead.",
  all: summarize(rows), witches: summarize(rows.filter(r => r.set === "witches")), species: rows };
writeFileSync(`${output}/memory-estimates.json`, JSON.stringify(metrics, null, 2) + "\n");
const build = await Bun.build({ entrypoints: [resolve("tools/fish-rotation/viewer.ts")], target: "browser", minify: true });
if (!build.success) throw new Error(build.logs.join("\n"));
const script = await build.outputs[0].text();
writeFileSync(`${output}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fish rotation comparison</title><style>
*{box-sizing:border-box}body{margin:0;background:#071a2b;color:#e6eef1;font:15px/1.5 system-ui,sans-serif}main{max-width:1720px;margin:auto;padding:22px 20px}h1{font-size:28px;margin:0 0 6px}p{color:#afc4d0;margin:0 0 16px}.controls{display:flex;gap:20px;align-items:center;flex-wrap:wrap;background:#102b40;padding:14px;border-radius:8px}label{display:flex;gap:8px;align-items:center}select,button{font:inherit;background:#1b3c52;color:#e6eef1;border:1px solid #436178;border-radius:5px;padding:7px 10px}input{accent-color:#80d3ce}output{color:#94d2cc;font-size:13px}.heads{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;margin-top:20px}.heads h2{font-size:19px;margin:0}.heads p{font-size:13px;margin:3px 0 0}.rowlabel{text-align:center;color:#a0b9c7;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:14px 0 0}canvas{display:block;width:100%;height:auto;image-rendering:pixelated}/* KAPLAY sets fixed inline dimensions; keep the full render visible in narrow panels. */#comparison{width:100%!important;height:auto!important}.stage{position:relative}.zoomlabel{position:absolute;top:25%;width:100%;text-align:center;font-size:12px;letter-spacing:2px;color:#a0b9c7;pointer-events:none}.note{font-size:13px;border-top:1px solid #29485e;padding-top:12px}a{color:#9adad7}.tuning{margin-top:12px}#inspection{width:540px;max-width:100%;height:auto;margin:auto}.inspection-controls{justify-content:center;margin-top:16px}.inspection-caption{text-align:center;margin:8px 0}#inspect-toggle{min-width:210px}label{flex-wrap:wrap}input[type=range]{max-width:125px}select{max-width:100%}.filter-info{margin:12px 0;font-size:13px}.tuning label{min-width:0;max-width:100%}#cubic-tuning[hidden]{display:none}
</style><main><h1>Fish rotation: three rendering options</h1>
<p>Same source art, swim frame, body scale and integer position. Top: tank-scale pixels at a 1920×1080 render buffer. The rows fit your panel. Use the same-position inspector below for a larger A/B comparison.</p>
<div class="controls"><label>Fish <select id="fish"></select></label><button id="play">Animate motion</button><label>Tilt <input id="angle" type="range" min="-21" max="21" step="1" value="14"></label><label>Swim frame <input id="frame" type="range" min="0" max="3" step="1" value="1"></label><label>Fish size <input id="fish-size" type="range" min="25" max="100" step="5" value="100"><output id="size-value">100%</output></label><output id="status"></output></div>
<div class="controls tuning"><label>Middle filter <select id="filter-type"><option value="nearest">Nearest · hardware</option><option value="bilinear">Bilinear · hardware</option><option value="trilinear">Trilinear · hardware + mipmaps</option><option value="anisotropic">Anisotropic · hardware extension</option><option value="catmull" selected>Bicubic Catmull–Rom · shader</option><option value="mitchell">Bicubic Mitchell · shader</option><option value="bspline">Bicubic B-spline · shader</option><option value="blend">Adjustable blend · shader</option></select></label><label>Filter amount <input id="filter-strength" type="range" min="0" max="100" step="5" value="35"><output id="filter-value">35%</output></label><label>Experiment <select id="experiment"><option value="edge">Edge-only smoothing</option><option value="rot">RotSprite-style</option></select></label><label>Edge smoothing <input id="edge-strength" type="range" min="0" max="100" step="5" value="75"><output id="edge-value">75%</output></label></div>
<div id="cubic-tuning" class="controls tuning"><label>Cubic sharpness C <input id="cubic-sharpness" type="range" min="0" max="1" step="0.05" value="0.5"><output id="cubic-value">0.50</output></label><label><input id="limit-halos" type="checkbox">Limit halos</label><button id="cubic-reset">Reset to Catmull–Rom</button></div>
<p id="filter-info" class="filter-info"></p><div class="heads"><section><h2>Current</h2><p>Nearest sampling · rotation in 7° steps</p></section><section><h2 id="filter-heading">Adjustable filtering</h2><p id="filter-description">Blend nearest and bilinear</p></section><section><h2 id="experiment-heading">Edge-only smoothing</h2><p id="experiment-description">Smooth transparent boundaries · retain opaque detail</p></section></div><div class="rowlabel">Tank scale</div><canvas id="comparison"></canvas><div class="rowlabel">Enlarged comparison · fitted to panel</div><canvas id="zoom" width="1680" height="540"></canvas>
<div class="controls inspection-controls"><label>Inspect <select id="inspect-method"><option value="1" selected>Middle filter</option><option value="2">Selected experiment</option></select></label><button id="inspect-toggle" aria-pressed="false">Show Current</button></div><p id="inspection-label" class="inspection-caption"></p><canvas id="inspection" width="540" height="540"></canvas><p id="inspection-scale" class="inspection-caption"></p><p class="inspection-caption">Pause motion, then switch methods to compare the same pose in the same place.</p>
<p id="difference" class="note"></p><p class="note">Nearest, bilinear, trilinear and supported anisotropic modes use the GPU texture sampler. Trilinear and anisotropic use separate mipmapped textures per swim frame. Cubic sharpness adjusts the Catmull–Rom family (B=0); only C=0.50 is standard Catmull–Rom. Limit halos confines the result to the central 2×2 texel color/alpha range, which may reduce crispness. These controls do not increase the 16 texture lookups, but the limiter adds arithmetic. Bicubic modes use custom shaders; Catmull–Rom is sharper, Mitchell more balanced, B-spline softer. Filter amount applies only to Adjustable blend. Reduce Fish size to compare minification; anisotropic filtering may resemble trilinear on these flat sprites. Edge-only smoothing blends where the texture has transparency, preserving fully opaque interior detail; transparent holes are smoothed too. RotSprite-style remains available in Experiment. All methods use the same motion and angles. These are visual experiments; full-tank performance has not been measured. The tank itself is unchanged.</p>
<script>window.rotationExamples=${JSON.stringify(examples)};</script><script type="module">${script.replaceAll("</script", "<\\/script")}</script></main></html>`);
console.log(JSON.stringify({ output, elapsedSeconds: metrics.elapsedSeconds, all: metrics.all, witches: metrics.witches }, null, 2));

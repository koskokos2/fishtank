// Normalize twelve authored poses per skin into the existing octopus contract:
// 8 idle sway frames + 11 named poses, 10 columns by 2 rows.
// Size artwork by visible area; allow larger cells for longer limbs.
// Ordinary and Halloween artwork share packing, pose order and size reference.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";
import { OCTOPUS_COLS as COLS,
  OCTOPUS_ROWS as ROWS, OCTOPUS_FRAMES, OCTOPUS_IDLE_FRAMES, OCTOPUS_POSE } from "../src/octopusAtlas";

export function generateOctopusAtlases(kind: "ordinary" | "halloween") {
  const skins = kind === "ordinary" ? ["ordinary"] : ["plague-doctor", "possessed-doll", "vampire-squid"];
  const poses = ["idleHover", ...Object.keys(OCTOPUS_POSE)];
  type Crop = { pixels: number[]; x: number; y: number; w: number; h: number; headX: number };
  const runtime = [];
  // Compare the twelve authored poses once each, without overweighting the eight
  // derived idle frames. Alpha coverage measures body mass, not transparent padding
  // or a long, thin tentacle that would otherwise shrink the entire character.
  // Frozen pre-redraw reference prevents size drift across repeated regeneration.
  const original = decodePng(readFileSync("art/octopus-legacy-packed.png"));
  const ORIGINAL_W = original.w / COLS, ORIGINAL_H = original.h / ROWS;
  const referenceFrames = [0, ...Object.values(OCTOPUS_POSE)];
  const referenceArea = referenceFrames.reduce((total, frame) => {
    let area = 0;
    for (let y = 0; y < ORIGINAL_H; y++) for (let x = 0; x < ORIGINAL_W; x++) {
      const px = frame % COLS * ORIGINAL_W + x;
      const py = Math.floor(frame / COLS) * ORIGINAL_H + y;
      area += original.rgba[(py * original.w + px) * 4 + 3] / 255;
    }
    return total + area;
  }, 0) / referenceFrames.length;
  for (const id of skins) {
    const stem = id === "ordinary" ? "octopus-v2" : `halloween-octopus-${id}`;
    const sourcePath = `art/${stem}-source.png`;
    const source = decodePng(readFileSync(sourcePath));
    // Find whole silhouettes before assigning rows: extended arms deliberately
    // cross the nominal grid boundaries in the authored source sheets.
    const seen = new Uint8Array(source.w * source.h);
    const components: number[][] = [];
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || source.rgba[start * 4 + 3] < 16) continue;
      const pixels = [start]; seen[start] = 1;
      for (let i = 0; i < pixels.length; i++) {
        const px = pixels[i] % source.w, py = Math.floor(pixels[i] / source.w);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy, p = ny * source.w + nx;
          if (nx < 0 || nx >= source.w || ny < 0 || ny >= source.h || seen[p] || source.rgba[p * 4 + 3] < 16) continue;
          seen[p] = 1; pixels.push(p);
        }
      }
      if (pixels.length >= 100) components.push(pixels);
    }
    if (components.length !== poses.length) throw Error(`${id}: expected twelve separate silhouettes, got ${components.length}`);
    const crops: Crop[] = components.map(pixels => {
      let x0 = source.w, y0 = source.h, x1 = 0, y1 = 0;
      for (const p of pixels) { const x = p % source.w, y = Math.floor(p / source.w);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const head = pixels.filter(p => Math.floor(p / source.w) <= y0 + Math.round((y1 - y0) * 0.33));
      const headX = head.reduce((sum, p) => sum + p % source.w, 0) / head.length;
      return { pixels, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, headX };
    }).sort((a, b) => a.y - b.y);
    for (let row = 0; row < 3; row++) crops.splice(row * 4, 4, ...crops.slice(row * 4, row * 4 + 4).sort((a, b) => a.x - b.x));
    // One scale for the whole skin preserves head size as limbs extend/retract.
    // Head-centred x placement follows the original atlas baker; y is bbox-centred.
    const reach = Math.max(...crops.map(c => Math.max(c.headX - c.x + 1, c.x + c.w - c.headX)));
    const sourceArea = crops.reduce((total, c) => total + c.pixels.reduce(
      (area, p) => area + source.rgba[p * 4 + 3] / 255, 0), 0) / crops.length;
    const scale = Math.sqrt(referenceArea / sourceArea);
    // Head alignment and pose indices stay unchanged; only transparent cell bounds
    // grow. Four pixels on either side match the original atlas baker's padding.
    const W = 2 * Math.ceil(reach * scale) + 8;
    const H = 2 * Math.ceil(Math.max(...crops.map(c => c.h)) * scale / 2) + 8;
    if (W * COLS > 2048) throw Error(`${id}: sheet exceeds the renderer texture page`);
    const frames = crops.map(c => {
      const mask = new Set(c.pixels);
      const out = new Uint8Array(W * H * 4);
      const ox = W / 2 - c.headX * scale;
      const oy = (H - c.h * scale) / 2 - c.y * scale;
      // Alpha-weighted area resampling preserves translucent pixel edges without
      // introducing black/teal halos from transparent texels.
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx0 = (x - ox) / scale, sx1 = (x + 1 - ox) / scale;
        const sy0 = (y - oy) / scale, sy1 = (y + 1 - oy) / scale;
        let a = 0, r = 0, g = 0, b = 0;
        for (let sy = Math.max(c.y, Math.floor(sy0)); sy < Math.min(c.y + c.h, Math.ceil(sy1)); sy++) {
          const wy = Math.max(0, Math.min(sy1, sy + 1) - Math.max(sy0, sy));
          for (let sx = Math.max(c.x, Math.floor(sx0)); sx < Math.min(c.x + c.w, Math.ceil(sx1)); sx++) {
            const p = sy * source.w + sx;
            if (!mask.has(p)) continue;
            const area = wy * Math.max(0, Math.min(sx1, sx + 1) - Math.max(sx0, sx));
            const alpha = source.rgba[p * 4 + 3] / 255 * area;
            a += alpha; r += source.rgba[p * 4] * alpha; g += source.rgba[p * 4 + 1] * alpha; b += source.rgba[p * 4 + 2] * alpha;
          }
        }
        const alpha = Math.round(a * scale * scale * 255);
        if (alpha) out.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), alpha], (y * W + x) * 4);
      }
      return out;
    });
    const sheetW = COLS * W, sheetH = ROWS * H;
    const sheet = new Uint8Array(sheetW * sheetH * 4);
    const put = (frame: number, x: number, y: number, src: Uint8Array, si: number) => {
      if (!src[si + 3]) return;
      if (x < 2 || x >= W - 2 || y < 2 || y >= H - 2) throw Error(`${id} frame ${frame} lacks padding`);
      sheet.set(src.subarray(si, si + 4), ((Math.floor(frame / COLS) * H + y) * sheetW + frame % COLS * W + x) * 4);
    };
    let minY = H, maxY = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (frames[0][(y * W + x) * 4 + 3]) {
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    for (let frame = 0; frame < OCTOPUS_IDLE_FRAMES; frame++) for (let y = 0; y < H; y++) {
      const armTop = minY + (maxY - minY) * 0.4;
      const lower = Math.min(1, (y - armTop) / Math.max(1, maxY - armTop));
      const shift = y < armTop ? 0 : Math.round(5 * lower * Math.sin(2 * Math.PI * frame / OCTOPUS_IDLE_FRAMES - 2.4 * lower));
      for (let x = 0; x < W; x++) put(frame, x + shift, y, frames[0], (y * W + x) * 4);
    }
    for (let i = 1; i < frames.length; i++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      put(OCTOPUS_IDLE_FRAMES + i - 1, x, y, frames[i], (y * W + x) * 4);
    const png = encodePng(sheet, sheetW, sheetH);
    const output = `art/${stem}.png`;
    writeFileSync(output, png);
    writeFileSync(`art/${stem}.json`, JSON.stringify({ image: output.split("/").pop(), sourceImage: sourcePath.split("/").pop(),
      generator: kind === "ordinary" ? "tools/gen-octopus-atlas.ts" : "tools/gen-halloween-octopus-atlases.ts", width: sheetW, height: sheetH, frameWidth: W, frameHeight: H,
      columns: COLS, rows: ROWS, frames: OCTOPUS_FRAMES, idleFrames: OCTOPUS_IDLE_FRAMES, poses: OCTOPUS_POSE, scale, referenceArea,
      sourceBounds: crops.map(({pixels, ...bounds}, index) => ({pose: poses[index], ...bounds})) }, null, 2) + "\n");
    const src = `data:image/png;base64,${png.toString("base64")}`;
    runtime.push({ id, sprite: `octopus-${id}`, src });
    if (kind === "ordinary") {
      writeFileSync("src/octopusAtlas.ts", `// GENERATED by tools/gen-octopus-atlas.ts — do not edit by hand.
// Detailed purple octopus from art/octopus-v2-source.png. The original frame
// indices, idle sway and movement contract are preserved; cells fit the artwork.
export const OCTOPUS_ATLAS = ${JSON.stringify(src)};
export const OCTOPUS_FRAMES = ${OCTOPUS_FRAMES};
export const OCTOPUS_IDLE_FRAMES = ${OCTOPUS_IDLE_FRAMES};
export const OCTOPUS_COLS = ${COLS};
export const OCTOPUS_ROWS = ${ROWS};
export const OCTOPUS_FRAME_W = ${W};
export const OCTOPUS_FRAME_H = ${H};
export const OCTOPUS_POSE = ${JSON.stringify(OCTOPUS_POSE, null, 2)} as const;
  `);
    }
    console.log(`${id}: ${OCTOPUS_FRAMES} padded frames, ${sheetW}x${sheetH}, common scale ${scale.toFixed(3)}`);
  }
  if (kind === "halloween") writeFileSync("src/halloweenOctopusAtlases.ts", "// GENERATED by tools/gen-halloween-octopus-atlases.ts — do not edit.\n" +
    "// Every skin uses OCTOPUS_POSE and the original 10x2 grid, with cells sized to its silhouette.\n" +
    `export const HALLOWEEN_OCTOPUS_ATLASES = ${JSON.stringify(runtime, null, 2)} as const;\n`);
}

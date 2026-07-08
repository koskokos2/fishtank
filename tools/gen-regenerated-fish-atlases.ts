// Normalize the regenerated high-resolution fish sheets into clean 3x4
// runtime atlases. Each fish is isolated through an empty gutter, centred in a
// padded work tile, then area-filtered into its 128px cell with premultiplied
// alpha so fins and barbels stay crisp without green/dark edge halos.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type AtlasConfig = {
  source: string;
  output: string;
  width: number;
  height: number;
  colCuts: readonly number[];
  rowCuts: readonly number[];
  minIslandPixels?: number;
};

const TILE = 128;
const WORK_TILE = 384;
const CONFIGS: AtlasConfig[] = [
  {
    source: "art/fish-atlas-regenerated-transparent.png",
    output: "art/fish-atlas-128.png",
    width: 1070,
    height: 1470,
    colCuts: [0, 374, 708, 1070],
    rowCuts: [0, 425, 734, 1035, 1470],
  },
  {
    source: "art/fish-extra-atlas-regenerated-transparent.png",
    output: "art/fish-extra-atlas-128.png",
    width: 1086,
    height: 1448,
    colCuts: [0, 379, 699, 1086],
    rowCuts: [0, 418, 701, 1024, 1448],
  },
  {
    source: "art/fish-bonus-atlas-regenerated-transparent.png",
    output: "art/fish-bonus-atlas-128.png",
    width: 1085,
    height: 1450,
    colCuts: [0, 362, 723, 1085],
    rowCuts: [0, 363, 725, 1088, 1450],
    minIslandPixels: 12,
  },
];

// Generated chroma-key sources occasionally leave isolated one-pixel flecks.
// Remove only tiny disconnected components after downsampling; genuine fins,
// barbels, and spines remain connected to the body and are unaffected.
function removeTinyIslands(rgba: Uint8Array, minPixels: number) {
  if (minPixels <= 1) return;
  const seen = new Uint8Array(TILE * TILE);
  // Fully discard near-invisible matte noise before component analysis.
  for (let index = 0; index < TILE * TILE; index++)
    if (rgba[index * 4 + 3] < 16) rgba.fill(0, index * 4, index * 4 + 4);
  for (let start = 0; start < TILE * TILE; start++) {
    if (seen[start] || rgba[start * 4 + 3] < 16) continue;
    const stack = [start];
    const component: number[] = [];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      component.push(index);
      const x = index % TILE;
      const y = Math.floor(index / TILE);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if ((!ox && !oy) || x + ox < 0 || x + ox >= TILE || y + oy < 0 || y + oy >= TILE)
            continue;
          const next = (y + oy) * TILE + x + ox;
          if (seen[next] || rgba[next * 4 + 3] < 16) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (component.length >= minPixels) continue;
    for (const index of component) rgba.fill(0, index * 4, index * 4 + 4);
  }
}

function alphaBBox(rgba: Uint8Array, imageW: number, region: Rect): Rect {
  let minX = region.x + region.w;
  let minY = region.y + region.h;
  let maxX = region.x - 1;
  let maxY = region.y - 1;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (rgba[(y * imageW + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error("empty fish source region");
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function downsample(work: Uint8Array): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4);
  const scale = WORK_TILE / TILE;
  for (let dy = 0; dy < TILE; dy++) {
    const sy0 = dy * scale;
    const sy1 = (dy + 1) * scale;
    for (let dx = 0; dx < TILE; dx++) {
      const sx0 = dx * scale;
      const sx1 = (dx + 1) * scale;
      let weight = 0;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.max(0, Math.min(sy1, sy + 1) - Math.max(sy0, sy));
        if (!wy || sy < 0 || sy >= WORK_TILE) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.max(0, Math.min(sx1, sx + 1) - Math.max(sx0, sx));
          if (!wx || sx < 0 || sx >= WORK_TILE) continue;
          const area = wx * wy;
          const si = (sy * WORK_TILE + sx) * 4;
          const a = work[si + 3] / 255;
          weight += area;
          alpha += a * area;
          red += work[si] * a * area;
          green += work[si + 1] * a * area;
          blue += work[si + 2] * a * area;
        }
      }
      if (alpha === 0) continue;
      const di = (dy * TILE + dx) * 4;
      out[di] = Math.round(red / alpha);
      out[di + 1] = Math.round(green / alpha);
      out[di + 2] = Math.round(blue / alpha);
      out[di + 3] = Math.round((alpha / weight) * 255);
    }
  }
  return out;
}

function generate(config: AtlasConfig) {
  const { rgba, w, h } = decodePng(readFileSync(config.source));
  if (w !== config.width || h !== config.height)
    throw new Error(`${config.source}: expected ${config.width}x${config.height}, got ${w}x${h}`);

  const sheetW = TILE * 3;
  const sheetH = TILE * 4;
  const sheet = new Uint8Array(sheetW * sheetH * 4);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const region: Rect = {
        x: config.colCuts[col],
        y: config.rowCuts[row],
        w: config.colCuts[col + 1] - config.colCuts[col],
        h: config.rowCuts[row + 1] - config.rowCuts[row],
      };
      const bb = alphaBBox(rgba, w, region);
      const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
      const offX = Math.round((WORK_TILE - bb.w) / 2) - bb.x;
      const offY = Math.round((WORK_TILE - bb.h) / 2) - bb.y;
      for (let y = bb.y; y < bb.y + bb.h; y++) {
        for (let x = bb.x; x < bb.x + bb.w; x++) {
          const si = (y * w + x) * 4;
          if (rgba[si + 3] === 0) continue;
          const tx = x + offX;
          const ty = y + offY;
          const wi = (ty * WORK_TILE + tx) * 4;
          work.set(rgba.subarray(si, si + 4), wi);
        }
      }
      const tile = downsample(work);
      removeTinyIslands(tile, config.minIslandPixels ?? 1);
      for (let y = 0; y < TILE; y++) {
        const from = y * TILE * 4;
        const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
        sheet.set(tile.subarray(from, from + TILE * 4), to);
      }
    }
  }
  writeFileSync(config.output, encodePng(sheet, sheetW, sheetH));
  console.log(`wrote ${config.output} (3x4 cells, ${TILE}px each)`);
}

for (const config of CONFIGS) generate(config);

// Normalize the generated 4x4 designer sheet into a clean 128px-cell runtime
// atlas. The model source uses slightly uneven source cells, so each prop is
// isolated, centred with generous padding, and area-filtered with premultiplied
// alpha to preserve pixel-art edges without chroma halos.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };

const SOURCE = "art/small-props-atlas-regenerated-transparent.png";
const OUTPUT = "art/small-props-atlas-128.png";
const SOURCE_SIZE = 1254;
const CUTS = [0, 314, 627, 941, 1254] as const;
const TILE = 128;
const WORK_TILE = 384;

function alphaBBox(rgba: Uint8Array, imageW: number, region: Rect): Rect {
  let minX = region.x + region.w;
  let minY = region.y + region.h;
  let maxX = region.x - 1;
  let maxY = region.y - 1;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (rgba[(y * imageW + x) * 4 + 3] < 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error("empty small-prop source region");
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function downsample(work: Uint8Array): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4);
  const scale = WORK_TILE / TILE;
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      let weight = 0;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = dy * scale; sy < (dy + 1) * scale; sy++) {
        for (let sx = dx * scale; sx < (dx + 1) * scale; sx++) {
          const si = (sy * WORK_TILE + sx) * 4;
          const a = work[si + 3] / 255;
          weight++;
          alpha += a;
          red += work[si] * a;
          green += work[si + 1] * a;
          blue += work[si + 2] * a;
        }
      }
      if (!alpha) continue;
      const di = (dy * TILE + dx) * 4;
      out[di] = Math.round(red / alpha);
      out[di + 1] = Math.round(green / alpha);
      out[di + 2] = Math.round(blue / alpha);
      out[di + 3] = Math.round((alpha / weight) * 255);
    }
  }
  return out;
}

// Chroma extraction can leave tiny detached grains. Keep meaningful sand rims,
// chains, and skeleton bones, but remove components too small to survive at play
// scale.
function removeTinyIslands(rgba: Uint8Array, minPixels = 5) {
  const seen = new Uint8Array(TILE * TILE);
  for (let i = 0; i < TILE * TILE; i++)
    if (rgba[i * 4 + 3] < 16) rgba.fill(0, i * 4, i * 4 + 4);
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
          if ((!ox && !oy) || x + ox < 0 || x + ox >= TILE || y + oy < 0 || y + oy >= TILE) continue;
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

const { rgba, w, h } = decodePng(readFileSync(SOURCE));
if (w !== SOURCE_SIZE || h !== SOURCE_SIZE)
  throw new Error(`${SOURCE}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${w}x${h}`);

const sheet = new Uint8Array(TILE * 4 * TILE * 4 * 4);
const sheetW = TILE * 4;
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 4; col++) {
    const region: Rect = {
      x: CUTS[col],
      y: CUTS[row],
      w: CUTS[col + 1] - CUTS[col],
      h: CUTS[row + 1] - CUTS[row],
    };
    const bb = alphaBBox(rgba, w, region);
    const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
    const offX = Math.round((WORK_TILE - bb.w) / 2) - bb.x;
    const offY = Math.round((WORK_TILE - bb.h) / 2) - bb.y;
    for (let y = bb.y; y < bb.y + bb.h; y++) {
      for (let x = bb.x; x < bb.x + bb.w; x++) {
        const si = (y * w + x) * 4;
        if (rgba[si + 3] < 16) continue;
        const wi = ((y + offY) * WORK_TILE + x + offX) * 4;
        work.set(rgba.subarray(si, si + 4), wi);
      }
    }
    const tile = downsample(work);
    removeTinyIslands(tile);
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
      sheet.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

writeFileSync(OUTPUT, encodePng(sheet, sheetW, TILE * 4));
console.log(`wrote ${OUTPUT} (4x4 cells, ${TILE}px each)`);

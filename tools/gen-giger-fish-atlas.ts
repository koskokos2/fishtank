// Normalize the transparent biomechanical fish sheet into the runtime 3x4
// atlas and embed it for the shared fish swim-sheet baker.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type Sprite = { name: string; row: number; col: number };

const SOURCE = "art/giger-fish-atlas-transparent.png";
const OUTPUT = "art/giger-fish-atlas-128.png";
const MANIFEST = "art/giger-fish-atlas-128.json";
const MODULE = "src/gigerFishAtlas.ts";
const SOURCE_W = 1075;
const SOURCE_H = 1463;
const COLS = 3;
const ROWS = 4;
const TILE = 128;
const WORK_TILE = 384;
const ROW_CUTS = [0, 423, 738, 1036, SOURCE_H] as const;
// Long fins overlap the nominal thirds differently in each row. These cuts sit
// inside the measured transparent gutter for that row.
const COL_CUTS = [
  [0, 382, 704, SOURCE_W],
  [0, 374, 692, SOURCE_W],
  [0, 370, 684, SOURCE_W],
  [0, 338, 674, SOURCE_W],
] as const;

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
  if (maxX < minX) throw new Error(`empty biomechanical fish region at ${region.x},${region.y}`);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function downsample(work: Uint8Array): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4);
  const scale = WORK_TILE / TILE;
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = dy * scale; sy < (dy + 1) * scale; sy++) {
        for (let sx = dx * scale; sx < (dx + 1) * scale; sx++) {
          const si = (sy * WORK_TILE + sx) * 4;
          const a = work[si + 3] / 255;
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
      out[di + 3] = Math.round((alpha / (scale * scale)) * 255);
    }
  }
  return out;
}

function removeTinyIslands(rgba: Uint8Array, minPixels = 3): void {
  const seen = new Uint8Array(TILE * TILE);
  for (let start = 0; start < TILE * TILE; start++) {
    if (seen[start] || rgba[start * 4 + 3] < 16) continue;
    const stack = [start];
    const component: number[] = [];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      component.push(p);
      const x = p % TILE;
      const y = Math.floor(p / TILE);
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
    for (const p of component) rgba.fill(0, p * 4, p * 4 + 4);
  }
}

const source = decodePng(readFileSync(SOURCE));
if (source.w !== SOURCE_W || source.h !== SOURCE_H)
  throw new Error(`${SOURCE}: expected ${SOURCE_W}x${SOURCE_H}, got ${source.w}x${source.h}`);
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  tileSize: number;
  columns: number;
  rows: number;
  sprites: Sprite[];
};
if (manifest.tileSize !== TILE || manifest.columns !== COLS || manifest.rows !== ROWS)
  throw new Error(`${MANIFEST}: expected a ${COLS}x${ROWS} layout with ${TILE}px cells`);

const atlasW = TILE * COLS;
const atlasH = TILE * ROWS;
const atlas = new Uint8Array(atlasW * atlasH * 4);
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const x0 = COL_CUTS[row][col];
    const x1 = COL_CUTS[row][col + 1];
    const y0 = ROW_CUTS[row];
    const y1 = ROW_CUTS[row + 1];
    const bb = alphaBBox(source.rgba, source.w, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    if (bb.w > WORK_TILE || bb.h > WORK_TILE)
      throw new Error(`biomechanical fish (${row},${col}) is ${bb.w}x${bb.h}, larger than ${WORK_TILE}px`);
    const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
    const offX = Math.round((WORK_TILE - bb.w) / 2) - bb.x;
    const offY = Math.round((WORK_TILE - bb.h) / 2) - bb.y;
    for (let y = bb.y; y < bb.y + bb.h; y++) {
      for (let x = bb.x; x < bb.x + bb.w; x++) {
        const si = (y * source.w + x) * 4;
        if (source.rgba[si + 3] < 16) continue;
        const wi = ((y + offY) * WORK_TILE + x + offX) * 4;
        work.set(source.rgba.subarray(si, si + 4), wi);
      }
    }
    const tile = downsample(work);
    removeTinyIslands(tile);
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * atlasW + col * TILE) * 4;
      atlas.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

const png = encodePng(atlas, atlasW, atlasH);
writeFileSync(OUTPUT, png);
const layout = manifest.sprites
  .map((sprite) => `  ${sprite.name}: { row: ${sprite.row}, col: ${sprite.col} },`)
  .join("\n");
const moduleSource = `// GENERATED by tools/gen-giger-fish-atlas.ts — do not edit by hand.\n` +
  `// Biomechanical Dream Archive fish: a 3x4 grid of left-facing 128px cells.\n` +
  `export const GIGER_FISH_ATLAS = "data:image/png;base64,${png.toString("base64")}";\n` +
  `export const GIGER_FISH_ATLAS_CELL = ${TILE};\n` +
  `export const GIGER_FISH_ATLAS_COLS = ${COLS};\n` +
  `export const GIGER_FISH_ATLAS_ROWS = ${ROWS};\n` +
  `export const GIGER_FISH_ATLAS_LAYOUT: Record<string, { row: number; col: number }> = {\n${layout}\n};\n`;
writeFileSync(MODULE, moduleSource);
console.log(`wrote ${OUTPUT} and ${MODULE}`);

// Normalize the generated 4x4 plant-component sheet into a 128px-cell runtime
// atlas. Every sprite is bottom-centred around the same root pivot, allowing the
// game to assemble independently swaying fronds into varied clumps. A four-row
// ordered-alpha fade at each root reveals the real procedural sand underneath.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type SpriteDef = { name: string; row: number; col: number; category: string };

const SOURCE = "art/plant-atlas-v2-transparent.png";
const MANIFEST = "art/plant-atlas-v2-128.json";
const OUTPUT = "art/plant-atlas-v2-128.png";
const MODULE = "src/plantAtlas.ts";
const SOURCE_SIZE = 1254;
const CUTS = [0, 314, 627, 941, 1254] as const;
const TILE = 128;
const WORK_TILE = 384;
const WORK_BOTTOM_PAD = 4;
const ROOT_FADE = 4;

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
  if (maxX < minX) throw new Error("empty plant source region");
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function downsample(work: Uint8Array): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4);
  const scale = WORK_TILE / TILE;
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      let samples = 0;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = dy * scale; sy < (dy + 1) * scale; sy++) {
        for (let sx = dx * scale; sx < (dx + 1) * scale; sx++) {
          const si = (sy * WORK_TILE + sx) * 4;
          const a = work[si + 3] / 255;
          samples++;
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
      out[di + 3] = Math.round((alpha / samples) * 255);
    }
  }
  return out;
}

function bounds(tile: Uint8Array) {
  let top = TILE;
  let bottom = -1;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (tile[(y * TILE + x) * 4 + 3] < 16) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { top, bottom };
}

// Chroma extraction preserves a few tiny detached root specks from the concept
// sheet. They are not useful pivots: retain meaningful plant components and
// discard only islands too small to read at play scale.
function retainMainPlant(tile: Uint8Array) {
  const seen = new Uint8Array(TILE * TILE);
  const components: number[][] = [];
  for (let start = 0; start < TILE * TILE; start++) {
    if (seen[start] || tile[start * 4 + 3] < 16) continue;
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
          if (seen[next] || tile[next * 4 + 3] < 16) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  for (const component of components.slice(1))
    for (const index of component) tile.fill(0, index * 4, index * 4 + 4);
}

function alignLivingRoot(tile: Uint8Array, targetBottom = TILE - 2) {
  const { bottom } = bounds(tile);
  const shift = targetBottom - bottom;
  if (!shift) return;
  const moved = new Uint8Array(tile.length);
  for (let y = 0; y < TILE; y++) {
    const ny = y + shift;
    if (ny < 0 || ny >= TILE) continue;
    moved.set(tile.subarray(y * TILE * 4, (y + 1) * TILE * 4), ny * TILE * 4);
  }
  tile.set(moved);
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function ditherRoot(tile: Uint8Array) {
  const { bottom } = bounds(tile);
  for (let y = Math.max(0, bottom - ROOT_FADE + 1); y <= bottom; y++) {
    const coverage = (bottom - y) / ROOT_FADE;
    for (let x = 0; x < TILE; x++) {
      const ai = (y * TILE + x) * 4 + 3;
      if (tile[ai] < 16) continue;
      const threshold = (BAYER4[y & 3][x & 3] + 0.5) / 16;
      if (coverage <= threshold) tile[ai] = 0;
    }
  }
}

const source = decodePng(readFileSync(SOURCE));
if (source.w !== SOURCE_SIZE || source.h !== SOURCE_SIZE)
  throw new Error(`${SOURCE}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${source.w}x${source.h}`);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  sprites: SpriteDef[];
};
const sheetW = TILE * 4;
const sheet = new Uint8Array(sheetW * TILE * 4 * 4);
const layout: Record<string, { row: number; col: number; top: number; bottom: number }> = {};

for (const sprite of manifest.sprites) {
  const { row, col } = sprite;
  const region: Rect = {
    x: CUTS[col],
    y: CUTS[row],
    w: CUTS[col + 1] - CUTS[col],
    h: CUTS[row + 1] - CUTS[row],
  };
  const bb = alphaBBox(source.rgba, source.w, region);
  const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
  const offX = Math.round((WORK_TILE - bb.w) / 2) - bb.x;
  const offY = WORK_TILE - WORK_BOTTOM_PAD - (bb.y + bb.h);
  for (let y = bb.y; y < bb.y + bb.h; y++) {
    for (let x = bb.x; x < bb.x + bb.w; x++) {
      const si = (y * source.w + x) * 4;
      if (source.rgba[si + 3] < 16) continue;
      const wx = x + offX;
      const wy = y + offY;
      if (wx < 0 || wx >= WORK_TILE || wy < 0 || wy >= WORK_TILE) continue;
      work.set(source.rgba.subarray(si, si + 4), (wy * WORK_TILE + wx) * 4);
    }
  }
  const tile = downsample(work);
  retainMainPlant(tile);
  alignLivingRoot(tile);
  ditherRoot(tile);
  const content = bounds(tile);
  layout[sprite.name] = { row, col, ...content };
  for (let y = 0; y < TILE; y++) {
    const from = y * TILE * 4;
    const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
    sheet.set(tile.subarray(from, from + TILE * 4), to);
  }
}

const png = encodePng(sheet, sheetW, TILE * 4);
writeFileSync(OUTPUT, png);

const entries = manifest.sprites
  .map((sprite, frame) => {
    const b = layout[sprite.name];
    return `  ${sprite.name}: { frame: ${frame}, row: ${b.row}, col: ${b.col}, top: ${b.top}, bottom: ${b.bottom} },`;
  })
  .join("\n");
const moduleText = `// GENERATED by tools/gen-plant-atlas-v2.ts — do not edit by hand.\n` +
  `// Modular rooted fronds with a dithered alpha fade at the common sand pivot.\n` +
  `export const PLANT_ATLAS = "data:image/png;base64,${png.toString("base64")}";\n` +
  `export const PLANT_ATLAS_CELL = ${TILE};\n` +
  `export const PLANT_ATLAS_COLS = 4;\n` +
  `export const PLANT_ATLAS_ROWS = 4;\n` +
  `export const PLANT_ATLAS_LAYOUT = {\n${entries}\n} as const;\n`;
writeFileSync(MODULE, moduleText);
console.log(`wrote ${OUTPUT} and ${MODULE}`);

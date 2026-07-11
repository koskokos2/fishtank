// Normalize the transparent pop-culture fish source into the runtime 3x4 atlas
// and embed it as a TypeScript data URL. The alpha source is produced from the
// chroma reference before this runs, preserving black costume and outline pixels.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type Sprite = { name: string; row: number; col: number };

const SOURCE = "art/pop-culture-fish-atlas-transparent.png";
const OUTPUT = "art/pop-culture-fish-atlas-128.png";
const MANIFEST = "art/pop-culture-fish-atlas-128.json";
const MODULE = "src/popCultureFishAtlas.ts";
const SOURCE_W = 1073;
const SOURCE_H = 1465;
const TILE = 128;
const WORK_TILE = 384;
const MIN_SOURCE_COMPONENT = 10;

const SOURCE_REGIONS: readonly (readonly Rect[])[] = [
  [
    { x: 35, y: 105, w: 355, h: 280 },
    { x: 395, y: 105, w: 325, h: 280 },
    { x: 725, y: 105, w: 340, h: 280 },
  ],
  [
    { x: 35, y: 405, w: 340, h: 280 },
    { x: 390, y: 405, w: 325, h: 280 },
    { x: 720, y: 405, w: 345, h: 280 },
  ],
  [
    { x: 35, y: 710, w: 340, h: 330 },
    { x: 385, y: 710, w: 330, h: 330 },
    { x: 725, y: 710, w: 325, h: 330 },
  ],
  [
    { x: 35, y: 1035, w: 345, h: 310 },
    { x: 380, y: 1035, w: 340, h: 310 },
    { x: 725, y: 1035, w: 330, h: 310 },
  ],
] as const;

const source = decodePng(readFileSync(SOURCE));
if (source.w !== SOURCE_W || source.h !== SOURCE_H)
  throw new Error(`${SOURCE}: expected ${SOURCE_W}x${SOURCE_H}, got ${source.w}x${source.h}`);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  tileSize: number;
  columns: number;
  rows: number;
  sprites: Sprite[];
};
if (manifest.tileSize !== TILE || manifest.columns !== 3 || manifest.rows !== 4)
  throw new Error(`${MANIFEST}: expected a 3x4 layout with ${TILE}px cells`);

function isolate(region: Rect): { mask: Uint8Array; bbox: Rect } {
  const size = region.w * region.h;
  const candidate = new Uint8Array(size);
  const seen = new Uint8Array(size);
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      const i = ((region.y + y) * source.w + region.x + x) * 4;
      if (source.rgba[i + 3] > 0)
        candidate[y * region.w + x] = 1;
    }
  }

  const kept = new Uint8Array(size);
  for (let start = 0; start < size; start++) {
    if (!candidate[start] || seen[start]) continue;
    const stack = [start];
    const component: number[] = [];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      component.push(p);
      const x = p % region.w;
      const y = Math.floor(p / region.w);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if ((!ox && !oy) || x + ox < 0 || x + ox >= region.w || y + oy < 0 || y + oy >= region.h)
            continue;
          const next = (y + oy) * region.w + x + ox;
          if (!candidate[next] || seen[next]) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (component.length >= MIN_SOURCE_COMPONENT)
      for (const p of component) kept[p] = 1;
  }

  const mask = kept;

  let minX = region.w;
  let minY = region.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      if (!mask[y * region.w + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error(`empty pop-culture fish region at ${region.x},${region.y}`);
  return { mask, bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
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

function removeTinyIslands(rgba: Uint8Array, minPixels: number): void {
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
    for (const p of component) rgba.fill(0, p * 4, p * 4 + 4);
  }
}

const atlasW = TILE * 3;
const atlasH = TILE * 4;
const atlas = new Uint8Array(atlasW * atlasH * 4);
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 3; col++) {
    const region = SOURCE_REGIONS[row][col];
    const { mask, bbox } = isolate(region);
    if (bbox.w > WORK_TILE || bbox.h > WORK_TILE)
      throw new Error(`pop-culture fish (${row},${col}) is ${bbox.w}x${bbox.h}, larger than the work tile`);
    const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
    const offX = Math.round((WORK_TILE - bbox.w) / 2) - bbox.x;
    const offY = Math.round((WORK_TILE - bbox.h) / 2) - bbox.y;
    for (let y = bbox.y; y < bbox.y + bbox.h; y++) {
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) {
        if (!mask[y * region.w + x]) continue;
        const si = ((region.y + y) * source.w + region.x + x) * 4;
        const wi = ((y + offY) * WORK_TILE + x + offX) * 4;
        work.set(source.rgba.subarray(si, si + 4), wi);
      }
    }
    const tile = downsample(work);
    removeTinyIslands(tile, 4);
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * atlasW + col * TILE) * 4;
      atlas.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

writeFileSync(OUTPUT, encodePng(atlas, atlasW, atlasH));
console.log(`wrote ${OUTPUT} (3x4 cells, ${TILE}px each)`);

const b64 = readFileSync(OUTPUT).toString("base64");
const layout = manifest.sprites
  .map((sprite) => `  ${sprite.name}: { row: ${sprite.row}, col: ${sprite.col} },`)
  .join("\n");
const moduleSource = `// GENERATED by tools/gen-pop-culture-fish-atlas.ts — do not edit by hand.
// The pop-culture fish sprite sheet: a 3x4 grid of 128px cells, one left-facing
// fish per cell. Each receives the shared species-profiled swim cycle at load.
export const POP_CULTURE_FISH_ATLAS = "data:image/png;base64,${b64}";
export const POP_CULTURE_FISH_ATLAS_CELL = ${TILE};
export const POP_CULTURE_FISH_ATLAS_COLS = 3;
export const POP_CULTURE_FISH_ATLAS_ROWS = 4;
export const POP_CULTURE_FISH_ATLAS_LAYOUT: Record<string, { row: number; col: number }> = {
${layout}
};
`;
writeFileSync(MODULE, moduleSource);
console.log(`wrote ${MODULE} (${(moduleSource.length / 1024).toFixed(0)} KB)`);

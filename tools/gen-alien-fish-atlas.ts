// Normalize the generated ALIEN concept sheet into the runtime 3x4 atlas and
// embed it as a TypeScript data URL. The source was generated against black;
// foreground components are isolated per cell before the same premultiplied
// area downsample used by the other regenerated fish atlases.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type Sprite = { name: string; row: number; col: number };

const SOURCE = "art/alien-fish-atlas-final-v2.png";
const OUTPUT = "art/alien-fish-atlas-128.png";
const MANIFEST = "art/alien-fish-atlas-128.json";
const MODULE = "src/alienFishAtlas.ts";
const SOURCE_W = 1024;
const SOURCE_H = 1536;
const TILE = 128;
const WORK_TILE = 384;
const SIGNAL_THRESHOLD = 32;
const MIN_SOURCE_COMPONENT = 12;
const OUTLINE_RADIUS = 2;

// The generated portrait has generous gutters. These bands intentionally stop
// before the next row so low-level black-background texture cannot join cells.
const SOURCE_REGIONS: readonly (readonly Rect[])[] = [
  [
    { x: 0, y: 100, w: 341, h: 300 },
    { x: 405, y: 100, w: 278, h: 300 },
    { x: 700, y: 100, w: 324, h: 300 },
  ],
  [
    { x: 0, y: 400, w: 341, h: 300 },
    { x: 372, y: 400, w: 311, h: 335 },
    { x: 720, y: 400, w: 304, h: 300 },
  ],
  [
    { x: 0, y: 735, w: 341, h: 265 },
    { x: 350, y: 735, w: 333, h: 265 },
    { x: 700, y: 735, w: 324, h: 265 },
  ],
  [
    { x: 0, y: 1000, w: 341, h: 350 },
    { x: 390, y: 1000, w: 293, h: 350 },
    { x: 725, y: 1000, w: 299, h: 350 },
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

function maxChannelAt(x: number, y: number): number {
  const i = (y * source.w + x) * 4;
  return Math.max(source.rgba[i], source.rgba[i + 1], source.rgba[i + 2]);
}

function isolate(region: Rect): { mask: Uint8Array; bbox: Rect } {
  const size = region.w * region.h;
  const candidate = new Uint8Array(size);
  const seen = new Uint8Array(size);
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      if (maxChannelAt(region.x + x, region.y + y) > SIGNAL_THRESHOLD)
        candidate[y * region.w + x] = 1;
    }
  }

  // Keep real sprite pieces (including portal rings and deliberate stars), while
  // rejecting the source's sparse near-black canvas texture.
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

  // Recover the very dark contour pixels lost by the signal threshold. The
  // source background is black too, so a tight dilation doubles as the compact
  // dark outline used by the existing fish art.
  let mask = kept;
  for (let pass = 0; pass < OUTLINE_RADIUS; pass++) {
    const expanded = new Uint8Array(mask);
    for (let y = 0; y < region.h; y++) {
      for (let x = 0; x < region.w; x++) {
        if (!mask[y * region.w + x]) continue;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx >= 0 && nx < region.w && ny >= 0 && ny < region.h)
              expanded[ny * region.w + nx] = 1;
          }
        }
      }
    }
    mask = expanded;
  }

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
  if (maxX < minX) throw new Error(`empty alien fish region at ${region.x},${region.y}`);
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

function removeTinyOutputIslands(rgba: Uint8Array, minPixels: number): void {
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

const atlas = new Uint8Array(TILE * 3 * TILE * 4 * 4);
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 3; col++) {
    const region = SOURCE_REGIONS[row][col];
    const { mask, bbox } = isolate(region);
    if (bbox.w > WORK_TILE || bbox.h > WORK_TILE)
      throw new Error(`alien fish (${row},${col}) is ${bbox.w}x${bbox.h}, larger than the work tile`);
    const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
    const offX = Math.round((WORK_TILE - bbox.w) / 2) - bbox.x;
    const offY = Math.round((WORK_TILE - bbox.h) / 2) - bbox.y;
    for (let y = bbox.y; y < bbox.y + bbox.h; y++) {
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) {
        if (!mask[y * region.w + x]) continue;
        const si = ((region.y + y) * source.w + region.x + x) * 4;
        const wi = ((y + offY) * WORK_TILE + x + offX) * 4;
        const max = Math.max(source.rgba[si], source.rgba[si + 1], source.rgba[si + 2]);
        if (max <= 2) {
          work[wi] = 7;
          work[wi + 1] = 7;
          work[wi + 2] = 9;
        } else {
          work[wi] = source.rgba[si];
          work[wi + 1] = source.rgba[si + 1];
          work[wi + 2] = source.rgba[si + 2];
        }
        work[wi + 3] = 255;
      }
    }
    const tile = downsample(work);
    removeTinyOutputIslands(tile, 4);
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * TILE * 3 + col * TILE) * 4;
      atlas.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

writeFileSync(OUTPUT, encodePng(atlas, TILE * 3, TILE * 4));
console.log(`wrote ${OUTPUT} (3x4 cells, ${TILE}px each)`);

const b64 = readFileSync(OUTPUT).toString("base64");
const layout = manifest.sprites
  .map((sprite) => `  ${sprite.name}: { row: ${sprite.row}, col: ${sprite.col} },`)
  .join("\n");
const moduleSource = `// GENERATED by tools/gen-alien-fish-atlas.ts — do not edit by hand.
// The ALIEN fish sprite sheet: a 3x4 grid of 128px cells, one left-facing fish
// per cell. Each receives the shared species-profiled swim cycle at load time.
export const ALIEN_FISH_ATLAS = "data:image/png;base64,${b64}";
export const ALIEN_FISH_ATLAS_CELL = ${TILE};
export const ALIEN_FISH_ATLAS_COLS = 3;
export const ALIEN_FISH_ATLAS_ROWS = 4;
export const ALIEN_FISH_ATLAS_LAYOUT: Record<string, { row: number; col: number }> = {
${layout}
};
`;
writeFileSync(MODULE, moduleSource);
console.log(`wrote ${MODULE} (${(moduleSource.length / 1024).toFixed(0)} KB)`);

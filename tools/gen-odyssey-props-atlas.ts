// Normalize the transparent Odyssey relic sheet into a 4x3 runtime atlas,
// dither its compact seabed bases, and embed it for Kaplay.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type Sprite = { name: string; row: number; col: number };

const SOURCE = "art/odyssey-props-atlas-transparent-v2.png";
const OUTPUT = "art/odyssey-props-atlas-128.png";
const MANIFEST = "art/odyssey-props-atlas-128.json";
const MODULE = "src/odysseyPropsAtlas.ts";
const REPLACEMENTS: Record<string, string> = {
  helios_sacred_bull_skull: "art/odyssey-replacements/helios-bull-skull-transparent.png",
  tiresias_underworld_lantern: "art/odyssey-replacements/underworld-lantern-transparent.png",
  cyclops_head: "art/odyssey-replacements/cyclops-head-transparent.png",
};
const SOURCE_W = 1448;
const SOURCE_H = 1086;
const COLS = 4;
const ROWS = 3;
const TILE = 128;
const WORK_TILE = 384;
const BURIAL_BAND = 18;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
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
  if (maxX < minX) throw new Error(`empty Odyssey relic region at ${region.x},${region.y}`);
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

function normalizeReplacement(
  rgba: Uint8Array,
  imageW: number,
  bounds: Rect,
): Uint8Array {
  const maxContent = 330;
  const scale = Math.min(maxContent / bounds.w, maxContent / bounds.h);
  const targetW = Math.max(1, Math.round(bounds.w * scale));
  const targetH = Math.max(1, Math.round(bounds.h * scale));
  const offsetX = Math.round((WORK_TILE - targetW) / 2);
  const offsetY = Math.round((WORK_TILE - targetH) / 2);
  const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);

  for (let y = 0; y < targetH; y++) {
    const sy = bounds.y + (y + 0.5) * bounds.h / targetH - 0.5;
    const y0 = Math.max(bounds.y, Math.min(bounds.y + bounds.h - 1, Math.floor(sy)));
    const y1 = Math.max(bounds.y, Math.min(bounds.y + bounds.h - 1, y0 + 1));
    const fy = sy - Math.floor(sy);
    for (let x = 0; x < targetW; x++) {
      const sx = bounds.x + (x + 0.5) * bounds.w / targetW - 0.5;
      const x0 = Math.max(bounds.x, Math.min(bounds.x + bounds.w - 1, Math.floor(sx)));
      const x1 = Math.max(bounds.x, Math.min(bounds.x + bounds.w - 1, x0 + 1));
      const fx = sx - Math.floor(sx);
      const samples = [
        { x: x0, y: y0, weight: (1 - fx) * (1 - fy) },
        { x: x1, y: y0, weight: fx * (1 - fy) },
        { x: x0, y: y1, weight: (1 - fx) * fy },
        { x: x1, y: y1, weight: fx * fy },
      ];
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (const sample of samples) {
        const si = (sample.y * imageW + sample.x) * 4;
        const a = rgba[si + 3] / 255;
        const wa = sample.weight * a;
        alpha += wa;
        red += rgba[si] * wa;
        green += rgba[si + 1] * wa;
        blue += rgba[si + 2] * wa;
      }
      if (!alpha) continue;
      const di = ((offsetY + y) * WORK_TILE + offsetX + x) * 4;
      work[di] = Math.round(red / alpha);
      work[di + 1] = Math.round(green / alpha);
      work[di + 2] = Math.round(blue / alpha);
      work[di + 3] = Math.round(alpha * 255);
    }
  }
  return work;
}

function alphaRows(rgba: Uint8Array) {
  let top = TILE;
  let bottom = -1;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (rgba[(y * TILE + x) * 4 + 3] < 16) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { top, bottom };
}

function ditherBurial(rgba: Uint8Array): void {
  const { bottom } = alphaRows(rgba);
  for (let y = Math.max(0, bottom - BURIAL_BAND + 1); y <= bottom; y++) {
    const coverage = (bottom - y) / BURIAL_BAND;
    for (let x = 0; x < TILE; x++) {
      const i = (y * TILE + x) * 4;
      if (rgba[i + 3] < 16) continue;
      const threshold = (BAYER[y & 3][x & 3] + 0.5) / 16;
      if (coverage <= threshold) rgba[i + 3] = 0;
    }
  }
}

function contentBounds(rgba: Uint8Array, row: number, col: number, sheetW: number) {
  let top = TILE;
  let bottom = -1;
  let contactLeft = TILE;
  let contactRight = -1;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (rgba[((row * TILE + y) * sheetW + col * TILE + x) * 4 + 3] < 16) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  for (let y = Math.max(top, bottom - 12); y <= bottom; y++) {
    for (let x = 0; x < TILE; x++) {
      if (rgba[((row * TILE + y) * sheetW + col * TILE + x) * 4 + 3] < 16) continue;
      contactLeft = Math.min(contactLeft, x);
      contactRight = Math.max(contactRight, x);
    }
  }
  return { top, bottom, contactLeft, contactRight };
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

const sheetW = TILE * COLS;
const sheetH = TILE * ROWS;
const sheet = new Uint8Array(sheetW * sheetH * 4);
const replacementSources = new Map(
  Object.entries(REPLACEMENTS).map(([name, path]) => [name, decodePng(readFileSync(path))]),
);
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const sprite = manifest.sprites.find((entry) => entry.row === row && entry.col === col);
    if (!sprite) throw new Error(`${MANIFEST}: missing sprite at row ${row}, col ${col}`);
    const x0 = Math.round((col * source.w) / COLS);
    const x1 = Math.round(((col + 1) * source.w) / COLS);
    const y0 = Math.round((row * source.h) / ROWS);
    const y1 = Math.round(((row + 1) * source.h) / ROWS);
    let work: Uint8Array;
    const replacement = replacementSources.get(sprite.name);
    if (replacement) {
      const bb = alphaBBox(replacement.rgba, replacement.w, {
        x: 0,
        y: 0,
        w: replacement.w,
        h: replacement.h,
      });
      work = normalizeReplacement(replacement.rgba, replacement.w, bb);
    } else {
      const bb = alphaBBox(source.rgba, source.w, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      if (bb.w > WORK_TILE || bb.h > WORK_TILE)
        throw new Error(`Odyssey relic (${row},${col}) is ${bb.w}x${bb.h}, larger than ${WORK_TILE}px`);

      work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
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
    }
    const tile = downsample(work);
    ditherBurial(tile);
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
      sheet.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

const png = encodePng(sheet, sheetW, sheetH);
writeFileSync(OUTPUT, png);
const entries = manifest.sprites.map((sprite, frame) => {
  const bounds = contentBounds(sheet, sprite.row, sprite.col, sheetW);
  return `  ${sprite.name}: { frame: ${frame}, row: ${sprite.row}, col: ${sprite.col}, top: ${bounds.top}, bottom: ${bounds.bottom}, contactLeft: ${bounds.contactLeft}, contactRight: ${bounds.contactRight} },`;
}).join("\n");
const moduleSource = `// GENERATED by tools/gen-odyssey-props-atlas.ts — do not edit by hand.\n` +
  `export const ODYSSEY_PROPS_ATLAS = "data:image/png;base64,${png.toString("base64")}";\n` +
  `export const ODYSSEY_PROPS_ATLAS_CELL = ${TILE};\n` +
  `export const ODYSSEY_PROPS_ATLAS_COLS = ${COLS};\n` +
  `export const ODYSSEY_PROPS_ATLAS_ROWS = ${ROWS};\n` +
  `export const ODYSSEY_PROPS_ATLAS_LAYOUT = {\n${entries}\n} as const;\n`;
writeFileSync(MODULE, moduleSource);
console.log(`wrote ${OUTPUT} and ${MODULE}`);

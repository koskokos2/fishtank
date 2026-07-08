// Normalize the generated designer sheet into the project's 128px-cell atlas,
// dither its illustrated substrate rim into alpha, and embed it for Kaplay.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type SpriteDef = { name: string; row: number; col: number };

const SOURCE = "art/sci-fi-props-atlas-transparent.png";
const OUTPUT = "art/sci-fi-props-atlas-128.png";
const MANIFEST = "art/sci-fi-props-atlas-128.json";
const MODULE = "src/sciFiPropsAtlas.ts";
const SOURCE_SIZE = 1254;
const CUTS = [0, 314, 627, 941, 1254] as const;
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
  if (maxX < minX) throw new Error("empty sci-fi prop source region");
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

function ditherBurial(rgba: Uint8Array) {
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
      if (rgba[(((row * TILE + y) * sheetW) + col * TILE + x) * 4 + 3] < 16) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  for (let y = Math.max(top, bottom - 12); y <= bottom; y++) {
    for (let x = 0; x < TILE; x++) {
      if (rgba[(((row * TILE + y) * sheetW) + col * TILE + x) * 4 + 3] < 16) continue;
      contactLeft = Math.min(contactLeft, x);
      contactRight = Math.max(contactRight, x);
    }
  }
  return { top, bottom, contactLeft, contactRight };
}

const source = decodePng(readFileSync(SOURCE));
if (source.w !== SOURCE_SIZE || source.h !== SOURCE_SIZE)
  throw new Error(`${SOURCE}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${source.w}x${source.h}`);

const sheetW = TILE * 4;
const sheet = new Uint8Array(sheetW * TILE * 4 * 4);
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 4; col++) {
    const region: Rect = {
      x: CUTS[col],
      y: CUTS[row],
      w: CUTS[col + 1] - CUTS[col],
      h: CUTS[row + 1] - CUTS[row],
    };
    const bb = alphaBBox(source.rgba, source.w, region);
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
    ditherBurial(tile);
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
      sheet.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

const png = encodePng(sheet, sheetW, TILE * 4);
writeFileSync(OUTPUT, png);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const entries = (manifest.sprites as SpriteDef[]).map((sprite, frame) => {
  const bounds = contentBounds(sheet, sprite.row, sprite.col, sheetW);
  return `  ${sprite.name}: { frame: ${frame}, row: ${sprite.row}, col: ${sprite.col}, top: ${bounds.top}, bottom: ${bounds.bottom}, contactLeft: ${bounds.contactLeft}, contactRight: ${bounds.contactRight} },`;
}).join("\n");
const module = `// GENERATED by tools/gen-sci-fi-props-atlas.ts — do not edit by hand.\n` +
  `export const SCI_FI_PROPS_ATLAS = "data:image/png;base64,${Buffer.from(png).toString("base64")}";\n` +
  `export const SCI_FI_PROPS_ATLAS_CELL = ${TILE};\n` +
  `export const SCI_FI_PROPS_ATLAS_COLS = 4;\n` +
  `export const SCI_FI_PROPS_ATLAS_ROWS = 4;\n` +
  `export const SCI_FI_PROPS_ATLAS_LAYOUT = {\n${entries}\n} as const;\n`;
writeFileSync(MODULE, module);
console.log(`wrote ${OUTPUT} and ${MODULE}`);

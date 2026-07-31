// Normalize the approved transparent Grindelwald sheet into a 4x3 runtime
// atlas, dither its compact seabed contact band, and embed it for Kaplay.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type Sprite = { name: string; row: number; col: number };

const SOURCE = "art/grindelwald-props-atlas-transparent.png";
const OUTPUT = "art/grindelwald-props-atlas-128.png";
const MANIFEST = "art/grindelwald-props-atlas-128.json";
const MODULE = "src/grindelwaldPropsAtlas.ts";
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

// The generated source uses visual cells rather than hard clipping: the train,
// chalet, and alpenhorn extend slightly left of their nominal columns. Give
// those props their complete silhouette while excluding the same pixels from
// the compact neighbour to the left.
const FRAME_X_RANGES: Partial<Record<string, readonly [number, number]>> = {
  "0,1": [362, 690],
  "0,2": [690, 1086],
  "1,2": [724, 1020],
  "1,3": [1020, 1448],
  "2,2": [724, 1030],
  "2,3": [1030, 1448],
};

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
  if (maxX < minX)
    throw new Error(`empty Grindelwald prop region at ${region.x},${region.y}`);
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

function despillKeyRemnants(rgba: Uint8Array): void {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    const maxRB = Math.max(rgba[i], rgba[i + 2]);
    // The matte is near-pure green, including its dark antialiased edge. Keep
    // natural foliage (which carries yellow/red) and neutralize only pixels
    // whose green channel overwhelmingly dominates both other channels.
    if (maxRB < 28 && rgba[i + 1] > 30 && rgba[i + 1] > maxRB * 2) {
      rgba[i + 1] = maxRB;
    }
  }
}

function normalizeFrameColors(rgba: Uint8Array, row: number, col: number): void {
  if (row !== 0 || col !== 1) return;
  // The closed Wetterhorn cabin windows inherited the source matte as an
  // enclosed green fill. Preserve their existing shading while moving only
  // that green-dominant fill into the set's cool, dark glass palette.
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    const green = rgba[i + 1];
    if (green < 45 || green < rgba[i] * 1.45 || green < rgba[i + 2] * 1.45) continue;
    rgba[i] = Math.round(green * 0.12);
    rgba[i + 1] = Math.round(green * 0.28);
    rgba[i + 2] = Math.round(green * 0.38);
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
  if (top > bottom || contactLeft > contactRight)
    throw new Error(`empty normalized Grindelwald prop at row ${row}, col ${col}`);
  return { top, bottom, contactLeft, contactRight };
}

function countKeyLeaks(rgba: Uint8Array): number {
  let leaks = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (
      rgba[i + 3] >= 16 &&
      rgba[i] < 45 &&
      rgba[i + 1] > 225 &&
      rgba[i + 2] < 45
    ) leaks++;
  }
  return leaks;
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
if (manifest.sprites.length !== COLS * ROWS)
  throw new Error(`${MANIFEST}: expected ${COLS * ROWS} sprites, got ${manifest.sprites.length}`);

const sheetW = TILE * COLS;
const sheetH = TILE * ROWS;
const sheet = new Uint8Array(sheetW * sheetH * 4);
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const nominalX0 = Math.round((col * source.w) / COLS);
    const nominalX1 = Math.round(((col + 1) * source.w) / COLS);
    const [x0, x1] = FRAME_X_RANGES[`${row},${col}`] ?? [nominalX0, nominalX1];
    const y0 = Math.round((row * source.h) / ROWS);
    const y1 = Math.round(((row + 1) * source.h) / ROWS);
    const bb = alphaBBox(source.rgba, source.w, {
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
    });
    if (bb.w > WORK_TILE || bb.h > WORK_TILE)
      throw new Error(
        `Grindelwald prop (${row},${col}) is ${bb.w}x${bb.h}, larger than ${WORK_TILE}px`,
      );

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
    despillKeyRemnants(tile);
    normalizeFrameColors(tile, row, col);
    ditherBurial(tile);
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
      sheet.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

const keyLeaks = countKeyLeaks(sheet);
if (keyLeaks) throw new Error(`${OUTPUT}: found ${keyLeaks} opaque chroma-key pixels`);

const png = encodePng(sheet, sheetW, sheetH);
writeFileSync(OUTPUT, png);
const entries = manifest.sprites
  .map((sprite, frame) => {
    const bounds = contentBounds(sheet, sprite.row, sprite.col, sheetW);
    return `  ${sprite.name}: { frame: ${frame}, row: ${sprite.row}, col: ${sprite.col}, top: ${bounds.top}, bottom: ${bounds.bottom}, contactLeft: ${bounds.contactLeft}, contactRight: ${bounds.contactRight} },`;
  })
  .join("\n");
const moduleSource =
  `// GENERATED by tools/gen-grindelwald-props-atlas.ts — do not edit by hand.\n` +
  `export const GRINDELWALD_PROPS_ATLAS = "data:image/png;base64,${png.toString("base64")}";\n` +
  `export const GRINDELWALD_PROPS_ATLAS_CELL = ${TILE};\n` +
  `export const GRINDELWALD_PROPS_ATLAS_COLS = ${COLS};\n` +
  `export const GRINDELWALD_PROPS_ATLAS_ROWS = ${ROWS};\n` +
  `export const GRINDELWALD_PROPS_ATLAS_LAYOUT = {\n${entries}\n} as const;\n`;
writeFileSync(MODULE, moduleSource);
console.log(`wrote ${OUTPUT} and ${MODULE}`);

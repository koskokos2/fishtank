// Normalize the generated tribute prop concept sheet into the project's 128px
// prop-atlas format, chroma-key the flat background, dither the sand-touching
// lower edge into alpha, and embed the result for Kaplay.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type SpriteDef = { name: string; row: number; col: number };

const SOURCE = "art/pop-culture-props-atlas-chroma.png";
const TRANSPARENT_SOURCE = "art/pop-culture-props-atlas-transparent.png";
const OUTPUT = "art/pop-culture-props-atlas-128.png";
const MANIFEST = "art/pop-culture-props-atlas-128.json";
const MODULE = "src/popCulturePropsAtlas.ts";
const COLS = 4;
const ROWS = 3;
const TILE = 128;
const WORK_TILE = 384;
const BURIAL_BAND = 18;
const KEY_TOLERANCE = 38;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

function isChroma(r: number, g: number, b: number) {
  const distance = Math.abs(r - 255) + Math.abs(g) + Math.abs(b - 255);
  return (
    distance < KEY_TOLERANCE ||
    (r > 238 && b > 238 && g < 44) ||
    (r > 180 && b > 180 && g < 108 && Math.abs(r - b) < 76)
  );
}

function chromaKey(rgba: Uint8Array) {
  const out = new Uint8Array(rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (!isChroma(out[i], out[i + 1], out[i + 2])) continue;
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = 0;
  }
  return out;
}

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
  if (maxX < minX) throw new Error("empty pop-culture prop source region");
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

function purgeChromaCrumbs(rgba: Uint8Array) {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16 || !isChroma(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
    rgba[i] = 0;
    rgba[i + 1] = 0;
    rgba[i + 2] = 0;
    rgba[i + 3] = 0;
  }
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
if (source.w % COLS !== 0 || source.h % ROWS !== 0)
  throw new Error(`${SOURCE}: expected dimensions divisible by ${COLS}x${ROWS}, got ${source.w}x${source.h}`);

const transparent = chromaKey(source.rgba);
writeFileSync(TRANSPARENT_SOURCE, encodePng(transparent, source.w, source.h));

const sourceTileW = source.w / COLS;
const sourceTileH = source.h / ROWS;
const sheetW = TILE * COLS;
const sheet = new Uint8Array(sheetW * TILE * ROWS * 4);
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const region: Rect = {
      x: col * sourceTileW,
      y: row * sourceTileH,
      w: sourceTileW,
      h: sourceTileH,
    };
    const bb = alphaBBox(transparent, source.w, region);
    const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
    const offX = Math.round((WORK_TILE - bb.w) / 2) - bb.x;
    const offY = Math.round((WORK_TILE - bb.h) / 2) - bb.y;
    for (let y = bb.y; y < bb.y + bb.h; y++) {
      for (let x = bb.x; x < bb.x + bb.w; x++) {
        const si = (y * source.w + x) * 4;
        if (transparent[si + 3] < 16) continue;
        const wi = ((y + offY) * WORK_TILE + x + offX) * 4;
        work.set(transparent.subarray(si, si + 4), wi);
      }
    }
    const tile = downsample(work);
    purgeChromaCrumbs(tile);
    removeTinyIslands(tile);
    ditherBurial(tile);
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
      sheet.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

const png = encodePng(sheet, sheetW, TILE * ROWS);
writeFileSync(OUTPUT, png);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const entries = (manifest.sprites as SpriteDef[]).map((sprite, frame) => {
  const bounds = contentBounds(sheet, sprite.row, sprite.col, sheetW);
  return `  ${sprite.name}: { frame: ${frame}, row: ${sprite.row}, col: ${sprite.col}, top: ${bounds.top}, bottom: ${bounds.bottom}, contactLeft: ${bounds.contactLeft}, contactRight: ${bounds.contactRight} },`;
}).join("\n");
const module = `// GENERATED by tools/gen-pop-culture-props-atlas.ts — do not edit by hand.\n` +
  `export const POP_CULTURE_PROPS_ATLAS = "data:image/png;base64,${Buffer.from(png).toString("base64")}";\n` +
  `export const POP_CULTURE_PROPS_ATLAS_CELL = ${TILE};\n` +
  `export const POP_CULTURE_PROPS_ATLAS_COLS = ${COLS};\n` +
  `export const POP_CULTURE_PROPS_ATLAS_ROWS = ${ROWS};\n` +
  `export const POP_CULTURE_PROPS_ATLAS_LAYOUT = {\n${entries}\n} as const;\n`;
writeFileSync(MODULE, module);
console.log(`wrote ${OUTPUT}, ${TRANSPARENT_SOURCE}, and ${MODULE}`);

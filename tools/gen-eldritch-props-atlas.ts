// Normalize the generated designer sheet into the project's 128px-cell atlas,
// dither its illustrated substrate rim into alpha, and embed it for Kaplay.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type SpriteDef = { name: string; row: number; col: number };

const SOURCE = "art/eldritch-props-atlas-transparent.png";
const REPLACEMENTS = "art/eldritch-props-replacements-v2-transparent.png";
const TOME_V3 = "art/eldritch-tome-v3-transparent.png";
const CHAOS_POLYP_V3 = "art/eldritch-shoggoth-v3-transparent.png";
const OUTPUT = "art/eldritch-props-atlas-128.png";
const MANIFEST = "art/eldritch-props-atlas-128.json";
const MODULE = "src/eldritchPropsAtlas.ts";
const SOURCE_SIZE = 1254;
const TILE = 128;
const WORK_TILE = 384;
const REPLACEMENT_WORK_TILE = 512;
const BURIAL_BAND = 18;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

// The generated subjects occasionally lean a few pixels over the nominal grid
// line. Discover the sixteen large connected silhouettes first, then order them
// by visual row and column. This preserves tall tips without stealing debris
// from a neighbour's cell.
function spriteBounds(
  rgba: Uint8Array,
  imageW: number,
  imageH: number,
  expected: number,
  columns: number,
  sourceName: string,
): Rect[] {
  const seen = new Uint8Array(imageW * imageH);
  const queue = new Int32Array(imageW * imageH);
  const found: Array<Rect & { pixels: number; centerX: number; centerY: number }> = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || rgba[start * 4 + 3] < 16) continue;
    let head = 0;
    let tail = 0;
    let minX = imageW;
    let minY = imageH;
    let maxX = -1;
    let maxY = -1;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const point = queue[head++];
      const x = point % imageW;
      const y = Math.floor(point / imageW);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbours = [point - 1, point + 1, point - imageW, point + imageW];
      for (const next of neighbours) {
        if (next < 0 || next >= seen.length || seen[next] || rgba[next * 4 + 3] < 16) continue;
        const nx = next % imageW;
        if (Math.abs(nx - x) > 1) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    if (tail < 2000) continue;
    found.push({
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      pixels: tail,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    });
  }
  if (found.length !== expected)
    throw new Error(`${sourceName}: expected ${expected} connected props, found ${found.length}`);
  found.sort((a, b) => a.centerY - b.centerY);
  const ordered: Rect[] = [];
  const rows = expected / columns;
  for (let row = 0; row < rows; row++) {
    const rowItems = found
      .slice(row * columns, row * columns + columns)
      .sort((a, b) => a.centerX - b.centerX);
    ordered.push(...rowItems.map(({ x, y, w, h }) => ({ x, y, w, h })));
  }
  return ordered;
}

function normalizeTile(
  source: ReturnType<typeof decodePng>,
  bb: Rect,
  workSize = WORK_TILE,
): Uint8Array {
  const work = new Uint8Array(workSize * workSize * 4);
  const offX = Math.round((workSize - bb.w) / 2) - bb.x;
  const offY = Math.round((workSize - bb.h) / 2) - bb.y;
  for (let y = bb.y; y < bb.y + bb.h; y++) {
    for (let x = bb.x; x < bb.x + bb.w; x++) {
      const si = (y * source.w + x) * 4;
      if (source.rgba[si + 3] < 16) continue;
      const wi = ((y + offY) * workSize + x + offX) * 4;
      work.set(source.rgba.subarray(si, si + 4), wi);
    }
  }
  const tile = downsample(work, workSize);
  ditherBurial(tile);
  return tile;
}

function putTile(sheet: Uint8Array, sheetW: number, tile: Uint8Array, frame: number) {
  const row = Math.floor(frame / 4);
  const col = frame % 4;
  for (let y = 0; y < TILE; y++) {
    const from = y * TILE * 4;
    const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
    sheet.set(tile.subarray(from, from + TILE * 4), to);
  }
}

function normalizeSingle(path: string): Uint8Array {
  const source = decodePng(readFileSync(path));
  assertTransparentSource(source.rgba, path);
  const [bounds] = spriteBounds(source.rgba, source.w, source.h, 1, 1, path);
  // Single-sprite generations use most of their canvas. Fit them into a padded
  // power-of-128 work area so their final scale matches the original atlas.
  const workSize = Math.ceil((Math.max(bounds.w, bounds.h) * 1.08) / TILE) * TILE;
  return normalizeTile(source, bounds, workSize);
}

function downsample(work: Uint8Array, workSize: number): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4);
  const scale = workSize / TILE;
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      let weight = 0;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = dy * scale; sy < (dy + 1) * scale; sy++) {
        for (let sx = dx * scale; sx < (dx + 1) * scale; sx++) {
          const si = (sy * workSize + sx) * 4;
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

function assertTransparentSource(rgba: Uint8Array, sourceName: string) {
  let transparentPixels = 0;
  let visibleKeyPixels = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) transparentPixels++;
    else if (rgba[i] === 255 && rgba[i + 1] === 0 && rgba[i + 2] === 255) visibleKeyPixels++;
  }
  if (transparentPixels < (rgba.length / 4) * 0.25)
    throw new Error(`${sourceName}: expected a real transparent source; did you pass a chroma PNG?`);
  if (visibleKeyPixels)
    throw new Error(`${sourceName}: contains ${visibleKeyPixels} visible exact chroma-key pixels`);
}

function assertNoRuntimeKeyPixels(rgba: Uint8Array) {
  let exact = 0;
  let near = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a < 16) continue;
    if (r === 255 && g === 0 && b === 255) exact++;
    else if (r > 220 && g < 90 && b > 220) near++;
  }
  if (exact || near)
    throw new Error(`chroma key leak in eldritch runtime atlas: ${exact} exact, ${near} near-key visible pixels`);
}

const source = decodePng(readFileSync(SOURCE));
if (source.w !== SOURCE_SIZE || source.h !== SOURCE_SIZE)
  throw new Error(`${SOURCE}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${source.w}x${source.h}`);
assertTransparentSource(source.rgba, SOURCE);

const sheetW = TILE * 4;
const sheet = new Uint8Array(sheetW * TILE * 4 * 4);
const bounds = spriteBounds(source.rgba, source.w, source.h, 16, 4, SOURCE);
for (let frame = 0; frame < 16; frame++)
  putTile(sheet, sheetW, normalizeTile(source, bounds[frame]), frame);

const replacements = decodePng(readFileSync(REPLACEMENTS));
if (replacements.w !== SOURCE_SIZE || replacements.h !== SOURCE_SIZE)
  throw new Error(
    `${REPLACEMENTS}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${replacements.w}x${replacements.h}`,
  );
assertTransparentSource(replacements.rgba, REPLACEMENTS);
const replacementBounds = spriteBounds(
  replacements.rgba,
  replacements.w,
  replacements.h,
  9,
  3,
  REPLACEMENTS,
);
const replacementFrames = [0, 2, 4, 6, 8, 9, 11, 14, 15] as const;
replacementFrames.forEach((frame, index) =>
  putTile(
    sheet,
    sheetW,
    normalizeTile(replacements, replacementBounds[index], REPLACEMENT_WORK_TILE),
    frame,
  ),
);

// Two focused, higher-resolution replacements land last so every other cell—
// including the seven user-approved originals—remains byte-for-byte stable.
putTile(sheet, sheetW, normalizeSingle(TOME_V3), 5);
putTile(sheet, sheetW, normalizeSingle(CHAOS_POLYP_V3), 8);
assertNoRuntimeKeyPixels(sheet);

const png = encodePng(sheet, sheetW, TILE * 4);
writeFileSync(OUTPUT, png);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const entries = (manifest.sprites as SpriteDef[]).map((sprite, frame) => {
  const bounds = contentBounds(sheet, sprite.row, sprite.col, sheetW);
  return `  ${sprite.name}: { frame: ${frame}, row: ${sprite.row}, col: ${sprite.col}, top: ${bounds.top}, bottom: ${bounds.bottom}, contactLeft: ${bounds.contactLeft}, contactRight: ${bounds.contactRight} },`;
}).join("\n");
const module = `// GENERATED by tools/gen-eldritch-props-atlas.ts — do not edit by hand.\n` +
  `export const ELDRITCH_PROPS_ATLAS = "data:image/png;base64,${Buffer.from(png).toString("base64")}";\n` +
  `export const ELDRITCH_PROPS_ATLAS_CELL = ${TILE};\n` +
  `export const ELDRITCH_PROPS_ATLAS_COLS = 4;\n` +
  `export const ELDRITCH_PROPS_ATLAS_ROWS = 4;\n` +
  `export const ELDRITCH_PROPS_ATLAS_LAYOUT = {\n${entries}\n} as const;\n`;
writeFileSync(MODULE, module);
console.log(`wrote ${OUTPUT} and ${MODULE}`);

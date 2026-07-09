// Normalize the generated designer sheet into the project's 128px-cell atlas,
// dither its illustrated substrate rim into alpha, and embed it for Kaplay.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type SpriteDef = { name: string; row: number; col: number };

const SOURCE = "art/sci-fi-props-atlas-transparent.png";
const CHROMA_SOURCE = "art/sci-fi-props-atlas-chroma.png";
const OUTPUT = "art/sci-fi-props-atlas-128.png";
const MANIFEST = "art/sci-fi-props-atlas-128.json";
const MODULE = "src/sciFiPropsAtlas.ts";
const SOURCE_SIZE = 1254;
const CUTS = [0, 314, 627, 941, 1254] as const;
const TILE = 128;
const WORK_TILE = 384;
const BURIAL_BAND = 18;
const SPHERICAL_SENSOR_FRAME = 6;
const BROKEN_MAINTENANCE_DRONE_FRAME = 7;
const FOLDED_ALIEN_RELIC_FRAME = 9;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

function frameRegion(frame: number): Rect {
  const row = Math.floor(frame / 4);
  const col = frame % 4;
  const y = CUTS[row];
  const h = CUTS[row + 1] - CUTS[row];

  // The generated source sheet has two frame-boundary defects:
  // - broken_maintenance_drone's manipulator reaches left into the previous
  //   grid cell, so its default cell clips the hand;
  // - the same hand is visible inside spherical_sensor's cell, so the sensor
  //   bbox gets polluted by a neighboring sprite.
  //
  // Treat these as source extraction/packing issues, not art redesign issues:
  // expand the drone's source region enough to include the full connected prop,
  // and guard the sensor's right edge before bbox detection.
  if (frame === SPHERICAL_SENSOR_FRAME) return { x: CUTS[col], y, w: 292, h };
  if (frame === BROKEN_MAINTENANCE_DRONE_FRAME) return { x: 890, y, w: SOURCE_SIZE - 890, h };

  return {
    x: CUTS[col],
    y,
    w: CUTS[col + 1] - CUTS[col],
    h,
  };
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

function normalizeSourceRegion(source: ReturnType<typeof decodePng>, bb: Rect, offsetX = 0, offsetY = 0) {
  const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
  const offX = Math.round((WORK_TILE - bb.w) / 2) - bb.x + offsetX;
  const offY = Math.round((WORK_TILE - bb.h) / 2) - bb.y + offsetY;
  for (let y = bb.y; y < bb.y + bb.h; y++) {
    for (let x = bb.x; x < bb.x + bb.w; x++) {
      const si = (y * source.w + x) * 4;
      if (source.rgba[si + 3] < 16) continue;
      const wx = x + offX;
      const wy = y + offY;
      if (wx < 0 || wx >= WORK_TILE || wy < 0 || wy >= WORK_TILE) continue;
      const wi = (wy * WORK_TILE + wx) * 4;
      work.set(source.rgba.subarray(si, si + 4), wi);
    }
  }
  const tile = downsample(work);
  ditherBurial(tile);
  return tile;
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

function isStrictMagentaKey(r: number, g: number, b: number) {
  return (
    (r > 235 && g < 72 && b > 220 && Math.abs(r - b) < 72) ||
    (r > 170 && b > 170 && g < 145 && Math.min(r, b) - g > 42 && Math.abs(r - b) < 128)
  );
}

function removeConnectedChromaInRegion(source: ReturnType<typeof decodePng>, region: Rect) {
  const rgba = new Uint8Array(source.rgba);
  const seen = new Uint8Array(region.w * region.h);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    const local = (y - region.y) * region.w + (x - region.x);
    if (seen[local]) return;
    const i = (y * source.w + x) * 4;
    if (!isStrictMagentaKey(rgba[i], rgba[i + 1], rgba[i + 2])) return;
    seen[local] = 1;
    queue.push(local);
  };

  for (let x = region.x; x < region.x + region.w; x++) {
    push(x, region.y);
    push(x, region.y + region.h - 1);
  }
  for (let y = region.y; y < region.y + region.h; y++) {
    push(region.x, y);
    push(region.x + region.w - 1, y);
  }

  while (queue.length) {
    const local = queue.pop()!;
    const x = region.x + (local % region.w);
    const y = region.y + Math.floor(local / region.w);
    rgba.fill(0, (y * source.w + x) * 4, (y * source.w + x) * 4 + 4);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (nx < region.x || nx >= region.x + region.w || ny < region.y || ny >= region.y + region.h) continue;
        push(nx, ny);
      }
    }
  }

  return { ...source, rgba };
}

function hasTransparentNeighbor(rgba: Uint8Array, imageW: number, x: number, y: number, radius: number) {
  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || nx >= imageW || ny < 0) continue;
      if (rgba[(ny * imageW + nx) * 4 + 3] < 16) return true;
    }
  }
  return false;
}

function removeChromaHaloInRegion(rgba: Uint8Array, region: Rect, imageW: number) {
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const i = (y * imageW + x) * 4;
      if (rgba[i + 3] < 16 || !isStrictMagentaKey(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
      if (!hasTransparentNeighbor(rgba, imageW, x, y, 2)) continue;
      rgba.fill(0, i, i + 4);
    }
  }
}

function isRelicPurpleAccent(r: number, g: number, b: number, a: number) {
  if (a < 16) return false;
  return r > 72 && b > 92 && b > g + 24 && r > g + 16 && Math.abs(r - b) < 155;
}

function recolorRelicPurpleToGreen(rgba: Uint8Array, region: Rect, imageW: number) {
  for (let y = region.y; y < region.y + region.h; y++) {
    if (y > region.y + region.h - 48) continue;
    for (let x = region.x; x < region.x + region.w; x++) {
      const i = (y * imageW + x) * 4;
      if (!isRelicPurpleAccent(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) continue;
      const luminance = rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722;
      const glow = Math.max(rgba[i], rgba[i + 2]) - rgba[i + 1];
      rgba[i] = Math.max(22, Math.min(120, Math.round(luminance * 0.42 + glow * 0.12)));
      rgba[i + 1] = Math.min(255, Math.round(luminance * 1.2 + glow * 0.95 + 38));
      rgba[i + 2] = Math.min(190, Math.round(luminance * 0.72 + glow * 0.24 + 20));
    }
  }
}

function buildFoldedAlienRelicTile(chromaSource: ReturnType<typeof decodePng>) {
  const region = frameRegion(FOLDED_ALIEN_RELIC_FRAME);
  const transparent = removeConnectedChromaInRegion(chromaSource, region);
  removeChromaHaloInRegion(transparent.rgba, region, transparent.w);
  recolorRelicPurpleToGreen(transparent.rgba, region, transparent.w);
  const bb = alphaBBox(transparent.rgba, transparent.w, region);
  const tile = normalizeSourceRegion(transparent, bb);
  softenFoldedRelicGreenContact(tile);
  return tile;
}

function isGeneratedGreenGlow(r: number, g: number, b: number, a: number) {
  return a >= 16 && g > 112 && g > r * 1.35 && g > b * 1.08;
}

function softenFoldedRelicGreenContact(rgba: Uint8Array) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = (y * TILE + x) * 4;
      if (!isGeneratedGreenGlow(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) continue;

      // Matte remnants at the far right are background, not part of the relic.
      if (x > 108) {
        rgba.fill(0, i, i + 4);
        continue;
      }

      // Keep the relic glow, but do not let it turn the sand/contact shadow
      // into a chroma-looking green carpet.
      if (y > 82) {
        const luminance = rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722;
        rgba[i] = Math.min(215, Math.round(luminance * 1.18 + 28));
        rgba[i + 1] = Math.min(150, Math.round(luminance * 0.62 + 24));
        rgba[i + 2] = Math.min(92, Math.round(luminance * 0.34 + 12));
      }
    }
  }

  // Remove any tiny extraction flecks below the grounded prop. This is specific
  // to the folded relic's chroma-source recovery; other tiles keep their normal
  // dithered contact rims.
  for (let y = 104; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      rgba.fill(0, (y * TILE + x) * 4, (y * TILE + x) * 4 + 4);
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

function frameBounds(rgba: Uint8Array, sheetW: number, frame: number) {
  const row = Math.floor(frame / 4);
  const col = frame % 4;
  let minX = TILE;
  let minY = TILE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = ((row * TILE + y) * sheetW + col * TILE + x) * 4;
      if (rgba[i + 3] < 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error(`empty sci-fi prop frame ${frame}`);
  return { minX, minY, maxX, maxY };
}

function assertNoRuntimeKeyPixels(rgba: Uint8Array) {
  let exact = 0;
  let near = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    if (rgba[i] === 255 && rgba[i + 1] === 0 && rgba[i + 2] === 255) exact++;
    else if (rgba[i] > 220 && rgba[i + 1] < 90 && rgba[i + 2] > 220) near++;
  }
  if (exact || near)
    throw new Error(`sci-fi runtime atlas contains ${exact} exact and ${near} near magenta-key pixels`);
}

function assertSciFiRepairBounds(rgba: Uint8Array, sheetW: number) {
  const sensor = frameBounds(rgba, sheetW, SPHERICAL_SENSOR_FRAME);
  if (sensor.maxX > 108)
    throw new Error(`spherical_sensor still reaches suspiciously far right (${sensor.maxX}); likely drone contamination`);

  const drone = frameBounds(rgba, sheetW, BROKEN_MAINTENANCE_DRONE_FRAME);
  if (drone.minX < 4 || drone.maxX > TILE - 5)
    throw new Error(`broken_maintenance_drone does not fit with side margin (${drone.minX}..${drone.maxX})`);

  const relic = frameBounds(rgba, sheetW, FOLDED_ALIEN_RELIC_FRAME);
  if (relic.maxY > 104)
    throw new Error(`folded_alien_relic has detached matte/flecks below contact patch (${relic.maxY})`);
}

const source = decodePng(readFileSync(SOURCE));
if (source.w !== SOURCE_SIZE || source.h !== SOURCE_SIZE)
  throw new Error(`${SOURCE}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${source.w}x${source.h}`);
const chromaSource = decodePng(readFileSync(CHROMA_SOURCE));
if (chromaSource.w !== SOURCE_SIZE || chromaSource.h !== SOURCE_SIZE)
  throw new Error(`${CHROMA_SOURCE}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${chromaSource.w}x${chromaSource.h}`);

const sheetW = TILE * 4;
const sheet = new Uint8Array(sheetW * TILE * 4 * 4);
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 4; col++) {
    const frame = row * 4 + col;
    const tile = frame === FOLDED_ALIEN_RELIC_FRAME
      ? buildFoldedAlienRelicTile(chromaSource)
      : normalizeSourceRegion(source, alphaBBox(source.rgba, source.w, frameRegion(frame)));
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
      sheet.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

assertNoRuntimeKeyPixels(sheet);
assertSciFiRepairBounds(sheet, sheetW);

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

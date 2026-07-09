// Clean the curated high-detail pop-culture tribute source into the project's
// 128px prop-atlas format and embed the result for Kaplay.
//
// Important workflow boundary:
// - Use scripted repair for measurable pixel artifacts: chroma halos, detached
//   specks, forbidden purple/magenta matte casts, or source pixels deleted by
//   cleanup. The cube-heart and portal-cable exceptions below are intentionally
//   narrow and validated.
// - Do not use scripted repair for visual anatomy/attachment problems. If a
//   part needs to feel physically integrated, regenerate the affected tile as a
//   whole object and consume that source here. The robot head follows this rule:
//   its antenna is part of a replacement tile, not a pasted-on cap.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

type Rect = { x: number; y: number; w: number; h: number };
type SpriteDef = { name: string; row: number; col: number };

const SOURCE = "art/pop-culture-props-restored-128.png";
// Full-tile replacement source. Keep this separate from the 128px runtime atlas
// so future runs can reproduce the coherent robot/antenna drawing.
const ROBOT_REPLACEMENT_SOURCE = "art/pop-culture-robot-head-regenerated.png";
const OUTPUT = "art/pop-culture-props-atlas-128.png";
const MANIFEST = "art/pop-culture-props-atlas-128.json";
const MODULE = "src/popCulturePropsAtlas.ts";
const COLS = 4;
const ROWS = 3;
const TILE = 128;
const WORK_TILE = 384;
const BURIAL_BAND = 18;
const KEY_TOLERANCE = 38;
const RETRO_ROBOT_FRAME = 6;
const COMPANION_CUBE_FRAME = 9;
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

function assertTransparentSource(rgba: Uint8Array, sourceName: string) {
  let transparentPixels = 0;
  let visibleKeyPixels = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    if (alpha < 16) transparentPixels++;
    else if (rgba[i] === 255 && rgba[i + 1] === 0 && rgba[i + 2] === 255) visibleKeyPixels++;
  }
  if (transparentPixels < (rgba.length / 4) * 0.25)
    throw new Error(`${sourceName}: expected a real transparent source; did you pass the chroma PNG?`);
  if (visibleKeyPixels)
    throw new Error(`${sourceName}: contains ${visibleKeyPixels} visible exact chroma-key pixels`);
}

function downsample(work: Uint8Array, workSize = WORK_TILE): Uint8Array {
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

function removeFloatingSpecks(rgba: Uint8Array, maxPixels = 72) {
  const { bottom } = alphaRows(rgba);
  const seen = new Uint8Array(TILE * TILE);
  for (let start = 0; start < TILE * TILE; start++) {
    if (seen[start] || rgba[start * 4 + 3] < 16) continue;
    const stack = [start];
    const component: number[] = [];
    let maxY = -1;
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      component.push(index);
      const x = index % TILE;
      const y = Math.floor(index / TILE);
      maxY = Math.max(maxY, y);
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
    if (component.length > maxPixels || maxY >= bottom - 10) continue;
    for (const index of component) rgba.fill(0, index * 4, index * 4 + 4);
  }
}

function isBubbleFleckColor(r: number, g: number, b: number) {
  return b >= 118 && b > r + 34 && b >= g + 4 && g >= 42;
}

function removeBubbleFlecks(rgba: Uint8Array, maxPixels = 42) {
  const { bottom } = alphaRows(rgba);
  const seen = new Uint8Array(TILE * TILE);
  for (let start = 0; start < TILE * TILE; start++) {
    if (seen[start]) continue;
    const startIndex = start * 4;
    if (rgba[startIndex + 3] < 16 || !isBubbleFleckColor(rgba[startIndex], rgba[startIndex + 1], rgba[startIndex + 2])) {
      seen[start] = 1;
      continue;
    }
    const stack = [start];
    const component: number[] = [];
    let maxY = -1;
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      component.push(index);
      const x = index % TILE;
      const y = Math.floor(index / TILE);
      maxY = Math.max(maxY, y);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if ((!ox && !oy) || x + ox < 0 || x + ox >= TILE || y + oy < 0 || y + oy >= TILE) continue;
          const next = (y + oy) * TILE + x + ox;
          const ni = next * 4;
          if (seen[next] || rgba[ni + 3] < 16 || !isBubbleFleckColor(rgba[ni], rgba[ni + 1], rgba[ni + 2])) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (component.length > maxPixels || maxY >= bottom - 10) continue;
    for (const index of component) rgba.fill(0, index * 4, index * 4 + 4);
  }
}

function clearTileBorderArtifacts(rgba: Uint8Array) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (x >= 2 && x < TILE - 2 && y >= 2 && y < TILE - 2) continue;
      rgba.fill(0, (y * TILE + x) * 4, (y * TILE + x) * 4 + 4);
    }
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

function isChromaHalo(r: number, g: number, b: number) {
  return r > 120 && b > 120 && g < 135 && Math.abs(r - b) < 96 && Math.min(r, b) - g > 36;
}

function hasTransparentNeighbor(rgba: Uint8Array, x: number, y: number, radius: number) {
  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      if ((!ox && !oy) || x + ox < 0 || x + ox >= TILE || y + oy < 0 || y + oy >= TILE) continue;
      if (rgba[((y + oy) * TILE + x + ox) * 4 + 3] < 16) return true;
    }
  }
  return false;
}

// Some edge pixels are anti-aliased or model-painted into "almost key" colours;
// exact key removal misses those, but a global purple purge would eat intentional
// coral/heart details. Only remove magenta-hued pixels that sit on the
// transparent silhouette edge.
function removeChromaHalo(rgba: Uint8Array) {
  const out = new Uint8Array(rgba);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = (y * TILE + x) * 4;
      const alpha = rgba[i + 3];
      if (alpha < 16 || alpha >= 246) continue;
      if (!isChromaHalo(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
      if (!hasTransparentNeighbor(rgba, x, y, 2)) continue;
      out.fill(0, i, i + 4);
    }
  }
  rgba.set(out);
}

function isGeneratedPurple(r: number, g: number, b: number) {
  return r > 70 && b > 70 && g < 125 && Math.min(r, b) - g > 18 && Math.abs(r - b) < 135;
}

function isDarkVioletCast(r: number, g: number, b: number) {
  return b > g + 10 && r > g + 6 && Math.abs(r - b) < 92 && r < 156 && b < 176;
}

function isSoftVioletCast(r: number, g: number, b: number) {
  return b > 150 && r > 116 && b > g + 34 && r > g + 18;
}

function isAllowedCubeHeartRegion(x: number, y: number) {
  return (
    (x >= 45 && x <= 63 && y >= 52 && y <= 79) ||
    (x >= 84 && x <= 100 && y >= 57 && y <= 78) ||
    (x >= 57 && x <= 87 && y >= 29 && y <= 45)
  );
}

function isAllowedCubeHeart(frame: number, x: number, y: number, r: number, g: number, b: number) {
  if (frame !== COMPANION_CUBE_FRAME || !isAllowedCubeHeartRegion(x, y)) return false;
  return r >= 92 && b >= 72 && r > g + 18 && b > g + 8;
}

function isPortalCableRegion(frame: number, x: number, y: number) {
  return frame === 11 && x >= 73 && x <= 121 && y >= 66 && y <= 106;
}

function neutralizePortalCablePixel(rgba: Uint8Array, i: number) {
  const luminance = rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722;
  rgba[i] = Math.min(255, Math.round(luminance * 0.58 + 14));
  rgba[i + 1] = Math.min(255, Math.round(luminance * 0.72 + 18));
  rgba[i + 2] = Math.min(255, Math.round(luminance * 0.98 + 28));
  rgba[i + 3] = Math.max(rgba[i + 3], 210);
}

function isPortalCablePixelCandidate(r: number, g: number, b: number, a: number) {
  if (a < 16) return false;
  return isGeneratedPurple(r, g, b) || isDarkVioletCast(r, g, b) || (b > 84 && b >= g - 8 && b > r + 8);
}

function recoverPortalCablePixels(rgba: Uint8Array, original: Uint8Array, frame: number) {
  if (frame !== 11) return;
  for (let y = 66; y <= 106; y++) {
    for (let x = 73; x <= 121; x++) {
      const i = (y * TILE + x) * 4;
      if (!isPortalCablePixelCandidate(original[i], original[i + 1], original[i + 2], original[i + 3])) continue;
      if (rgba[i + 3] < 16) rgba.set(original.subarray(i, i + 4), i);
      neutralizePortalCablePixel(rgba, i);
    }
  }
}

function neutralizePurpleMatte(rgba: Uint8Array, frame: number) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = (y * TILE + x) * 4;
      const alpha = rgba[i + 3];
      if (alpha < 16) continue;
      const generatedPurple = isGeneratedPurple(rgba[i], rgba[i + 1], rgba[i + 2]);
      const violetCast = isDarkVioletCast(rgba[i], rgba[i + 1], rgba[i + 2]);
      const softVioletCast = isSoftVioletCast(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (!generatedPurple && !violetCast && !softVioletCast) continue;
      if (isAllowedCubeHeart(frame, x, y, rgba[i], rgba[i + 1], rgba[i + 2])) continue;
      if (isPortalCableRegion(frame, x, y)) {
        neutralizePortalCablePixel(rgba, i);
        continue;
      }

      if ((generatedPurple || softVioletCast) && (alpha < 250 || hasTransparentNeighbor(rgba, x, y, 2))) {
        rgba.fill(0, i, i + 4);
        continue;
      }

      // If the generated model painted a purple shadow into an opaque object
      // detail, keep the form but remove the hue bias.
      const luminance = rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722;
      rgba[i] = Math.round(luminance * 0.78);
      rgba[i + 1] = Math.round(luminance * 0.84);
      rgba[i + 2] = Math.round(luminance * 0.92);
    }
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

function normalizeTile(source: ReturnType<typeof decodePng>, bb: Rect, workSize = WORK_TILE): Uint8Array {
  const work = new Uint8Array(workSize * workSize * 4);
  const offX = Math.round((workSize - bb.w) / 2) - bb.x;
  const offY = Math.round((workSize - bb.h) / 2) - bb.y;
  for (let y = bb.y; y < bb.y + bb.h; y++) {
    for (let x = bb.x; x < bb.x + bb.w; x++) {
      const si = (y * source.w + x) * 4;
      if (source.rgba[si + 3] < 16) continue;
      const wx = x + offX;
      const wy = y + offY;
      if (wx < 0 || wx >= workSize || wy < 0 || wy >= workSize) continue;
      const wi = (wy * workSize + wx) * 4;
      work.set(source.rgba.subarray(si, si + 4), wi);
    }
  }
  const tile = downsample(work, workSize);
  purgeChromaCrumbs(tile);
  removeChromaHalo(tile);
  removeTinyIslands(tile);
  ditherBurial(tile);
  return tile;
}

function putTile(sheet: Uint8Array, sheetW: number, tile: Uint8Array, frame: number) {
  const row = Math.floor(frame / COLS);
  const col = frame % COLS;
  for (let y = 0; y < TILE; y++) {
    const from = y * TILE * 4;
    const to = ((row * TILE + y) * sheetW + col * TILE) * 4;
    sheet.set(tile.subarray(from, from + TILE * 4), to);
  }
}

function cropFixedTile(source: ReturnType<typeof decodePng>, frame: number): Uint8Array {
  const tile = new Uint8Array(TILE * TILE * 4);
  const sourceCol = frame % COLS;
  const sourceRow = Math.floor(frame / COLS);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const si = ((sourceRow * TILE + y) * source.w + sourceCol * TILE + x) * 4;
      const di = (y * TILE + x) * 4;
      tile.set(source.rgba.subarray(si, si + 4), di);
    }
  }
  return tile;
}

function transparentizeChromaSource(source: ReturnType<typeof decodePng>) {
  const rgba = new Uint8Array(source.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    if (!isChroma(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
    rgba.fill(0, i, i + 4);
  }
  return { ...source, rgba };
}

function resizeRegionIntoTile(source: ReturnType<typeof decodePng>, bb: Rect, target: Rect): Uint8Array {
  const tile = new Uint8Array(TILE * TILE * 4);

  for (let dy = 0; dy < target.h; dy++) {
    for (let dx = 0; dx < target.w; dx++) {
      let weight = 0;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      const fromY = bb.y + Math.floor((dy * bb.h) / target.h);
      const toY = bb.y + Math.max(Math.floor(((dy + 1) * bb.h) / target.h), Math.floor((dy * bb.h) / target.h) + 1);
      const fromX = bb.x + Math.floor((dx * bb.w) / target.w);
      const toX = bb.x + Math.max(Math.floor(((dx + 1) * bb.w) / target.w), Math.floor((dx * bb.w) / target.w) + 1);
      for (let sy = fromY; sy < toY; sy++) {
        for (let sx = fromX; sx < toX; sx++) {
          const si = (sy * source.w + sx) * 4;
          const a = source.rgba[si + 3] / 255;
          weight++;
          alpha += a;
          red += source.rgba[si] * a;
          green += source.rgba[si + 1] * a;
          blue += source.rgba[si + 2] * a;
        }
      }

      const tx = target.x + dx;
      const ty = target.y + dy;
      if (tx < 0 || tx >= TILE || ty < 0 || ty >= TILE) continue;
      const di = (ty * TILE + tx) * 4;
      const outAlpha = alpha / weight;
      tile[di + 3] = Math.round(outAlpha * 255);
      if (alpha > 0) {
        tile[di] = Math.round(red / alpha);
        tile[di + 1] = Math.round(green / alpha);
        tile[di + 2] = Math.round(blue / alpha);
      }
    }
  }

  return tile;
}

function buildRobotReplacementTile(source: ReturnType<typeof decodePng>) {
  const transparent = transparentizeChromaSource(source);
  const bb = alphaBBox(transparent.rgba, transparent.w, { x: 0, y: 0, w: transparent.w, h: transparent.h });
  const targetH = 108;
  const targetW = Math.round((bb.w / bb.h) * targetH);
  const targetBottom = 112;
  const target = {
    x: Math.round((TILE - targetW) / 2),
    y: targetBottom - targetH + 1,
    w: targetW,
    h: targetH,
  };
  const tile = resizeRegionIntoTile(transparent, bb, target);
  purgeChromaCrumbs(tile);
  removeChromaHalo(tile);
  neutralizePurpleMatte(tile, RETRO_ROBOT_FRAME);
  removeTinyIslands(tile);
  ditherBurial(tile);
  clearTileBorderArtifacts(tile);
  return tile;
}

function cleanupRestoredTile(tile: Uint8Array, frame: number) {
  // Restored tiles already have a hand-painted sand/contact rim. Keep that
  // grounding, but remove the old loose bubbles and purple cast that made the
  // source look chroma-contaminated.
  const original = new Uint8Array(tile);
  removeFloatingSpecks(tile, 96);
  removeBubbleFlecks(tile);
  neutralizePurpleMatte(tile, frame);
  removeTinyIslands(tile);
  removeFloatingSpecks(tile, 96);
  clearTileBorderArtifacts(tile);
  recoverPortalCablePixels(tile, original, frame);
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
    throw new Error(`chroma key leak in runtime atlas: ${exact} exact, ${near} near-key visible pixels`);
}

function isForbiddenPortalMagenta(r: number, g: number, b: number) {
  // The portal projector's cable/handle is intentionally graphite-blue. Any
  // visible magenta/purple family here means the generated subject art, not just
  // the background extraction, drifted wrong.
  return r > 112 && b > 112 && g < 150 && Math.abs(r - b) < 116 && Math.min(r, b) - g > 24;
}

function assertNoMagentaFamilyInFrame(rgba: Uint8Array, sheetW: number, frame: number) {
  const row = Math.floor(frame / COLS);
  const col = frame % COLS;
  let count = 0;
  const samples: string[] = [];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = (((row * TILE + y) * sheetW) + col * TILE + x) * 4;
      if (rgba[i + 3] < 16) continue;
      if (!isForbiddenPortalMagenta(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
      count++;
      if (samples.length < 8) {
        const hex = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
          .map((value) => value.toString(16).padStart(2, "0")).join("");
        samples.push(`${x},${y}:#${hex}`);
      }
    }
  }
  if (count)
    throw new Error(`portal projector frame contains ${count} visible magenta/purple-family pixels (${samples.join(", ")})`);
}

function assertNoGeneratedPurpleLeaks(rgba: Uint8Array, sheetW: number) {
  let count = 0;
  const samples: string[] = [];
  for (let frame = 0; frame < COLS * ROWS; frame++) {
    const row = Math.floor(frame / COLS);
    const col = frame % COLS;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const i = (((row * TILE + y) * sheetW) + col * TILE + x) * 4;
        if (rgba[i + 3] < 16) continue;
        if (!isGeneratedPurple(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
        if (isAllowedCubeHeart(frame, x, y, rgba[i], rgba[i + 1], rgba[i + 2])) continue;
        count++;
        if (samples.length < 8) {
          const hex = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
            .map((value) => value.toString(16).padStart(2, "0")).join("");
          samples.push(`f${frame}@${x},${y}:#${hex}`);
        }
      }
    }
  }
  if (count)
    throw new Error(`pop-culture atlas contains ${count} generated purple-family leaks (${samples.join(", ")})`);
}

const source = decodePng(readFileSync(SOURCE));
if (source.w !== TILE * COLS || source.h !== TILE * ROWS)
  throw new Error(`${SOURCE}: expected ${TILE * COLS}x${TILE * ROWS}, got ${source.w}x${source.h}`);
assertTransparentSource(source.rgba, SOURCE);
const robotReplacementSource = decodePng(readFileSync(ROBOT_REPLACEMENT_SOURCE));

const sheetW = TILE * COLS;
const sheet = new Uint8Array(sheetW * TILE * ROWS * 4);
for (let frame = 0; frame < COLS * ROWS; frame++) {
  const tile = frame === RETRO_ROBOT_FRAME ? buildRobotReplacementTile(robotReplacementSource) : cropFixedTile(source, frame);
  if (frame !== RETRO_ROBOT_FRAME) cleanupRestoredTile(tile, frame);
  putTile(sheet, sheetW, tile, frame);
}

assertNoRuntimeKeyPixels(sheet);
assertNoMagentaFamilyInFrame(sheet, sheetW, 11);
assertNoGeneratedPurpleLeaks(sheet, sheetW);

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
console.log(`wrote ${OUTPUT} and ${MODULE}`);

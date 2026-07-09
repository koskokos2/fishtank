// Build the layered jellyfish runtime atlas from three invariant source pieces:
// bell, frilly oral arms, and long tendrils. The image model only supplies one
// identity-consistent master for each piece; every animation frame below is a
// deterministic deformation, so the jellyfish cannot change scale or anatomy as
// the animation advances.
//
// Runtime layout (16 columns x 3 rows, 128px cells):
//   row 0 — bell pulse, relaxed -> contracted -> relaxed
//   row 1 — continuously waving oral arms
//   row 2 — continuously waving long tendrils
// The appendage loops are phase-independent from the bell in cephalopod.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const SRC = "art/jellyfish-components-transparent.png";
const OUT = "art/jellyfish-atlas-128.png";
const OUT_TS = "src/jellyfishAtlas.ts";
const TILE = 128;
const FRAMES = 16;
const ROWS = 3;
const BELL_TOP = 10;
const LAYER_ROOT_Y = 47;
const BELL_OPEN_W = 82;
const APPENDAGE_H = 68;

type Buf = { data: Uint8Array; w: number; h: number };
type Rect = { x: number; y: number; w: number; h: number };

const src = decodePng(readFileSync(SRC));

function alphaBBox(region: Rect): Rect {
  let minX = region.x + region.w;
  let minY = region.y + region.h;
  let maxX = region.x - 1;
  let maxY = region.y - 1;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (src.rgba[(y * src.w + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error(`empty component region ${JSON.stringify(region)}`);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function crop(bb: Rect): Buf {
  const data = new Uint8Array(bb.w * bb.h * 4);
  for (let y = 0; y < bb.h; y++) {
    const from = ((bb.y + y) * src.w + bb.x) * 4;
    data.set(src.rgba.subarray(from, from + bb.w * 4), y * bb.w * 4);
  }
  return { data, w: bb.w, h: bb.h };
}

// Premultiplied-alpha area resampling retains one-pixel tendrils without green or
// dark fringes when the large generated masters are reduced to game resolution.
function resize(input: Buf, outW: number, outH: number): Buf {
  const data = new Uint8Array(outW * outH * 4);
  const scaleX = input.w / outW;
  const scaleY = input.h / outH;
  for (let dy = 0; dy < outH; dy++) {
    const sy0 = dy * scaleY;
    const sy1 = (dy + 1) * scaleY;
    for (let dx = 0; dx < outW; dx++) {
      const sx0 = dx * scaleX;
      const sx1 = (dx + 1) * scaleX;
      let areaSum = 0;
      let alphaSum = 0;
      let r = 0, g = 0, b = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.max(0, Math.min(sy1, sy + 1) - Math.max(sy0, sy));
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.max(0, Math.min(sx1, sx + 1) - Math.max(sx0, sx));
          const area = wx * wy;
          if (!area || sx < 0 || sy < 0 || sx >= input.w || sy >= input.h) continue;
          const si = (sy * input.w + sx) * 4;
          const a = input.data[si + 3] / 255;
          areaSum += area;
          alphaSum += a * area;
          r += input.data[si] * a * area;
          g += input.data[si + 1] * a * area;
          b += input.data[si + 2] * a * area;
        }
      }
      if (!alphaSum) continue;
      const di = (dy * outW + dx) * 4;
      data[di] = Math.round(r / alphaSum);
      data[di + 1] = Math.round(g / alphaSum);
      data[di + 2] = Math.round(b / alphaSum);
      data[di + 3] = Math.round((alphaSum / areaSum) * 255);
    }
  }
  return { data, w: outW, h: outH };
}

function blit(dst: Uint8Array, dstW: number, input: Buf, ox: number, oy: number) {
  for (let y = 0; y < input.h; y++) {
    for (let x = 0; x < input.w; x++) {
      const si = (y * input.w + x) * 4;
      if (input.data[si + 3] === 0) continue;
      const tx = ox + x;
      const ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= dstW || ty >= TILE * ROWS) continue;
      dst.set(input.data.subarray(si, si + 4), (ty * dstW + tx) * 4);
    }
  }
}

// Inverse-map a component through a travelling wave. The top attachment band is
// rigid; motion grows toward the tips. The x-dependent phase prevents the long
// strands from moving as one cardboard curtain.
function waveFrame(
  base: Buf,
  frame: number,
  amp: number,
  depthLag: number,
  strandPhase: number,
  verticalAmp: number,
): Buf {
  const data = new Uint8Array(TILE * TILE * 4);
  const left = Math.round((TILE - base.w) / 2);
  const phase = (2 * Math.PI * frame) / FRAMES;
  for (let y = 0; y < TILE; y++) {
    const localY = y - LAYER_ROOT_Y;
    if (localY < -2 || localY > base.h + 2) continue;
    const lower = Math.max(0, Math.min(1, (localY / Math.max(1, base.h - 1) - 0.08) / 0.92));
    const ease = lower * lower * (3 - 2 * lower);
    for (let x = 0; x < TILE; x++) {
      const localX = x - left;
      const lateralPhase = phase - depthLag * lower + strandPhase * (localX - base.w / 2);
      const sx = Math.round(localX - amp * ease * Math.sin(lateralPhase));
      const sy = Math.round(localY - verticalAmp * ease * Math.cos(phase + lower * 1.7 + strandPhase * localX));
      if (sx < 0 || sy < 0 || sx >= base.w || sy >= base.h) continue;
      const si = (sy * base.w + sx) * 4;
      if (base.data[si + 3] === 0) continue;
      data.set(base.data.subarray(si, si + 4), (y * TILE + x) * 4);
    }
  }
  return { data, w: TILE, h: TILE };
}

const cuts = [0, Math.floor(src.w / 3), Math.floor((src.w * 2) / 3), src.w];
const masters = [0, 1, 2].map((i) =>
  crop(alphaBBox({ x: cuts[i], y: 0, w: cuts[i + 1] - cuts[i], h: src.h })),
);
const [bellMaster, armsMaster, tendrilMaster] = masters;

const appendage = (master: Buf) =>
  resize(master, Math.max(1, Math.round((master.w / master.h) * APPENDAGE_H)), APPENDAGE_H);
const arms = appendage(armsMaster);
const tendrils = appendage(tendrilMaster);

const sheetW = TILE * FRAMES;
const sheetH = TILE * ROWS;
const sheet = new Uint8Array(sheetW * sheetH * 4);
const bellAttachY: number[] = [];

for (let f = 0; f < FRAMES; f++) {
  // Cosine gives a seamless open -> tight -> open pulse. Width and height change
  // inversely, so this reads as one flexible bell compressing rather than a new,
  // differently scaled jellyfish replacing the previous one.
  const contracted = 0.5 - 0.5 * Math.cos((2 * Math.PI * f) / FRAMES);
  const bellW = Math.round(BELL_OPEN_W * (1 - 0.12 * contracted));
  const openH = Math.round((bellMaster.h / bellMaster.w) * BELL_OPEN_W * 0.92);
  const bellH = Math.round(openH * (1 + 0.18 * contracted));
  const bell = resize(bellMaster, bellW, bellH);
  const bellX = f * TILE + Math.round((TILE - bellW) / 2);
  blit(sheet, sheetW, bell, bellX, BELL_TOP);
  bellAttachY.push(BELL_TOP + bellH - 2);

  const armFrame = waveFrame(arms, f, 3.2, 2.5, 0.045, 1.1);
  blit(sheet, sheetW, armFrame, f * TILE, TILE);
  const tendrilFrame = waveFrame(tendrils, f, 5.2, 3.1, 0.105, 0.7);
  blit(sheet, sheetW, tendrilFrame, f * TILE, TILE * 2);
}

const png = encodePng(sheet, sheetW, sheetH);
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${FRAMES}x${ROWS} layered frames, ${TILE}px each)`);

const b64 = Buffer.from(png).toString("base64");
const module = `// GENERATED by tools/gen-jellyfish-atlas.ts - do not edit by hand.
// One identity-stable jellyfish split into independent bell, oral-arm, and long-
// tendril rows. The bell follows propulsion; both appendage rows loop continuously.
export const JELLYFISH_ATLAS = "data:image/png;base64,${b64}";
export const JELLYFISH_ATLAS_COLS = ${FRAMES};
export const JELLYFISH_ATLAS_ROWS = ${ROWS};
export const JELLYFISH_ATLAS_CELL = ${TILE};
export const JELLYFISH_LAYER_FRAMES = ${FRAMES};
export const JELLYFISH_FRAMES = ${FRAMES * ROWS};
export const JELLYFISH_BELL_START = 0;
export const JELLYFISH_ARMS_START = ${FRAMES};
export const JELLYFISH_TENDRILS_START = ${FRAMES * 2};
export const JELLYFISH_LAYER_ROOT_Y = ${LAYER_ROOT_Y};
export const JELLYFISH_BELL_ATTACH_Y = [${bellAttachY.join(", ")}] as const;
`;
writeFileSync(OUT_TS, module);
console.log(`wrote ${OUT_TS} (${(module.length / 1024).toFixed(0)} KB)`);

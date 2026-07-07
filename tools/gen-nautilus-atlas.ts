// Build the nautilus runtime atlas from four identity-stable source pieces:
// shell/body, tentacle crown, siphon, and expelled-water plume. The generated
// source supplies one master for each piece; every animation frame below is a
// deterministic deformation, so the shell, eye, and attachment points cannot
// change when the animation advances.
//
// Runtime layout (16 columns x 4 rows, 128px cells):
//   row 0 — fixed shell/body (repeated for convenient shared slicing)
//   row 1 — continuously travelling tentacle wave
//   row 2 — siphon retraction -> extension
//   row 3 — one-shot jet plume, birth -> expansion -> dissipation
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const SRC = "art/nautilus-components-transparent.png";
const OUT = "art/nautilus-atlas-128.png";
const OUT_TS = "src/nautilusAtlas.ts";
const TILE = 128;
const FRAMES = 16;
const ROWS = 4;

// All layers share the centre of a 128px cell. These placements assemble the
// left-facing creature while keeping the tentacle and siphon roots fixed.
const BODY_X = 53;
const BODY_Y = 35;
const BODY_W = 70;
const BODY_H = 59;
// The generated crown's attachment cuff is its right edge. Seat that cuff under
// the eye and behind the striped mouth folds (not on the tip of the snout).
const TENTACLE_RIGHT = 67;
const TENTACLE_TOP = 56;
const TENTACLE_W = 58;
const TENTACLE_H = 43;
const SIPHON_RIGHT = 58;
const SIPHON_CENTRE_Y = 75;
const PLUME_RIGHT = 39;
const PLUME_CENTRE_Y = 75;

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
      if (src.rgba[(y * src.w + x) * 4 + 3] <= 8) continue;
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

// Premultiplied-alpha area resampling keeps the small pixel clusters clean and
// avoids a dark/key-colour fringe around the translucent component edges.
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
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.max(0, Math.min(sy1, sy + 1) - Math.max(sy0, sy));
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.max(0, Math.min(sx1, sx + 1) - Math.max(sx0, sx));
          const area = wx * wy;
          if (!area || sx < 0 || sy < 0 || sx >= input.w || sy >= input.h) continue;
          const si = (sy * input.w + sx) * 4;
          const alpha = input.data[si + 3] / 255;
          areaSum += area;
          alphaSum += alpha * area;
          red += input.data[si] * alpha * area;
          green += input.data[si + 1] * alpha * area;
          blue += input.data[si + 2] * alpha * area;
        }
      }
      if (!alphaSum) continue;
      const di = (dy * outW + dx) * 4;
      data[di] = Math.round(red / alphaSum);
      data[di + 1] = Math.round(green / alphaSum);
      data[di + 2] = Math.round(blue / alphaSum);
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

// The root is the right edge of the tentacle crown. It remains rigid while wave
// amplitude grows toward the left tips. A y-dependent phase offset prevents the
// many arms from behaving like one flat ribbon.
function tentacleFrame(base: Buf, frame: number): Buf {
  const data = new Uint8Array(TILE * TILE * 4);
  const left = TENTACLE_RIGHT - base.w;
  const phase = (2 * Math.PI * frame) / FRAMES;
  for (let y = 0; y < TILE; y++) {
    const localY = y - TENTACLE_TOP;
    for (let x = 0; x < TILE; x++) {
      const localX = x - left;
      if (localX < -5 || localX > base.w + 2 || localY < -6 || localY > base.h + 6)
        continue;
      const towardTip = Math.max(0, Math.min(1, 1 - localX / Math.max(1, base.w - 1)));
      const ease = towardTip * towardTip * (3 - 2 * towardTip);
      const strandPhase = ((localY - base.h / 2) / Math.max(1, base.h)) * 2.4;
      const sx = Math.round(
        localX - 1.2 * ease * Math.cos(phase - towardTip * 2.1 + strandPhase),
      );
      const sy = Math.round(
        localY - 3.6 * ease * Math.sin(phase - towardTip * 2.8 + strandPhase),
      );
      if (sx < 0 || sy < 0 || sx >= base.w || sy >= base.h) continue;
      const si = (sy * base.w + sx) * 4;
      if (base.data[si + 3] === 0) continue;
      data.set(base.data.subarray(si, si + 4), (y * TILE + x) * 4);
    }
  }
  return { data, w: TILE, h: TILE };
}

function withOpacity(input: Buf, opacity: number): Buf {
  const data = input.data.slice();
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
  return { data, w: input.w, h: input.h };
}

const halfW = Math.floor(src.w / 2);
const halfH = Math.floor(src.h / 2);
const regions: Rect[] = [
  { x: 0, y: 0, w: halfW, h: halfH },
  { x: halfW, y: 0, w: src.w - halfW, h: halfH },
  { x: 0, y: halfH, w: halfW, h: src.h - halfH },
  { x: halfW, y: halfH, w: src.w - halfW, h: src.h - halfH },
];
const [bodyMaster, tentacleMaster, siphonMaster, plumeMaster] = regions.map((r) =>
  crop(alphaBBox(r)),
);

const body = resize(bodyMaster, BODY_W, BODY_H);
const tentacles = resize(tentacleMaster, TENTACLE_W, TENTACLE_H);
const sheetW = TILE * FRAMES;
const sheetH = TILE * ROWS;
const sheet = new Uint8Array(sheetW * sheetH * 4);

for (let frame = 0; frame < FRAMES; frame++) {
  blit(sheet, sheetW, body, frame * TILE + BODY_X, BODY_Y);

  const waving = tentacleFrame(tentacles, frame);
  blit(sheet, sheetW, waving, frame * TILE, TILE);

  const extension = frame / (FRAMES - 1);
  const siphonW = Math.round(16 + 8 * (extension * extension * (3 - 2 * extension)));
  const siphonH = Math.round(11 + extension * 3);
  const siphon = resize(siphonMaster, siphonW, siphonH);
  blit(
    sheet,
    sheetW,
    siphon,
    frame * TILE + SIPHON_RIGHT - siphonW,
    TILE * 2 + Math.round(SIPHON_CENTRE_Y - siphonH / 2),
  );

  const t = frame / (FRAMES - 1);
  const strength = Math.sin(Math.PI * t);
  const plumeW = Math.max(2, Math.round(10 + 34 * (1 - Math.pow(1 - t, 2))));
  const plumeH = Math.max(2, Math.round(7 + 10 * strength));
  const plume = withOpacity(resize(plumeMaster, plumeW, plumeH), Math.min(1, strength * 1.35));
  blit(
    sheet,
    sheetW,
    plume,
    frame * TILE + PLUME_RIGHT - plumeW,
    TILE * 3 + Math.round(PLUME_CENTRE_Y - plumeH / 2),
  );
}

const png = encodePng(sheet, sheetW, sheetH);
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${FRAMES}x${ROWS} layered frames, ${TILE}px each)`);

const b64 = Buffer.from(png).toString("base64");
const module = `// GENERATED by tools/gen-nautilus-atlas.ts - do not edit by hand.
// One identity-stable nautilus split into fixed body, continuously waving
// tentacles, state-driven siphon, and one-shot water-jet rows.
export const NAUTILUS_ATLAS = "data:image/png;base64,${b64}";
export const NAUTILUS_ATLAS_COLS = ${FRAMES};
export const NAUTILUS_ATLAS_ROWS = ${ROWS};
export const NAUTILUS_ATLAS_CELL = ${TILE};
export const NAUTILUS_LAYER_FRAMES = ${FRAMES};
export const NAUTILUS_FRAMES = ${FRAMES * ROWS};
export const NAUTILUS_BODY_START = 0;
export const NAUTILUS_TENTACLES_START = ${FRAMES};
export const NAUTILUS_SIPHON_START = ${FRAMES * 2};
export const NAUTILUS_JET_START = ${FRAMES * 3};
`;
writeFileSync(OUT_TS, module);
console.log(`wrote ${OUT_TS} (${(module.length / 1024).toFixed(0)} KB)`);

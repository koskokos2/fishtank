// One-off generator: bake the four "assembled" octopus poses from
// art/octopus-atlas-128.png (a transparent-background pixel-art atlas) into a clean
// sprite sheet, embedded as a base64 data URL. Re-run if the source atlas changes.
//
// Only the atlas's last row (the pre-composited "assembled" poses) reads as a whole
// octopus — the separate body/tentacle layers don't overlay cleanly. Those assembled
// octopuses are drawn slightly TALLER than their 128px cells, so the mantle dome pokes
// a few px up into the cell above and a plain grid slice would clip it flat. So we
// flood-extract each pose as a connected blob — the transparent background means the
// blob is exactly the one octopus (full dome, no neighbour bleed) — and re-bake them
// into a 128px-tall sheet shifted down a uniform margin. The idle pose is expanded
// into a short arm-sway loop; the other three are single frames.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const SRC = "art/octopus-atlas-128.png";
const OUT = "src/octopusAtlas.ts";
const CELL = 128; // source cell size (art/octopus-atlas-128.json tileSize)
const COLS = 4; // atlas columns
const ASSEMBLED_ROW = 3; // the row of whole-octopus poses
const TOP_MARGIN = 8; // shift each pose down this many px so the dome clears the top
const SWAY_FRAMES = 8; // idle-pose arm-sway loop length
const SWAY_AMP = 5; // peak sideways arm-tip shift, px
const SWAY_ARM_TOP = 0.4; // fraction down the octopus where the arms start swaying

const { rgba, w, h } = decodePng(readFileSync(SRC));

// --- bake the assembled poses into a clean COLS-frame, CELL-tall sheet ---
// Flood-extract one octopus (8-connected over opaque pixels) from a seed at the
// centre of an assembled cell, returning its atlas pixel indices.
function extractBlob(col: number): number[] {
  const seed = (ASSEMBLED_ROW * CELL + (CELL >> 1)) * w + (col * CELL + (CELL >> 1));
  if (rgba[seed * 4 + 3] === 0) throw new Error(`assembled c${col}: empty centre`);
  const seenB = new Set<number>([seed]);
  const stack = [seed];
  const blob: number[] = [];
  while (stack.length) {
    const p = stack.pop()!;
    blob.push(p);
    const x = p % w;
    const y = (p / w) | 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!seenB.has(q) && rgba[q * 4 + 3] !== 0) {
          seenB.add(q);
          stack.push(q);
        }
      }
  }
  return blob;
}

// Render one assembled pose's extracted blob into a fresh CELL×CELL RGBA buffer,
// shifted down by TOP_MARGIN so the over-tall mantle dome clears the top.
function poseBuf(col: number): Uint8Array {
  const buf = new Uint8Array(CELL * CELL * 4);
  let minY = CELL,
    maxY = 0;
  for (const p of extractBlob(col)) {
    const lx = (p % w) - col * CELL;
    const ly = ((p / w) | 0) - ASSEMBLED_ROW * CELL + TOP_MARGIN;
    if (lx < 0 || lx >= CELL || ly < 0 || ly >= CELL) continue;
    const di = (ly * CELL + lx) * 4;
    for (let c = 0; c < 4; c++) buf[di + c] = rgba[p * 4 + c];
    if (ly < minY) minY = ly;
    if (ly > maxY) maxY = ly;
  }
  (buf as any).minY = minY;
  (buf as any).maxY = maxY;
  return buf;
}

// Per-row sideways shift for idle-sway frame `f`: zero in the mantle, growing toward
// the arm tips, phase lagging with depth so the arms drift as a gentle travelling
// wave. Whole-pixel (crisp), mirroring the jellyfish tentacle bake.
function swayShift(y: number, minY: number, maxY: number, f: number): number {
  const armTop = minY + (maxY - minY) * SWAY_ARM_TOP;
  if (y < armTop) return 0;
  const lower = Math.min(1, (y - armTop) / Math.max(1, maxY - armTop));
  const phase = (2 * Math.PI * f) / SWAY_FRAMES;
  return Math.round(SWAY_AMP * lower * Math.sin(phase - 2.4 * lower));
}

// Layout: SWAY_FRAMES idle frames (arms swaying), then pulse, glide, curl.
const FRAMES = SWAY_FRAMES + (COLS - 1);
const sheetW = FRAMES * CELL;
const sheet = new Uint8Array(sheetW * CELL * 4);
const put = (frame: number, x: number, y: number, src: Uint8Array, si: number) => {
  if (x < 0 || x >= CELL || y < 0 || y >= CELL) return;
  const di = (y * sheetW + frame * CELL + x) * 4;
  for (let c = 0; c < 4; c++) sheet[di + c] = src[si + c];
};

// idle pose → SWAY_FRAMES swayed copies
const idle = poseBuf(0);
const iMinY = (idle as any).minY as number;
const iMaxY = (idle as any).maxY as number;
for (let f = 0; f < SWAY_FRAMES; f++) {
  for (let y = 0; y < CELL; y++) {
    const sh = swayShift(y, iMinY, iMaxY, f);
    for (let x = 0; x < CELL; x++) {
      const si = (y * CELL + x) * 4;
      if (idle[si + 3] === 0) continue;
      put(f, x + sh, y, idle, si);
    }
  }
}
// pulse, glide, curl → one frame each, after the idle loop
for (let col = 1; col < COLS; col++) {
  const buf = poseBuf(col);
  const frame = SWAY_FRAMES + (col - 1);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const si = (y * CELL + x) * 4;
      if (buf[si + 3] === 0) continue;
      put(frame, x, y, buf, si);
    }
}

const b64 = Buffer.from(encodePng(sheet, sheetW, CELL)).toString("base64");
const module = `// GENERATED by tools/gen-octopus-atlas.ts - do not edit by hand.
// A clean ${FRAMES}-frame octopus sheet (${sheetW}x${CELL}), baked from the "assembled"
// pose row of art/octopus-atlas-128.png. The first ${SWAY_FRAMES} frames are the idle
// pose (idle_hover) with its arms swaying as a subtle whole-pixel travelling wave (the
// rigid mantle stays put) — cycled while the octopus drifts. The last three are the
// single swim/turn poses: swim_pulse, glide_streaming, curled_turn. Each pose was
// flood-extracted from the transparent-background source so the mantle dome that
// overflows its source cell is kept, not clipped.
export const OCTOPUS_ATLAS = "data:image/png;base64,${b64}";
export const OCTOPUS_FRAMES = ${FRAMES};
export const OCTOPUS_IDLE_FRAMES = ${SWAY_FRAMES};
export const OCTOPUS_FRAME_W = ${CELL};
`;

writeFileSync(OUT, module);
console.log(
  `wrote ${OUT} (${(module.length / 1024).toFixed(0)} KB) — ${FRAMES} frames (${SWAY_FRAMES} idle-sway + 3 poses)`,
);

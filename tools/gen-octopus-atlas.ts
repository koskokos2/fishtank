// One-off generator: bake the twelve "assembled" octopus poses from
// art/octopus-atlas-128.png (a transparent-background pixel-art atlas) into a clean
// sprite sheet, embedded as a base64 data URL. Re-run if the source atlas changes.
//
// The atlas is 4 cols x 6 rows. Rows 0-2 are component layers (body / back / front
// tentacles) that don't overlay cleanly, so we ignore them; rows 3-5 are the artist's
// twelve pre-composited "assembled" octopuses, the only cells that read as a whole
// creature. They are baked here into one sheet the crawl/swim state machine indexes by
// name (see OCTOPUS_POSE).
//
// Two wrinkles drive the work:
//   * The poses are drawn slightly larger than their cells, so the mantle dome pokes a
//     few px up into the row above and a plain grid slice would clip it. So each pose is
//     flood-extracted as a connected blob from a centre seed — the transparent background
//     means the blob is exactly one octopus. The rows pack tightly (a neighbour's dome/
//     arms can touch), so the flood is clamped to the pose's own cell band (plus a small
//     overflow margin) to keep its dome without swallowing a neighbour.
//   * The poses vary in size and in how far the arms reach, so each blob is re-centred in
//     a uniform square frame. The app centre-anchors the sprite and seats the body centre
//     a fixed height above the sand, so centring keeps the creature's mass put as poses
//     swap; the swim "lift off the bottom" comes from physics, not the framing.
// The idle_hover pose is additionally expanded into a short whole-pixel arm-sway loop
// (mantle rigid) for the in-place hover; the other eleven are single frames.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const SRC = "art/octopus-atlas-128.png";
const OUT = "src/octopusAtlas.ts";
const COLS = 4; // atlas columns
const ROWS = 6; // atlas rows (0-2 component layers, 3-5 assembled poses)
const DOME_UP = 12; // px a pose's dome may overflow above its cell (kept by the flood)
const FOOT_DOWN = 8; // px the arms may overflow below its cell
const SIDE_PAD = 6; // px of horizontal flood slack past the cell edges
const FRAME_MARGIN = 4; // blank px around the widest pose in the square output frame
const MANTLE_FRAC = 0.33; // top fraction of a blob treated as the mantle/head (anchor band)
const SWAY_FRAMES = 8; // idle-pose arm-sway loop length
const SWAY_AMP = 5; // peak sideways arm-tip shift, px
const SWAY_ARM_TOP = 0.4; // fraction down the octopus where the arms start swaying

// The twelve assembled poses, in atlas order (rows 3-5). The first is expanded into the
// idle arm-sway loop; the rest are baked one frame each. Keys match OCTOPUS_POSE.
const POSES = [
  { key: "idleHover", row: 3, col: 0 },
  { key: "swimPulse", row: 3, col: 1 },
  { key: "glide", row: 3, col: 2 },
  { key: "curl", row: 3, col: 3 },
  { key: "rest", row: 4, col: 0 },
  { key: "crawlReach", row: 4, col: 1 },
  { key: "crawlPush", row: 4, col: 2 },
  { key: "settledRest", row: 4, col: 3 },
  { key: "activeSwimPulse", row: 5, col: 0 },
  { key: "activeGlide", row: 5, col: 1 },
  { key: "activeCrawlReach", row: 5, col: 2 },
  { key: "activeCurl", row: 5, col: 3 },
] as const;

const { rgba, w, h } = decodePng(readFileSync(SRC));
const cellW = w / COLS;
const cellH = h / ROWS;
const alphaAt = (x: number, y: number) =>
  x < 0 || y < 0 || x >= w || y >= h ? 0 : rgba[(y * w + x) * 4 + 3];

// Flood-extract one octopus (8-connected over opaque pixels), clamped to its cell band so
// a touching neighbour can't bleed in. Returns the atlas pixel indices.
function extractBlob(row: number, col: number): number[] {
  const top = Math.floor(row * cellH) - DOME_UP;
  const bot = Math.floor((row + 1) * cellH) + FOOT_DOWN;
  const left = Math.floor(col * cellW) - SIDE_PAD;
  const right = Math.floor((col + 1) * cellW) + SIDE_PAD;
  let sx = Math.floor((col + 0.5) * cellW);
  let sy = Math.floor((row + 0.5) * cellH);
  // Cell centre is usually solid body, but can land in an arm gap — spiral out a little.
  if (alphaAt(sx, sy) === 0) {
    let found = false;
    for (let r = 1; r < 24 && !found; r++)
      for (let dy = -r; dy <= r && !found; dy++)
        for (let dx = -r; dx <= r && !found; dx++)
          if (alphaAt(sx + dx, sy + dy) > 0) {
            sx += dx;
            sy += dy;
            found = true;
          }
    if (!found) throw new Error(`pose r${row}c${col}: no opaque seed near centre`);
  }
  const seed = sy * w + sx;
  const seen = new Set<number>([seed]);
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
        if (nx < left || nx > right || ny < top || ny > bot) continue;
        const q = ny * w + nx;
        if (!seen.has(q) && rgba[q * 4 + 3] !== 0) {
          seen.add(q);
          stack.push(q);
        }
      }
  }
  return blob;
}

const blobs = POSES.map((p) => extractBlob(p.row, p.col));
const bbox = (blob: number[]) => {
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (const p of blob) {
    const x = p % w;
    const y = (p / w) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
};

// Mean x of the opaque pixels in the top MANTLE_FRAC of a blob — the mantle/head, the one
// body part that stays put across poses. Poses are anchored on it horizontally so the body
// holds still while the arms reach/pull (otherwise a per-bbox centre jerks the body as the
// arm-reach changes the silhouette width — a crawl-gait wobble).
function mantleX(blob: number[], bb: ReturnType<typeof bbox>): number {
  const bandBot = bb.minY + Math.round((bb.maxY - bb.minY) * MANTLE_FRAC);
  let sum = 0;
  let n = 0;
  for (const p of blob)
    if (((p / w) | 0) <= bandBot) {
      sum += p % w;
      n++;
    }
  return n ? sum / n : (bb.minX + bb.maxX) / 2;
}

// Square output frame: wide enough for the most head-offset pose (horizontal anchored on
// the head) and the tallest pose (vertical bbox-centred), plus a margin (even side). Sizing
// from the head-centred reach keeps an arms-forward pose from clipping.
let halfX = 0;
let maxH = 0;
for (const b of blobs) {
  const bb = bbox(b);
  const hx = mantleX(b, bb);
  halfX = Math.max(halfX, hx - bb.minX, bb.maxX - hx);
  maxH = Math.max(maxH, bb.maxY - bb.minY + 1);
}
const FRAME = (Math.max(2 * Math.ceil(halfX), maxH) + 2 * FRAME_MARGIN + 1) & ~1;

// Render a blob into a fresh FRAME-square buffer — head-anchored in x, bbox-centred in y —
// and report its content rows so the sway can target the arms.
function centeredBuf(blob: number[]): { buf: Uint8Array; minY: number; maxY: number } {
  const bb = bbox(blob);
  const offX = Math.round(FRAME / 2 - mantleX(blob, bb));
  const offY = Math.round((FRAME - (bb.maxY - bb.minY + 1)) / 2) - bb.minY;
  const buf = new Uint8Array(FRAME * FRAME * 4);
  let minY = FRAME, maxY = 0;
  for (const p of blob) {
    const lx = (p % w) + offX;
    const ly = ((p / w) | 0) + offY;
    if (lx < 0 || lx >= FRAME || ly < 0 || ly >= FRAME) continue;
    const di = (ly * FRAME + lx) * 4;
    for (let c = 0; c < 4; c++) buf[di + c] = rgba[p * 4 + c];
    if (ly < minY) minY = ly;
    if (ly > maxY) maxY = ly;
  }
  return { buf, minY, maxY };
}

// Per-row sideways shift for idle-sway frame `f`: zero in the mantle, growing toward the
// arm tips, phase lagging with depth so the arms drift as a gentle travelling wave.
// Whole-pixel (crisp), mirroring the jellyfish tentacle bake.
function swayShift(y: number, minY: number, maxY: number, f: number): number {
  const armTop = minY + (maxY - minY) * SWAY_ARM_TOP;
  if (y < armTop) return 0;
  const lower = Math.min(1, (y - armTop) / Math.max(1, maxY - armTop));
  const phase = (2 * Math.PI * f) / SWAY_FRAMES;
  return Math.round(SWAY_AMP * lower * Math.sin(phase - 2.4 * lower));
}

// Layout: SWAY_FRAMES idle-sway frames, then one frame per remaining pose.
const FRAMES = SWAY_FRAMES + (POSES.length - 1);
const sheetW = FRAMES * FRAME;
const sheet = new Uint8Array(sheetW * FRAME * 4);
const put = (frame: number, x: number, y: number, src: Uint8Array, si: number) => {
  if (x < 0 || x >= FRAME || y < 0 || y >= FRAME) return;
  const di = (y * sheetW + frame * FRAME + x) * 4;
  for (let c = 0; c < 4; c++) sheet[di + c] = src[si + c];
};

// idle pose -> SWAY_FRAMES swayed copies
const idle = centeredBuf(blobs[0]);
for (let f = 0; f < SWAY_FRAMES; f++)
  for (let y = 0; y < FRAME; y++) {
    const sh = swayShift(y, idle.minY, idle.maxY, f);
    for (let x = 0; x < FRAME; x++) {
      const si = (y * FRAME + x) * 4;
      if (idle.buf[si + 3] === 0) continue;
      put(f, x + sh, y, idle.buf, si);
    }
  }
// remaining poses -> one frame each, after the idle loop
for (let i = 1; i < POSES.length; i++) {
  const { buf } = centeredBuf(blobs[i]);
  const frame = SWAY_FRAMES + (i - 1);
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const si = (y * FRAME + x) * 4;
      if (buf[si + 3] === 0) continue;
      put(frame, x, y, buf, si);
    }
}

// pose key -> sheet frame index (the idle loop occupies 0..SWAY_FRAMES-1)
const poseIndex: Record<string, number> = {};
for (let i = 1; i < POSES.length; i++) poseIndex[POSES[i].key] = SWAY_FRAMES + (i - 1);

const b64 = Buffer.from(encodePng(sheet, sheetW, FRAME)).toString("base64");
const poseLines = Object.entries(poseIndex)
  .map(([k, v]) => `  ${k}: ${v},`)
  .join("\n");
const module = `// GENERATED by tools/gen-octopus-atlas.ts - do not edit by hand.
// A clean ${FRAMES}-frame octopus sheet (${sheetW}x${FRAME}), baked from the twelve
// "assembled" poses (rows 3-5) of art/octopus-atlas-128.png. Frames 0..${SWAY_FRAMES - 1} are the
// idle_hover pose with its arms swaying as a subtle whole-pixel travelling wave (the
// rigid mantle stays put) — the in-place hover loop. The remaining frames are the single
// crawl/rest/swim poses indexed by OCTOPUS_POSE. Each pose was flood-extracted from the
// transparent-background source (full mantle dome kept) and centred in the square frame.
export const OCTOPUS_ATLAS = "data:image/png;base64,${b64}";
export const OCTOPUS_FRAMES = ${FRAMES};
export const OCTOPUS_IDLE_FRAMES = ${SWAY_FRAMES};
export const OCTOPUS_FRAME_W = ${FRAME};
// Sheet frame index for each named pose (the idle-hover loop is frames 0..${SWAY_FRAMES - 1}).
export const OCTOPUS_POSE = {
${poseLines}
} as const;
`;

writeFileSync(OUT, module);
console.log(
  `wrote ${OUT} (${(module.length / 1024).toFixed(0)} KB) — ${FRAMES} frames ` +
    `(${SWAY_FRAMES} idle-sway + ${POSES.length - 1} poses), ${FRAME}px square`,
);

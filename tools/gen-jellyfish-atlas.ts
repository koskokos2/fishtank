// Normalize the generated jellyfish pose sheet into a clean 4x4 runtime atlas,
// then embed it as src/jellyfishAtlas.ts (a base64 data URL plus a named frame
// index, JELLYFISH_POSE, read from the sidecar JSON).
//
// The image model left generous, slightly uneven gutters. These cuts pass through
// the empty space between poses. Each pose is then centred independently in a
// 128px tile and box-filtered down from the high-resolution source so fine
// tentacles survive without leaking into a neighbouring frame.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const SRC = "art/jellyfish-atlas-transparent.png";
const LAYOUT = "art/jellyfish-atlas-128.json";
const OUT = "art/jellyfish-atlas-128.png";
const OUT_TS = "src/jellyfishAtlas.ts";
const TILE = 128;
// Slightly larger than the widest source pose so bell-anchored streaming frames
// retain their long lateral tentacles with a safe transparent gutter.
const WORK_TILE = 360;
const COL_CUTS = [0, 313, 615, 902, 1254] as const;
const ROW_CUTS = [0, 322, 616, 909, 1254] as const;

const { rgba, w, h } = decodePng(readFileSync(SRC));
if (w !== 1254 || h !== 1254)
  throw new Error(`expected a 1254x1254 source, got ${w}x${h}`);

type Rect = { x: number; y: number; w: number; h: number };

function alphaBBox(region: Rect): Rect {
  let minX = region.x + region.w;
  let minY = region.y + region.h;
  let maxX = region.x - 1;
  let maxY = region.y - 1;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (rgba[(y * w + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error("empty jellyfish source region");
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Horizontal anchor from the upper bell rather than the full bounding box. Long
// streaming tentacles can pull a pose's bbox far sideways; anchoring on the bell
// keeps the creature's body steady while those appendages follow through.
function bellX(bb: Rect): number {
  const bellBottom = bb.y + Math.round(bb.h * 0.36);
  let weightedX = 0;
  let weight = 0;
  for (let y = bb.y; y < bellBottom; y++) {
    for (let x = bb.x; x < bb.x + bb.w; x++) {
      const alpha = rgba[(y * w + x) * 4 + 3];
      weightedX += x * alpha;
      weight += alpha;
    }
  }
  return weight ? weightedX / weight : bb.x + bb.w / 2;
}

// Box-filter one WORK_TILE pose into its final tile. RGB is accumulated with
// premultiplied alpha, preventing dark/green fringes at transparent edges.
function downsample(work: Uint8Array): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4);
  const scale = WORK_TILE / TILE;
  for (let dy = 0; dy < TILE; dy++) {
    const sy0 = dy * scale;
    const sy1 = (dy + 1) * scale;
    for (let dx = 0; dx < TILE; dx++) {
      const sx0 = dx * scale;
      const sx1 = (dx + 1) * scale;
      let weight = 0;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.max(0, Math.min(sy1, sy + 1) - Math.max(sy0, sy));
        if (!wy || sy < 0 || sy >= WORK_TILE) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.max(0, Math.min(sx1, sx + 1) - Math.max(sx0, sx));
          if (!wx || sx < 0 || sx >= WORK_TILE) continue;
          const area = wx * wy;
          const si = (sy * WORK_TILE + sx) * 4;
          const a = work[si + 3] / 255;
          weight += area;
          alpha += a * area;
          red += work[si] * a * area;
          green += work[si + 1] * a * area;
          blue += work[si + 2] * a * area;
        }
      }
      const di = (dy * TILE + dx) * 4;
      if (alpha > 0) {
        out[di] = Math.round(red / alpha);
        out[di + 1] = Math.round(green / alpha);
        out[di + 2] = Math.round(blue / alpha);
        out[di + 3] = Math.round((alpha / weight) * 255);
      }
    }
  }
  return out;
}

const sheetW = TILE * 4;
const sheet = new Uint8Array(sheetW * sheetW * 4);
const bboxes: Rect[] = [];
for (let row = 0; row < 4; row++)
  for (let col = 0; col < 4; col++)
    bboxes.push(
      alphaBBox({
        x: COL_CUTS[col],
        y: ROW_CUTS[row],
        w: COL_CUTS[col + 1] - COL_CUTS[col],
        h: ROW_CUTS[row + 1] - ROW_CUTS[row],
      }),
    );
// One shared bell-top line (the tallest pose, centred) rather than per-pose
// vertical centring: the poses swap as animation frames, and per-pose centring
// makes the bell bob whenever the tentacle reach changes the bbox height.
const maxH = Math.max(...bboxes.map((b) => b.h));
const topWork = Math.round((WORK_TILE - maxH) / 2);
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 4; col++) {
    const bb = bboxes[row * 4 + col];
    const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
    const offX = Math.round(WORK_TILE / 2 - bellX(bb));
    const offY = topWork - bb.y;
    for (let y = bb.y; y < bb.y + bb.h; y++) {
      for (let x = bb.x; x < bb.x + bb.w; x++) {
        const si = (y * w + x) * 4;
        if (rgba[si + 3] === 0) continue;
        const tx = x + offX;
        const ty = y + offY;
        if (tx < 0 || tx >= WORK_TILE || ty < 0 || ty >= WORK_TILE) continue;
        const wi = (ty * WORK_TILE + tx) * 4;
        work.set(rgba.subarray(si, si + 4), wi);
      }
    }
    const tile = downsample(work);
    const tileX = col * TILE;
    const tileY = row * TILE;
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((tileY + y) * sheetW + tileX) * 4;
      sheet.set(tile.subarray(from, from + TILE * 4), to);
    }
  }
}

const png = encodePng(sheet, sheetW, sheetW);
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (4x4 frames, ${TILE}px each)`);

// The sidecar JSON is the single source of truth for frame names and order.
const layout = JSON.parse(readFileSync(LAYOUT, "utf8")) as {
  sprites: { name: string; frame: number }[];
};
const camel = (s: string) => s.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
const poseLines = layout.sprites
  .sort((a, b) => a.frame - b.frame)
  .map((s) => `  ${camel(s.name)}: ${s.frame},`)
  .join("\n");
const b64 = Buffer.from(png).toString("base64");
const module = `// GENERATED by tools/gen-jellyfish-atlas.ts - do not edit by hand.
// A clean 16-frame jellyfish pose atlas (4x4 grid of ${TILE}px cells) normalized from
// art/jellyfish-atlas-transparent.png: the bell-pulse cycle, glide/streaming poses,
// hover variety, turns, and the flare/recoil. Each pose is bell-anchored horizontally
// and centred in its cell; the pulse state machine in cephalopod.ts picks the frame.
export const JELLYFISH_ATLAS = "data:image/png;base64,${b64}";
export const JELLYFISH_ATLAS_COLS = 4;
export const JELLYFISH_ATLAS_ROWS = 4;
export const JELLYFISH_ATLAS_CELL = ${TILE};
export const JELLYFISH_FRAMES = ${4 * 4};
// Atlas frame index for each named pose (row-major, from ${LAYOUT}).
export const JELLYFISH_POSE = {
${poseLines}
} as const;
`;
writeFileSync(OUT_TS, module);
console.log(`wrote ${OUT_TS} (${(module.length / 1024).toFixed(0)} KB) — 16 poses`);

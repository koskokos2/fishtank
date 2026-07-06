// Normalize the generated nautilus pose sheet into a clean 4x4 runtime atlas,
// then embed it as src/nautilusAtlas.ts with named frame indices.
//
// The source has uneven gutters. Fixed cuts pass only through empty space; each
// pose is shell-anchored and box-filtered into a padded 128px tile so tentacles
// and the jet effect cannot bleed into a neighbouring frame.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const SRC = "art/nautilus-atlas-transparent.png";
const LAYOUT = "art/nautilus-atlas-128.json";
const OUT = "art/nautilus-atlas-128.png";
const OUT_TS = "src/nautilusAtlas.ts";
const TILE = 128;
// Extra horizontal room preserves the longest exploration/jet poses while the
// shell remains at one fixed anchor in every frame.
const WORK_TILE = 388;
const COL_CUTS = [0, 292, 616, 922, 1254] as const;
const ROW_CUTS = [0, 316, 607, 907, 1254] as const;

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
  if (maxX < minX) throw new Error("empty nautilus source region");
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// The shell dominates the right half of every left-facing pose. Its alpha
// centroid is a steadier animation anchor than the full bbox, whose centre moves
// dramatically as tentacles extend, curl, or retract.
function shellAnchor(bb: Rect): { x: number; y: number } {
  const shellLeft = bb.x + Math.round(bb.w * 0.5);
  let weightedX = 0;
  let weightedY = 0;
  let weight = 0;
  for (let y = bb.y; y < bb.y + bb.h; y++) {
    for (let x = shellLeft; x < bb.x + bb.w; x++) {
      const alpha = rgba[(y * w + x) * 4 + 3];
      weightedX += x * alpha;
      weightedY += y * alpha;
      weight += alpha;
    }
  }
  return weight
    ? { x: weightedX / weight, y: weightedY / weight }
    : { x: bb.x + bb.w * 0.72, y: bb.y + bb.h / 2 };
}

// Area-average with premultiplied alpha. This keeps the tiny tentacles readable
// while preventing dark or green fringes around translucent edge pixels.
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

const sheetW = TILE * 4;
const sheet = new Uint8Array(sheetW * sheetW * 4);
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 4; col++) {
    const bb = bboxes[row * 4 + col];
    const anchor = shellAnchor(bb);
    const work = new Uint8Array(WORK_TILE * WORK_TILE * 4);
    // Shell sits slightly right of tile centre, leaving room for left-facing arms.
    const offX = Math.round(WORK_TILE * 0.59 - anchor.x);
    const offY = Math.round(WORK_TILE * 0.5 - anchor.y);
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

const layout = JSON.parse(readFileSync(LAYOUT, "utf8")) as {
  sprites: { name: string; frame: number }[];
};
const camel = (s: string) => s.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
const poseLines = layout.sprites
  .sort((a, b) => a.frame - b.frame)
  .map((s) => `  ${camel(s.name)}: ${s.frame},`)
  .join("\n");
const b64 = Buffer.from(png).toString("base64");
const module = `// GENERATED by tools/gen-nautilus-atlas.ts - do not edit by hand.
// A clean 16-frame nautilus pose atlas (4x4 grid of ${TILE}px cells), normalized
// around the rigid shell while the head, siphon, and tentacles articulate.
export const NAUTILUS_ATLAS = "data:image/png;base64,${b64}";
export const NAUTILUS_ATLAS_COLS = 4;
export const NAUTILUS_ATLAS_ROWS = 4;
export const NAUTILUS_ATLAS_CELL = ${TILE};
export const NAUTILUS_FRAMES = 16;
export const NAUTILUS_POSE = {
${poseLines}
} as const;
`;
writeFileSync(OUT_TS, module);
console.log(`wrote ${OUT_TS} (${(module.length / 1024).toFixed(0)} KB) — 16 poses`);

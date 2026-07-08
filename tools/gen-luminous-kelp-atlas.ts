// Normalize the generated 4x4 giant-kelp component sheet into one coherent
// runtime atlas. Every part is cropped independently, downsampled with
// premultiplied alpha, and placed around a shared 256px hinge. Bottom-rooted
// pieces grow upward from the hinge; hanging tendrils/pods grow downward.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const SRC = "art/luminous-kelp-atlas-v3-transparent.png";
const OUT = "art/luminous-kelp-atlas-v3-256.png";
const OUT_META = "art/luminous-kelp-atlas-v3-256.json";
const OUT_TS = "src/luminousKelpAtlas.ts";
const COLS = 4;
const ROWS = 4;
const TILE = 256;
const HINGE = TILE / 2;
const PAD = 9;
const ALPHA_MIN = 20;

type Edge = "top" | "bottom" | "center";
type Buf = { data: Uint8Array; w: number; h: number };
type Part = {
  name: string;
  edge: Edge;
  maxWidth?: number;
  maxHeight?: number;
  rootBlend?: boolean;
};

// Row-major order matches the deliberately authored source sheet.
const PARTS: Part[] = [
  { name: "holdfast", edge: "bottom", maxWidth: 230, maxHeight: 119, rootBlend: true },
  { name: "straightStem", edge: "bottom", maxWidth: 150, maxHeight: 119 },
  { name: "leftStem", edge: "bottom", maxWidth: 190, maxHeight: 119 },
  { name: "rightStem", edge: "bottom", maxWidth: 190, maxHeight: 119 },
  { name: "leftBranch", edge: "bottom", maxWidth: 230, maxHeight: 118 },
  { name: "rightBranch", edge: "bottom", maxWidth: 230, maxHeight: 118 },
  { name: "forkedCrown", edge: "bottom", maxWidth: 230, maxHeight: 119 },
  { name: "rightCanopy", edge: "bottom", maxWidth: 232, maxHeight: 119 },
  { name: "leftCanopy", edge: "bottom", maxWidth: 232, maxHeight: 119 },
  { name: "featheryTuft", edge: "bottom", maxWidth: 210, maxHeight: 119 },
  { name: "largePods", edge: "top", maxWidth: 200, maxHeight: 116 },
  { name: "smallPods", edge: "top", maxWidth: 150, maxHeight: 112 },
  { name: "trailingTendril", edge: "top", maxWidth: 110, maxHeight: 116 },
  { name: "forkedTendril", edge: "top", maxWidth: 180, maxHeight: 116 },
  { name: "foliageCollar", edge: "center", maxWidth: 170, maxHeight: 170 },
  { name: "fanCrown", edge: "bottom", maxWidth: 230, maxHeight: 119 },
];

const src = decodePng(readFileSync(SRC));

function sourceCell(index: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x0 = Math.round((col * src.w) / COLS);
  const x1 = Math.round(((col + 1) * src.w) / COLS);
  const y0 = Math.round((row * src.h) / ROWS);
  const y1 = Math.round(((row + 1) * src.h) / ROWS);
  return { x0, y0, x1, y1 };
}

function alphaBounds(cell: ReturnType<typeof sourceCell>) {
  let minX = cell.x1;
  let minY = cell.y1;
  let maxX = cell.x0 - 1;
  let maxY = cell.y0 - 1;
  for (let y = cell.y0; y < cell.y1; y++)
    for (let x = cell.x0; x < cell.x1; x++) {
      if (src.rgba[(y * src.w + x) * 4 + 3] < ALPHA_MIN) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (maxX < minX || maxY < minY) throw new Error("empty kelp source cell");
  return { minX, minY, maxX, maxY };
}

function crop(x0: number, y0: number, w: number, h: number): Buf {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * src.w + x0) * 4;
    data.set(src.rgba.subarray(from, from + w * 4), y * w * 4);
  }
  return { data, w, h };
}

function resize(input: Buf, outW: number, outH: number): Buf {
  const data = new Uint8Array(outW * outH * 4);
  const sxScale = input.w / outW;
  const syScale = input.h / outH;
  for (let dy = 0; dy < outH; dy++) {
    const sy0 = dy * syScale;
    const sy1 = (dy + 1) * syScale;
    for (let dx = 0; dx < outW; dx++) {
      const sx0 = dx * sxScale;
      const sx1 = (dx + 1) * sxScale;
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
          if (!area) continue;
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

function edgeCentre(part: Buf, edge: "top" | "bottom") {
  // The generated fronds can extend farther than the load-bearing stem. Search
  // progressively inward and use opaque, dark-green pixels so a stray hair or
  // amber halo cannot drag the anatomical socket sideways.
  const greenWeight = (i: number) => {
    const a = part.data[i + 3];
    const r = part.data[i];
    const g = part.data[i + 1];
    const b = part.data[i + 2];
    return a >= 80 && g >= r * 0.72 && g >= b * 0.72 ? a : 0;
  };
  for (let depth = 0; depth < Math.min(30, part.h); depth++) {
    const y = edge === "top" ? depth : part.h - 1 - depth;
    let weightedX = 0;
    let weight = 0;
    for (let x = 0; x < part.w; x++) {
      const w = greenWeight((y * part.w + x) * 4);
      weightedX += x * w;
      weight += w;
    }
    if (weight > 255) return weightedX / weight;
  }
  return part.w / 2;
}

function rootDither(part: Buf) {
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const band = Math.min(12, part.h);
  for (let y = part.h - band; y < part.h; y++) {
    const keep = (part.h - y) / band;
    for (let x = 0; x < part.w; x++) {
      const i = (y * part.w + x) * 4;
      if (part.data[i + 3] === 0) continue;
      const threshold = (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      if (threshold > keep) part.data[i + 3] = 0;
    }
  }
}

const sheetW = COLS * TILE;
const sheetH = ROWS * TILE;
const sheet = new Uint8Array(sheetW * sheetH * 4);
const layout: Record<string, unknown> = {};
const partIds: Record<string, number> = {};
const tips: Record<string, { x: number; y: number }> = {};

PARTS.forEach((spec, index) => {
  const bounds = alphaBounds(sourceCell(index));
  const raw = crop(
    bounds.minX,
    bounds.minY,
    bounds.maxX - bounds.minX + 1,
    bounds.maxY - bounds.minY + 1,
  );
  const scale = Math.min(
    (spec.maxWidth ?? TILE - PAD * 2) / raw.w,
    (spec.maxHeight ?? TILE - PAD * 2) / raw.h,
    1,
  );
  const sprite = resize(raw, Math.max(1, Math.round(raw.w * scale)), Math.max(1, Math.round(raw.h * scale)));
  if (spec.rootBlend) rootDither(sprite);

  const bottomX = edgeCentre(sprite, "bottom");
  const topX = edgeCentre(sprite, "top");
  let pivotX = sprite.w / 2;
  let pivotY = sprite.h / 2;
  let tipX = sprite.w / 2;
  let tipY = 0;
  if (spec.edge === "bottom") {
    pivotX = bottomX;
    pivotY = sprite.h - 1;
    tipX = topX;
    tipY = 0;
  } else if (spec.edge === "top") {
    pivotX = topX;
    pivotY = 0;
    tipX = bottomX;
    tipY = sprite.h - 1;
  }
  const drawX = Math.round(HINGE - pivotX);
  const drawY = Math.round(HINGE - pivotY);
  if (drawX < 0 || drawY < 0 || drawX + sprite.w > TILE || drawY + sprite.h > TILE)
    throw new Error(`${spec.name} does not fit ${TILE}px tile at ${drawX},${drawY} (${sprite.w}x${sprite.h})`);

  const cellX = (index % COLS) * TILE;
  const cellY = Math.floor(index / COLS) * TILE;
  for (let y = 0; y < sprite.h; y++)
    for (let x = 0; x < sprite.w; x++) {
      const si = (y * sprite.w + x) * 4;
      if (!sprite.data[si + 3]) continue;
      const di = ((cellY + drawY + y) * sheetW + cellX + drawX + x) * 4;
      sheet.set(sprite.data.subarray(si, si + 4), di);
    }

  const tip = { x: Math.round(tipX - pivotX), y: Math.round(tipY - pivotY) };
  tips[spec.name] = tip;
  partIds[spec.name] = index;
  layout[spec.name] = {
    frame: index,
    cell: { col: index % COLS, row: Math.floor(index / COLS) },
    pivot: { x: HINGE, y: HINGE },
    draw: { x: drawX, y: drawY, width: sprite.w, height: sprite.h },
    tip,
    attachment: spec.edge,
  };
});

const png = encodePng(sheet, sheetW, sheetH);
writeFileSync(OUT, png);
writeFileSync(
  OUT_META,
  JSON.stringify({
    name: "luminous-giant-kelp",
    source: SRC,
    layout: { columns: COLS, rows: ROWS, tile: TILE },
    parts: layout,
  }, null, 2) + "\n",
);
writeFileSync(
  OUT_TS,
  `// GENERATED by tools/gen-luminous-kelp-atlas.ts - do not edit by hand.\n` +
    `// One coherent giant-kelp species: articulated hairy stems, crowns, tendrils, and amber pods.\n` +
    `export const LUMINOUS_KELP_ATLAS = "data:image/png;base64,${Buffer.from(png).toString("base64")}";\n` +
    `export const LUMINOUS_KELP_COLS = ${COLS};\n` +
    `export const LUMINOUS_KELP_ROWS = ${ROWS};\n` +
    `export const LUMINOUS_KELP_TILE = ${TILE};\n` +
    `export const LUMINOUS_KELP_PART = ${JSON.stringify(partIds)} as const;\n` +
    `export const LUMINOUS_KELP_TIP = ${JSON.stringify(tips)} as const;\n`,
);
console.log(`wrote ${OUT}, ${OUT_META}, and ${OUT_TS}`);

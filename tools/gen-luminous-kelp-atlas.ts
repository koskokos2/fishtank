// Bake the generated six-panel fantasy kelp sheet into a runtime atlas. Every
// component's anatomical attachment point is placed at the exact centre of its
// tile, so Kaplay's centre anchor becomes a useful hinge for modular animation.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const SRC = "art/luminous-kelp-atlas-v2-transparent.png";
const OUT = "art/luminous-kelp-atlas-v2-256.png";
const BUSHY_SRC = "art/luminous-kelp-atlas-256.png";
const OUT_TS = "src/luminousKelpAtlas.ts";
const OUT_META = "art/luminous-kelp-atlas-v2-256.json";
const TILE = 256;
const COLS = 3;
const ROWS = 2;
const ALPHA_MIN = 24;

type Region = { x0: number; y0: number; x1: number; y1: number };
type Edge = "top" | "bottom";
type Part = {
  name: string;
  region: Region;
  scale: number;
  attachmentEdge: Edge;
};

const PARTS: Part[] = [
  { name: "base", region: { x0: 0, y0: 0, x1: 512, y1: 512 }, scale: 0.27, attachmentEdge: "bottom" },
  { name: "lowerStem", region: { x0: 512, y0: 0, x1: 1024, y1: 512 }, scale: 0.25, attachmentEdge: "bottom" },
  { name: "middleStem", region: { x0: 1024, y0: 0, x1: 1536, y1: 512 }, scale: 0.25, attachmentEdge: "bottom" },
  { name: "podStem", region: { x0: 0, y0: 512, x1: 512, y1: 1024 }, scale: 0.26, attachmentEdge: "bottom" },
  { name: "crown", region: { x0: 512, y0: 512, x1: 1024, y1: 1024 }, scale: 0.26, attachmentEdge: "bottom" },
  { name: "sideShoot", region: { x0: 1024, y0: 512, x1: 1536, y1: 1024 }, scale: 0.27, attachmentEdge: "bottom" },
];

type Buf = { data: Uint8Array; w: number; h: number };
const src = decodePng(readFileSync(SRC));
if (src.w !== 1536 || src.h !== 1024)
  throw new Error(`expected a 1536x1024 source, got ${src.w}x${src.h}`);

function alphaBounds(region: Region) {
  let minX = region.x1;
  let minY = region.y1;
  let maxX = region.x0 - 1;
  let maxY = region.y0 - 1;
  for (let y = region.y0; y < region.y1; y++)
    for (let x = region.x0; x < region.x1; x++) {
      const alpha = src.rgba[(y * src.w + x) * 4 + 3];
      if (alpha < ALPHA_MIN) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (maxX < minX || maxY < minY) throw new Error("empty component region");
  return { minX, minY, maxX, maxY };
}

function attachmentX(
  bounds: ReturnType<typeof alphaBounds>,
  edge: Edge,
) {
  const band = 24;
  const y0 = edge === "top" ? bounds.minY : Math.max(bounds.minY, bounds.maxY - band);
  const y1 = edge === "top" ? Math.min(bounds.maxY, bounds.minY + band) : bounds.maxY;
  let weightedX = 0;
  let weight = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const alpha = src.rgba[(y * src.w + x) * 4 + 3];
      if (alpha < ALPHA_MIN) continue;
      weightedX += x * alpha;
      weight += alpha;
    }
  return weight ? weightedX / weight : (bounds.minX + bounds.maxX) / 2;
}

function crop(x0: number, y0: number, w: number, h: number): Buf {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * src.w + x0) * 4;
    data.set(src.rgba.subarray(from, from + w * 4), y * w * 4);
  }
  return { data, w, h };
}

// Premultiplied-alpha area sampling keeps the original deliberate pixel clusters
// while avoiding dark or magenta colour bleed at transparent edges.
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

const sheetW = COLS * TILE;
const sheetH = ROWS * TILE;
const sheet = new Uint8Array(sheetW * sheetH * 4);
const metadata: Record<string, unknown> = {};
const tips: Record<string, { x: number; y: number }> = {};

for (let index = 0; index < PARTS.length; index++) {
  const part = PARTS[index];
  const b = alphaBounds(part.region);
  const sourceW = b.maxX - b.minX + 1;
  const sourceH = b.maxY - b.minY + 1;
  const drawW = Math.max(1, Math.round(sourceW * part.scale));
  const drawH = Math.max(1, Math.round(sourceH * part.scale));
  const pivotSourceX = attachmentX(b, part.attachmentEdge);
  const pivotSourceY = part.attachmentEdge === "top" ? b.minY : b.maxY;
  const tipSourceX = attachmentX(b, part.attachmentEdge === "top" ? "bottom" : "top");
  const tipSourceY = part.attachmentEdge === "top" ? b.maxY : b.minY;
  const pivotDrawX = (pivotSourceX - b.minX) * part.scale;
  const pivotDrawY = (pivotSourceY - b.minY) * part.scale;
  const drawX = Math.round(TILE / 2 - pivotDrawX);
  const drawY = Math.round(TILE / 2 - pivotDrawY);
  if (drawX < 0 || drawY < 0 || drawX + drawW > TILE || drawY + drawH > TILE)
    throw new Error(`${part.name} does not fit its tile: ${drawX},${drawY} ${drawW}x${drawH}`);

  const sprite = resize(crop(b.minX, b.minY, sourceW, sourceH), drawW, drawH);
  const cellX = (index % COLS) * TILE;
  const cellY = Math.floor(index / COLS) * TILE;
  for (let y = 0; y < drawH; y++)
    for (let x = 0; x < drawW; x++) {
      const si = (y * drawW + x) * 4;
      if (sprite.data[si + 3] === 0) continue;
      const di = ((cellY + drawY + y) * sheetW + cellX + drawX + x) * 4;
      sheet.set(sprite.data.subarray(si, si + 4), di);
    }

  metadata[part.name] = {
    frame: index,
    cell: { col: index % COLS, row: Math.floor(index / COLS) },
    pivot: { x: TILE / 2, y: TILE / 2 },
    draw: { x: drawX, y: drawY, width: drawW, height: drawH },
    tip: {
      x: Math.round((tipSourceX - pivotSourceX) * part.scale),
      y: Math.round((tipSourceY - pivotSourceY) * part.scale),
    },
  };
  tips[part.name] = {
    x: Math.round((tipSourceX - pivotSourceX) * part.scale),
    y: Math.round((tipSourceY - pivotSourceY) * part.scale),
  };
}

const png = encodePng(sheet, sheetW, sheetH);
writeFileSync(OUT, png);
const b64 = Buffer.from(png).toString("base64");
const bushyPng = readFileSync(BUSHY_SRC);
const bushy = decodePng(bushyPng);
if (bushy.w !== COLS * TILE || bushy.h !== ROWS * TILE)
  throw new Error(`expected a ${COLS * TILE}x${ROWS * TILE} bushy atlas, got ${bushy.w}x${bushy.h}`);
const bushyB64 = Buffer.from(bushyPng).toString("base64");
writeFileSync(
  OUT_TS,
  `// GENERATED by tools/gen-luminous-kelp-atlas.ts - do not edit by hand.\n` +
    `// Six modular plant parts, each with its attachment pivot at tile centre.\n` +
    `export const LUMINOUS_KELP_ATLAS = "data:image/png;base64,${b64}";\n` +
    `export const LUMINOUS_KELP_COLS = ${COLS};\n` +
    `export const LUMINOUS_KELP_ROWS = ${ROWS};\n` +
    `export const LUMINOUS_KELP_TILE = ${TILE};\n` +
    `export const LUMINOUS_KELP_PART = { base: 0, lowerStem: 1, middleStem: 2, podStem: 3, crown: 4, sideShoot: 5 } as const;\n` +
    `export const LUMINOUS_KELP_TIP = ${JSON.stringify(tips)} as const;\n` +
    `// Earlier, fuller modules retained for the hybrid crown and magical fruit.\n` +
    `export const LUMINOUS_KELP_BUSHY_ATLAS = "data:image/png;base64,${bushyB64}";\n` +
    `export const LUMINOUS_KELP_BUSHY_PART = { base: 0, leftBranch: 1, rightBranch: 2, crown: 3, tendrils: 4, pods: 5 } as const;\n`,
);
writeFileSync(
  OUT_META,
  JSON.stringify(
    {
      name: "luminous-kelp",
      layout: { columns: COLS, rows: ROWS, tile: TILE },
      source: SRC,
      parts: metadata,
    },
    null,
    2,
  ) + "\n",
);
console.log(`wrote ${OUT}, ${OUT_TS}, and ${OUT_META}`);

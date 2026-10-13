// Deterministic, offline source normalization and precomposed directional frames.
// Run bun run birthday:atlas after changing the source art, metadata or QR URLs.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";
import { BIRTHDAY_QR } from "../src/birthdayQr";

const spec = JSON.parse(readFileSync("art/birthday-fish-source.json", "utf8")) as {
  source: string; sourceRows: number; sourceRowBounds?: number[];
  frameWidth: number; frameHeight: number; modulePixels: number;
  sprites: { name: string; row: number; qr: { x: number; y: number };
    ink: [number, number, number]; enamel: [number, number, number]; tailStart: number }[];
};
const source = decodePng(readFileSync(`art/${spec.source}`));
const W = spec.frameWidth, H = spec.frameHeight, COLS = 4, ROWS = 6;
const sheetW = W * COLS, sheetH = H * ROWS;
if (sheetW > 2048 || sheetH > 2048) throw new Error("Birthday atlas exceeds texture page");
const sheet = new Uint8Array(sheetW * sheetH * 4);
const preview = new Uint8Array(W * H * 3 * 4);
const medallionPreview = new Uint8Array(W * H * 3 * 4);
const layouts = [];

for (const [index, sprite] of spec.sprites.entries()) {
  const y0 = spec.sourceRowBounds?.[sprite.row] ?? Math.round(sprite.row * source.h / spec.sourceRows);
  const y1 = spec.sourceRowBounds?.[sprite.row + 1] ?? Math.round((sprite.row + 1) * source.h / spec.sourceRows);
  let left = source.w, top = y1, right = 0, bottom = y0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < source.w; x++) {
    if (source.rgba[(y * source.w + x) * 4 + 3] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right <= left || bottom <= top) throw new Error(`Empty source: ${sprite.name}`);
  if (top <= y0 + 2 || bottom >= y1 - 3) throw new Error(`Source crosses its cell: ${sprite.name}`);
  const scale = Math.min((W - 24) / (right - left + 1), (H - 24) / (bottom - top + 1));
  const width = Math.round((right - left + 1) * scale);
  const height = Math.round((bottom - top + 1) * scale);
  const ox = Math.floor((W - width) / 2), oy = Math.floor((H - height) / 2);
  const base = new Uint8Array(W * H * 4);
  // Nearest-neighbour sampling at native scene density; no blur or colour key.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(right, left + Math.floor(x / scale));
    const sy = Math.min(bottom, top + Math.floor(y / scale));
    const si = (sy * source.w + sx) * 4;
    const di = ((y + oy) * W + x + ox) * 4;
    if (source.rgba[si + 3] < 128) continue;
    base.set(source.rgba.subarray(si, si + 3), di);
    base[di + 3] = 255;
  }
  preview.set(base, index * W * H * 4);
  const qrSize = 33 * spec.modulePixels;
  if (sprite.qr.x + qrSize > sprite.tailStart) throw new Error("QR must stay in the rigid body");
  for (let direction = 0; direction < 2; direction++) {
    for (let frame = 0; frame < 4; frame++) {
      const pixels = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const si = (y * W + x) * 4;
        if (!base[si + 3]) continue;
        // Only the tail bends. The head, body and QR anchor never move between
        // frames. Mirroring happens BEFORE the QR is composited.
        const reach = Math.max(0, (x - sprite.tailStart) / (W - sprite.tailStart));
        const dy = y + Math.round(5 * reach * Math.sin(frame * Math.PI / 2));
        const dx = direction ? W - 1 - x : x;
        if (dy < 4 || dy >= H - 4) throw new Error("Animation exhausts atlas gutter");
        pixels.set(base.subarray(si, si + 4), (dy * W + dx) * 4);
      }
      const qrX = direction ? W - sprite.qr.x - qrSize : sprite.qr.x;
      for (let y = 0; y < qrSize; y++) for (let x = 0; x < qrSize; x++) {
        const mx = Math.floor(x / spec.modulePixels) - 4;
        const my = Math.floor(y / spec.modulePixels) - 4;
        const dark = mx >= 0 && mx < 25 && my >= 0 && my < 25 && BIRTHDAY_QR[index].rows[my][mx] === "1";
        const di = ((sprite.qr.y + y) * W + qrX + x) * 4;
        // The code is enamel inlay: flat palette colours preserve contrast and
        // the quiet zone; generated shading and gems stay outside the inset.
        pixels.set([...(dark ? sprite.ink : sprite.enamel), 255], di);
      }
      const frameIndex = index * 8 + direction * 4 + frame;
      if (direction === 0 && frame === 0) medallionPreview.set(pixels, index * W * H * 4);
      for (let y = 0; y < H; y++) {
        const destination = ((Math.floor(frameIndex / COLS) * H + y) * sheetW + (frameIndex % COLS) * W) * 4;
        sheet.set(pixels.subarray(y * W * 4, (y + 1) * W * 4), destination);
      }
    }
  }
  layouts.push({ name: sprite.name, left: index * 8, right: index * 8 + 4,
    qr: { ...sprite.qr, size: qrSize, modulePixels: spec.modulePixels,
      ink: sprite.ink, enamel: sprite.enamel }, pivot: { x: W / 2, y: H / 2 },
    sourceBounds: { left, top, right, bottom }, normalizedBounds: { x: ox, y: oy, width, height } });
}
const png = encodePng(sheet, sheetW, sheetH);
writeFileSync("art/birthday-fish-atlas.png", png);
writeFileSync("art/birthday-fish-normalized.png", encodePng(preview, W, H * 3));
writeFileSync("art/birthday-medallion-preview.png", encodePng(medallionPreview, W, H * 3));
writeFileSync("art/birthday-fish-atlas.json", JSON.stringify({
  source: spec.source, columns: COLS, rows: ROWS, frameWidth: W, frameHeight: H,
  modulePixels: spec.modulePixels, quietZoneModules: 4, framesPerDirection: 4, sprites: layouts,
}, null, 2) + "\n");
writeFileSync("src/birthdayFishAtlas.ts", `// GENERATED by tools/gen-birthday-atlas.ts. Do not edit.\n` +
  `export const BIRTHDAY_ATLAS = "data:image/png;base64,${png.toString("base64")}";\n` +
  `export const BIRTHDAY_ATLAS_COLS = ${COLS};\nexport const BIRTHDAY_ATLAS_ROWS = ${ROWS};\n` +
  `export const BIRTHDAY_FRAME_WIDTH = ${W};\nexport const BIRTHDAY_FRAME_HEIGHT = ${H};\n` +
  `export const BIRTHDAY_LAYOUT = ${JSON.stringify(layouts, null, 2)} as const;\n`);
console.log(`Birthday atlas: ${sheetW}x${sheetH}, 24 frames (three fish, two directions, four swim poses).`);

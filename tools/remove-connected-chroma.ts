// Convert a chroma-key generated atlas to transparent alpha without globally
// deleting subject colours that resemble the key. Unlike a plain RGB threshold,
// this removes key-coloured pixels connected to the image border plus enclosed
// holes that exactly match the key, and it despills only from confirmed
// non-background neighbours so matte colour is not copied into the subject.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error("Usage: bun tools/remove-connected-chroma.ts <input.png> <output.png>");
  process.exit(2);
}

const transparentThreshold = Number(process.env.TRANSPARENT_THRESHOLD ?? 12);
const opaqueThreshold = Number(process.env.OPAQUE_THRESHOLD ?? 220);
const searchRadius = Number(process.env.DESPILL_RADIUS ?? 4);

function keyFromBorder(rgba: Uint8Array, w: number, h: number) {
  const samples: [number, number, number][] = [];
  for (let x = 0; x < w; x++) {
    samples.push(pixel(rgba, w, x, 0), pixel(rgba, w, x, h - 1));
  }
  for (let y = 1; y < h - 1; y++) {
    samples.push(pixel(rgba, w, 0, y), pixel(rgba, w, w - 1, y));
  }
  samples.sort((a, b) => luminance(a) - luminance(b));
  const mid = samples.slice(Math.floor(samples.length * 0.4), Math.ceil(samples.length * 0.6));
  return mid.reduce(
    (sum, rgb) => [sum[0] + rgb[0], sum[1] + rgb[1], sum[2] + rgb[2]] as [number, number, number],
    [0, 0, 0],
  ).map((value) => Math.round(value / mid.length)) as [number, number, number];
}

function pixel(rgba: Uint8Array, w: number, x: number, y: number): [number, number, number] {
  const i = (y * w + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2]];
}

function luminance([r, g, b]: [number, number, number]) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function distance(rgba: Uint8Array, index: number, key: [number, number, number]) {
  const dr = rgba[index] - key[0];
  const dg = rgba[index + 1] - key[1];
  const db = rgba[index + 2] - key[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function alphaForDistance(d: number) {
  if (d <= transparentThreshold) return 0;
  if (d >= opaqueThreshold) return 255;
  const t = (d - transparentThreshold) / (opaqueThreshold - transparentThreshold);
  const eased = t * t * (3 - 2 * t);
  return Math.round(eased * 255);
}

function connectedBackground(rgba: Uint8Array, w: number, h: number, key: [number, number, number]) {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const maybePush = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    if (distance(rgba, p * 4, key) >= opaqueThreshold) return;
    seen[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    maybePush(x, 0);
    maybePush(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    maybePush(0, y);
    maybePush(w - 1, y);
  }
  // Chroma can appear in enclosed holes inside a sprite silhouette. Those pixels
  // are not border-connected, but if they match the border key very closely they
  // are matte, not subject detail. Seed them and let the same connected expansion
  // remove their antialiased rim.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (seen[p] || distance(rgba, p * 4, key) > transparentThreshold) continue;
      maybePush(x, y);
    }
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = Math.floor(p / w);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox || oy) maybePush(x + ox, y + oy);
      }
    }
  }
  return seen;
}

function copyNearestSolidColor(
  source: Uint8Array,
  out: Uint8Array,
  background: Uint8Array,
  key: [number, number, number],
  w: number,
  h: number,
  x: number,
  y: number,
  outIndex: number,
): boolean {
  for (let radius = 1; radius <= searchRadius; radius++) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const np = ny * w + nx;
        const ni = (ny * w + nx) * 4;
        if (background[np] || distance(source, ni, key) < opaqueThreshold) continue;
        red += source[ni];
        green += source[ni + 1];
        blue += source[ni + 2];
        count++;
      }
    }
    if (!count) continue;
    out[outIndex] = Math.round(red / count);
    out[outIndex + 1] = Math.round(green / count);
    out[outIndex + 2] = Math.round(blue / count);
    return true;
  }
  out[outIndex] = 0;
  out[outIndex + 1] = 0;
  out[outIndex + 2] = 0;
  return false;
}

const image = decodePng(readFileSync(input));
const key = keyFromBorder(image.rgba, image.w, image.h);
const background = connectedBackground(image.rgba, image.w, image.h, key);
const out = new Uint8Array(image.rgba);
let transparentPixels = 0;
let partialPixels = 0;

for (let y = 0; y < image.h; y++) {
  for (let x = 0; x < image.w; x++) {
    const p = y * image.w + x;
    const i = p * 4;
    if (image.rgba[i] === 255 && image.rgba[i + 1] === 0 && image.rgba[i + 2] === 255) {
      out.fill(0, i, i + 4);
      transparentPixels++;
      continue;
    }
    if (distance(image.rgba, i, key) <= transparentThreshold) {
      out.fill(0, i, i + 4);
      transparentPixels++;
      continue;
    }
    if (!background[p]) {
      out[i + 3] = 255;
      continue;
    }
    const alpha = alphaForDistance(distance(image.rgba, i, key));
    out[i + 3] = alpha;
    if (alpha === 0) {
      out.fill(0, i, i + 4);
      transparentPixels++;
    } else if (alpha < 255) {
      if (copyNearestSolidColor(image.rgba, out, background, key, image.w, image.h, x, y, i)) {
        partialPixels++;
      } else {
        out.fill(0, i, i + 4);
        transparentPixels++;
      }
    }
  }
}

writeFileSync(output, encodePng(out, image.w, image.h));
console.log(`wrote ${output}`);
console.log(`key: #${key.map((n) => n.toString(16).padStart(2, "0")).join("")}`);
console.log(`transparent pixels: ${transparentPixels}/${image.w * image.h}`);
console.log(`partially transparent pixels: ${partialPixels}/${image.w * image.h}`);

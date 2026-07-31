// Build the runtime surface-caustic sprite from one black-background master.
// The source is only responsible for the still composition; full-width fitting,
// grading, alpha, cleanup, and animation frames are deterministic here.
import { readFileSync, writeFileSync } from "node:fs";
import { clamp01, lerp } from "../src/color";
import { decodePng, encodePng } from "./png";

const SRC = "art/caustics-master.png";
const OUT = "art/caustics-frames.png";
const OUT_TS = "src/causticsSprite.ts";
const FRAME_W = 1920;
const FRAME_H = 384;
const FRAMES = 4;
const BORDER = 2;
const ALPHA_FLOOR = 0.05;
const MIN_COMPONENT = 8;

type Buf = { data: Uint8Array; w: number; h: number };

const DIM_AQUA = [25, 126, 156] as const;
const MID_AQUA = [91, 207, 211] as const;
const PALE_CORE = [235, 255, 246] as const;
const FRAME_JITTER = [1, 1.018, 0.985, 1.008] as const;

const luminance = (r: number, g: number, b: number) =>
  (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hotspot(src: Buf) {
  let peak = 0;
  for (let i = 0; i < src.data.length; i += 4)
    peak = Math.max(
      peak,
      luminance(src.data[i], src.data[i + 1], src.data[i + 2]),
    );
  if (peak < 0.15)
    throw new Error(`${SRC} is too dark to contain a usable light map`);

  let sumX = 0;
  let sumY = 0;
  let sum = 0;
  const threshold = peak * 0.72;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      const l = luminance(src.data[i], src.data[i + 1], src.data[i + 2]);
      if (l < threshold) continue;
      const w = Math.pow((l - threshold) / Math.max(0.001, peak - threshold), 2);
      sumX += x * w;
      sumY += y * w;
      sum += w;
    }
  if (!sum) throw new Error(`${SRC} has no identifiable hotspot`);
  return { x: sumX / sum, y: sumY / sum, peak };
}

function sampleBilinear(src: Buf, x: number, y: number) {
  if (x < 0 || y < 0 || x >= src.w - 1 || y >= src.h - 1)
    return [0, 0, 0] as const;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const channel = (c: number) => {
    const a = src.data[(y0 * src.w + x0) * 4 + c];
    const b = src.data[(y0 * src.w + x0 + 1) * 4 + c];
    const d = src.data[((y0 + 1) * src.w + x0) * 4 + c];
    const e = src.data[((y0 + 1) * src.w + x0 + 1) * 4 + c];
    return lerp(lerp(a, b, tx), lerp(d, e, tx), ty);
  };
  return [channel(0), channel(1), channel(2)] as const;
}

function fitFrame(src: Buf): Buf {
  const data = new Uint8Array(FRAME_W * FRAME_H * 4);
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const u = x / Math.max(1, FRAME_W - 1);
      const v = y / Math.max(1, FRAME_H - 1);
      // Image generation produces a conventional wide frame, while runtime
      // needs a shallow 5:1 surface strip. A curved vertical remap retains more
      // space for the dense top detail and compresses the long dark fade.
      const [r, g, b] = sampleBilinear(
        src,
        u * (src.w - 1),
        Math.pow(v, 1.35) * (src.h - 1),
      );
      const i = (y * FRAME_W + x) * 4;
      data[i] = Math.round(r);
      data[i + 1] = Math.round(g);
      data[i + 2] = Math.round(b);
      data[i + 3] = 255;
    }
  return { data, w: FRAME_W, h: FRAME_H };
}

function whitePoint(buf: Buf) {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < buf.data.length; i += 4) {
    const l = Math.round(
      luminance(buf.data[i], buf.data[i + 1], buf.data[i + 2]) * 255,
    );
    histogram[l]++;
  }
  const target = Math.floor((buf.w * buf.h) * 0.9995);
  let seen = 0;
  for (let i = 0; i < histogram.length; i++) {
    seen += histogram[i];
    if (seen >= target) return Math.max(0.2, i / 255);
  }
  return 1;
}

function grade(buf: Buf): Buf {
  const point = whitePoint(buf);
  const data = new Uint8Array(buf.data.length);
  for (let i = 0; i < buf.data.length; i += 4) {
    const l =
      luminance(buf.data[i], buf.data[i + 1], buf.data[i + 2]) / point;
    if (l < ALPHA_FLOOR) continue;
    const shoulder = smoothstep(
      ALPHA_FLOOR,
      1,
      clamp01(l),
    );
    const colorMix = smoothstep(0.08, 0.94, shoulder);
    const lowToMid = Math.min(1, colorMix / 0.75);
    const midToCore = Math.max(0, (colorMix - 0.75) / 0.25);
    for (let c = 0; c < 3; c++) {
      const lowMid = lerp(DIM_AQUA[c], MID_AQUA[c], lowToMid);
      data[i + c] = Math.round(lerp(lowMid, PALE_CORE[c], midToCore));
    }
    data[i + 3] = Math.round(Math.pow(shoulder, 1.08) * 238);
  }
  return { data, w: buf.w, h: buf.h };
}

function removeFlecks(buf: Buf) {
  const pixels = buf.w * buf.h;
  const seen = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  for (let start = 0; start < pixels; start++) {
    if (seen[start] || buf.data[start * 4 + 3] === 0) continue;
    let read = 0;
    let write = 0;
    seen[start] = 1;
    queue[write++] = start;
    while (read < write) {
      const p = queue[read++];
      const x = p % buf.w;
      const y = Math.floor(p / buf.w);
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x + 1 < buf.w ? p + 1 : -1,
        y > 0 ? p - buf.w : -1,
        y + 1 < buf.h ? p + buf.w : -1,
      ];
      for (const next of neighbours) {
        if (
          next < 0 ||
          seen[next] ||
          buf.data[next * 4 + 3] === 0
        )
          continue;
        seen[next] = 1;
        queue[write++] = next;
      }
    }
    if (write >= MIN_COMPONENT) continue;
    for (let i = 0; i < write; i++)
      buf.data.fill(0, queue[i] * 4, queue[i] * 4 + 4);
  }
}

function clearBorder(buf: Buf) {
  for (let y = 0; y < buf.h; y++)
    for (let x = 0; x < buf.w; x++)
      if (
        x < BORDER ||
        y < BORDER ||
        x >= buf.w - BORDER ||
        y >= buf.h - BORDER
      )
        buf.data.fill(0, (y * buf.w + x) * 4, (y * buf.w + x) * 4 + 4);
}

function validate(buf: Buf, label: string) {
  let opaque = 0;
  let minX = buf.w;
  let minY = buf.h;
  let maxX = -1;
  let maxY = -1;
  let peak = -1;
  let peakX = 0;
  let peakY = 0;
  for (let y = 0; y < buf.h; y++)
    for (let x = 0; x < buf.w; x++) {
      const i = (y * buf.w + x) * 4;
      const a = buf.data[i + 3];
      const l = luminance(buf.data[i], buf.data[i + 1], buf.data[i + 2]);
      if (a) {
        opaque++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (l > peak) {
        peak = l;
        peakX = x;
        peakY = y;
      }
      if (
        (x < BORDER ||
          y < BORDER ||
          x >= buf.w - BORDER ||
          y >= buf.h - BORDER) &&
        a !== 0
      )
        throw new Error(`${label}: alpha touches the ${BORDER}px border`);
    }
  const coverage = opaque / (buf.w * buf.h);
  if (coverage < 0.025 || coverage > 0.42)
    throw new Error(`${label}: opaque coverage ${(coverage * 100).toFixed(1)}% is outside 2.5–42%`);
  if (peakY > FRAME_H * 0.3)
    throw new Error(`${label}: peak is too deep in the surface sprite at ${peakX},${peakY}`);
  const footprint = (maxX - minX + 1) / buf.w;
  const depth = (maxY - minY + 1) / buf.h;
  if (footprint < 0.96 || footprint > 1)
    throw new Error(`${label}: footprint ${(footprint * 100).toFixed(1)}% is outside 96–100%`);
  if (depth < 0.55 || depth > 1)
    throw new Error(`${label}: depth ${(depth * 100).toFixed(1)}% is outside 55–100% of the surface sprite`);
  return { coverage, footprint, depth, peakX, peakY };
}

function synthesizeFrame(master: Buf, frame: number): Buf {
  const phase = (frame / FRAMES) * Math.PI * 2;
  const data = new Uint8Array(master.data.length);
  const jitter = FRAME_JITTER[frame];
  for (let y = 0; y < master.h; y++)
    for (let x = 0; x < master.w; x++) {
      const dx =
        Math.sin(y / 91 + phase) * 0.9 +
        Math.sin(x / 263 - phase) * 0.35;
      const dy =
        Math.sin(x / 127 - phase) * 0.85 +
        Math.sin(y / 109 + phase) * 0.3;
      const sx = Math.max(0, Math.min(master.w - 1, x + dx));
      const sy = Math.max(0, Math.min(master.h - 1, y + dy));
      const di = (y * master.w + x) * 4;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(master.w - 1, x0 + 1);
      const y1 = Math.min(master.h - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;
      for (let c = 0; c < 4; c++) {
        const a = master.data[(y0 * master.w + x0) * 4 + c];
        const b = master.data[(y0 * master.w + x1) * 4 + c];
        const d = master.data[(y1 * master.w + x0) * 4 + c];
        const e = master.data[(y1 * master.w + x1) * 4 + c];
        const value = lerp(lerp(a, b, tx), lerp(d, e, tx), ty);
        data[di + c] = Math.min(
          255,
          Math.round(c < 3 ? value * jitter : value),
        );
      }
    }
  const result = { data, w: master.w, h: master.h };
  clearBorder(result);
  return result;
}

const source = decodePng(readFileSync(SRC));
const sourceBuf = { data: source.rgba, w: source.w, h: source.h };
const sourceHotspot = hotspot(sourceBuf);
const master = grade(fitFrame(sourceBuf));
removeFlecks(master);
clearBorder(master);
const masterStats = validate(master, "graded master");
const frames = Array.from({ length: FRAMES }, (_, i) =>
  synthesizeFrame(master, i),
);
frames.forEach((frame, i) => validate(frame, `frame ${i}`));

const sheet = new Uint8Array(FRAME_W * FRAME_H * FRAMES * 4);
frames.forEach((frame, index) => {
  for (let y = 0; y < FRAME_H; y++) {
    const sourceStart = y * FRAME_W * 4;
    const targetStart = (index * FRAME_H + y) * FRAME_W * 4;
    sheet.set(frame.data.subarray(sourceStart, sourceStart + FRAME_W * 4), targetStart);
  }
});
const png = encodePng(sheet, FRAME_W, FRAME_H * FRAMES);
writeFileSync(OUT, png);
writeFileSync(
  OUT_TS,
  `// GENERATED by tools/gen-caustics.ts - do not edit by hand.\n` +
    `// Four identity-stable surface-light frames derived from one graded master.\n` +
    `export const CAUSTICS_SPRITE = "data:image/png;base64,${png.toString("base64")}";\n` +
    `export const CAUSTICS_FRAME_W = ${FRAME_W};\n` +
    `export const CAUSTICS_FRAME_H = ${FRAME_H};\n` +
    `export const CAUSTICS_FRAMES = ${FRAMES};\n` +
    `export const CAUSTICS_SOURCE_HOTSPOT = { x: ${sourceHotspot.x.toFixed(2)}, y: ${sourceHotspot.y.toFixed(2)} } as const;\n`,
);

console.log(
  `wrote ${OUT} (${FRAME_W}x${FRAME_H * FRAMES}) and ${OUT_TS}; ` +
    `coverage ${(masterStats.coverage * 100).toFixed(1)}%, ` +
    `footprint ${(masterStats.footprint * 100).toFixed(1)}%, ` +
    `source hotspot ${sourceHotspot.x.toFixed(1)},${sourceHotspot.y.toFixed(1)}`,
);

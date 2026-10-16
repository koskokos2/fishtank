// Experimental offline poses. Production fish rendering does not import this.
import { type Buf, copyRect } from "../../src/fishbake";

// Scale2x's published neighborhood rules, applied three times before sampling
// the rotation back onto the native pixel grid. No new colors are introduced.
// https://www.scale2x.it/algorithm
export function scale2x(input: Buf): Buf {
  const source = new Uint32Array(input.data.buffer, input.data.byteOffset, input.w * input.h);
  const w = input.w * 2, h = input.h * 2;
  const result = new Uint32Array(w * h);
  const at = (x: number, y: number) => source[Math.max(0, Math.min(input.h - 1, y)) * input.w + Math.max(0, Math.min(input.w - 1, x))];
  for (let y = 0; y < input.h; y++) for (let x = 0; x < input.w; x++) {
    const e = at(x, y), b = at(x, y - 1), d = at(x - 1, y), f = at(x + 1, y), h = at(x, y + 1);
    const split = b !== h && d !== f;
    const p = y * 2 * w + x * 2;
    result[p] = split && d === b ? d : e;
    result[p + 1] = split && b === f ? f : e;
    result[p + w] = split && d === h ? d : e;
    result[p + w + 1] = split && h === f ? f : e;
  }
  return { data: new Uint8Array(result.buffer), w, h };
}

export const angles3 = [-14, 0, 14];
export const angles7 = [-21, -14, -7, 0, 7, 14, 21];
export function poseSize(w: number, h: number, angles: number[]) {
  const extent = angles.map(angle => {
    const a = angle * Math.PI / 180;
    return { w: Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), h: Math.abs(h * Math.cos(a)) + Math.abs(w * Math.sin(a)) };
  });
  // Match the original frame's parity: the same anchor stays on pixel centers.
  const pad = (size: number, original: number) => original + 2 * Math.ceil((size - original) / 2) + 4;
  return { w: pad(Math.max(...extent.map(v => v.w)), w), h: pad(Math.max(...extent.map(v => v.h)), h) };
}

export function bakePoses(sheet: Buf, frames: number, angles: number[]) {
  const fw = sheet.w / frames, fh = sheet.h;
  const size = poseSize(fw, fh, angles);
  const w = size.w * frames, h = size.h * angles.length;
  const out = new Uint8Array(w * h * 4);
  for (let f = 0; f < frames; f++) {
    const frame = copyRect(sheet.data, sheet.w, f * fw, 0, fw, fh);
    const high = scale2x(scale2x(scale2x(frame)));
    for (let pose = 0; pose < angles.length; pose++) {
      const radians = angles[pose] * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
      for (let y = 0; y < size.h; y++) for (let x = 0; x < size.w; x++) {
        const dx = x + 0.5 - size.w / 2, dy = y + 0.5 - size.h / 2;
        const sx = (dx * c + dy * s + fw / 2), sy = (-dx * s + dy * c + fh / 2);
        if (sx < 0 || sx >= fw || sy < 0 || sy >= fh) continue;
        // Keep the horizontal pose byte-identical to the original animation.
        const from = angles[pose] === 0
          ? (Math.floor(sy) * fw + Math.floor(sx)) * 4
          : (Math.floor(sy * 8) * high.w + Math.floor(sx * 8)) * 4;
        const source = angles[pose] === 0 ? frame.data : high.data;
        const dest = ((pose * size.h + y) * w + f * size.w + x) * 4;
        out.set(source.subarray(from, from + 4), dest);
      }
    }
  }
  return { data: out, w, h, frameW: size.w, frameH: size.h };
}

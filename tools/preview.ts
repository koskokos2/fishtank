// Headless sprite previewer. Bakes the procedural fish straight to a PNG so the
// art can be reviewed without a browser. Run: `bun tools/preview.ts`.
import { deflateSync, inflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { BW, BH, backdropPixels } from "../src/backdrop";
import {
  OCTO_W,
  OCTO_H,
  octopusPixels,
  jellyTentacleSheet,
  JELLYFISH_FRAMES,
} from "../src/cephalopod";
import {
  FISH_ATLAS,
  FISH_ATLAS_CELL,
  FISH_ATLAS_COLS,
} from "../src/fishAtlas";
import {
  SEA_CREATURES_ATLAS,
  SEA_CREATURES_ATLAS_CELL,
  SEA_CREATURES_ATLAS_COLS,
  SEA_CREATURE_JELLYFISH_INDEX,
} from "../src/seaCreaturesAtlas";
import { FISH_KINDS } from "../src/fish";
import {
  cellBBox,
  copyRect,
  shearSheet,
  type Buf,
  SWIM_FRAMES,
} from "../src/fishbake";

// Knobs can be passed as trailing args (`bun tools/preview.ts S=30 ONE=1`) or as
// env vars (`S=30 ONE=1 bun ...`). Args are preferred — a single permission rule
// `Bash(bun tools/preview.ts:*)` then covers every variation.
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.includes("="))
    .map((a) => a.split("=") as [string, string]),
);
const opt = (k: string) => argv[k] ?? process.env[k];

// MODE=fish (default) bakes every fish's swim sheet from the atlas; MODE=backdrop
// bakes the static scene to backdrop.png; MODE=octopus bakes the octopus body
// (its arms are per-frame so they only show in `bun run dev`); MODE=jellyfish bakes
// the jellyfish tentacle-sway frames (its bell pulse is a runtime squash, so it only
// shows in `bun run dev`). The nautilus is cropped from the sea-creature atlas and
// animated in-browser at load.
const MODE = opt("MODE") ?? "fish";
const S = Number(opt("S") ?? (MODE === "backdrop" ? 1 : 6)); // upscale factor

if (MODE === "backdrop") renderBackdrop();
else if (MODE === "octopus")
  renderCreature(octopusPixels(), OCTO_W, OCTO_H, "octopus.png");
else if (MODE === "jellyfish") renderJellyfish();
else renderFishGrid();

// Bakes the jellyfish tentacle frames exactly as the app does — crop atlas cell 0,
// then the same horizontal-sway sheet — so the tentacle motion can be reviewed
// without a browser. (The bell-pulse squash is runtime-only; see `bun run dev`.)
function renderJellyfish() {
  const atlas = decodePng(dataUrlToBuffer(SEA_CREATURES_ATLAS));
  const cell = SEA_CREATURES_ATLAS_CELL;
  const col = SEA_CREATURE_JELLYFISH_INDEX % SEA_CREATURES_ATLAS_COLS;
  const row = Math.floor(SEA_CREATURE_JELLYFISH_INDEX / SEA_CREATURES_ATLAS_COLS);
  const bb = cellBBox(atlas.rgba, atlas.w, col * cell, row * cell, cell);
  const sheet = jellyTentacleSheet(
    copyRect(atlas.rgba, atlas.w, bb.x, bb.y, bb.bw, bb.bh),
  );
  renderSheet(sheet, "jellyfish.png", JELLYFISH_FRAMES);
}

// Upscale one frame-strip Buf over a vertical tank gradient and write it to PNG.
function renderSheet(s: Buf, name: string, frames: number) {
  const pad = 8;
  const cw = pad + s.w * S + pad;
  const ch = pad + s.h * S + pad;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const t = y / ch;
    const r = 18 + (6 - 18) * t;
    const g = 70 + (22 - 70) * t;
    const b = 92 + (34 - 92) * t;
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const si = (y * s.w + x) * 4;
      const a = s.data[si + 3];
      if (a === 0) continue;
      const af = a / 255;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const i = ((pad + y * S + sy) * cw + (pad + x * S + sx)) * 4;
          out[i] = s.data[si] * af + out[i] * (1 - af);
          out[i + 1] = s.data[si + 1] * af + out[i + 1] * (1 - af);
          out[i + 2] = s.data[si + 2] * af + out[i + 2] * (1 - af);
          out[i + 3] = 255;
        }
      }
    }
  }
  writeFileSync(name, encodePng(out, cw, ch));
  console.log(`wrote ${name} (${cw}x${ch}) — ${frames} tentacle frames`);
}

// One cephalopod body, upscaled over a dark tank-blue ground (alpha-composited).
function renderCreature(px: number[][], w: number, h: number, name: string) {
  const pad = 8;
  const cw = (w + pad * 2) * S;
  const ch = (h + pad * 2) * S;
  const out = new Uint8Array(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) {
    out[i * 4] = 14;
    out[i * 4 + 1] = 40;
    out[i * 4 + 2] = 58;
    out[i * 4 + 3] = 255;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px[y * w + x];
      if (!a) continue;
      const af = a / 255;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const i = (((pad + y) * S + sy) * cw + ((pad + x) * S + sx)) * 4;
          out[i] = r * af + out[i] * (1 - af);
          out[i + 1] = g * af + out[i + 1] * (1 - af);
          out[i + 2] = b * af + out[i + 2] * (1 - af);
          out[i + 3] = 255;
        }
      }
    }
  }
  writeFileSync(name, encodePng(out, cw, ch));
  console.log(`wrote ${name} (${cw}x${ch})`);
}

function renderBackdrop() {
  const buf = backdropPixels(Number(opt("SEED") ?? 1));
  const cw = BW * S;
  const ch = BH * S;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const [r, g, b, a] = buf[y * BW + x];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const i = ((y * S + sy) * cw + (x * S + sx)) * 4;
          out[i] = r;
          out[i + 1] = g;
          out[i + 2] = b;
          out[i + 3] = a;
        }
      }
    }
  }
  const name = opt("OUT") ?? "backdrop.png";
  writeFileSync(name, encodePng(out, cw, ch));
  console.log(`wrote ${name} (${cw}x${ch})`);
}

// Bakes the fish exactly as the app does — native atlas copy + tail-swish shear
// — so the swim frames can be reviewed without a browser. One fish per row, its
// swim frames laid out left to right. SPECIES=name filters to one fish by
// FISH_KINDS name.
function renderFishGrid() {
  const pad = 8;
  const atlas = decodePng(dataUrlToBuffer(FISH_ATLAS));
  const cell = FISH_ATLAS_CELL;

  const kinds = opt("SPECIES")
    ? FISH_KINDS.filter((k) => k.name === opt("SPECIES"))
    : FISH_KINDS;

  const sheets = kinds.map((k) => {
    const i = FISH_KINDS.indexOf(k);
    const col = i % FISH_ATLAS_COLS;
    const row = Math.floor(i / FISH_ATLAS_COLS);
    const bb = cellBBox(atlas.rgba, atlas.w, col * cell, row * cell, cell);
    return shearSheet(copyRect(atlas.rgba, atlas.w, bb.x, bb.y, bb.bw, bb.bh));
  });

  const cw = pad + Math.max(...sheets.map((s) => s.w)) * S + pad;
  const ch = pad + sheets.reduce((h, s) => h + s.h * S + pad, 0);
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const t = y / ch;
    const r = 18 + (6 - 18) * t;
    const g = 70 + (22 - 70) * t;
    const b = 92 + (34 - 92) * t;
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }

  let oy = pad;
  for (const s of sheets) {
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const si = (y * s.w + x) * 4;
        const a = s.data[si + 3];
        if (a === 0) continue;
        const af = a / 255;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            const i = ((oy + y * S + sy) * cw + (pad + x * S + sx)) * 4;
            out[i] = s.data[si] * af + out[i] * (1 - af);
            out[i + 1] = s.data[si + 1] * af + out[i + 1] * (1 - af);
            out[i + 2] = s.data[si + 2] * af + out[i + 2] * (1 - af);
            out[i + 3] = 255;
          }
        }
      }
    }
    oy += s.h * S + pad;
  }

  writeFileSync("preview.png", encodePng(out, cw, ch));
  console.log(
    `wrote preview.png (${cw}x${ch}) — ${kinds.length} fish, ${SWIM_FRAMES} swim frames each`,
  );
}

function dataUrlToBuffer(url: string): Buffer {
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

// --- minimal PNG decode (8-bit, color type 6 RGBA, no interlace) ---
function decodePng(buf: Buffer): { rgba: Uint8Array; w: number; h: number } {
  let p = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6)
    throw new Error(`unsupported PNG: depth ${bitDepth} colorType ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const rgba = new Uint8Array(w * h * bpp);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= bpp ? rgba[y * stride + x - bpp] : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? rgba[(y - 1) * stride + x - bpp] : 0;
      let recon: number;
      switch (filter) {
        case 0: recon = v; break;
        case 1: recon = v + a; break;
        case 2: recon = v + b; break;
        case 3: recon = v + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          recon = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      rgba[y * stride + x] = recon & 0xff;
    }
  }
  return { rgba, w, h };
}

// --- minimal PNG (RGBA, 8-bit, no interlace) ---
function encodePng(rgba: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    rgba.subarray(y * w * 4, (y + 1) * w * 4).forEach((v, i) => {
      raw[y * (1 + w * 4) + 1 + i] = v;
    });
  }
  const idat = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0, 0);
  return Buffer.concat([len, td, crc]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

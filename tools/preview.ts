// Headless sprite previewer. Bakes the procedural fish straight to a PNG so the
// art can be reviewed without a browser. Run: `bun tools/preview.ts`.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import {
  FISH_SPECIES,
  FISH_W,
  FISH_H,
  fishFrame,
  type Species,
} from "../src/pixels";
import { BW, BH, backdropPixels } from "../src/backdrop";
import { OCTO_W, OCTO_H, octopusPixels } from "../src/cephalopod";

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

// MODE=fish (default) renders the fish grid; MODE=backdrop bakes the static
// scene to backdrop.png; MODE=octopus bakes the octopus body (its arms are
// per-frame so they only show in `bun run dev`). The nautilus is a baked image
// atlas (nautilusAtlas.ts), not procedural — inspect art/nautilus-atlas-128.png.
const MODE = opt("MODE") ?? "fish";
const S = Number(opt("S") ?? (MODE === "backdrop" ? 1 : 10)); // upscale factor

if (MODE === "backdrop") renderBackdrop();
else if (MODE === "octopus")
  renderCreature(octopusPixels(), OCTO_W, OCTO_H, "octopus.png");
else renderFishGrid();

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

function renderFishGrid() {
  const pad = 10;

  // SPECIES=name filters to one species; otherwise every species is shown, one
  // row each with both swim frames. COLS defaults to 2 so a species' two frames
  // sit side by side on its own row.
  const species: Species[] = opt("SPECIES")
    ? FISH_SPECIES.filter((s) => s.name === opt("SPECIES"))
    : FISH_SPECIES;
  const cols = Number(opt("COLS") ?? 2);

  const cells: { frame: number; sp: Species }[] = opt("ONE")
    ? [{ frame: 0, sp: species[0] }]
    : species.flatMap((sp) => [
        { frame: 0, sp },
        { frame: 1, sp },
      ]);

  const rows = Math.ceil(cells.length / cols);
  const cellW = FISH_W * S;
  const cellH = FISH_H * S;
  const cw = cols * (cellW + pad) + pad;
  const ch = rows * (cellH + pad) + pad;
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

  const blit = (px: number[][], ox: number, oy: number) => {
    for (let y = 0; y < FISH_H; y++) {
      for (let x = 0; x < FISH_W; x++) {
        const [r, g, b, a] = px[y * FISH_W + x];
        if (a === 0) continue;
        const af = a / 255;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            const i = ((oy + y * S + sy) * cw + (ox + x * S + sx)) * 4;
            out[i] = r * af + out[i] * (1 - af);
            out[i + 1] = g * af + out[i + 1] * (1 - af);
            out[i + 2] = b * af + out[i + 2] * (1 - af);
            out[i + 3] = 255;
          }
        }
      }
    }
  };

  cells.forEach((c, idx) => {
    const ox = pad + (idx % cols) * (cellW + pad);
    const oy = pad + Math.floor(idx / cols) * (cellH + pad);
    blit(fishFrame(c.sp, c.frame) as unknown as number[][], ox, oy);
  });

  writeFileSync("preview.png", encodePng(out, cw, ch));
  console.log(`wrote preview.png (${cw}x${ch})`);
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

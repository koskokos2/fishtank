// Headless sprite previewer. Bakes the procedural fish straight to a PNG so the
// art can be reviewed without a browser. Run: `bun tools/preview.ts`.
import { writeFileSync } from "node:fs";
import { decodePng, encodePng, dataUrlToBuffer } from "./png";
import { BW, BH, backdropPixels, coralBlits } from "../src/backdrop";
import { CORAL_ATLAS, CORAL_ATLAS_CELL, CORAL_ATLAS_LAYOUT } from "../src/coralsAtlas";
import { jellyTentacleSheet, JELLYFISH_FRAMES } from "../src/cephalopod";
import {
  FISH_ATLAS,
  FISH_ATLAS_CELL,
  FISH_ATLAS_LAYOUT,
} from "../src/fishAtlas";
import {
  FISH_EXTRA_ATLAS,
  FISH_EXTRA_ATLAS_CELL,
  FISH_EXTRA_ATLAS_LAYOUT,
} from "../src/fishExtraAtlas";
import {
  SEA_CREATURES_ATLAS,
  SEA_CREATURES_ATLAS_CELL,
  SEA_CREATURES_ATLAS_COLS,
  SEA_CREATURE_JELLYFISH_INDEX,
} from "../src/seaCreaturesAtlas";
import {
  OCTOPUS_ATLAS,
  OCTOPUS_FRAMES,
  OCTOPUS_FRAME_W,
} from "../src/octopusAtlas";
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
// bakes the static scene to backdrop.png; MODE=octopus lays out the baked octopus
// poses (the live pose-swapping state machine only shows in `bun run dev`);
// MODE=jellyfish bakes the jellyfish tentacle-sway frames (its
// bell pulse is a runtime squash, so it only shows in `bun run dev`). The nautilus
// is cropped from the sea-creature atlas and animated in-browser at load.
const MODE = opt("MODE") ?? "fish";
const S = Number(opt("S") ?? (MODE === "backdrop" ? 1 : 6)); // upscale factor

if (MODE === "backdrop") renderBackdrop();
else if (MODE === "octopus") renderOctopus();
else if (MODE === "jellyfish") renderJellyfish();
else renderFishGrid();

// Lays out the baked octopus frames — the idle-hover arm-sway loop followed by the
// eleven crawl/rest/swim poses — so the art and framing can be checked without a
// browser. The live pose-swapping state machine (and the sway playing in motion)
// still needs `bun run dev`.
function renderOctopus() {
  const atlas = decodePng(dataUrlToBuffer(OCTOPUS_ATLAS));
  const fw = OCTOPUS_FRAME_W;
  const frames = Array.from({ length: OCTOPUS_FRAMES }, (_, i) =>
    copyRect(atlas.rgba, atlas.w, i * fw, 0, fw, atlas.h),
  );
  renderFrames(frames, "octopus.png");
}

// Lay several full-cell Bufs side by side, upscaled over the tank ground.
function renderFrames(frames: Buf[], name: string) {
  const pad = 8;
  const fw = frames[0].w;
  const fh = frames[0].h;
  const cw = pad + frames.length * (fw * S + pad);
  const ch = pad + fh * S + pad;
  const out = new Uint8Array(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) {
    out[i * 4] = 14;
    out[i * 4 + 1] = 40;
    out[i * 4 + 2] = 58;
    out[i * 4 + 3] = 255;
  }
  frames.forEach((f, fi) => {
    const ox = pad + fi * (fw * S + pad);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const si = (y * fw + x) * 4;
        const a = f.data[si + 3];
        if (a === 0) continue;
        const af = a / 255;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            const i = ((pad + y * S + sy) * cw + (ox + x * S + sx)) * 4;
            out[i] = f.data[si] * af + out[i] * (1 - af);
            out[i + 1] = f.data[si + 1] * af + out[i + 1] * (1 - af);
            out[i + 2] = f.data[si + 2] * af + out[i + 2] * (1 - af);
            out[i + 3] = 255;
          }
        }
      }
    }
  });
  writeFileSync(name, encodePng(out, cw, ch));
  console.log(`wrote ${name} (${cw}x${ch}) — ${frames.length} octopus poses`);
}

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

function renderBackdrop() {
  const buf = backdropPixels(Number(opt("SEED") ?? 1));

  // Blit coral atlas cells into the raw buffer (alpha compositing).
  const atlas = decodePng(dataUrlToBuffer(CORAL_ATLAS));
  const CELL = CORAL_ATLAS_CELL;
  for (const { name, x: dx, y: dy } of coralBlits()) {
    const { col, row } = CORAL_ATLAS_LAYOUT[name];
    const sx0 = col * CELL;
    const sy0 = row * CELL;
    for (let cy = 0; cy < CELL; cy++) {
      for (let cx = 0; cx < CELL; cx++) {
        const bx = dx + cx;
        const by = dy + cy;
        if (bx < 0 || bx >= BW || by < 0 || by >= BH) continue;
        const si = ((sy0 + cy) * atlas.w + (sx0 + cx)) * 4;
        const a = atlas.rgba[si + 3];
        if (a === 0) continue;
        const af = a / 255;
        const bi = by * BW + bx;
        const [br, bg, bb] = buf[bi];
        buf[bi] = [
          Math.round(atlas.rgba[si] * af + br * (1 - af)),
          Math.round(atlas.rgba[si + 1] * af + bg * (1 - af)),
          Math.round(atlas.rgba[si + 2] * af + bb * (1 - af)),
          255,
        ];
      }
    }
  }

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
  const atlas1 = decodePng(dataUrlToBuffer(FISH_ATLAS));
  const atlas2 = decodePng(dataUrlToBuffer(FISH_EXTRA_ATLAS));

  const kinds = opt("SPECIES")
    ? FISH_KINDS.filter((k) => k.name === opt("SPECIES"))
    : FISH_KINDS;

  const sheets = kinds.map((k) => {
    const inExtra = k.name in FISH_EXTRA_ATLAS_LAYOUT;
    const atlas = inExtra ? atlas2 : atlas1;
    const cell = inExtra ? FISH_EXTRA_ATLAS_CELL : FISH_ATLAS_CELL;
    const { row, col } = inExtra
      ? FISH_EXTRA_ATLAS_LAYOUT[k.name]
      : FISH_ATLAS_LAYOUT[k.name];
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


// Headless sprite previewer. Bakes the procedural fish straight to a PNG so the
// art can be reviewed without a browser. Run: `bun tools/preview.ts`.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng, dataUrlToBuffer } from "./png";
import { BW, BH, backdropPixels, coralBlits } from "../src/backdrop";
import { CORAL_ATLAS, CORAL_ATLAS_CELL, CORAL_ATLAS_LAYOUT } from "../src/coralsAtlas";
import {
  JELLYFISH_ATLAS,
  JELLYFISH_ATLAS_CELL,
  JELLYFISH_ATLAS_COLS,
  JELLYFISH_FRAMES,
} from "../src/jellyfishAtlas";
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
// MODE=jellyfish lays out the sixteen baked jellyfish poses (the live pulse
// machine that swaps them only shows in `bun run dev`);
// MODE=ruins-kit validates the modular ruins source sidecar and renders assembled
// column/wall/arch recipe previews. The nautilus is cropped from the sea-creature
// atlas and animated in-browser at load.
const MODE = opt("MODE") ?? "fish";
const S = Number(opt("S") ?? (MODE === "backdrop" || MODE === "ruins-kit" ? 1 : 6)); // upscale factor

if (MODE === "backdrop") renderBackdrop();
else if (MODE === "octopus") renderOctopus();
else if (MODE === "jellyfish") renderJellyfish();
else if (MODE === "ruins-kit") renderRuinsKit();
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
  renderFrames(frames, "octopus.png", "octopus poses");
}

// Lay several full-cell Bufs side by side, upscaled over the tank ground.
function renderFrames(frames: Buf[], name: string, label: string) {
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
  console.log(`wrote ${name} (${cw}x${ch}) — ${frames.length} ${label}`);
}

// Lays out the sixteen baked jellyfish poses — the bell-pulse cycle, the streaming
// glides, the hover variety, the turns, and the flare/recoil — so the art and
// framing can be checked without a browser. The live pose-swapping pulse machine
// still needs `bun run dev`.
function renderJellyfish() {
  const atlas = decodePng(dataUrlToBuffer(JELLYFISH_ATLAS));
  const cell = JELLYFISH_ATLAS_CELL;
  const frames = Array.from({ length: JELLYFISH_FRAMES }, (_, i) =>
    copyRect(
      atlas.rgba,
      atlas.w,
      (i % JELLYFISH_ATLAS_COLS) * cell,
      Math.floor(i / JELLYFISH_ATLAS_COLS) * cell,
      cell,
      cell,
    ),
  );
  renderFrames(frames, "jellyfish.png", "jellyfish poses");
}

function renderBackdrop() {
  const buf = backdropPixels(Number(opt("SEED") ?? 1));

  // Blit coral atlas cells into the raw buffer (alpha compositing).
  const atlas = decodePng(dataUrlToBuffer(CORAL_ATLAS));
  const CELL = CORAL_ATLAS_CELL;
  for (const { name, x: dx, y: dy } of coralBlits()) {
    const { col, row, top, bottom } = CORAL_ATLAS_LAYOUT[name];
    const sx0 = col * CELL;
    const sy0 = row * CELL;
    // Match backdrop.ts: only blit the coral's main-body rows [top, bottom] so
    // disconnected atlas-edge specks don't float in the water.
    for (let cy = top; cy <= bottom; cy++) {
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

type RuinsSocket = { x: number; y: number; type: string };
type RuinsRect = { x: number; y: number; w: number; h: number };
type RuinsSprite = {
  name: string;
  row: number;
  col: number;
  sourceRect?: RuinsRect;
  category?: string;
  role?: string;
  sockets?: Record<string, RuinsSocket>;
};
type RuinsRecipeStep = {
  sprite: string;
  attach?: string;
  from?: string;
  toPrevious?: string;
};
type RuinsMeta = {
  image: string;
  sourceWidth: number;
  sourceHeight: number;
  columns: number;
  rows: number;
  anchorSpace?: "normalizedCell" | "normalizedSourceRect";
  socketTypes?: Record<string, string>;
  sprites: RuinsSprite[];
  recipes?: Record<string, RuinsRecipeStep[]>;
};
type Rect = RuinsRect;
type RuinsPart = Buf & {
  name: string;
  sockets: Record<string, RuinsSocket>;
};
type RuinsPlacement = { part: RuinsPart; x: number; y: number };

// Validates the modular ruins source manifest and renders every recipe assembled
// by its declared sockets. The source atlas remains an opaque black sheet; the
// preview keys near-black matte pixels to alpha so seams/gaps are visible.
function renderRuinsKit() {
  const jsonPath = opt("JSON") ?? "art/modular-ruins-kit-atlas-original.json";
  const meta = JSON.parse(readFileSync(jsonPath, "utf8")) as RuinsMeta;
  const pngPath = opt("PNG") ?? `art/${meta.image}`;
  const atlas = decodePng(readFileSync(pngPath));

  const { errors, warnings } = validateRuinsKit(meta, atlas.w, atlas.h);
  for (const warning of warnings) console.warn(`ruins-kit warning: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`ruins-kit error: ${error}`);
    throw new Error(`ruins-kit validation failed with ${errors.length} error(s)`);
  }
  if (opt("VALIDATE_ONLY") === "1") {
    console.log(`validated ${jsonPath} — ${meta.sprites.length} sprite(s), ${Object.keys(meta.recipes ?? {}).length} recipe(s)`);
    return;
  }

  const parts = makeRuinsParts(meta, atlas.rgba, atlas.w, atlas.h);
  const wanted = opt("RECIPE");
  const recipes = Object.entries(meta.recipes ?? {}).filter(([name]) => !wanted || name === wanted);
  if (!recipes.length) throw new Error(wanted ? `no recipe named ${wanted}` : "no ruins recipes");

  const assembled = recipes.map(([name, steps]) => {
    const buf = assembleRuinsRecipe(name, steps, parts);
    console.log(`validated ${name}: ${buf.w}x${buf.h}, ${steps.length} part(s)`);
    return { name, buf };
  });

  const out = opt("OUT") ?? "ruins-kit-preview.png";
  renderRuinsContactSheet(assembled, out);
}

function validateRuinsKit(
  meta: RuinsMeta,
  imgW: number,
  imgH: number,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (imgW !== meta.sourceWidth || imgH !== meta.sourceHeight) {
    errors.push(
      `image dimensions ${imgW}x${imgH} do not match manifest ${meta.sourceWidth}x${meta.sourceHeight}`,
    );
  }
  const allSpritesHaveSourceRects = meta.sprites.every((sprite) => sprite.sourceRect);
  if ((imgW % meta.columns !== 0 || imgH % meta.rows !== 0) && !allSpritesHaveSourceRects) {
    warnings.push(
      `${imgW}x${imgH} does not divide evenly into ${meta.columns}x${meta.rows}; preview uses rounded source cell bounds`,
    );
  }
  if (meta.anchorSpace !== "normalizedCell" && meta.anchorSpace !== "normalizedSourceRect") {
    warnings.push(
      `anchorSpace is ${meta.anchorSpace ?? "missing"}; normalizedCell or normalizedSourceRect is expected`,
    );
  }
  if (meta.sprites.length !== meta.columns * meta.rows) {
    warnings.push(
      `sprite count ${meta.sprites.length} does not equal grid cells ${meta.columns * meta.rows}`,
    );
  }

  const seen = new Set<string>();
  const spriteByName = new Map<string, RuinsSprite>();
  for (const sprite of meta.sprites) {
    if (seen.has(sprite.name)) errors.push(`duplicate sprite name ${sprite.name}`);
    seen.add(sprite.name);
    spriteByName.set(sprite.name, sprite);
    if (sprite.row < 0 || sprite.row >= meta.rows || sprite.col < 0 || sprite.col >= meta.columns) {
      errors.push(`${sprite.name} row/col ${sprite.row}/${sprite.col} is outside the ${meta.rows}x${meta.columns} grid`);
    }
    if (sprite.sourceRect) {
      const { x, y, w, h } = sprite.sourceRect;
      if (w <= 0 || h <= 0) errors.push(`${sprite.name}.sourceRect must have positive size`);
      if (x < 0 || y < 0 || x + w > imgW || y + h > imgH) {
        errors.push(`${sprite.name}.sourceRect ${x},${y},${w},${h} is outside the image`);
      }
    }
    for (const [socketName, socket] of Object.entries(sprite.sockets ?? {})) {
      if (socket.x < 0 || socket.x > 1 || socket.y < 0 || socket.y > 1) {
        errors.push(`${sprite.name}.${socketName} socket is outside normalized coordinates`);
      }
      if (meta.socketTypes && !(socket.type in meta.socketTypes)) {
        errors.push(`${sprite.name}.${socketName} uses unknown socket type ${socket.type}`);
      }
    }
  }

  for (const [recipeName, steps] of Object.entries(meta.recipes ?? {})) {
    if (!steps.length) errors.push(`${recipeName} has no steps`);
    let previous: RuinsRecipeStep | undefined;
    for (const [index, step] of steps.entries()) {
      const sprite = spriteByName.get(step.sprite);
      if (!sprite) {
        errors.push(`${recipeName}[${index}] references missing sprite ${step.sprite}`);
        previous = step;
        continue;
      }
      const sockets = sprite.sockets ?? {};
      if (index === 0) {
        if (step.attach && !(step.attach in sockets)) {
          errors.push(`${recipeName}[0] ${step.sprite} is missing attach socket ${step.attach}`);
        }
      } else {
        if (!step.from) errors.push(`${recipeName}[${index}] ${step.sprite} is missing from socket`);
        if (!step.toPrevious) errors.push(`${recipeName}[${index}] ${step.sprite} is missing toPrevious socket`);
        if (step.from && !(step.from in sockets)) {
          errors.push(`${recipeName}[${index}] ${step.sprite} is missing socket ${step.from}`);
        }
        if (previous && step.toPrevious) {
          const prevSprite = spriteByName.get(previous.sprite);
          const prevSocket = prevSprite?.sockets?.[step.toPrevious];
          const thisSocket = step.from ? sockets[step.from] : undefined;
          if (!prevSocket) {
            errors.push(`${recipeName}[${index}] previous ${previous.sprite} is missing socket ${step.toPrevious}`);
          } else if (thisSocket && thisSocket.type !== prevSocket.type) {
            errors.push(
              `${recipeName}[${index}] socket type mismatch: ${step.sprite}.${step.from} is ${thisSocket.type}, previous ${previous.sprite}.${step.toPrevious} is ${prevSocket.type}`,
            );
          }
        }
      }
      previous = step;
    }
  }

  return { errors, warnings };
}

function makeRuinsParts(
  meta: RuinsMeta,
  rgba: Uint8Array,
  imgW: number,
  imgH: number,
): Map<string, RuinsPart> {
  const parts = new Map<string, RuinsPart>();
  for (const sprite of meta.sprites) {
    const rect = sourceSpriteRect(sprite, meta, imgW, imgH);
    const data = new Uint8Array(rect.w * rect.h * 4);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const si = ((rect.y + y) * imgW + rect.x + x) * 4;
        const di = (y * rect.w + x) * 4;
        const r = rgba[si];
        const g = rgba[si + 1];
        const b = rgba[si + 2];
        data[di] = r;
        data[di + 1] = g;
        data[di + 2] = b;
        data[di + 3] = r <= 10 && g <= 10 && b <= 10 ? 0 : rgba[si + 3];
      }
    }
    const sockets: Record<string, RuinsSocket> = {};
    for (const [name, socket] of Object.entries(sprite.sockets ?? {})) {
      if (meta.anchorSpace === "normalizedSourceRect") {
        sockets[name] = {
          x: socket.x * rect.w,
          y: socket.y * rect.h,
          type: socket.type,
        };
      } else {
        const cell = sourceCellRect(sprite, meta, imgW, imgH);
        sockets[name] = {
          x: socket.x * cell.w + cell.x - rect.x,
          y: socket.y * cell.h + cell.y - rect.y,
          type: socket.type,
        };
      }
    }
    parts.set(sprite.name, { name: sprite.name, data, w: rect.w, h: rect.h, sockets });
  }
  return parts;
}

function sourceSpriteRect(sprite: RuinsSprite, meta: RuinsMeta, imgW: number, imgH: number): Rect {
  return sprite.sourceRect ?? sourceCellRect(sprite, meta, imgW, imgH);
}

function sourceCellRect(sprite: RuinsSprite, meta: RuinsMeta, imgW: number, imgH: number): Rect {
  const x0 = Math.round((sprite.col * imgW) / meta.columns);
  const x1 = Math.round(((sprite.col + 1) * imgW) / meta.columns);
  const y0 = Math.round((sprite.row * imgH) / meta.rows);
  const y1 = Math.round(((sprite.row + 1) * imgH) / meta.rows);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function assembleRuinsRecipe(
  name: string,
  steps: RuinsRecipeStep[],
  parts: Map<string, RuinsPart>,
): Buf {
  const placements: RuinsPlacement[] = [];
  for (const [index, step] of steps.entries()) {
    const part = parts.get(step.sprite);
    if (!part) throw new Error(`${name}: missing part ${step.sprite}`);
    let x = 0;
    let y = 0;
    if (index === 0) {
      const anchor = step.attach ? part.sockets[step.attach] : undefined;
      if (anchor) {
        x = -anchor.x;
        y = -anchor.y;
      }
    } else {
      const previous = placements[placements.length - 1];
      const from = step.from ? part.sockets[step.from] : undefined;
      const toPrevious = step.toPrevious ? previous.part.sockets[step.toPrevious] : undefined;
      if (!from || !toPrevious) throw new Error(`${name}: invalid socket at step ${index}`);
      x = previous.x + toPrevious.x - from.x;
      y = previous.y + toPrevious.y - from.y;
    }
    placements.push({ part, x: Math.round(x), y: Math.round(y) });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const placement of placements) {
    const bb = contentBBox(placement.part);
    minX = Math.min(minX, placement.x + bb.x);
    minY = Math.min(minY, placement.y + bb.y);
    maxX = Math.max(maxX, placement.x + bb.x + bb.w - 1);
    maxY = Math.max(maxY, placement.y + bb.y + bb.h - 1);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) throw new Error(`${name}: empty assembled recipe`);

  const pad = 16;
  const outW = Math.ceil(maxX - minX + 1 + pad * 2);
  const outH = Math.ceil(maxY - minY + 1 + pad * 2);
  const out = new Uint8Array(outW * outH * 4);
  for (const placement of placements) {
    blitBuf(out, outW, outH, placement.part, Math.round(placement.x - minX + pad), Math.round(placement.y - minY + pad));
  }
  return { data: out, w: outW, h: outH };
}

function contentBBox(buf: Buf): Rect {
  let minX = buf.w;
  let minY = buf.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (buf.data[(y * buf.w + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function blitBuf(dst: Uint8Array, dstW: number, dstH: number, src: Buf, dx: number, dy: number) {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dstH) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dstW) continue;
      const si = (y * src.w + x) * 4;
      const a = src.data[si + 3];
      if (a === 0) continue;
      const di = (ty * dstW + tx) * 4;
      const af = a / 255;
      dst[di] = Math.round(src.data[si] * af + dst[di] * (1 - af));
      dst[di + 1] = Math.round(src.data[si + 1] * af + dst[di + 1] * (1 - af));
      dst[di + 2] = Math.round(src.data[si + 2] * af + dst[di + 2] * (1 - af));
      dst[di + 3] = Math.max(dst[di + 3], a);
    }
  }
}

function renderRuinsContactSheet(items: { name: string; buf: Buf }[], outName: string) {
  const pad = 24;
  const cols = Math.min(3, Math.max(1, items.length));
  const rows = Math.ceil(items.length / cols);
  const cellW = Math.max(...items.map((item) => item.buf.w));
  const cellH = Math.max(...items.map((item) => item.buf.h));
  const cw = pad + cols * (cellW * S + pad);
  const ch = pad + rows * (cellH * S + pad);
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const t = y / Math.max(1, ch - 1);
    const r = 14 + (6 - 14) * t;
    const g = 44 + (22 - 44) * t;
    const b = 56 + (34 - 56) * t;
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }

  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const ox = pad + col * (cellW * S + pad) + Math.floor((cellW - item.buf.w) * S * 0.5);
    const oy = pad + row * (cellH * S + pad) + (cellH - item.buf.h) * S;
    blitScaled(out, cw, ch, item.buf, ox, oy);
  });

  writeFileSync(outName, encodePng(out, cw, ch));
  console.log(`wrote ${outName} (${cw}x${ch}) — ${items.length} ruins recipe preview(s)`);
}

function blitScaled(dst: Uint8Array, dstW: number, dstH: number, src: Buf, dx: number, dy: number) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4;
      const a = src.data[si + 3];
      if (a === 0) continue;
      const af = a / 255;
      for (let sy = 0; sy < S; sy++) {
        const ty = dy + y * S + sy;
        if (ty < 0 || ty >= dstH) continue;
        for (let sx = 0; sx < S; sx++) {
          const tx = dx + x * S + sx;
          if (tx < 0 || tx >= dstW) continue;
          const di = (ty * dstW + tx) * 4;
          dst[di] = Math.round(src.data[si] * af + dst[di] * (1 - af));
          dst[di + 1] = Math.round(src.data[si + 1] * af + dst[di + 1] * (1 - af));
          dst[di + 2] = Math.round(src.data[si + 2] * af + dst[di + 2] * (1 - af));
          dst[di + 3] = 255;
        }
      }
    }
  }
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

// Headless sprite previewer. Bakes the procedural fish straight to a PNG so the
// art can be reviewed without a browser. Run: `bun tools/preview.ts`.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng, dataUrlToBuffer } from "./png";
import {
  BW,
  BH,
  backdropPixels,
  groundZ,
  sandTopAt,
} from "../src/backdrop";
import {
  SMALL_PROPS_ATLAS,
  SMALL_PROPS_ATLAS_CELL,
} from "../src/smallPropsAtlas";
import {
  PLANT_ATLAS,
  PLANT_ATLAS_CELL,
  PLANT_ATLAS_COLS,
  PLANT_ATLAS_LAYOUT,
} from "../src/plantAtlas";
import {
  FOREGROUND_PLANTS,
  MID_PLANTS,
  THEME_BASE,
  THEME_FRONDS,
} from "../src/tank";
import {
  placeProp,
  PROP_SLOTS,
  PROP_WHITELIST,
  type PropPlacement,
  type WhitelistedProp,
} from "../src/propPlacement";
import {
  SCI_FI_DISPLAY_WINDOWS,
  SCI_FI_PROP_SPECS,
} from "../src/sciFiProps";
import {
  SCI_FI_PROPS_ATLAS,
  SCI_FI_PROPS_ATLAS_CELL,
  SCI_FI_PROPS_ATLAS_LAYOUT,
} from "../src/sciFiPropsAtlas";
import { ELDRITCH_PROP_SPECS } from "../src/eldritchProps";
import {
  ELDRITCH_PROPS_ATLAS,
  ELDRITCH_PROPS_ATLAS_CELL,
  ELDRITCH_PROPS_ATLAS_LAYOUT,
} from "../src/eldritchPropsAtlas";
import { STAR_WARS_PROP_SPECS } from "../src/starWarsProps";
import {
  STAR_WARS_PROPS_ATLAS,
  STAR_WARS_PROPS_ATLAS_CELL,
  STAR_WARS_PROPS_ATLAS_LAYOUT,
} from "../src/starWarsPropsAtlas";
import { RES } from "../src/res";
import {
  JELLYFISH_ARMS_START,
  JELLYFISH_ATLAS,
  JELLYFISH_BELL_ATTACH_Y,
  JELLYFISH_ATLAS_CELL,
  JELLYFISH_ATLAS_COLS,
  JELLYFISH_BELL_START,
  JELLYFISH_LAYER_FRAMES,
  JELLYFISH_LAYER_ROOT_Y,
  JELLYFISH_TENDRILS_START,
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
  FISH_BONUS_ATLAS,
  FISH_BONUS_ATLAS_CELL,
  FISH_BONUS_ATLAS_LAYOUT,
} from "../src/fishBonusAtlas";
import {
  ALIEN_FISH_ATLAS,
  ALIEN_FISH_ATLAS_CELL,
  ALIEN_FISH_ATLAS_LAYOUT,
} from "../src/alienFishAtlas";
import {
  OCTOPUS_ATLAS,
  OCTOPUS_FRAMES,
  OCTOPUS_FRAME_W,
} from "../src/octopusAtlas";
import {
  NAUTILUS_ATLAS,
  NAUTILUS_ATLAS_CELL,
  NAUTILUS_ATLAS_COLS,
  NAUTILUS_BODY_START,
  NAUTILUS_JET_START,
  NAUTILUS_LAYER_FRAMES,
  NAUTILUS_SIPHON_START,
  NAUTILUS_TENTACLES_START,
} from "../src/nautilusAtlas";
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
// MODE=jellyfish and MODE=nautilus composite their independent layers into
// representative frames (their clocks/state are independent in the live tank);
// MODE=ruins-kit validates the modular ruins source sidecar and renders assembled
// column/wall/arch recipe previews.
const MODE = opt("MODE") ?? "fish";
const S = Number(opt("S") ?? (MODE === "backdrop" || MODE === "ruins-kit" ? 1 : 6)); // upscale factor

if (MODE === "backdrop") renderBackdrop();
else if (MODE === "octopus") renderOctopus();
else if (MODE === "jellyfish") renderJellyfish();
else if (MODE === "nautilus") renderNautilus();
else if (MODE === "plants") renderPlantScene();
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

// Composite representative layered frames. The tendril phase intentionally walks
// at a different rate from the bell and oral arms to expose seams or clipping.
function renderJellyfish() {
  const atlas = decodePng(dataUrlToBuffer(JELLYFISH_ATLAS));
  const cell = JELLYFISH_ATLAS_CELL;
  const tile = (i: number) =>
    copyRect(
      atlas.rgba,
      atlas.w,
      (i % JELLYFISH_ATLAS_COLS) * cell,
      Math.floor(i / JELLYFISH_ATLAS_COLS) * cell,
      cell,
      cell,
    );
  const over = (dst: Buf, src: Buf, oy = 0) => {
    for (let y = 0; y < src.h; y++) {
      const dy = y + oy;
      if (dy < 0 || dy >= dst.h) continue;
      for (let x = 0; x < src.w; x++) {
        const si = (y * src.w + x) * 4;
        const sa = src.data[si + 3] / 255;
        if (!sa) continue;
        const di = (dy * dst.w + x) * 4;
        const da = dst.data[di + 3] / 255;
        const oa = sa + da * (1 - sa);
        for (let c = 0; c < 3; c++)
          dst.data[di + c] = Math.round(
            (src.data[si + c] * sa + dst.data[di + c] * da * (1 - sa)) / oa,
          );
        dst.data[di + 3] = Math.round(oa * 255);
      }
    }
  };
  const frames = Array.from({ length: JELLYFISH_LAYER_FRAMES }, (_, i) => {
    const out: Buf = { data: new Uint8Array(cell * cell * 4), w: cell, h: cell };
    const offset = JELLYFISH_BELL_ATTACH_Y[i] - JELLYFISH_LAYER_ROOT_Y;
    over(out, tile(JELLYFISH_TENDRILS_START + ((i * 3 + 2) % JELLYFISH_LAYER_FRAMES)), offset);
    over(out, tile(JELLYFISH_ARMS_START + i), offset);
    over(out, tile(JELLYFISH_BELL_START + i));
    return out;
  });
  renderFrames(frames, "jellyfish.png", "layered jellyfish frames");
}

// Composite the fixed body with the continuous tentacle loop and the matching
// siphon/plume progress. The live state machine shows the plume only around an
// impulse; this contact strip intentionally exposes every generated phase.
function renderNautilus() {
  const atlas = decodePng(dataUrlToBuffer(NAUTILUS_ATLAS));
  const cell = NAUTILUS_ATLAS_CELL;
  const tile = (i: number) =>
    copyRect(
      atlas.rgba,
      atlas.w,
      (i % NAUTILUS_ATLAS_COLS) * cell,
      Math.floor(i / NAUTILUS_ATLAS_COLS) * cell,
      cell,
      cell,
    );
  const over = (dst: Buf, src: Buf) => {
    for (let i = 0; i < cell * cell; i++) {
      const si = i * 4;
      const sa = src.data[si + 3] / 255;
      if (!sa) continue;
      const da = dst.data[si + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++)
        dst.data[si + c] = Math.round(
          (src.data[si + c] * sa + dst.data[si + c] * da * (1 - sa)) / oa,
        );
      dst.data[si + 3] = Math.round(oa * 255);
    }
  };
  const frames = Array.from({ length: NAUTILUS_LAYER_FRAMES }, (_, i) => {
    const out: Buf = { data: new Uint8Array(cell * cell * 4), w: cell, h: cell };
    over(out, tile(NAUTILUS_JET_START + i));
    over(out, tile(NAUTILUS_SIPHON_START + i));
    over(out, tile(NAUTILUS_TENTACLES_START + i));
    over(out, tile(NAUTILUS_BODY_START));
    return out;
  });
  renderFrames(frames, "nautilus.png", "layered nautilus frames");
}

function renderBackdrop() {
  const buf = backdropWithProps();

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

function backdropWithProps() {
  return backdropPixels(Number(opt("SEED") ?? 1));
}

// A deterministic cross-section of the runtime pool for headless review. The
// app samples randomly; the preview strides through the whitelist so all four
// atlas families are represented consistently between runs.
function blitRotatingPropSample(buf: ReturnType<typeof backdropPixels>) {
  const selected = Array.from(
    { length: PROP_SLOTS.length },
    (_, index) => PROP_WHITELIST[(index * 5) % PROP_WHITELIST.length],
  );
  const atlasBySprite: Record<WhitelistedProp["sprite"], ReturnType<typeof decodePng>> = {
    "sci-fi-props": decodePng(dataUrlToBuffer(SCI_FI_PROPS_ATLAS)),
    "eldritch-props": decodePng(dataUrlToBuffer(ELDRITCH_PROPS_ATLAS)),
    "star-wars-props": decodePng(dataUrlToBuffer(STAR_WARS_PROPS_ATLAS)),
    "small-props": decodePng(dataUrlToBuffer(SMALL_PROPS_ATLAS)),
  };

  selected
    .map((prop, index) => ({ prop, placement: placeProp(BW, prop, PROP_SLOTS[index]) }))
    .sort((a, b) => a.placement.rootY - b.placement.rootY)
    .forEach(({ prop, placement }) => {
      const atlas = atlasBySprite[prop.sprite];
      const cell = prop.cell;
      const dx = Math.round(placement.rootX - cell / 2);
      const dy = Math.round(placement.spriteY - cell);
      const sx0 = (prop.frame % 4) * cell;
      const sy0 = Math.floor(prop.frame / 4) * cell;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const bx = dx + x;
          const by = dy + y;
          if (bx < 0 || bx >= BW || by < 0 || by >= BH) continue;
          const si = ((sy0 + y) * atlas.w + sx0 + x) * 4;
          const a = atlas.rgba[si + 3] / 255;
          if (!a) continue;
          const [br, bg, bb] = buf[by * BW + bx];
          buf[by * BW + bx] = [
            Math.round(atlas.rgba[si] * a + br * (1 - a)),
            Math.round(atlas.rgba[si + 1] * a + bg * (1 - a)),
            Math.round(atlas.rgba[si + 2] * a + bb * (1 - a)),
            255,
          ];
        }
      }
    });
}

// Representative still of the live modular plant system. This repeats the pure
// placement math from tank.ts at one instant, then inverse-maps each rotated
// atlas cell onto the exact procedural backdrop. It is intentionally headless:
// roots, scale tiers, tint, and foreground framing can be reviewed without a
// browser while the real scene continues to animate each frond independently.
function renderPlantScene() {
  const buf = backdropWithProps();
  blitRotatingPropSample(buf);
  const atlas = decodePng(dataUrlToBuffer(PLANT_ATLAS));
  const time = Number(opt("TIME") ?? 3.4);
  type Part = {
    frame: number;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    angle: number;
    tint: [number, number, number];
    opacity: number;
    z: number;
  };
  const parts: Part[] = [];
  for (const spec of [...MID_PLANTS, ...FOREGROUND_PLANTS]) {
    const rootX = spec.fx * BW;
    const rootY = spec.foreground
      ? BH + spec.depth * RES
      : sandTopAt(Math.max(0, Math.min(BW - 1, rootX))) + spec.depth * RES;
    const names = [...THEME_FRONDS[spec.theme], THEME_BASE[spec.theme]];
    const centre = (names.length - 2) / 2;
    const clusterZ = spec.foreground ? spec.z! : groundZ(rootY);
    names.forEach((name, index) => {
      const base = index === names.length - 1;
      const side = base ? 0 : index - centre;
      const spread = side * 2.1 * RES * spec.scale;
      const centreBoost = base ? 0.72 : 0.78 + (1 - Math.abs(side) / (centre + 1)) * 0.28;
      const scale = spec.scale * centreBoost;
      const layout = PLANT_ATLAS_LAYOUT[name];
      const rootPad = (PLANT_ATLAS_CELL - layout.bottom) * scale;
      const baseAngle = base ? 0 : side * 4.8 + Math.sin(index * 2.7 + spec.phase) * 2.4;
      const sway = (base ? 1.2 : 3.2 + index * 0.38) * (spec.foreground ? 1.22 : 1);
      const phase = spec.phase + index * 1.17;
      const speed = 0.46 + (index % 3) * 0.09;
      const slowCurrent = 0.82 + Math.sin(time * 0.16 + phase * 0.7) * 0.18;
      const angle = baseAngle + Math.sin(time * speed + phase) * sway * slowCurrent;
      const mirror = !base && (index + Math.round(spec.phase)) % 2 === 1;
      parts.push({
        frame: layout.frame,
        x: rootX + spread,
        y: rootY + rootPad,
        scaleX: mirror ? -scale : scale,
        scaleY: scale,
        angle,
        tint: spec.tint,
        opacity: spec.opacity,
        z: clusterZ + index * 0.01,
      });
    });
  }
  parts.sort((a, b) => a.z - b.z);
  for (const part of parts) blitPlantPart(buf, atlas.rgba, atlas.w, part);

  const out = new Uint8Array(BW * BH * 4);
  for (let i = 0; i < buf.length; i++) out.set(buf[i], i * 4);
  const name = opt("OUT") ?? "plants-scene.png";
  writeFileSync(name, encodePng(out, BW, BH));
  console.log(`wrote ${name} (${BW}x${BH}) — ${parts.length} independently placed fronds`);
}

function blitEldritchProps(
  buf: ReturnType<typeof backdropPixels>,
  placements: Map<string, PropPlacement>,
) {
  const atlas = decodePng(dataUrlToBuffer(ELDRITCH_PROPS_ATLAS));
  const cell = ELDRITCH_PROPS_ATLAS_CELL;
  for (const spec of ELDRITCH_PROP_SPECS) {
    const layout = ELDRITCH_PROPS_ATLAS_LAYOUT[spec.name];
    const { rootX, spriteY } = placements.get(spec.name)!;
    const dx = Math.round(rootX - cell / 2);
    const dy = Math.round(spriteY - cell);
    const sx0 = layout.col * cell;
    const sy0 = layout.row * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const bx = dx + x;
        const by = dy + y;
        if (bx < 0 || bx >= BW || by < 0 || by >= BH) continue;
        const si = ((sy0 + y) * atlas.w + sx0 + x) * 4;
        const a = atlas.rgba[si + 3] / 255;
        if (!a) continue;
        const [br, bg, bb] = buf[by * BW + bx];
        buf[by * BW + bx] = [
          Math.round(atlas.rgba[si] * a + br * (1 - a)),
          Math.round(atlas.rgba[si + 1] * a + bg * (1 - a)),
          Math.round(atlas.rgba[si + 2] * a + bb * (1 - a)),
          255,
        ];
      }
    }
  }
}

function blitStarWarsProps(
  buf: ReturnType<typeof backdropPixels>,
  placements: Map<string, PropPlacement>,
) {
  const atlas = decodePng(dataUrlToBuffer(STAR_WARS_PROPS_ATLAS));
  const cell = STAR_WARS_PROPS_ATLAS_CELL;
  for (const spec of STAR_WARS_PROP_SPECS) {
    const layout = STAR_WARS_PROPS_ATLAS_LAYOUT[spec.name];
    const { rootX, spriteY } = placements.get(spec.name)!;
    const dx = Math.round(rootX - cell / 2);
    const dy = Math.round(spriteY - cell);
    const sx0 = layout.col * cell;
    const sy0 = layout.row * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const bx = dx + x;
        const by = dy + y;
        if (bx < 0 || bx >= BW || by < 0 || by >= BH) continue;
        const si = ((sy0 + y) * atlas.w + sx0 + x) * 4;
        const a = atlas.rgba[si + 3] / 255;
        if (!a) continue;
        const [br, bg, bb] = buf[by * BW + bx];
        buf[by * BW + bx] = [
          Math.round(atlas.rgba[si] * a + br * (1 - a)),
          Math.round(atlas.rgba[si + 1] * a + bg * (1 - a)),
          Math.round(atlas.rgba[si + 2] * a + bb * (1 - a)),
          255,
        ];
      }
    }
  }
}

function blitSciFiProps(
  buf: ReturnType<typeof backdropPixels>,
  placements: Map<string, PropPlacement>,
) {
  const atlas = decodePng(dataUrlToBuffer(SCI_FI_PROPS_ATLAS));
  const cell = SCI_FI_PROPS_ATLAS_CELL;
  for (const spec of SCI_FI_PROP_SPECS) {
    const layout = SCI_FI_PROPS_ATLAS_LAYOUT[spec.name];
    const { rootX, spriteY } = placements.get(spec.name)!;
    const dx = Math.round(rootX - cell / 2);
    const dy = Math.round(spriteY - cell);
    const sx0 = layout.col * cell;
    const sy0 = layout.row * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const bx = dx + x;
        const by = dy + y;
        if (bx < 0 || bx >= BW || by < 0 || by >= BH) continue;
        const si = ((sy0 + y) * atlas.w + sx0 + x) * 4;
        const a = atlas.rgba[si + 3] / 255;
        if (!a) continue;
        const [br, bg, bb] = buf[by * BW + bx];
        buf[by * BW + bx] = [
          Math.round(atlas.rgba[si] * a + br * (1 - a)),
          Math.round(atlas.rgba[si + 1] * a + bg * (1 - a)),
          Math.round(atlas.rgba[si + 2] * a + bb * (1 - a)),
          255,
        ];
      }
    }
    if (spec.name === "retro_telemetry_terminal") {
      const screen = SCI_FI_DISPLAY_WINDOWS[spec.name];
      if (screen.shape !== "quad") continue;
      const quad = screen.points.map((point) => ({ x: dx + point.x, y: dy + point.y })) as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ];
      const values = [0.31, 0.58, 0.45, 0.82, 0.67, 0.39, 0.72, 0.55, 0.76, 0.49];
      values.forEach((value, i) => {
        const gap = 0.018;
        const barWidth = (0.86 - gap * (values.length - 1)) / values.length;
        const u0 = 0.07 + i * (barWidth + gap);
        fillPreviewQuad(buf, quad, u0, 0.7 - value * 0.54, u0 + barWidth, 0.7, [71, 208, 199, 255]);
      });
      fillPreviewQuad(buf, quad, 0.07, 0.84, 0.07 + 0.86 * 0.67, 0.93, [238, 167, 70, 255]);
    } else if (spec.name === "porthole_instrument") {
      const screen = SCI_FI_DISPLAY_WINDOWS[spec.name];
      if (screen.shape !== "round") continue;
      const cx = dx + screen.cx;
      const cy = dy + screen.cy;
      const at = (u: number, v: number) => ({
        x: cx + u * screen.ax + v * screen.bx,
        y: cy + u * screen.ay + v * screen.by,
      });
      const plot = (p: { x: number; y: number }, q: { x: number; y: number }, color: [number, number, number, number]) => {
        const steps = Math.ceil(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)));
        for (let i = 0; i <= steps; i++) {
          const x = Math.round(p.x + ((q.x - p.x) * i) / steps);
          const y = Math.round(p.y + ((q.y - p.y) * i) / steps);
          if (x >= 0 && x < BW && y >= 0 && y < BH) buf[y * BW + x] = color;
        }
      };
      plot(at(-1, 0), at(1, 0), [54, 157, 151, 255]);
      plot(at(0, -1), at(0, 1), [54, 157, 151, 255]);
      const blipAngle = -0.72;
      const blip = at(Math.cos(blipAngle) * 0.72, Math.sin(blipAngle) * 0.72);
      fillPreviewRect(buf, Math.round(blip.x) - 1, Math.round(blip.y) - 1, 2, 2, [242, 179, 78, 255]);
    }
  }
}

function fillPreviewRect(
  buf: ReturnType<typeof backdropPixels>,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
) {
  for (let py = Math.max(0, y); py < Math.min(BH, y + h); py++)
    for (let px = Math.max(0, x); px < Math.min(BW, x + w); px++)
      buf[py * BW + px] = color;
}

function fillPreviewQuad(
  buf: ReturnType<typeof backdropPixels>,
  quad: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  color: [number, number, number, number],
) {
  const project = (u: number, v: number) => {
    const [tl, tr, br, bl] = quad;
    const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
    const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
    return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
  };
  const points = [project(u0, v0), project(u1, v0), project(u1, v1), project(u0, v1)];
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const maxX = Math.min(BW - 1, Math.ceil(Math.max(...points.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(BH - 1, Math.ceil(Math.max(...points.map((point) => point.y))));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        if ((a.y > y + 0.5) !== (b.y > y + 0.5) &&
          x + 0.5 < ((b.x - a.x) * (y + 0.5 - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
      }
      if (inside) buf[y * BW + x] = color;
    }
  }
}

function blitPlantPart(
  dst: ReturnType<typeof backdropPixels>,
  atlas: Uint8Array,
  atlasW: number,
  part: {
    frame: number;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    angle: number;
    tint: [number, number, number];
    opacity: number;
  },
) {
  const cell = PLANT_ATLAS_CELL;
  const col = part.frame % PLANT_ATLAS_COLS;
  const row = Math.floor(part.frame / PLANT_ATLAS_COLS);
  const radians = (part.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const radius = cell * Math.max(Math.abs(part.scaleX), part.scaleY) * 1.5;
  const x0 = Math.max(0, Math.floor(part.x - radius));
  const x1 = Math.min(BW - 1, Math.ceil(part.x + radius));
  const y0 = Math.max(0, Math.floor(part.y - radius));
  const y1 = Math.min(BH - 1, Math.ceil(part.y + radius * 0.2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - part.x;
      const dy = y - part.y;
      const localX = (cos * dx + sin * dy) / part.scaleX + cell / 2;
      const localY = (-sin * dx + cos * dy) / part.scaleY + cell;
      const sx = Math.floor(localX);
      const sy = Math.floor(localY);
      if (sx < 0 || sx >= cell || sy < 0 || sy >= cell) continue;
      const si = (((row * cell + sy) * atlasW) + col * cell + sx) * 4;
      const sa = (atlas[si + 3] / 255) * part.opacity;
      if (!sa) continue;
      const bi = y * BW + x;
      const [br, bg, bb] = dst[bi];
      dst[bi] = [
        Math.round((atlas[si] * part.tint[0] / 255) * sa + br * (1 - sa)),
        Math.round((atlas[si + 1] * part.tint[1] / 255) * sa + bg * (1 - sa)),
        Math.round((atlas[si + 2] * part.tint[2] / 255) * sa + bb * (1 - sa)),
        255,
      ];
    }
  }
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
  const atlas3 = decodePng(dataUrlToBuffer(FISH_BONUS_ATLAS));
  const atlas4 = decodePng(dataUrlToBuffer(ALIEN_FISH_ATLAS));

  const kinds = opt("SPECIES")
    ? FISH_KINDS.filter((k) => k.name === opt("SPECIES"))
    : FISH_KINDS;

  const sheets = kinds.map((k) => {
    const inExtra = k.name in FISH_EXTRA_ATLAS_LAYOUT;
    const inBonus = k.name in FISH_BONUS_ATLAS_LAYOUT;
    const inAlien = k.name in ALIEN_FISH_ATLAS_LAYOUT;
    const atlas = inAlien ? atlas4 : inBonus ? atlas3 : inExtra ? atlas2 : atlas1;
    const cell = inAlien
      ? ALIEN_FISH_ATLAS_CELL
      : inBonus
      ? FISH_BONUS_ATLAS_CELL
      : inExtra
        ? FISH_EXTRA_ATLAS_CELL
        : FISH_ATLAS_CELL;
    const { row, col } = inAlien
      ? ALIEN_FISH_ATLAS_LAYOUT[k.name]
      : inBonus
      ? FISH_BONUS_ATLAS_LAYOUT[k.name]
      : inExtra
        ? FISH_EXTRA_ATLAS_LAYOUT[k.name]
        : FISH_ATLAS_LAYOUT[k.name];
    const bb = cellBBox(atlas.rgba, atlas.w, col * cell, row * cell, cell);
    return shearSheet(
      copyRect(atlas.rgba, atlas.w, bb.x, bb.y, bb.bw, bb.bh),
      k.motion,
    );
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

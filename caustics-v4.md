> Historical proposal, superseded by the unified surface/ray shader in `src/waterLighting.ts`. See README for its current preview command.

# Caustics v4 — generated light-map sprite for the surface cap

Supersedes `caustics-v3.md`. v3's premise (concentric procedural arcs = sphere
read) failed in practice: rings around a point read as a bullseye, stacked
falloff terms shrank the visible field, and layered sines can't produce the
reference's painterly, irregular caustic marks. v4 pivots the surface cap to a
**generated, hand-graded light-map sprite** and keeps everything else
procedural.

## Approach

- **Keep procedural:** water gradient (backdrop), major ray shafts, fine ray
  fan, aperture glow, depth fade, time-of-day emitter drift, the
  `animationLoopSeconds` phase discipline. These already look right.
- **Replace only the surface caustic pass** (`surface` block in
  `waterLighting.ts` — dome/cap/warp stack) with a sprite: an image-model-
  generated water-surface master, graded and keyed deterministically, animated
  by a small set of locally derived frames.
- **Generate on black, derive alpha from luminance.** Generated transparency
  is unreliable (established repo convention); a light map on black gives a
  deterministic alpha channel and preserves soft aqua halos.
- **Never request a spritesheet from the image model.** Generated frames are
  not identity-stable. One clean master → all frames derived locally by
  deterministic warping.

## Verified engine constraints (Kaplay 3001.0.19)

- `UniformValue` = `number | Vec2 | Color | Mat4 | arrays` — **no sampler
  uniforms**, so the shader cannot be handed the caustic texture.
- **No `BlendMode` / additive blending.** A sprite layer alpha-composites
  only. With alpha derived from luminance and bright graded RGB, alpha-over on
  dark water approximates a screen blend and the old shader clamped to 1.0
  anyway — acceptable. If it reads milky in practice, the fallback is baking
  the map into the backdrop texture as a strip and sampling it inside the
  existing shader (exact additive, more plumbing); do not reach for this
  unless the simple sprite demonstrably fails.
- Consequence: the light map can only brighten. The old
  `darkeningBetweenCaustics` (0.06) effect is dropped, not ported.

## Asset pipeline

### 1. Master generation (manual, external)

Prompt the image model for a **single still**: underside of a tropical water
surface seen from below, painterly caustic web on pure black, hotspot of
near-white converging light at top-center, cells foreshortening (smaller,
denser) toward the hotspot and enlarging away from it, lower silhouette of the
lit region curved (deepest under the hotspot), light fading well before the
left/right edges. Style reference: soft-edged hand-painted filaments, not
vector lines, not photoreal. Author large (≥2048 wide); several candidates,
pick under the preview composite (§ Tooling).

Per repo convention this is a standalone subject on black — no fish, no
bubbles, no coral clutter, no detached glitter specks.

### 2. Deterministic grading & keying — `tools/gen-caustics.ts`

Input: `art/caustics-master.png` (the chosen candidate, on black).
Output: `art/caustics-frames.png` (frame sheet) + `src/causticsSprite.ts`
(embedded base64 + metadata), matching the other `art/*.png` → `tools/gen-*`
→ `src/*Atlas.ts` pipelines.

Steps, all scripted and re-runnable:

1. **Register.** Locate the luminance centroid of the hotspot; crop/pad so the
   hotspot sits at a fixed anchor (horizontal center, near the top edge). The
   anchor is exported metadata — runtime positioning depends on it.
2. **Resize & quantize.** Final frame size **1920×384 native px** (design
   640×128 × RES). The backdrop bakes per-native-pixel detail, so the light
   map is stored and drawn at native resolution, scale 1 — no ×3 texel blocks.
   "Pixel-quantize" means: posterize luminance to 4–6 levels and snap hues to
   a small aqua/white ramp (reuse `color.ts` helpers), so the map reads as
   pixel art rather than a smooth photo gradient.
3. **Alpha from luminance.** `alpha = curve(luma)` with a hard floor (luma
   below ~0.08 → exactly 0) and a soft shoulder; RGB kept from the graded
   image (not premultiplied white), so halos stay aqua and cores stay
   near-white.
4. **Cleanup + assertions** (repo fleck-validation ethos): kill isolated
   opaque specks under ~4 px; assert a fully transparent 2 px border on all
   sides (clean clipping at screen edges); assert peak luminance falls inside
   the expected hotspot region; assert total opaque coverage within a sane
   band (guards against a regenerated master silently changing scale).
5. **Frame synthesis.** Derive **4 frames from the one graded master** via
   small smooth UV-displacement fields (two low-frequency sine fields, phase
   0 / ¼ / ½ / ¾, amplitude ~2–3 native px), sampled nearest and snapped to
   whole pixels, plus ±3% per-frame brightness jitter on the posterized
   levels. Identity-stable by construction — cells shimmer and breathe, they
   don't dissolve into a different painting.

Sheet: 4 frames stacked vertically → 1920×1536 (fits a 2048² atlas page);
`loadSprite(..., { sliceY: 4 })`. VRAM ≈ 11.8 MB, in line with the creature
atlases.

## Runtime integration

- **New layer, tiny code.** Add the sprite in `tank.ts` at `z(-195)` — above
  the water plate (−200, where rays/glow render), below far plants and the
  sand overlay (−150). Behind every creature by construction.
- **Position from the emitter.** Anchor the sprite's hotspot anchor at
  `sunEmitterX() * VW`, re-sampled in `onUpdate` exactly like the shader's
  `u_emitterX`, so the cap follows the sun and clips partially at the screen
  edges morning/evening. Vertical position fixed at the waterline. Whole-pixel
  snap the position (`Math.round`).
- **Animation.** Two stacked sprite objects crossfading between adjacent
  frames in a ping-pong sequence (1→2→3→4→3→2…), one crossfade every ~6–10 s
  with an S-curve so combined opacity stays near-constant (avoids the mid-fade
  brightness dip). Clock = `k.time() % animationLoopSeconds`, same phase
  discipline as the shader.
- **Ablation.** The layer honors the existing `?off=caustics` switch.
- **Shader diet.** Delete the whole `surface` block from `waterLighting.ts`
  (dome/cap/warp/fragment fields, `capMask`, surface tuning knobs). Keep:
  `fade`, `majorRays`, `fineRays`, `glow`, emitter uniforms. The aperture glow
  stays in the shader — it anchors the rays, and the sprite's hotspot sits on
  top of it.

## Requirements (measurable)

**R1 — Footprint.** Visible lit cap ≈ 55–65% of screen width at its fringe,
deepest ≈ 0.20–0.30 of screen height under the hotspot, curved lower
silhouette, luminance ≥ ~35% of peak across the middle half of the cap (the
v3 lesson: budget *visible* extent, not mask extent — no compounded falloffs).

**R2 — Depth read.** Cell density visibly increases toward the hotspot
(foreshortening). This is a property of the chosen master; reject candidates
without it.

**R3 — Marks.** Painterly filaments, roughly 2–6 native px wide, broken and
irregular; posterized to the ramp; no continuous stroke longer than ~15% of
screen width.

**R4 — Animation.** Motion reads as shimmer/breathing of one surface, never a
dissolve between two different images; no visible loop seam; period phase-
locked to `animationLoopSeconds`.

**R5 — Integration.** Follows `sunEmitterX()` continuously; whole-pixel
positioning; nearest filtering; exact-zero alpha border; behind all creatures
and the sand overlay; `?off=caustics` removes it entirely.

**R6 — Cost.** No new shader passes; one texture (≤ 2048² page), two sprite
objects, an `onUpdate` doing a position + two opacity writes.

## Tooling

- `tools/gen-caustics.ts` — the deterministic pipeline above (uses
  `tools/png.ts`).
- `tools/preview.ts` gains `MODE=caustics`: lays out the four graded frames
  and a composite of frame 0 alpha-blended over the baked backdrop's top band
  → `caustics.png`. Master candidates are judged here, headlessly, before any
  browser run.

## Verification

Headless: run the generator (assertions pass), review `MODE=caustics` PNG
against the reference for R1–R3. Live (R4–R6): `bun run build` + fresh
browser (HMR serves stale modules), watch several crossfades, check edge
clipping by pinning `xOverride` to 0.05 and 0.95, confirm `?off=caustics`,
and eyeball CPU/GPU cost is unchanged.

## Risks

- **Alpha-over vs additive:** slight milkiness where the map overlaps bright
  ray roots is possible; judged live, with the backdrop-strip additive
  variant as the documented fallback.
- **Crossfade dip:** mitigated by S-curve + near-constant total opacity; if
  still visible, drop to hard frame swaps at low frequency (the frames are
  close relatives, so swaps read as shimmer).
- **Master quality is the whole game.** Grading can rescue color and edges,
  not composition — generate multiple candidates and be picky (repo rule:
  regenerate the source rather than postprocess anatomy into quality).

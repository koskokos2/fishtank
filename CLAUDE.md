# Fishtank

An ambient pixel-art fish tank. Fish drift, bubbles rise, plants sway — a screensaver-style scene meant to run indefinitely with no interaction.

Runs as a **web page** and as a **Linux desktop executable** from one codebase.

## Stack

- **Bun** — package manager, bundler, dev server, and single-binary compiler. No npm, Vite, or Node.
- **Kaplay** — rendering, game loop, sprites, scene graph. (Maintained Kaboom.js fork.)
- **TypeScript** — the only language in the app.
- **Pixel art, no external asset pipeline.** The octopus and reef backdrop are generated procedurally in code (`src/pixels.ts`, `src/backdrop.ts`), baked to an offscreen canvas, and handed to Kaplay via `loadSprite`. The fish and the nautilus are realistic sprite atlases instead, embedded as base64 data URLs and smooth-downscaled to size at load (see Conventions). Either way no PNG files are loaded at runtime — every image is code or an embedded data URL.
- **webview-bun** — wraps the web build in a native WebKitGTK window for the Linux binary.

## Commands

```sh
bun install          # deps
bun run dev          # dev server, web target, hot reload
bun run build        # bundle to dist/
bun run compile      # single Linux executable via `bun build --compile`
```

(Keep these script names in sync with `package.json`.)

## Verifying the art without a browser

The sprites can be baked to a PNG headlessly — no dev server, browser, or webview
— so art changes can be reviewed directly:

```sh
bun tools/preview.ts                       # every fish, all swim frames → preview.png
bun tools/preview.ts SPECIES=koi S=12      # one fish, zoomed, for pixel-level checks
bun tools/preview.ts MODE=backdrop         # the baked reef scene → backdrop.png (VW×VH)
bun tools/preview.ts MODE=octopus S=12     # the octopus body → octopus.png
```

Knobs: `MODE` = `fish` (default), `backdrop`, or `octopus`; `S` = upscale factor,
`SPECIES` = filter to one fish by its `FISH_KINDS` name (fish.ts), `SEED` =
backdrop seed. Pass them as trailing args (above) or as env vars; args are
preferred so the single `Bash(bun tools/preview.ts:*)` permission covers every
variation without prompts. For `fish`, the previewer decodes the embedded atlas
and runs the *same* downscale + tail-swish shear as the app (`src/fishbake.ts`),
standing in the browser's smooth resampler with a box downscale; for `backdrop`/
`octopus` it bakes the procedural pixels directly. Open/read the PNG to review.
Prefer this over guessing when iterating on art. The animated scene layers
(caustics, plants, motes, bubbles), the nautilus animation, and all creature
motion still need `bun run dev` to see.

## Layout

```
src/
  main.ts     # kaplay() init, scene setup, the game loop
  res.ts      # RES: the single resolution knob — 640×360 design space × RES is the virtual buffer (VW×VH); every absolute px size/speed scales by it
  fish.ts     # Fish: the kind/level table, makeFishSheets() (bakes the atlas to swim sprites), burst-and-coast swim model, pitch, speed-linked beat, separation
  fishAtlas.ts # GENERATED — the embedded base64 fish sprite atlas (3x4 grid of 128px fish, all facing left)
  fishbake.ts # DOM-free atlas → sprite helpers: crop, downscale, and the synthesized tail-swish swim frames (shared by fish.ts and the previewer)
  cephalopod.ts # Octopus (procedural body + per-frame arms, benthic crawl-drift w/ rare jet) + nautilus (12-frame atlas, jet-cruise motion); shared spawn/arm-layer scaffolding
  nautilusAtlas.ts # the embedded base64 nautilus animation atlas
  tank.ts     # animated layers over the baked backdrop: caustics, swaying plants, motes, bubbles
  pixels.ts   # shared pixel-art shading helpers (hue-shifted ramp, selective outline) used by the procedural octopus
  backdrop.ts # static reef (dithered water, ruins, coral, sand) baked to one full-resolution (VW×VH) sprite
  color.ts    # shared color helpers (hslToRgb, lerp, clamp01) used by pixels + backdrop
tools/
  preview.ts  # headless previewer (bakes the fish swim sheets, the backdrop, or the octopus to PNG)
  gen-fish-atlas.ts # one-off: re-embed art/fish-atlas-128.png into src/fishAtlas.ts
desktop.ts    # webview-bun launcher for the desktop binary
index.html    # mounts the kaplay canvas (web target)
```

## How it runs in each target

Same `src/` everywhere — only the entry differs:

- **Web** — `index.html` mounts the Kaplay canvas directly.
- **Desktop** — `desktop.ts` opens a native webview pointing at the bundled build.

Kaplay needs a browser context (canvas + WebGL), so the compiled binary is **not** headless — it must open the webview. If `bun build --compile` has trouble embedding the native `libwebview` via `bun:ffi`, ship `libwebview.so` next to the executable.

## Conventions

- **Two sprite sources, both DOM-bakeable.** The octopus body is procedural (a silhouette + per-pixel color through the shared shading/outline pipeline in `pixels.ts`). The fish and nautilus are realistic sprite atlases embedded as base64 data URLs (`src/fishAtlas.ts` from `art/fish-atlas-128.png`; `src/nautilusAtlas.ts` from `art/nautilus-atlas-128.png`) and smooth-downscaled to size on a canvas at load — Kaplay has no per-sprite filter and the global one is nearest-neighbor, so a high-res atlas must be resampled down before it hits the crisp grid. A new fish = a new 128px cell in the atlas + an entry in `FISH_KINDS` (name + habitat level); regenerate `fishAtlas.ts` with `tools/gen-fish-atlas.ts`. The fish atlas frames are static, so a tail-swish "swim" is synthesized at bake by shearing the rear of the body in whole-pixel steps (`fishbake.ts`) — keeping it on the integer grid — and played at a speed tied to swim speed.
- **Crisp pixels.** Keep nearest-neighbor scaling on; never enable smoothing.
- **One pixel grid.** The game renders at a fixed virtual resolution and scales to the window (whole-number when it fits, else a fractional fill), so fish and the procedural background share one pixel density. That resolution is the 640×360 **design space** multiplied by `RES` (`src/res.ts`) — currently 2 → 1280×720. Author scene sizes in the 640×360 design space and multiply absolute px sizes/speeds by `RES`; angles, ratios, decay rates, and per-pixel dither/noise stay unscaled (so the dither just gets finer). Draw sprites at scale 1 — scaling a sprite up would make its texels coarser than the rest of the scene and break the consistency. To change the whole scene's detail, change `RES`.
- **Ambient, not interactive.** No input handling, menus, or UI chrome. The scene should look good left alone for hours and stay cheap on CPU.
- **Concise over clever.** This codebase is deliberately small. Prefer a few hundred readable lines over abstractions.

# Fishtank

An ambient pixel-art fish tank. Fish drift, bubbles rise, plants sway — a screensaver-style scene meant to run indefinitely with no interaction.

Runs as a **web page** and as a **Linux desktop executable** from one codebase.

## Stack

- **Bun** — package manager, bundler, dev server, and single-binary compiler. No npm, Vite, or Node.
- **Kaplay** — rendering, game loop, sprites, scene graph. (Maintained Kaboom.js fork.)
- **TypeScript** — the only language in the app.
- **Procedural pixel art** — every sprite is generated in code (`src/pixels.ts`), baked to an offscreen canvas, and handed to Kaplay via `loadSprite`. No PNGs, no asset pipeline.
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

The procedural sprites can be baked to a PNG headlessly — no dev server, canvas,
or webview — so changes to `src/pixels.ts` can be reviewed directly:

```sh
bun tools/preview.ts                    # every species, both swim frames → preview.png
bun tools/preview.ts SPECIES=koi S=16   # one species, zoomed, for pixel-level checks
bun tools/preview.ts MODE=backdrop      # the baked reef scene → backdrop.png (640×360)
bun tools/preview.ts MODE=octopus S=12  # the octopus body → octopus.png
```

Knobs: `MODE` = `fish` (default), `backdrop`, or `octopus`; `S` = upscale
factor, `SPECIES` = filter to one species by name, `COLS` = grid columns, `ONE=1` =
single sprite, `SEED` = backdrop seed. Pass them as trailing
args (above) or as env vars; args are preferred so the single
`Bash(bun tools/preview.ts:*)` permission covers every variation without prompts.
This works because `pixels.ts`/`backdrop.ts` expose `fishFrame`/`backdropPixels`
returning raw RGBA with no DOM dependency (only `makeFishSheet`/`makeBackdrop`
touch the canvas); the previewer hand-encodes the PNG via `node:zlib`. Open/read
the PNG to review. Prefer this over guessing when iterating on art. The animated
scene layers (caustics, plants, motes, bubbles) and fish motion still need
`bun run dev` to see — only the baked sprites are previewable.

## Layout

```
src/
  main.ts     # kaplay() init, scene setup, the game loop
  fish.ts     # Fish entity: burst-and-coast swim model, pitch, speed-linked fin beat, separation
  cephalopod.ts # Octopus (procedural body + per-frame arms, benthic crawl-drift w/ rare jet) + nautilus (12-frame atlas, jet-cruise motion); shared spawn/arm-layer scaffolding
  nautilusAtlas.ts # the embedded base64 nautilus animation atlas (the one non-procedural sprite)
  tank.ts     # animated layers over the baked backdrop: caustics, swaying plants, motes, bubbles
  pixels.ts   # procedural fish sprite generation + shading (shared ramp/outline helpers reused by cephalopod.ts)
  backdrop.ts # static reef (dithered water, ruins, coral, sand) baked to one 640×360 sprite
  color.ts    # shared color helpers (hslToRgb, lerp, clamp01) used by pixels + backdrop
tools/
  preview.ts  # headless previewer (bakes fish grid or the backdrop to PNG)
desktop.ts    # webview-bun launcher for the desktop binary
index.html    # mounts the kaplay canvas (web target)
```

## How it runs in each target

Same `src/` everywhere — only the entry differs:

- **Web** — `index.html` mounts the Kaplay canvas directly.
- **Desktop** — `desktop.ts` opens a native webview pointing at the bundled build.

Kaplay needs a browser context (canvas + WebGL), so the compiled binary is **not** headless — it must open the webview. If `bun build --compile` has trouble embedding the native `libwebview` via `bun:ffi`, ship `libwebview.so` next to the executable.

## Conventions

- **Procedural sprites, not files.** A new fish = a new `Species` in `src/pixels.ts` (silhouette + a per-pixel `body()` color function); the shared shading/outline pipeline does the rest. Don't add image assets unless there's a clear reason. The one exception: the nautilus is a realistic 12-frame animation atlas embedded as a base64 data URL (`src/nautilusAtlas.ts`, source `art/nautilus-atlas-128.png`), smooth-downscaled to fish size on a canvas at load (`makeNautilusSprite`) since Kaplay has no per-sprite filter and the global one is nearest-neighbor.
- **Crisp pixels.** Keep nearest-neighbor scaling on; never enable smoothing.
- **One pixel grid.** The game renders at a fixed virtual resolution (640×360) and integer-scales to the window, so fish and the procedural background share one pixel density. Author scene sizes in that 640×360 space, and draw fish at scale 1 — scaling a sprite up would make its texels coarser than the rest of the scene and break the consistency.
- **Ambient, not interactive.** No input handling, menus, or UI chrome. The scene should look good left alone for hours and stay cheap on CPU.
- **Concise over clever.** This codebase is deliberately small. Prefer a few hundred readable lines over abstractions.

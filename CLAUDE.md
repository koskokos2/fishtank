# Fishtank

An ambient pixel-art fish tank. Fish drift, bubbles rise, plants sway — a screensaver-style scene meant to run indefinitely with no interaction.

Runs as a **web page** and as a **Linux desktop executable** from one codebase.

## Stack

- **Bun** — package manager, bundler, dev server, and single-binary compiler. No npm, Vite, or Node.
- **Kaplay** — rendering, game loop, sprites, scene graph. (Maintained Kaboom.js fork.)
- **TypeScript** — the only language in the app.
- **Pixel art, no external asset pipeline.** The reef backdrop is generated procedurally in code (`src/backdrop.ts`), baked to an offscreen canvas, and handed to Kaplay via `loadSprite`. The fish, sea creatures, and octopus are native transparent pixel-art atlases (`128px` cells) embedded as base64 data URLs; fish/nautilus/jellyfish animation sheets are synthesized from static atlas cells at load, and the octopus is a layered atlas composited and pose-swapped live. No PNG files are loaded at runtime — every image is code or an embedded data URL.
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
bun tools/preview.ts MODE=octopus S=6       # octopus layers composited into sample poses → octopus.png
```

Knobs: `MODE` = `fish` (default), `backdrop`, `octopus`, or `jellyfish`; `S` =
upscale factor, `SPECIES` = filter to one fish by its `FISH_KINDS` name (fish.ts),
`SEED` = backdrop seed. Pass them as trailing args (above) or as env vars; args are
preferred so the single `Bash(bun tools/preview.ts:*)` permission covers every
variation without prompts. For `fish`, the previewer decodes the embedded atlas
and runs the *same* native pixel copy + tail-swish shear as the app
(`src/fishbake.ts`); `jellyfish` likewise bakes the *same* horizontal tentacle-sway
frames from the sea-creature atlas; `octopus` lays out the four keyed
"assembled" poses (idle_hover, swim_pulse, glide_streaming, curled_turn — the ones
the app shows); `backdrop` bakes the procedural reef pixels directly.
Open/read the PNG to review.
Prefer this over guessing when iterating on art. The animated scene layers
(caustics, plants, motes, bubbles), the nautilus animation, the jellyfish bell pulse
(a runtime scale squash, not baked), the octopus's live pose-swapping crawl/swim
state machine, and all creature motion still need `bun run dev` to see.

## Layout

```
src/
  main.ts     # kaplay() init, scene setup, the game loop
  res.ts      # RES: the single resolution knob — 640×360 design space × RES is the virtual buffer (VW×VH); every absolute px size/speed scales by it
  fish.ts     # Fish: the kind/level table, makeFishSheets() (bakes the atlas to swim sprites), burst-and-coast swim model, pitch, speed-linked beat, separation
  fishAtlas.ts # GENERATED — the embedded base64 fish sprite atlas (3x4 grid of 128px fish, all facing left)
  fishbake.ts # DOM-free atlas → sprite helpers: crop, native copy, and the synthesized tail-swish swim frames (shared by fish.ts and the previewer)
  cephalopod.ts # Octopus (baked pose frames — an idle arm-sway loop + swim/turn poses — swapped by a crawl/swim state machine, benthic) + nautilus (sea-creature atlas crop + baked tentacle wiggle, jet-cruise motion) + jellyfish (atlas crop + baked horizontal tentacle sway + runtime bell-pulse squash, "pulse" motion); shared spawn/motion scaffolding
  seaCreaturesAtlas.ts # GENERATED — the embedded base64 sea-creature sprite atlas (3x2 grid of 128px cells)
  octopusAtlas.ts # GENERATED — the embedded base64 octopus sprite sheet baked from the source atlas's "assembled" poses: an idle arm-sway loop + single swim_pulse/glide/curl frames, background keyed to alpha
  tank.ts     # animated layers over the baked backdrop: caustics, swaying plants, motes, bubbles
  backdrop.ts # static reef (smooth water, dithered ruins/coral/sand) baked to one full-resolution (VW×VH) sprite
  color.ts    # shared color helpers (hslToRgb, lerp, clamp01) used by backdrop
tools/
  preview.ts  # headless previewer (bakes the fish swim sheets, the backdrop, the octopus pose composites, or the jellyfish tentacle frames to PNG)
  png.ts      # shared minimal PNG codec (decode/encode RGBA) used by preview.ts + gen-octopus-atlas.ts
  gen-fish-atlas.ts # one-off: re-embed art/fish-atlas-128.png into src/fishAtlas.ts
  gen-sea-creatures-atlas.ts # one-off: re-embed art/sea-creatures-atlas-128.png into src/seaCreaturesAtlas.ts
  gen-octopus-atlas.ts # one-off: key art/octopus-atlas-128.png's black bg to alpha + re-embed into src/octopusAtlas.ts
desktop.ts    # webview-bun launcher for the desktop binary
index.html    # mounts the kaplay canvas (web target)
```

## How it runs in each target

Same `src/` everywhere — only the entry differs:

- **Web** — `index.html` mounts the Kaplay canvas directly.
- **Desktop** — `desktop.ts` opens a native webview pointing at the bundled build.

Kaplay needs a browser context (canvas + WebGL), so the compiled binary is **not** headless — it must open the webview. If `bun build --compile` has trouble embedding the native `libwebview` via `bun:ffi`, ship `libwebview.so` next to the executable.

## Conventions

- **Every creature is a pixel-art atlas; animation is all whole-pixel.** The fish are a transparent atlas embedded as a base64 data URL (`src/fishAtlas.ts` from `art/fish-atlas-128.png`), one native 128px cell per fish. A new fish = a new 128px cell + an entry in `FISH_KINDS` (name + habitat level); regenerate with `tools/gen-fish-atlas.ts`. The fish frames are static, so a tail-swish "swim" is synthesized at bake by shearing the rear of the body in whole-pixel steps (`fishbake.ts`) — keeping it on the integer pixel grid — played at a speed tied to swim speed. The nautilus and jellyfish are cropped from the sea-creature atlas (`src/seaCreaturesAtlas.ts` from `art/sea-creatures-atlas-128.png`, cells 4 and 0) and use the same static-cell-to-animation approach: the nautilus wiggles the lower-left tentacle region while the shell stays rigid; the jellyfish sways its full-width tentacle curtain as a horizontal travelling wave, and its propulsive bell *pulse* is a separate runtime `scale.y` squash (≤ 1 to stay crisp) synced to the swim thrust — see the `"pulse"` motion. A new sea creature = a new 128px cell + an index export from `gen-sea-creatures-atlas.ts` + a `KINDS` entry.
- **The octopus is the most complex creature — pose-driven, not deformed.** It comes from its own atlas (`src/octopusAtlas.ts` from `art/octopus-atlas-128.png` + `.json`, a 4x4 grid loaded as one 16-frame sheet), a side-view left-facing octopus. The first three rows are component layers (body / back tentacles / front tentacles), but they do **not** overlay into a clean creature in code — stacking all three doubles the arms into a tangle, and one or two layers is incomplete — so the app uses the atlas's last row, the artist's pre-composited **"assembled" poses** (idle_hover, swim_pulse, glide_streaming, curled_turn), each a whole clean octopus. The crawl/swim state machine in `cephalopod.ts` selects one pose frame per update: it mostly crawls slow and omnidirectional low in the tank, cycling a short **idle arm-sway loop** (baked into the sheet's first frames — the idle pose with its arms gently swaying as a whole-pixel travelling wave, jellyfish-style, while the mantle stays rigid; per-creature phase offset so two octopuses aren't in lockstep), and flashing the curl pose on a turn; then it occasionally pushes off into a short pulse-glide swim (gather → thrust → glide → settle, swapping to the single pulse/glide poses) and resettles low. The source PNG's opaque-black background is keyed to alpha by `tools/gen-octopus-atlas.ts` (border flood-fill + size-thresholded enclosed cavities, preserving the eye pupils).
- **Crisp pixels.** Keep nearest-neighbor scaling on; never enable smoothing.
- **One pixel grid.** The game renders at a fixed virtual resolution and scales to the window (whole-number when it fits, else a fractional fill), so fish and the procedural background share one pixel density. That resolution is the 640×360 **design space** multiplied by `RES` (`src/res.ts`) — currently 3 → 1920×1080. Author scene sizes in the 640×360 design space and multiply absolute px sizes/speeds by `RES`; angles, normalized fractions, and decay rates stay unscaled. Fish sprites are drawn at their authored pixel size, so increasing `RES` makes 128px fish occupy less of the tank while preserving their source resolution. Draw sprites at scale 1 — scaling a sprite up would make its texels coarser than the rest of the scene and break the consistency.
- **Ambient, not interactive.** No input handling, menus, or UI chrome. The scene should look good left alone for hours and stay cheap on CPU.
- **Concise over clever.** This codebase is deliberately small. Prefer a few hundred readable lines over abstractions.

# Fishtank

An ambient pixel-art fish tank. Fish drift, bubbles rise, plants sway — a screensaver-style scene meant to run indefinitely with no interaction.

Runs as a **web page** and as a **Linux desktop executable** from one codebase.

## Stack

- **Bun** — package manager, bundler, dev server, and single-binary compiler. No npm, Vite, or Node.
- **Kaplay** — rendering, game loop, sprites, scene graph. (Maintained Kaboom.js fork.)
- **TypeScript** — the only language in the app.
- **Pixel art, no external asset pipeline.** The reef backdrop is generated procedurally in code (`src/backdrop.ts`), baked to an offscreen canvas, and handed to Kaplay via `loadSprite`. The fish, sea creatures, octopus, and jellyfish are native transparent pixel-art atlases (`128px` cells) embedded as base64 data URLs; fish/nautilus animation sheets are synthesized from static atlas cells at load, while the octopus and jellyfish ship real pose atlases baked at build and pose-swapped live. No PNG files are loaded at runtime — every image is code or an embedded data URL.
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
bun tools/preview.ts MODE=octopus S=6       # octopus assembled poses laid out → octopus.png
```

Knobs: `MODE` = `fish` (default), `backdrop`, `octopus`, or `jellyfish`; `S` =
upscale factor, `SPECIES` = filter to one fish by its `FISH_KINDS` name (fish.ts),
`SEED` = backdrop seed. Pass them as trailing args (above) or as env vars; args are
preferred so the single `Bash(bun tools/preview.ts:*)` permission covers every
variation without prompts. For `fish`, the previewer decodes the embedded atlas
and runs the *same* native pixel copy + tail-swish shear as the app
(`src/fishbake.ts`); `jellyfish` lays out the sixteen baked jellyfish poses;
`octopus` lays out the baked octopus frames (the idle-hover sway loop + the eleven
crawl/rest/swim poses the app shows); `backdrop` bakes the procedural reef pixels
directly.
Open/read the PNG to review.
Prefer this over guessing when iterating on art. The animated scene layers
(caustics, plants, motes, bubbles), the nautilus animation, the octopus's and
jellyfish's live pose-swapping state machines, and all creature motion still need
`bun run dev` to see.

## Layout

```
src/
  main.ts     # kaplay() init, scene setup, the game loop
  res.ts      # RES: the single resolution knob — 640×360 design space × RES is the virtual buffer (VW×VH); every absolute px size/speed scales by it
  fish.ts     # Fish: the kind/level table, makeFishSheets() (bakes the atlas to swim sprites), burst-and-coast swim model, pitch, speed-linked beat, separation
  fishAtlas.ts # GENERATED — the embedded base64 fish sprite atlas (3x4 grid of 128px fish, all facing left)
  fishbake.ts # DOM-free atlas → sprite helpers: crop, native copy, and the synthesized tail-swish swim frames (shared by fish.ts and the previewer)
  cephalopod.ts # Octopus (baked pose frames — an idle arm-sway loop + swim/turn poses — swapped by a crawl/swim state machine, benthic) + nautilus (sea-creature atlas crop + baked tentacle wiggle, jet-cruise motion) + jellyfish (16-pose atlas swapped by the "pulse" machine: pulse cycle synced to thrust, streaming glides, hover variety, turn rolls, rare startle); shared spawn/motion scaffolding
  seaCreaturesAtlas.ts # GENERATED — the embedded base64 sea-creature sprite atlas (3x2 grid of 128px cells)
  jellyfishAtlas.ts # GENERATED — the embedded base64 jellyfish pose atlas (4x4 grid of 128px cells: pulse cycle, glides, hover variety, turns, flare/recoil), indexed by name via JELLYFISH_POSE
  octopusAtlas.ts # GENERATED — the embedded base64 octopus sprite sheet baked from the source atlas's twelve "assembled" poses (rows 3-5): an idle-hover arm-sway loop + single crawl/rest/swim pose frames, indexed by name via OCTOPUS_POSE
  tank.ts     # animated layers over the baked backdrop: caustics, swaying plants, motes, bubbles
  backdrop.ts # static reef baked to two full-resolution (VW×VH) sprites: the water/ruins back plate and a transparent sand overlay (dunes only); far plants render between them so the dune crest occludes their roots, while rotating props stay live
  color.ts    # shared color helpers (hslToRgb, lerp, clamp01) used by backdrop
tools/
  preview.ts  # headless previewer (bakes the fish swim sheets, the backdrop, the octopus pose composites, or the jellyfish tentacle frames to PNG)
  png.ts      # shared minimal PNG codec (decode/encode RGBA) used by preview.ts + gen-octopus-atlas.ts
  gen-fish-atlas.ts # one-off: re-embed art/fish-atlas-128.png into src/fishAtlas.ts
  gen-sea-creatures-atlas.ts # one-off: re-embed art/sea-creatures-atlas-128.png into src/seaCreaturesAtlas.ts
  gen-jellyfish-atlas.ts # one-off: normalize art/jellyfish-atlas-transparent.png into the 4x4 art/jellyfish-atlas-128.png (bell-anchored, shared bell-top line) + re-embed into src/jellyfishAtlas.ts
  gen-octopus-atlas.ts # one-off: flood-extract art/octopus-atlas-128.png's twelve assembled poses, bake to a sprite sheet + re-embed into src/octopusAtlas.ts
desktop.ts    # webview-bun launcher for the desktop binary
index.html    # mounts the kaplay canvas (web target)
```

## How it runs in each target

Same `src/` everywhere — only the entry differs:

- **Web** — `index.html` mounts the Kaplay canvas directly.
- **Desktop** — `desktop.ts` opens a native webview pointing at the bundled build.

Kaplay needs a browser context (canvas + WebGL), so the compiled binary is **not** headless — it must open the webview. If `bun build --compile` has trouble embedding the native `libwebview` via `bun:ffi`, ship `libwebview.so` next to the executable.

## Conventions

- **Atlas changes have a guide.** Before changing sprite atlases, atlas generators, padding/packing behavior, or modular/composed objects, read `./docs/sprite-atlas-best-practices.md`. It is the project standard for atlas best practices and includes current refactor candidates; do not assume the current atlas pipeline is always the ideal target.
- **Generated prop atlases need real transparency before normalization.** Chroma-key PNGs are temporary source/reference files only. Convert them to `*-transparent.png` first (native transparency or border-sampled chroma removal with soft matte/despill when the key colour is absent; `tools/remove-connected-chroma.ts` when key-like colours appear in the art), then point the atlas generator at alpha. Do not let a runtime normalizer rely on broad RGB key thresholds; they leave halos and can eat intentional purple/green artwork. If a generated subject part itself has the wrong colour, such as a pink cable that should be graphite, regenerate or replace the source art instead of trying to postprocess it into quality. Scripted repair is for pixel artifacts, not visual anatomy: it is good at halos, specks, source-pixel recovery, and assertions, but weak at making newly attached parts feel physically integrated. If a missing antenna/handle/limb/tentacle/cable plug must read as attached, regenerate the whole affected tile/component and wire that source into the generator. Prompt generated props as standalone objects with an integrated contact/grounding rim when the set needs it, but no detached bubbles, floating specks, coral clutter, glitter, or side dressing; the atlas generator/game handle final grounding, dither, and validation.
- **Every creature is a pixel-art atlas; animation is all whole-pixel.** The fish are a transparent atlas embedded as a base64 data URL (`src/fishAtlas.ts` from `art/fish-atlas-128.png`), one native 128px cell per fish. A new fish = a new 128px cell + an entry in `FISH_KINDS` (name + habitat level); regenerate with `tools/gen-fish-atlas.ts`. The fish frames are static, so a tail-swish "swim" is synthesized at bake by shearing the rear of the body in whole-pixel steps (`fishbake.ts`) — keeping it on the integer pixel grid — played at a speed tied to swim speed. The nautilus is cropped from the sea-creature atlas (`src/seaCreaturesAtlas.ts` from `art/sea-creatures-atlas-128.png`, cell 4) and uses the same static-cell-to-animation approach: it wiggles the lower-left tentacle region while the shell stays rigid. A new sea creature = a new 128px cell + an index export from `gen-sea-creatures-atlas.ts` + a `KINDS` entry.
- **The jellyfish is pose-driven, like the octopus.** Its atlas (`art/jellyfish-atlas-128.png` + `.json`, embedded as `src/jellyfishAtlas.ts` by `tools/gen-jellyfish-atlas.ts`) is a 4x4 grid of sixteen artist poses: the four-frame bell-pulse cycle (relaxed → contract_early → contract_tight → reopen), streaming glide poses, hover variety, turn rolls, and a flare/recoil pair, each bell-anchored horizontally and sharing one bell-top line so frames swap without the body jumping. The `"pulse"` machine in `cephalopod.ts` picks one frame per update — no runtime deformation: the contraction frames play in sync with the propulsive thrust (a weak "breathing" pulse skips the tight squeeze), fast coasting shows the streaming-glide ladder (stepping down as drag slows it), slow drifting cycles the hover-variety loop, direction flips flash a turn roll, and every ~30–90s an oral-arms flare winds up a boosted recoil retreat. The art natively leads right (tentacles trail left), so its `artDir` is 1 and `flipX` mirrors it when travelling left.
- **The octopus is the most complex creature — pose-driven, not deformed.** It comes from its own atlas (`art/octopus-atlas-128.png` + `.json`), a side-view left-facing octopus, 4 cols × 6 rows on a transparent background. The first three rows are component layers (body / back tentacles / front tentacles), but they do **not** overlay into a clean creature in code — stacking all three doubles the arms into a tangle, and one or two layers is incomplete — so `tools/gen-octopus-atlas.ts` uses the last three rows, the artist's twelve pre-composited **"assembled" poses** (idle_hover, swim_pulse, glide_streaming, curled_turn; resting_on_sand, low_crawl_reach, low_crawl_push, settled_curled_rest; the four `active_*` variants). It **bakes them into a clean sheet** (`src/octopusAtlas.ts`): each pose is flood-extracted as a connected blob, clamped to its own cell band so a tightly-packed neighbour can't bleed in (the mantle dome that overflows its source cell is kept, not clipped), then re-centred in a uniform square frame (poses vary in arm reach — centring keeps the mass put as frames swap). The idle_hover pose is expanded into a short **arm-sway loop** (whole-pixel horizontal travelling wave, jellyfish-style, mantle rigid) for the in-place hover; `OCTOPUS_POSE` exports each remaining pose's frame index by name. The crawl/swim state machine in `cephalopod.ts` then selects one frame per update, driving all twelve. Behaviour is benthic: it **rests on the sand** (its body centre rides `OCTO_SIT` px above the dune contour from `backdrop.ts`'s exported `sandTopAt(x)`), parking for a few seconds up to ~a minute with the **arms held still** (resting_on_sand for short parks, the curled settled_curled_rest for long ones); between rests it hops a short way along the sand with a **2-frame reach↔push crawl gait** (per-creature phase offset; curled_turn flashed on a heading change); and now and then it pushes off into a short pulse-glide swim (reach push-off → pulse → glide → hover-down settle, the energetic `active_*` poses on multi-pulse bouts) before settling back onto the substrate. On touchdown it briefly **presses into the sand** (a short eased `buryNow` dip on the rest target/floor) and kicks up a **sand-grain puff** — `spawnSandPuff` emits a few short-lived sand-coloured grain objects that pop up from the surface and fall back under gravity. The puff/dip are runtime-only (no `preview.ts` path, like the jellyfish bell pulse), and the grains are lightweight `k.add`+`onUpdate`+`destroy()` particles in the `tank.ts` mote/bubble idiom rather than Kaplay's `particles()` (which needs a GPU texture and emits subpixel quads) — keeping them crisp and cheap.
- **Crisp pixels.** Keep nearest-neighbor scaling on; never enable smoothing.
- **Atlas import settings are part of the art.** Keep pixel-art atlases lossless/uncompressed unless a target platform forces otherwise; avoid accidental mipmaps, lossy compression, or wrap/filter settings that sample gutters. If mipmaps or fractional scaling enter the pipeline, add/verify padding plus edge extrusion rather than trusting transparent space.
- **One pixel grid.** The game renders at a fixed virtual resolution and scales to the window (whole-number when it fits, else a fractional fill), so fish and the procedural background share one pixel density. That resolution is the 640×360 **design space** multiplied by `RES` (`src/res.ts`) — currently 3 → 1920×1080. Author scene sizes in the 640×360 design space and multiply absolute px sizes/speeds by `RES`; angles, normalized fractions, and decay rates stay unscaled. Fish sprites are drawn at their authored pixel size, so increasing `RES` makes 128px fish occupy less of the tank while preserving their source resolution. Draw sprites at scale 1 — scaling a sprite up would make its texels coarser than the rest of the scene and break the consistency.
- **Ambient, not interactive.** No input handling, menus, or UI chrome. The scene should look good left alone for hours and stay cheap on CPU.
- **Concise over clever.** This codebase is deliberately small. Prefer a few hundred readable lines over abstractions.

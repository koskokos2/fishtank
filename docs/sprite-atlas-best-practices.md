# Building Good Pixel Sprite Atlases

This guide is a practical standard for pixel-game sprite atlases. It uses this
repo as a case study, not as the definition of best practice: good local patterns
are called out, and shortcuts become refactor candidates.

A sprite atlas is not just a packed PNG. It is a rendering contract between the
artist, packer, runtime, and animation system. The image, metadata, pivots,
padding, names, source sizes, draw order, and build settings all matter.

## Contents

- [Goals](#goals)
- [Core Principles](#core-principles)
- [Target Atlas Pipeline](#target-atlas-pipeline)
- [External Review Notes](#external-review-notes)
- [Packing Strategy](#packing-strategy)
- [Bigger Objects Made From Separate Sprites](#bigger-objects-made-from-separate-sprites)
- [Quality Checklist](#quality-checklist)
- [Project Defaults and Refactor Candidates](#project-defaults-and-refactor-candidates)
- [Sources](#sources)

## Goals

A good atlas should:

- keep pixels crisp under the game's actual camera and scaling rules;
- reduce texture switches by grouping sprites that are drawn together;
- avoid bleeding from neighboring sprites under filtering or sub-pixel sampling;
- preserve source intent with stable names, pivots, trim data, and sockets;
- rebuild deterministically from source files;
- support review at native size and at the final in-game scale;
- make big objects, modular props, and multi-part characters easy to assemble.

## Core Principles

### Optimize for the renderer, not the folder tree

Texture atlases exist mostly to reduce state changes. NVIDIA's texture-atlas
whitepaper frames the win as batching: if many sprites use one texture, the
renderer can draw more work before binding a different texture. Engine docs say
the same thing in practical terms: libGDX recommends packing small images into
larger textures because switching textures is expensive, and Unity's Sprite
Atlas exists to consolidate sprite textures for runtime use.

That means atlas grouping should follow runtime behavior:

- put sprites that appear together on the same page;
- separate sprites that need different sampler state, compression, filtering,
  blend mode, or lifetime;
- keep UI, world sprites, particles, terrain, and large background plates on
  separate pages when they are drawn in different phases;
- avoid a single mega-atlas if it forces unrelated assets to stay resident.

For this project, the current split into fish, nautilus, octopus, jellyfish, prop,
and other thematic atlases is reasonable because those groups also map to different
runtime systems and preview/generation tools.

### Keep the pixel grid sacred

Pixel art should normally use nearest-neighbor filtering, whole-pixel source
regions, and whole-pixel destination positions. Fractional scaling, linear
filtering, mipmaps, and camera movement at fractional pixels can turn a good
atlas into a blurred or unstable image.

Use these defaults unless you have a deliberate exception:

- point/nearest filtering for pixel art;
- mipmaps off for sprites that are never minified; if they are minified, test
  mipmaps deliberately and increase padding/extrusion because lower mip levels
  mix neighboring texels more aggressively;
- lossless/uncompressed texture output for pixel-art atlases by default; avoid
  lossy and GPU/VRAM compression unless the target platform forces it and visual
  review proves the result is acceptable;
- alpha blending on transparent sprites, but no color data left undefined around
  the visible pixels;
- integer sprite positions and integer crop rectangles;
- no runtime rotation unless the art was authored for it;
- consistent pixel density across sprites that share the same scene.

If the game ever uses fractional camera scaling or WebGL/canvas sampling, padding
and extruded edges become more important, not less.

### Treat metadata as part of the art

The atlas PNG is only half the asset. The sidecar data should preserve enough
information to reconstruct the sprite exactly:

- stable sprite name;
- page/image name;
- x, y, width, height in the atlas;
- original untrimmed source width and height;
- trim offset inside the original source frame;
- pivot/origin;
- category, role, tags, animation group, or gameplay id;
- collision, hurtbox, or interaction anchors if relevant;
- sockets/attachment points for modular objects;
- draw layer or part order for multi-part sprites;
- related secondary textures, such as normal maps, masks, or emission maps;
- generator version or source revision when builds need reproducibility.
- source pipeline fields for generated/replacement art, such as chroma source,
  transparent source, regenerated tile source, and the script that normalized it.

If you trim transparent pixels but throw away the original frame and offset, the
sprite will appear to jump between animation frames. If you keep the trim data,
you get smaller atlas regions without changing visual alignment.

## Target Atlas Pipeline

A mature atlas pipeline should look like this:

1. Keep source art separate from runtime output.
2. Store artist-facing metadata next to the source art.
3. Generate packed runtime pages deterministically.
4. Emit a machine-readable manifest with regions, pivots, trim offsets, bounds,
   sockets, recipes, and page names.
5. Generate only small typed runtime indexes when the codebase wants TypeScript
   constants.
6. Render automated preview sheets for review.
7. Validate the manifest in CI or a local build script.

The target is not "one perfect PNG." The target is a repeatable pipeline that
can answer: which source produced this sprite, where is it packed, how should it
be drawn, how does it attach to other sprites, and how can we prove it still
renders correctly?

## External Review Notes

Reviewed against common engine/tool documentation and community-facing sprite
workflows in July 2026. The outside advice mostly confirms this guide, with a
few useful sharpenings:

- **Padding and alpha bleeding are not optional polish.** TexturePacker,
  libGDX, Unity, and Godot all expose some combination of padding, separation,
  duplicate edge pixels, alpha dilation/bleeding, or filter clipping. This
  confirms the project rule: do not leave transparent padding with arbitrary RGB,
  and do not rely on "nearest" alone to hide bad atlas edges. If the project
  moves from fixed source grids to tighter packed pages, the packer should
  duplicate/extrude edge pixels into padding as a first-class output step.
- **Use nearest/point filtering and lossless art storage for pixel art.** Unity's
  Sprite Atlas settings call out point filtering as the pixelated option and
  bilinear/trilinear as smoothing. Godot recommends lossless compression for
  pixel art and warns that VRAM compression creates visible artifacts in 2D or
  low-resolution textures. For this repo: PNG/source losslessness and nearest
  runtime sampling are defaults, not taste preferences.
- **Mipmaps are contextual, not always wrong.** For this 2D tank, most sprites
  are drawn near native scale, so mipmaps should usually stay off. If a future
  view zooms out, Godot and WebGL guidance both support mipmaps as a way to
  reduce distant grain/shimmer, but that raises the standard for padding and
  extrusion because mip levels blend wider neighborhoods.
- **Margins, separation, and region metadata are asset data.** Aseprite imports
  sheets by offset, sprite size, padding, and sheet order; Godot TileSet atlases
  track margins, separation, region size, and texture padding. Changing those
  values can invalidate existing coordinates. In this repo, cell size, margin,
  padding, row/column count, and frame order changes should be treated as
  manifest migrations, not casual PNG edits.
- **Engine docs solve sampling; they do not solve art coherence.** The online
  tooling advice is strong on halos, padding, compression, metadata, and
  filtering, but it will not make a pasted-on antenna, limb, plug, or tentacle
  read as a coherent sprite. Keep the local rule from the pop-culture pass:
  scripted repair is for measurable pixel artifacts; structural/attachment
  problems require a whole tile/component replacement source.

### Source sheets and runtime sheets can differ

A fixed 128 px grid can be excellent as a source format because it is easy to
edit, inspect, and discuss. That does not mean the runtime texture must always
stay as a 128 px grid. A common best-practice split is:

- source sheets stay human-readable;
- build output is tightly packed, padded, and extruded;
- metadata maps stable sprite names to runtime regions;
- preview tools compare the packed output against the source intent.

For a tiny project, using the source grid directly at runtime is acceptable. As
the sprite count grows, a generated packed runtime page is usually better.

### Keep code indexes small

Embedding atlas PNGs as base64 strings in generated TypeScript is convenient for
a no-loader project, and it can be a valid local tradeoff. It is not inherently
the best atlas architecture.

As the art set grows, large generated TypeScript modules can make diffs noisy,
increase source parsing work, and reduce the value of browser or bundler asset
caching. The more scalable pattern is:

- PNG or WebP atlas pages emitted as build assets;
- JSON manifest emitted as data;
- small generated TypeScript file that exports names, types, and manifest access;
- content-hashed asset URLs or bundler-managed imports.

Keep base64 embedding only when the zero-file runtime constraint is more
important than build transparency and asset caching.

### Validate instead of trusting conventions

Atlas conventions should be checked by scripts, not memory. A validator should
catch:

- duplicate sprite names;
- missing source files;
- sprites outside page bounds;
- empty frames;
- trim offsets that change animation alignment;
- sockets whose types do not match recipe connections;
- recipes that reference missing sprites or sockets;
- pages that exceed target texture size;
- transparent edge pixels with unsafe RGB values;
- missing padding or missing edge extrusion on packed pages.

## Packing Strategy

### Use a real packer for irregular sprites

Packing rectangles into a limited page is a bin-packing problem. Jukka Jylanki's
rectangle bin-packing work surveys practical heuristics such as MaxRects,
Guillotine, and Skyline approaches. The important production lesson is that
packing is heuristic: there is no single magic layout. Use a known packer, fix
its settings, and make the output deterministic so diffs and reviews stay sane.

Use fixed grids when human review, stable cell coordinates, or a shared authored
frame matter more than texture area. Use tight packing when sprites vary in size,
page count matters, or transparent cells waste too much memory.

### Use padding, edge padding, and extrusion

Texture bleeding happens when sampling reaches into a neighboring region. It can
show up with linear filtering, mipmaps, fractional sprite placement, texture
compression, or camera transforms. The standard defenses are:

- padding between sprites;
- edge padding around the outside of the atlas;
- extrusion/duplicate padding, where the edge pixels of each sprite are copied
  outward into the transparent gutter;
- correct UV/crop math that does not sample outside the intended rectangle.

TexturePacker documents both padding and "extrude" settings. libGDX's packer has
edge padding and duplicate padding settings. Unity's Sprite Atlas has padding and
tight packing controls. Godot's atlas/tile APIs expose margins, separation, and
filter clipping options for similar reasons.

Recommended pixel-art defaults:

- 2 px padding for simple nearest-only rendering;
- 4 px padding when the camera can scale or when mipmaps/compression enter the
  picture;
- duplicate/extrude edge pixels into the padding;
- keep a padded border around the whole atlas page;
- keep texture wrap/clamp settings from sampling outside the intended sprite
  region; do not assume transparent gutters are enough if filtering or mipmaps
  are enabled;
- test sprites on both light and dark backgrounds to catch halos.

Do not leave transparent padding as arbitrary RGB. Transparent pixels still have
color values, and filtering can blend those hidden colors into the edge.

### Treat chroma-key sheets as temporary, not as atlas sources

For generated prop atlases, prefer the Star Wars prop workflow: remove the key
background first, commit a real `*-transparent.png` source, and let the atlas
normalizer consume alpha only. The normalizer should find bounds, resample, and
dither from transparent pixels; it should not be responsible for deciding which
opaque magenta, green, or blue pixels are background.

The pop-culture prop pass showed why this matters. That sheet was generated on a
flat magenta background and the first normalizer tried to key it directly with
RGB thresholds. Exact key pixels were easy to delete, but anti-aliased and
model-painted "almost key" pixels survived around silhouettes. Making the
threshold broader would also risk deleting intentional purple art such as coral,
hearts, and glow accents. In contrast, the Star Wars sheet entered its normalizer
as `art/star-wars-props-atlas-transparent.png`, with alpha already solved, so the
runtime atlas inherited no chroma halo.

The eldritch prop sheets are a useful distinction: the `*-chroma.png` files are
traceable generation references and can visibly contain one or more matte/key
tones, but they are not runtime sources. The generator must consume the
`*-transparent.png` versions and the final `*-128.png` atlas must validate clean.
Do not call a chroma reference "good" merely because it will not be loaded; call
the runtime atlas good only after exact/near key pixels and forbidden hue leaks
measure zero.

Standard generated-atlas sequence:

1. Generate on native transparent output when available. If only chroma-key
   output is available, use a flat key color that is absent from the subject and
   forbid that color in the prompt.
2. Convert the chroma sheet to transparency immediately, before atlas
   normalization. If the key colour is truly absent from the subject art, use a
   border-sampled soft matte, despill, and a small edge contract. In Codex
   desktop, prefer the bundled Python reported by `load_workspace_dependencies`
   when system Python does not have Pillow, for example:

   ```sh
   /Users/km/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
     /Users/km/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
     --input art/example-atlas-chroma.png \
     --out art/example-atlas-transparent.png \
     --auto-key border \
     --soft-matte \
     --transparent-threshold 12 \
     --opaque-threshold 220 \
     --despill \
     --edge-contract 1
   ```

   If the key colour overlaps intentional artwork, such as magenta/purple hearts,
   coral, glow, or glyph details, do not use a global despill/key pass. Use the
   connected-background converter instead:

   ```sh
   bun tools/remove-connected-chroma.ts \
     art/example-atlas-chroma.png \
     art/example-atlas-transparent.png
   ```

3. If the subject itself contains the wrong colour, regenerate or replace that
   source art. Chroma cleanup can remove matte and spill, but it cannot make a
   pink cable into a good graphite cable without lowering art quality. Focused
   replacements should match or exceed the source sheet quality; do not paste in
   a cleaner but simpler tile.
4. Generate prop subjects as props with intentional contact grounding, not as
   mini underwater scenes. A small integrated sand/rock/dither rim can be good
   and may be necessary to match atlases such as Star Wars or eldritch props.
   Avoid loose bubbles, floating specks, coral tufts, glitter, or side clutter
   that is detached from the prop's contact patch; those become "hanging
   bubbles" or inconsistent substrate after normalization.
5. Point the atlas generator at `art/*-transparent.png`. Keep the chroma PNG only
   as a traceable source/reference, not as the primary extraction input.
6. If a generator must support chroma fallback, make it border/edge-aware:
   remove only background-connected key pixels, clean key-coloured halo pixels
   only on transparent edges, seed enclosed key-coloured holes, and never
   globally purge a hue that might appear in the artwork.
7. Validate the final runtime atlas: exact key pixels should be zero, near-key
   opaque pixels should be zero, forbidden subject hues should fail loudly, and
   the atlas must be inspected on dark, checkerboard, and saturated backgrounds.

### Use scripted repair for pixel artifacts, not for structural art problems

The pop-culture prop pass exposed a useful boundary for Codex-assisted atlas
work.

Codex/scripted cleanup is strong at repeatable, measurable pixel problems:

- removing exact and near chroma-key pixels;
- cleaning background-connected halos and detached specks;
- preserving intentional colours with narrow, region-aware allowlists;
- recovering a few missing pixels from the same source drawing, such as a cable
  edge, when the shape already exists and only cleanup erased it;
- embedding validation into the generator so the same mistakes fail loudly next
  time.

It is weak at visual anatomy and attachment when the missing part was never a
coherent part of the current drawing. Do not try to "surgically" attach a cap,
limb, tentacle, handle, cable plug, or any other semantically important part from
another source unless the result is a true same-drawing restoration. Even if the
pixels line up technically, the lighting, contour, perspective, and silhouette
can read as pasted-on. The robot-head antenna was the lesson here: a recovered
cap existed, but it did not belong to the dome until the whole robot tile was
regenerated as one object.

Before fixing an atlas defect, classify it:

1. **Artifact problem** — matte colour, chroma halo, detached bubbles, tiny
   islands, local over-cleaning, or a few erased pixels from an otherwise intact
   shape. Fix this in the generator with narrow masks, source recovery, and
   assertions.
2. **Source-art problem** — wrong colour inside the subject, low detail,
   incorrect shape, bad attachment, inconsistent lighting, or a part that needs
   to feel physically integrated. Regenerate or replace the whole affected tile
   or component, then let the generator normalize it.

When regenerating a focused replacement:

- save the generated source as a traceable project asset, for example
  `art/<atlas>-<sprite>-regenerated.png`;
- record it in the atlas manifest under a replacement/source field;
- wire it into the generator as a full replacement path rather than editing the
  generated runtime atlas by hand;
- remove failed splice/inpainting helpers once the full replacement exists;
- verify native-size and 4x crops, then run chroma/forbidden-hue metrics and the
  project build.

### Be careful with rotation

Many atlas packers can rotate sprites by 90 degrees for a tighter pack. That is
fine for some engines, but it is a bad default for pixel art unless the runtime
and tooling fully support it.

Avoid rotation when:

- artists inspect or edit the atlas by hand;
- shaders or generated animations assume unrotated coordinates;
- a sprite has direction-specific pixel motifs;
- the atlas is also used as a readable source sheet.

Allow rotation only when:

- the atlas is purely generated output;
- metadata records the rotation;
- the runtime applies it correctly;
- previews prove the result matches the source.

### Split pages intentionally

A page split is not a failure. It can be the correct design.

Split atlases when:

- the page exceeds the target device texture limit;
- groups use different filtering or compression;
- some sprites are loaded only in a specific scene;
- a huge background would evict many small frequently drawn sprites;
- a rare boss or large prop would force an otherwise small common atlas to stay
  in memory.

Keep sprites together when:

- they are drawn in the same batch;
- they form one character or modular object;
- they share a timeline or animation state;
- they must sample matching secondary maps.

## Bigger Objects Made From Separate Sprites

Large pixel objects can be one enormous sprite, but often they are better as
composed objects made from separate parts.

Use multiple sprites when the object needs:

- variation from reusable pieces;
- animation through part movement;
- damage states or interchangeable attachments;
- large dimensions that would waste a fixed cell;
- repeated middle sections, such as walls, columns, vines, pipes, or plants;
- layered rendering, such as front arms over body over back arms;
- different hitboxes or interaction points per part.

Use one baked sprite when:

- the object is static and unique;
- the silhouette has important anti-seam detail;
- it is small enough to fit cleanly;
- part assembly would add complexity without variation.

### Keep object parts on the same atlas page

If parts are drawn together every frame, keep them on the same atlas page where
possible. Splitting a character's body, arms, head, and attachments across
different textures gives back the batching win that the atlas was supposed to
provide.

Exceptions are reasonable when the object uses different materials, very large
rare overlays, or optional skins that are not always resident.

### Author parts around pivots and sockets

For modular objects, metadata matters more than packing density. Each part needs
one or more named connection points.

A useful sprite-part schema:

```json
{
  "name": "column_middle_cracked",
  "region": { "x": 128, "y": 0, "w": 128, "h": 128 },
  "sourceSize": { "w": 128, "h": 128 },
  "pivot": { "x": 64, "y": 96 },
  "role": "repeatableColumnMiddle",
  "sockets": {
    "bottom": { "x": 64, "y": 102, "type": "columnShaft" },
    "top": { "x": 64, "y": 28, "type": "columnShaft" }
  }
}
```

Store sockets in either pixels, normalized cell coordinates, or normalized source
rect coordinates. Pixels are simple when all sprites share one resolution.
Normalized coordinates survive rebakes to a new cell size. This repo's
`art/modular-ruins-kit-atlas-original.json` uses explicit source rectangles with
normalized source-rect sockets, which is a strong pattern for hand-arranged
source art that may later be rebaked.

### Add recipes, not just loose parts

Parts alone make the runtime guess. Recipes make the intended assemblies
explicit:

```json
{
  "recipes": {
    "column_tall": [
      { "sprite": "column_base", "attach": "top" },
      { "sprite": "column_middle_straight", "from": "bottom", "toPrevious": "top" },
      { "sprite": "column_middle_cracked", "from": "bottom", "toPrevious": "top" },
      { "sprite": "column_capital", "from": "bottom", "toPrevious": "top" }
    ]
  }
}
```

A recipe should specify:

- the ordered list of parts;
- which socket on the new part connects to which previous socket;
- draw layer for overlaps;
- optional per-part offsets for intentional overhangs;
- allowed random variants;
- whether the part repeats, caps, mirrors, or terminates the structure.

This is much safer than hard-coding x/y offsets in scene code. The code can still
cache the final blit list for speed.

### Align by visual bounds when stacking organic parts

For organic structures, sockets may be overkill. A coral trunk or plant segment
often just needs to sit visually on the piece below it. In that case, calculate
tight content bounds and stack by visible top/bottom rather than by full cell
height.

This project already does that in `tools/gen-coral-atlas.ts` and
`src/backdrop.ts`: the generator records each coral cell's first and last
non-transparent row, and `stack()` places the next part so the visible pixels
touch the previous part. That avoids gaps caused by transparent headroom inside
the 128 px cell.

That is a good algorithm, but the current hard-coded coral stacks should be seen
as a small-scene shortcut. If the number of composed corals, plants, or ruins
grows, move the part lists into atlas metadata as recipes and let a generic
assembler produce the blits. The code should implement the composition rules;
the atlas sidecar should describe the actual objects.

Use this technique for:

- coral branches;
- plants;
- rubble piles;
- vines;
- stalactites or stalagmites;
- repeated vertical decorative segments.

Do not use pure visual bounds when precise mechanical alignment matters. For
columns, doors, machinery, weapons, or limbs, named sockets are clearer.

### Handle seams deliberately

Big objects split into chunks can reveal seams. Common fixes:

- overlap neighboring chunks by 1 or 2 pixels where the seam is hidden;
- place seams along natural edges, cracks, outlines, shadows, or tile boundaries;
- duplicate edge pixels into padding so filtering cannot pull in empty color;
- snap every part to integer pixels after alignment;
- keep all parts at the same authored scale;
- render from back to front so overlaps cover joins.

Do not split a large object through a detailed face, eye, logo, or high-contrast
line unless the seam is intentionally hidden by another part.

### Choose the right assembly model

There are four common models:

1. Static modular assembly

   Best for ruins, plants, terrain chunks, coral, pipes, walls, and buildings.
   Use sockets, recipes, optional variants, and cached blit lists. The object is
   assembled once and then treated as a static prop or baked background element.

2. Layered actor

   Best for characters with independently moving parts. Use named pivots,
   parent-child transforms, draw layers, and timeline data. Keep part motion on
   whole pixels for pixel art. Store front/back layering explicitly.

3. Precomposed pose sheet

   Best for complex silhouettes where separate parts tangle, self-overlap, or
   need artist-drawn poses. Factorio's Friday Facts #146 describes an art
   pipeline where vehicle graphics are assembled from multiple source layers and
   then exported into spritesheets. The lesson is useful: keep layered source
   files for authoring, but bake clean runtime poses when live composition would
   be fragile.

   This repo's octopus follows that spirit: component rows exist in the source,
   but the runtime uses clean precomposed poses because stacking the components
   directly creates visual clutter.

4. Hybrid base plus overlays

   Best for equipment, damage, color swaps, lights, decals, or seasonal details.
   Keep the stable base sprite packed with common overlays. Put rare overlays on
   a separate page only if memory or loading behavior justifies it.

### Keep secondary maps synchronized

If an object has normal maps, masks, palette ramps, emission maps, or shadow
maps, pack those textures with the same layout as the color atlas. Pixel-art
normal-map research and modern tool docs both point to a core rule: secondary
textures are useful only if their texels line up exactly with the base sprite.

Never hand-edit one map's atlas independently of the others. Generate them from
the same source list and packing result.

### Suggested large-object JSON shape

For complex atlas-driven objects, use a sidecar shape like this:

```json
{
  "image": "ruins-atlas-128.png",
  "tileSize": 128,
  "sprites": [
    {
      "name": "wall_middle_repeat_segment",
      "row": 1,
      "col": 1,
      "category": "ruins",
      "role": "repeatableWallMiddle",
      "pivot": { "x": 64, "y": 96 },
      "bounds": { "x": 14, "y": 22, "w": 100, "h": 86 },
      "sockets": {
        "left": { "x": 23, "y": 72, "type": "wallHorizontal" },
        "right": { "x": 105, "y": 72, "type": "wallHorizontal" },
        "bottom": { "x": 64, "y": 102, "type": "wallVertical" },
        "top": { "x": 64, "y": 38, "type": "wallVertical" }
      },
      "drawLayer": 0
    }
  ],
  "recipes": {
    "wall_run_capped": [
      { "sprite": "wall_left_end_corner", "attach": "right" },
      { "sprite": "wall_middle_repeat_segment", "from": "left", "toPrevious": "right" },
      { "sprite": "wall_right_end_corner", "from": "left", "toPrevious": "right" }
    ]
  }
}
```

The runtime algorithm is then simple:

1. Place the first part by world position, pivot, ground socket, or recipe anchor.
2. For each next part, read the previous socket world position.
3. Read the incoming part's matching socket.
4. Offset the new part so those sockets coincide.
5. Round final x/y to whole pixels.
6. Sort by draw layer.
7. Cache the resulting blits unless the object animates.

## Quality Checklist

Before accepting an atlas change:

- Render every sprite at native size on a transparent checkerboard.
- Render every sprite on light, dark, and saturated backgrounds.
- Render at the final in-game scale.
- Move the camera or object slowly to check shimmer.
- Play every animation and check pivot stability.
- Check trimmed frames against untrimmed reference frames.
- Check large-object recipes for gaps and overlaps.
- Check edge pixels for color bleed or dark halos.
- Check import/runtime settings: nearest filtering, no unwanted compression, no
  accidental mipmaps, and clamp/no-wrap behavior appropriate for atlas sprites.
- For any chroma-key-generated source, verify exact and near-key pixels are zero
  in the final runtime atlas before accepting it.
- For structural defects, do not accept a pasted-in part merely because it is
  present; inspect whether the contour, lighting, and attachment read as one
  coherent sprite. If not, regenerate the whole tile/component.
- Confirm the atlas did not exceed target texture size.
- Confirm page count and runtime grouping still make sense.
- Rebuild generated code or metadata from source.
- Review a deterministic diff, not a hand-edited generated blob.

For this repo, prefer adding preview modes to `tools/preview.ts` whenever a new
atlas class gets complex. The existing fish, backdrop, jellyfish, and octopus
preview flows are the right idea: make the build output visible without guessing.

## Project Defaults and Refactor Candidates

Keep these defaults:

- Use nearest-neighbor rendering and avoid smoothing.
- Treat 128 px grids as source-art format, not a permanent runtime requirement.
- Use tight bounds for organic stacks; use sockets and recipes for mechanical,
  architectural, or reusable modular parts.
- Avoid rotated packing while atlases are still useful as human-readable sheets.
- Keep big multi-part objects on one page unless memory or loading behavior says
  otherwise.
- Bake clean pose sheets when live part composition creates visual clutter.

Refactor toward these targets as the art set grows:

- Runtime packing: generate packed, padded, extruded pages with explicit region
  metadata for irregular or mostly transparent sprites.
- Asset output: replace giant base64 TypeScript modules with atlas assets plus
  JSON manifests when the zero-file runtime constraint no longer matters.
- Unified generation: consolidate per-atlas scripts into a configurable
  generator that handles grids, bounds, sockets, recipes, pose baking, secondary
  maps, and validation.
- Recipe data: move hard-coded coral/plant/ruin compositions into atlas sidecars
  and let a generic assembler produce blits.
- Octopus layers: mark component rows as source-only, or add real layer metadata
  with pivots, draw order, and pose transforms.
- Manifest checks: validate duplicate names, bounds, empty sprites, recipe/socket
  references, texture page limits, padding/extrusion, and generated-code
  freshness.

## Sources

How they were used: NVIDIA, Unity, and libGDX for batching and texture switching;
Jylanki and Blackpawn for packing; TexturePacker, libGDX, Unity, Godot, Aseprite,
and MDN/WebGL documentation for padding, extrusion, trim, margin, separation,
filtering, mipmaps, and source-sheet import assumptions; Factorio, APES, and this
repo for large-object composition; pixel-art normal-map research for synchronized
secondary maps.

- NVIDIA, "Improve Batching Using Texture Atlases":
  https://download.nvidia.com/developer/NVTextureSuite/Atlas_Tools/Texture_Atlas_Whitepaper.pdf
- Jukka Jylanki, "A Thousand Ways to Pack the Bin" and RectangleBinPack:
  https://github.com/juj/RectangleBinPack
- Blackpawn, "Packing Lightmaps":
  https://blackpawn.com/texts/lightmaps/
- libGDX Texture Packer documentation:
  https://libgdx.com/wiki/tools/texture-packer
- Unity Manual, Sprite Atlas:
  https://docs.unity3d.com/Manual/class-SpriteAtlas.html
- Unity Manual, Texture Import Settings:
  https://docs.unity3d.com/Manual/texture-type-sprite.html
- CodeAndWeb TexturePacker documentation, texture settings:
  https://www.codeandweb.com/texturepacker/documentation/texture-settings
- Aseprite documentation, Sprite Sheet:
  https://www.aseprite.org/docs/sprite-sheet/
- Godot documentation, Importing images:
  https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_images.html
- Godot documentation, TileSetAtlasSource:
  https://docs.godotengine.org/en/stable/classes/class_tilesetatlassource.html
- Godot documentation, AtlasTexture:
  https://docs.godotengine.org/en/stable/classes/class_atlastexture.html
- MDN Web Docs, Using textures in WebGL:
  https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
- Wube/Factorio Friday Facts #146, layered vehicle graphics and spritesheet
  export pipeline:
  https://www.factorio.com/blog/post/fff-146
- M. S. S. Moreira et al., "Normal Map Generation for Pixel Art Images":
  https://arxiv.org/abs/2107.14283
- APES, "Articulated Pixel-Edge Shape Generation from Sprite Sheets":
  https://arxiv.org/abs/2206.02015

# Building Good Pixel Sprite Atlases

This guide collects practical advice from texture-atlas papers, engine and tool
documentation, implementation articles, and production-style dev notes. It is
written for pixel games, where a technically "valid" atlas can still fail if it
blurs, bleeds, shifts by half a pixel, or makes large composed objects painful to
author.

The short version: a sprite atlas is not just a packed PNG. It is a rendering
contract between the artist, the packer, the runtime, and the animation system.
The image, metadata, pivots, padding, names, source sizes, draw order, and build
settings all matter.

## How The Sources Are Used

- NVIDIA, Unity, and libGDX inform the batching and texture-switching advice.
- Jylanki's rectangle-packing work and Blackpawn's packing article inform the
  packing strategy and the recommendation to use deterministic generated output.
- TexturePacker, libGDX, Unity, and Godot docs inform padding, extrusion, trim,
  margin, separation, and filter guidance.
- Factorio Friday Facts #146, APES, and this repo's coral/ruins/octopus atlases
  inform the large-object chapter.
- Pixel-art normal-map research informs the advice to keep secondary maps packed
  with exactly the same layout as the color atlas.

## Best Practice Versus Current Project

This guide is prescriptive. The current project is used as a case study, not as
the definition of best practice. When the repo already does something strong,
the guide says so. When the repo uses a convenient shortcut, the guide treats it
as an acceptable local tradeoff or a refactor candidate.

Use this vocabulary when applying the guide:

- Good current pattern: keep it unless the project goals change.
- Acceptable local tradeoff: fine for the current scope, but not a universal
  recommendation.
- Refactor candidate: research and tooling practice point to a stronger design
  than the current implementation.

## Contents

- [Goals](#goals)
- [Core Principles](#core-principles)
- [Target Atlas Pipeline](#target-atlas-pipeline)
- [Packing Strategy](#packing-strategy)
- [Do's](#dos)
- [Don'ts](#donts)
- [Bigger Objects Made From Separate Sprites](#bigger-objects-made-from-separate-sprites)
- [Quality Checklist](#quality-checklist)
- [Recommended Defaults For This Project](#recommended-defaults-for-this-project)
- [Current Project Refactor Candidates](#current-project-refactor-candidates)
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

For this project, the current split into fish, sea creatures, coral, ruins, and
other thematic atlases is reasonable because those groups also map to different
runtime systems and preview/generation tools.

### Keep the pixel grid sacred

Pixel art should normally use nearest-neighbor filtering, whole-pixel source
regions, and whole-pixel destination positions. Fractional scaling, linear
filtering, mipmaps, and camera movement at fractional pixels can turn a good
atlas into shimmering soup.

Use these defaults unless you have a deliberate exception:

- point/nearest filtering for pixel art;
- mipmaps off for sprites that are never minified;
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

For small grid-authored pixel art, a fixed grid can be better than a tight pack:

- fixed cells make hand editing and review easy;
- cell coordinates are stable;
- runtime crop math is simple;
- pieces can share a common authored frame.

For many differently sized sprites, a tight pack is usually better:

- less wasted texture area;
- fewer pages;
- better batching when page count matters.

This project currently uses a 128 px cell pattern for many atlases. That is a
good source-art convention as long as the sprites fit the cell and benefit from
easy manual review. It should not be treated as a permanent runtime requirement.
For large or irregular props, use generated metadata and consider packing the
runtime atlas more tightly instead of forcing everything into identical cells.

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
- test sprites on both light and dark backgrounds to catch halos.

Do not leave transparent padding as arbitrary RGB. Transparent pixels still have
color values, and filtering can blend those hidden colors into the edge.

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

## Do's

- Do keep source sprites separate from packed output.
- Do generate atlases from source art and sidecar metadata.
- Do preserve names, pivots, original sizes, and trim offsets.
- Do use nearest filtering for pixel art.
- Do add padding and extruded edge pixels.
- Do verify atlas output in the actual renderer, not just in an image viewer.
- Do keep deterministic packing settings.
- Do group by runtime draw behavior.
- Do keep related secondary textures in the same layout.
- Do write small preview tools that render atlas sprites at native size and game
  scale.
- Do keep a changelog or review image when changing generated art.

## Don'ts

- Do not hand-pack important runtime atlases without metadata.
- Do not rely on transparent gutters with random or black RGB values.
- Do not trim animation frames unless you preserve the original frame offsets.
- Do not mix point-filtered pixel art and linearly filtered effects on one page
  if the engine cannot assign sampler state per sprite.
- Do not rotate packed sprites unless every consumer supports rotated regions.
- Do not make a giant atlas just because fewer files feels cleaner.
- Do not put rarely used large art on a page that is always resident.
- Do not let packer output order change randomly between builds.
- Do not scale individual sprites independently unless the style calls for it.
- Do not fix bleeding by shrinking art inward; fix the atlas settings.

## Bigger Objects Made From Separate Sprites

Large pixel objects are where atlas discipline starts paying rent. A big coral,
ruin, creature, machine, building, or boss can be one enormous sprite, but often
it is better as a composed object made from separate parts.

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

Store sockets in either pixels or normalized cell coordinates. Pixels are simple
when all sprites share one resolution. Normalized coordinates survive rebakes to a
new cell size. This repo's `art/modular-ruins-kit-atlas-original.json` uses
normalized cell sockets, which is a strong pattern for source art that may later
be rebaked.

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
- Confirm the atlas did not exceed target texture size.
- Confirm page count and runtime grouping still make sense.
- Rebuild generated code or metadata from source.
- Review a deterministic diff, not a hand-edited generated blob.

For this repo, prefer adding preview modes to `tools/preview.ts` whenever a new
atlas class gets complex. The existing fish, backdrop, jellyfish, and octopus
preview flows are the right idea: make the build output visible without guessing.

## Recommended Defaults For This Project

- Keep nearest-neighbor rendering and avoid smoothing.
- Keep 128 px grid cells for small standalone creatures and simple props.
- Use tight generated bounds for stackable organic parts, as the coral atlas
  already does.
- Use socket metadata and recipes for ruins, plants, and any object assembled
  from mechanical or architectural pieces.
- Avoid rotated packing while atlases are still useful as human-readable pixel
  sheets.
- Add 2 to 4 px padding plus edge extrusion when moving from hand-authored grids
  to tight packed pages.
- Keep big multi-part objects on one atlas page unless a clear memory or loading
  reason says otherwise.
- Keep source PNG/JSON in `art/`, generate embedded TypeScript in `src/`, and do
  not edit generated modules by hand.
- When a composed object becomes hard to reason about live, bake clean poses from
  layered source art and drive the runtime by pose index.

## Sources

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
- CodeAndWeb TexturePacker documentation, texture settings:
  https://www.codeandweb.com/texturepacker/documentation/texture-settings
- Godot documentation, TileSetAtlasSource:
  https://docs.godotengine.org/en/stable/classes/class_tilesetatlassource.html
- Godot documentation, AtlasTexture:
  https://docs.godotengine.org/en/stable/classes/class_atlastexture.html
- Wube/Factorio Friday Facts #146, layered vehicle graphics and spritesheet
  export pipeline:
  https://www.factorio.com/blog/post/fff-146
- M. S. S. Moreira et al., "Normal Map Generation for Pixel Art Images":
  https://arxiv.org/abs/2107.14283
- APES, "Articulated Pixel-Edge Shape Generation from Sprite Sheets":
  https://arxiv.org/abs/2206.02015

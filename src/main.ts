import kaplay from "kaplay";
import { makeBackdrop } from "./backdrop";
import { spawnFish, makeFishSheets, FISH_KINDS } from "./fish";
import { SWIM_FRAMES } from "./fishbake";
import { spawnCephalopod } from "./cephalopod";
import { OCTOPUS_ATLAS, OCTOPUS_COLS, OCTOPUS_ROWS } from "./octopusAtlas";
import {
  JELLYFISH_ATLAS,
  JELLYFISH_ATLAS_COLS,
  JELLYFISH_ATLAS_ROWS,
} from "./jellyfishAtlas";
import {
  NAUTILUS_ATLAS,
  NAUTILUS_ATLAS_COLS,
  NAUTILUS_ATLAS_ROWS,
} from "./nautilusAtlas";
import { spawnHermitCrab } from "./hermitCrab";
import { HERMIT_CRAB_ATLAS, HERMIT_CRAB_FRAMES } from "./hermitCrabAtlas";
import { spawnSeaSnail } from "./seaSnail";
import { SEA_SNAIL_ATLAS, SEA_SNAIL_FRAMES } from "./seaSnailAtlas";
import { spawnLuminousKelpGrove } from "./luminousKelp";
import {
  LUMINOUS_KELP_ATLAS,
  LUMINOUS_KELP_COLS,
  LUMINOUS_KELP_ROWS,
} from "./luminousKelpAtlas";
import { PLANT_ATLAS, PLANT_ATLAS_COLS, PLANT_ATLAS_ROWS } from "./plantAtlas";
import {
  SCI_FI_PROPS_ATLAS,
  SCI_FI_PROPS_ATLAS_COLS,
  SCI_FI_PROPS_ATLAS_ROWS,
} from "./sciFiPropsAtlas";
import {
  ELDRITCH_PROPS_ATLAS,
  ELDRITCH_PROPS_ATLAS_COLS,
  ELDRITCH_PROPS_ATLAS_ROWS,
} from "./eldritchPropsAtlas";
import {
  STAR_WARS_PROPS_ATLAS,
  STAR_WARS_PROPS_ATLAS_COLS,
  STAR_WARS_PROPS_ATLAS_ROWS,
} from "./starWarsPropsAtlas";
import {
  POP_CULTURE_PROPS_ATLAS,
  POP_CULTURE_PROPS_ATLAS_COLS,
  POP_CULTURE_PROPS_ATLAS_ROWS,
} from "./popCulturePropsAtlas";
import { SMALL_PROPS_ATLAS } from "./smallPropsAtlas";
import { setupTank } from "./tank";
import {
  off,
  uncapped,
  capFPS,
  num,
  configureEntityCountDefaults,
  installEngineProfiler,
} from "./profiling";
import { VW, VH } from "./res";

const DEFAULT_ENTITY_COUNTS = {
  fish: 10,
  jelly: 5,
  octo: 1,
  naut: 1,
  crabs: 5,
  snail: 1,
  plants: 100,
} as const;
type EntityCounts = { [K in keyof typeof DEFAULT_ENTITY_COUNTS]: number };
const ENTITY_COUNTS: EntityCounts = {
  fish: num("fish", DEFAULT_ENTITY_COUNTS.fish),
  jelly: num("jelly", DEFAULT_ENTITY_COUNTS.jelly),
  octo: num("octo", DEFAULT_ENTITY_COUNTS.octo),
  naut: num("naut", DEFAULT_ENTITY_COUNTS.naut),
  crabs: num("crabs", DEFAULT_ENTITY_COUNTS.crabs),
  snail: num("snail", DEFAULT_ENTITY_COUNTS.snail),
  plants: num("plants", DEFAULT_ENTITY_COUNTS.plants),
};
configureEntityCountDefaults(DEFAULT_ENTITY_COUNTS);
const BACKDROP_SEED = 1;

// The scene needs no MSAA (pixel art), covers the canvas opaquely (no page
// blending), and never reads the frame back after present. kaplay's own context
// request enables all three, which tiled GPUs (the Pi's V3D above all) pay real
// bandwidth for — preserveDrawingBuffer alone forces reloading the previous
// frame into tile memory instead of a fast clear. A canvas's first getContext
// call fixes its attributes, so prime the context here and hand kaplay the
// canvas; its later request adopts this context unchanged.
const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
canvas.getContext("webgl", {
  antialias: false,
  alpha: false,
  depth: true,
  stencil: true,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
});

// Fixed virtual resolution: the whole scene renders into a VW x VH buffer (the
// 640x360 design space scaled by RES) that is scaled up to the window. This gives
// the fish and the procedurally-drawn background a single, consistent pixel grid
// — every sprite texel and every scene primitive is one buffer pixel. The canvas
// is left at VW x VH here and scaled to the window by fitWindow() below.
const k = kaplay({
  canvas,
  width: VW,
  height: VH,
  crisp: true,
  background: [6, 24, 43],
  // An ambient scene doesn't need ProMotion rates; capping halves the CPU work
  // on 120 Hz displays. The default is 62 rather than 60: the cap skips a vsync
  // tick whenever the elapsed time is under 1/maxFPS, and on a 120 Hz panel the
  // second 8.33 ms tick lands a hair under a 16.67 ms threshold, demoting the
  // scene to every third tick (40 fps). A 16.13 ms threshold keeps it on every
  // second tick. Same trick when a launcher passes ?cap=32: 31.25 ms clears the
  // second 60 Hz tick (33.3 ms) for a clean 30.
  maxFPS: uncapped ? undefined : capFPS,
});
installEngineProfiler(k);

// Display scaling: prefer the largest whole-number scale (every buffer pixel maps
// to an N×N block, perfectly crisp with no crawl). At the 1920x1080 buffer, 4K
// lands exactly at 2x. Smaller displays use a fractional fill, whose uneven pixel
// steps are far less visible at this density than they were at 640x360.
function fitWindow() {
  const fit = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  const scale = fit >= 2 ? Math.floor(fit) : fit;
  Object.assign(canvas.style, {
    width: `${VW * scale}px`,
    height: `${VH * scale}px`,
    imageRendering: "pixelated",
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  });
}
fitWindow();
window.addEventListener("resize", fitWindow);

// Each fish is a random kind; one that swims fully offscreen (a dart can carry
// it out) is despawned and replaced by a fresh random fish entering from an edge,
// so the population holds at ENTITY_COUNTS.fish.
const fishKindIndices = FISH_KINDS.map((_, i) => i);
const spawnRandomFish = (enterFromEdge: boolean) => {
  const kind = k.choose(fishKindIndices);
  spawnFish(k, `fish-${kind}`, FISH_KINDS[kind], {
    enterFromEdge,
    onGone: () => spawnRandomFish(true),
  });
};

// The fish sheets and backdrop are baked after async image decode, so resolve them
// first, then register every sprite together — that way they're all in the load
// queue before onLoad fires (no load-order race).
(async () => {
  const [fishSheets, backdrop] = await Promise.all([
    makeFishSheets(),
    makeBackdrop(BACKDROP_SEED),
  ]);

  // Benthic + rooted-plant sprites — the two crawlers, every prop, and the plant
  // and kelp groves — are all drawn in the bottom z-band, interleaved by depth
  // (crawlers and props by their sand-contact line, plant/kelp roots by theirs).
  // Kaplay's batch renderer flushes on every texture-page switch, so if these land
  // on different atlas pages the whole band degenerates into ~one draw call per
  // object. That per-flush cost is the dominant frame cost on a weak GPU (the Pi's
  // driver pays heavily per flush). loadSprite packs on async image decode, so
  // call order alone doesn't pin the page. Awaiting these in sequence, before any
  // other sprite loads, packs them contiguously onto the first atlas page (they
  // fit one 2048x2048 page together) — so the entire bottom band batches with far
  // fewer flushes regardless of z-interleaving.
  const loadSpriteSeq = (
    name: string,
    src: string,
    opt: Parameters<typeof k.loadSprite>[2],
  ) =>
    new Promise<void>((resolve) => {
      k.loadSprite(name, src, opt).onLoad(() => resolve());
    });
  // These pack onto ONE 2048x2048 atlas page only if they don't fragment the shelf
  // packer. Kaplay uses a next-fit shelf packer (each sprite opens or extends a shelf of
  // its own height; it never backfills an earlier, shorter shelf), so loading in mixed
  // heights strands slivers of space and spills the last sprites to a second page. Loading
  // TALLEST-FIRST keeps each shelf full before the next opens, so all ten (the octopus,
  // both crawlers, every prop, and the plant/kelp groves) fit one page and the whole
  // bottom band batches. Order below is strictly by packed height: kelp 1024, the 512s,
  // pop 384, octopus 172, then the 128-tall crawlers.
  await loadSpriteSeq("luminous-kelp", LUMINOUS_KELP_ATLAS, {
    sliceX: LUMINOUS_KELP_COLS,
    sliceY: LUMINOUS_KELP_ROWS,
  });
  await loadSpriteSeq("plant-atlas-v2", PLANT_ATLAS, {
    sliceX: PLANT_ATLAS_COLS,
    sliceY: PLANT_ATLAS_ROWS,
  });
  await loadSpriteSeq("sci-fi-props", SCI_FI_PROPS_ATLAS, {
    sliceX: SCI_FI_PROPS_ATLAS_COLS,
    sliceY: SCI_FI_PROPS_ATLAS_ROWS,
  });
  await loadSpriteSeq("eldritch-props", ELDRITCH_PROPS_ATLAS, {
    sliceX: ELDRITCH_PROPS_ATLAS_COLS,
    sliceY: ELDRITCH_PROPS_ATLAS_ROWS,
  });
  await loadSpriteSeq("star-wars-props", STAR_WARS_PROPS_ATLAS, {
    sliceX: STAR_WARS_PROPS_ATLAS_COLS,
    sliceY: STAR_WARS_PROPS_ATLAS_ROWS,
  });
  await loadSpriteSeq("small-props", SMALL_PROPS_ATLAS, {
    sliceX: 4,
    sliceY: 4,
  });
  await loadSpriteSeq("pop-culture-props", POP_CULTURE_PROPS_ATLAS, {
    sliceX: POP_CULTURE_PROPS_ATLAS_COLS,
    sliceY: POP_CULTURE_PROPS_ATLAS_ROWS,
  });
  // The octopus is benthic too (rests on the sand, drawn in the bottom band), so its
  // pose sheet joins this group to share the page and batch with the sea floor. Its cells
  // are wrapped into a grid (OCTOPUS_COLS x OCTOPUS_ROWS) so the sheet is 1340x172 — under
  // the 2048px page limit (it used to be a standalone 2546px big-texture that couldn't
  // batch at all) and short enough to slot in above the crawlers.
  await loadSpriteSeq("octopus", OCTOPUS_ATLAS, {
    sliceX: OCTOPUS_COLS,
    sliceY: OCTOPUS_ROWS,
  });
  await loadSpriteSeq("hermit-crab", HERMIT_CRAB_ATLAS, {
    sliceX: HERMIT_CRAB_FRAMES,
  });
  await loadSpriteSeq("sea-snail", SEA_SNAIL_ATLAS, {
    sliceX: SEA_SNAIL_FRAMES,
  });

  k.loadSprite("backdrop", backdrop.back);
  k.loadSprite("backdrop-sand", backdrop.sand);
  fishSheets.forEach((sheet, i) => {
    k.loadSprite(`fish-${i}`, sheet, {
      sliceX: SWIM_FRAMES,
      anims: { swim: { from: 0, to: SWIM_FRAMES - 1, loop: true, speed: 1 } },
    });
  });
  // The jellyfish and nautilus anatomical layers are separate game objects that each
  // set their own frame, so one atlas load per creature serves every layer. (The octopus
  // pose sheet is loaded above with the benthic band so it shares that page.)
  k.loadSprite("jellyfish", JELLYFISH_ATLAS, {
    sliceX: JELLYFISH_ATLAS_COLS,
    sliceY: JELLYFISH_ATLAS_ROWS,
  });
  k.loadSprite("nautilus", NAUTILUS_ATLAS, {
    sliceX: NAUTILUS_ATLAS_COLS,
    sliceY: NAUTILUS_ATLAS_ROWS,
  });

  setupTank(k, ENTITY_COUNTS);

  k.onLoad(() => {
    if (!off("fish"))
      for (let i = 0; i < ENTITY_COUNTS.fish; i++) spawnRandomFish(false);
    // A few cephalopods drift among the fish as larger accent creatures.
    if (!off("cephs")) {
      for (let i = 0; i < ENTITY_COUNTS.naut; i++)
        spawnCephalopod(k, "nautilus");
      for (let i = 0; i < ENTITY_COUNTS.octo; i++)
        spawnCephalopod(k, "octopus");
      for (let i = 0; i < ENTITY_COUNTS.jelly; i++)
        spawnCephalopod(k, "jellyfish");
    }
    // Spread the crabs evenly so each is immediately readable before their
    // independent routes eventually carry them around the full substrate.
    if (!off("crabs")) {
      const crabCount = ENTITY_COUNTS.crabs;
      for (let i = 0; i < crabCount; i++)
        spawnHermitCrab(k, k.width() * ((i + 0.5) / crabCount));
      for (let i = 0; i < ENTITY_COUNTS.snail; i++) spawnSeaSnail(k);
    }
    // A dense right-side kelp forest is reconstructed on every load from ordered
    // random stem, branch, crown, tendril and pod modules. Small juvenile stalks
    // taper the left edge, while alternating rear/front layers make fish disappear
    // naturally into the uneven mature grove.
    if (!off("kelp")) spawnLuminousKelpGrove(k);
  });
})();

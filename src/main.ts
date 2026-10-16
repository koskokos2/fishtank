import { settings } from "./settings";
import { DEFAULT_ENTITY_COUNTS } from "./settingsCodec";
import kaplay, { type KAPLAYCtx } from "kaplay";
import { makeBackdrop } from "./backdrop";
import { spawnFish, makeFishSheets, FISH_KINDS, fishKindSet } from "./fish";
import { loadTextureFiltering } from "./textureFiltering";
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
import { getCrabTheme } from "./crabTheme";
import { spawnSeaSnail } from "./seaSnail";
import { SEA_SNAIL_ATLAS, SEA_SNAIL_FRAMES } from "./seaSnailAtlas";
import { spawnLuminousKelpGrove } from "./luminousKelp";
import { getKelpTheme } from "./kelpTheme";
import { getPlantTheme } from "./plantTheme";
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
import {
  ODYSSEY_PROPS_ATLAS,
  ODYSSEY_PROPS_ATLAS_COLS,
  ODYSSEY_PROPS_ATLAS_ROWS,
} from "./odysseyPropsAtlas";
import {
  GIGER_PROPS_ATLAS,
  GIGER_PROPS_ATLAS_COLS,
  GIGER_PROPS_ATLAS_ROWS,
} from "./gigerPropsAtlas";
import {
  GRINDELWALD_PROPS_ATLAS,
  GRINDELWALD_PROPS_ATLAS_COLS,
  GRINDELWALD_PROPS_ATLAS_ROWS,
} from "./grindelwaldPropsAtlas";
import { SMALL_PROPS_ATLAS } from "./smallPropsAtlas";
import {
  HALLOWEEN_PROPS_ATLAS,
  HALLOWEEN_PROPS_ATLAS_COLS,
  HALLOWEEN_PROPS_ATLAS_ROWS,
} from "./halloweenPropsAtlas";
import { setupTank } from "./tank";
import { liveGroup } from "./liveGroup";
import { resetPropObstacles } from "./propPlacement";
import { loadWaterLighting } from "./waterLighting";
import {
  off,
  uncapped,
  capFPS,
  num,
  configureEntityCountDefaults,
  installEngineProfiler,
  onSettingsChange,
  birthdayFishEnabled,
  gothPlantsEnabled,
  gothKelpEnabled,
  crawlingHandsEnabled,
  halloweenBubblesEnabled,
} from "./profiling";
import { VW, VH } from "./res";
import { installBirthdayFish, loadBirthdayFish, syncBirthdaySparkles } from "./birthdayFish";

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
  // Keep the API off window; everything goes through k. The debug overlay gets
  // kaplay's debug object via installEngineProfiler instead of the global.
  global: false,
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
// Named export supports the isolated integration-test entry; no browser global.
export { k as aquarium };
installEngineProfiler(k);
loadWaterLighting(k);
loadTextureFiltering(k);

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

// Rebuild only the affected layer/population. All atlas textures, the clock,
// unrelated swimmers and the renderer stay alive.
function installLiveControls() {
  const groups = new Map<string, { key: string; dispose: () => void }>();
  const reconcileGroup = (name: string, key: string, spawn: (ctx: KAPLAYCtx) => void) => {
    if (groups.get(name)?.key === key) return;
    groups.get(name)?.dispose();
    const group = liveGroup(k, name);
    groups.set(name, { key, dispose: group.dispose });
    spawn(group.context);
  };
  // Separate asset names keep both skins cached, including their different UVs.
  // Old groups keep their own art/geometry until the requested atlas is ready.
  const requestedSkins = new Set<string>();
  const skinReady = (theme: { sprite: string; src: string }, options: Parameters<typeof k.loadSprite>[2]) => {
    if (k.getSprite(theme.sprite)?.data) return true;
    if (!requestedSkins.has(theme.sprite)) {
      requestedSkins.add(theme.sprite);
      k.loadSprite(theme.sprite, theme.src, options)
        .onLoad(() => reconcile()) // Read current flags, never apply an obsolete request.
        .onError(error => console.error(`Could not load skin ${theme.sprite}`, error));
    }
    return false;
  };
  let birthdayState: boolean | undefined;
  const reconcile = () => {
    const plantCount = num("plants", DEFAULT_ENTITY_COUNTS.plants);
    const plants = getPlantTheme(gothPlantsEnabled);
    const kelp = getKelpTheme(gothKelpEnabled);
    const crab = getCrabTheme(crawlingHandsEnabled);
    const plantsReady = off("plants") || plantCount === 0 || skinReady(plants, { sliceX: plants.cols, sliceY: plants.rows });
    const plantKey = `${off("plants")}:${plantCount}:${plants.sprite}`;
    const propKey = `${off("props")}:${settings.disabled.filter(n => n.startsWith("obj-")).sort().join(",")}`;
    for (const layer of ["backdrop", "sand", "props", "plants", "motes", "bubbles"]) {
      // Pearling bubbles reference the plant field, so replace the two together.
      if (!plantsReady && (layer === "plants" || layer === "bubbles")) continue;
      const key = layer === "backdrop" ? "live" : layer === "props" ? propKey
        : layer === "motes" ? String(off(layer) || halloweenBubblesEnabled)
        : layer === "plants" ? plantKey : layer === "bubbles" ? `${off(layer)}:${plantKey}:${halloweenBubblesEnabled}` : String(off(layer));
      reconcileGroup(layer, key, ctx => {
        if (layer === "props") resetPropObstacles();
        setupTank(ctx, { plants: plantCount }, layer);
      });
    }
    // The toolbar still works while creature updates are paused.
    for (const backdrop of k.get("settings-backdrop")) backdrop.hidden = off("backdrop");
    const fishKinds = FISH_KINDS.map((_, i) => i).filter(i => !off(`fish-${fishKindSet(FISH_KINDS[i].name)}`));
    const fishCount = off("fish") ? 0 : num("fish", DEFAULT_ENTITY_COUNTS.fish);
    reconcileGroup("fish", `${fishCount}:${fishKinds.join(",")}`, ctx => {
      const spawn = (enterFromEdge: boolean) => {
        if (!fishKinds.length) return;
        const kind = ctx.choose(fishKinds);
        spawnFish(ctx, `fish-${kind}`, FISH_KINDS[kind], { enterFromEdge, onGone: () => spawn(true) });
      };
      for (let i = 0; i < fishCount; i++) spawn(false);
    });
    for (const [name, kind] of [["naut", "nautilus"], ["octo", "octopus"], ["jelly", "jellyfish"]] as const) {
      const count = off("cephs") ? 0 : num(name, DEFAULT_ENTITY_COUNTS[name]);
      reconcileGroup(name, String(count), ctx => {
        for (let i = 0; i < count; i++) spawnCephalopod(ctx, kind);
      });
    }
    const crabs = off("crabs") ? 0 : num("crabs", DEFAULT_ENTITY_COUNTS.crabs);
    if (!crabs || skinReady(crab, { sliceX: crab.frames })) {
      reconcileGroup("crabs", `${crabs}:${crab.sprite}`, ctx => {
        for (let i = 0; i < crabs; i++) spawnHermitCrab(ctx, ctx.width() * ((i + 0.5) / crabs));
      });
    }
    const snails = off("crabs") ? 0 : num("snail", DEFAULT_ENTITY_COUNTS.snail);
    reconcileGroup("snail", String(snails), ctx => {
      for (let i = 0; i < snails; i++) spawnSeaSnail(ctx);
    });
    if (off("kelp") || skinReady(kelp, { sliceX: kelp.cols, sliceY: kelp.rows })) {
      reconcileGroup("kelp", `${off("kelp")}:${kelp.sprite}`, ctx => { if (!off("kelp")) spawnLuminousKelpGrove(ctx); });
    }
    if (off("puffs")) for (const puff of k.get("sand-puff")) puff.destroy();
    if (birthdayState !== birthdayFishEnabled) {
      birthdayState = birthdayFishEnabled;
      installBirthdayFish(k);
    }
    syncBirthdaySparkles(k);
  };
  reconcile();
  onSettingsChange(reconcile);
}

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
  // TALLEST-FIRST keeps each shelf full before the next opens, minimizing page
  // fragmentation across the octopus, both crawlers, every prop family, and the
  // plant/kelp groves. Order below is strictly by packed height: kelp 1024, the
  // 512s, the 384s, octopus 172, then the 128-tall crawlers.
  const kelp = getKelpTheme(gothKelpEnabled);
  const plants = getPlantTheme(gothPlantsEnabled);
  const crab = getCrabTheme(crawlingHandsEnabled);
  await loadSpriteSeq(kelp.sprite, kelp.src, { sliceX: kelp.cols, sliceY: kelp.rows });
  await loadSpriteSeq(plants.sprite, plants.src, { sliceX: plants.cols, sliceY: plants.rows });
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
  await loadSpriteSeq("odyssey-props", ODYSSEY_PROPS_ATLAS, {
    sliceX: ODYSSEY_PROPS_ATLAS_COLS,
    sliceY: ODYSSEY_PROPS_ATLAS_ROWS,
  });
  await loadSpriteSeq("giger-props", GIGER_PROPS_ATLAS, {
    sliceX: GIGER_PROPS_ATLAS_COLS,
    sliceY: GIGER_PROPS_ATLAS_ROWS,
  });
  await loadSpriteSeq("grindelwald-props", GRINDELWALD_PROPS_ATLAS, {
    sliceX: GRINDELWALD_PROPS_ATLAS_COLS,
    sliceY: GRINDELWALD_PROPS_ATLAS_ROWS,
  });
  await loadSpriteSeq("halloween-props", HALLOWEEN_PROPS_ATLAS, {
    sliceX: HALLOWEEN_PROPS_ATLAS_COLS,
    sliceY: HALLOWEEN_PROPS_ATLAS_ROWS,
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
  await loadSpriteSeq(crab.sprite, crab.src, {
    sliceX: crab.frames,
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
  loadBirthdayFish(k);
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

  k.onLoad(() => {
    installLiveControls();
    canvas.dataset.ready = "true";
  });
})();

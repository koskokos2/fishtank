import kaplay from "kaplay";
import { makeBackdrop } from "./backdrop";
import { spawnFish, makeFishSheets, FISH_KINDS } from "./fish";
import { SWIM_FRAMES } from "./fishbake";
import {
  makeNautilusSprite,
  NAUTILUS_FRAMES,
  makeJellyfishSprite,
  JELLYFISH_FRAMES,
  spawnCephalopod,
} from "./cephalopod";
import { OCTOPUS_ATLAS, OCTOPUS_FRAMES } from "./octopusAtlas";
import { setupTank } from "./tank";
import { VW, VH } from "./res";

const FISH_COUNT = 20;
const BACKDROP_SEED = 1;

// Fixed virtual resolution: the whole scene renders into a VW x VH buffer (the
// 640x360 design space scaled by RES) that is scaled up to the window. This gives
// the fish and the procedurally-drawn background a single, consistent pixel grid
// — every sprite texel and every scene primitive is one buffer pixel. The canvas
// is left at VW x VH here and scaled to the window by fitWindow() below.
const k = kaplay({
  width: VW,
  height: VH,
  crisp: true,
  background: [6, 24, 43],
});

// Display scaling: prefer the largest whole-number scale (every buffer pixel maps
// to an N×N block, perfectly crisp with no crawl). At the 1920x1080 buffer, 4K
// lands exactly at 2x. Smaller displays use a fractional fill, whose uneven pixel
// steps are far less visible at this density than they were at 640x360.
const canvas = document.querySelector("canvas")!;
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

// Which kind each spawned fish is — one random atlas cell per fish.
const fishKindIndices = FISH_KINDS.map((_, i) => i);
const fishPicks = Array.from({ length: FISH_COUNT }, () =>
  k.choose(fishKindIndices),
);

// The fish and nautilus sheets are baked on a canvas after async image decode, so
// resolve them first, then register every sprite together — that way they're all
// in the load queue before onLoad fires (no load-order race).
(async () => {
  const [fishSheets, nautilusSheet, jellyfishSheet] = await Promise.all([
    makeFishSheets(),
    makeNautilusSprite(),
    makeJellyfishSprite(),
  ]);

  k.loadSprite("backdrop", makeBackdrop(BACKDROP_SEED));
  fishSheets.forEach((sheet, i) => {
    k.loadSprite(`fish-${i}`, sheet, {
      sliceX: SWIM_FRAMES,
      anims: { swim: { from: 0, to: SWIM_FRAMES - 1, loop: true, speed: 1 } },
    });
  });
  // The octopus is a clean 4-frame sheet (the "assembled" poses); the spawn rig
  // shows one frame per the crawl/swim state machine.
  k.loadSprite("octopus", OCTOPUS_ATLAS, { sliceX: OCTOPUS_FRAMES });
  k.loadSprite("nautilus", nautilusSheet, {
    sliceX: NAUTILUS_FRAMES,
    anims: { idle: { from: 0, to: NAUTILUS_FRAMES - 1, loop: true, speed: 1 } },
  });
  k.loadSprite("jellyfish", jellyfishSheet, {
    sliceX: JELLYFISH_FRAMES,
    anims: { idle: { from: 0, to: JELLYFISH_FRAMES - 1, loop: true, speed: 1 } },
  });

  setupTank(k);

  k.onLoad(() => {
    fishPicks.forEach((kind, i) =>
      spawnFish(k, `fish-${kind}`, FISH_KINDS[kind]),
    );
    // A few cephalopods drift among the fish as larger accent creatures.
    spawnCephalopod(k, "nautilus");
    spawnCephalopod(k, "octopus");
    spawnCephalopod(k, "octopus");
    spawnCephalopod(k, "jellyfish");
  });
})();

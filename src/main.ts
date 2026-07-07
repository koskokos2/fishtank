import kaplay from "kaplay";
import { makeBackdrop } from "./backdrop";
import { spawnFish, makeFishSheets, FISH_KINDS } from "./fish";
import { SWIM_FRAMES } from "./fishbake";
import { spawnCephalopod } from "./cephalopod";
import { OCTOPUS_ATLAS, OCTOPUS_FRAMES } from "./octopusAtlas";
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
import { setupTank } from "./tank";
import { VW, VH } from "./res";

const FISH_COUNT = 15;
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

// Each fish is a random kind; one that swims fully offscreen (a dart can carry
// it out) is despawned and replaced by a fresh random fish entering from an edge,
// so the population holds at FISH_COUNT.
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
  const [fishSheets, backdropUrl] = await Promise.all([
    makeFishSheets(),
    makeBackdrop(BACKDROP_SEED),
  ]);

  k.loadSprite("backdrop", backdropUrl);
  fishSheets.forEach((sheet, i) => {
    k.loadSprite(`fish-${i}`, sheet, {
      sliceX: SWIM_FRAMES,
      anims: { swim: { from: 0, to: SWIM_FRAMES - 1, loop: true, speed: 1 } },
    });
  });
  // The octopus uses a pose sheet. Jellyfish and nautilus load one atlas through
  // several sprite names so their anatomical layers can advance independently.
  k.loadSprite("octopus", OCTOPUS_ATLAS, { sliceX: OCTOPUS_FRAMES });
  for (const layer of ["bell", "arms", "tendrils"])
    k.loadSprite(`jellyfish-${layer}`, JELLYFISH_ATLAS, {
      sliceX: JELLYFISH_ATLAS_COLS,
      sliceY: JELLYFISH_ATLAS_ROWS,
    });
  for (const layer of ["body", "tentacles", "siphon", "jet"])
    k.loadSprite(`nautilus-${layer}`, NAUTILUS_ATLAS, {
      sliceX: NAUTILUS_ATLAS_COLS,
      sliceY: NAUTILUS_ATLAS_ROWS,
    });

  setupTank(k);

  k.onLoad(() => {
    for (let i = 0; i < FISH_COUNT; i++) spawnRandomFish(false);
    // A few cephalopods drift among the fish as larger accent creatures.
    spawnCephalopod(k, "nautilus");
    spawnCephalopod(k, "octopus");
    spawnCephalopod(k, "jellyfish");
    spawnCephalopod(k, "jellyfish");
    spawnCephalopod(k, "jellyfish");
  });
})();

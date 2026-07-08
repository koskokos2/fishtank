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
import { spawnHermitCrab } from "./hermitCrab";
import { HERMIT_CRAB_ATLAS, HERMIT_CRAB_FRAMES } from "./hermitCrabAtlas";
import { spawnSeaSnail } from "./seaSnail";
import { SEA_SNAIL_ATLAS, SEA_SNAIL_FRAMES } from "./seaSnailAtlas";
import { spawnLuminousKelp } from "./luminousKelp";
import {
  LUMINOUS_KELP_ATLAS,
  LUMINOUS_KELP_BUSHY_ATLAS,
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
  k.loadSprite("hermit-crab", HERMIT_CRAB_ATLAS, {
    sliceX: HERMIT_CRAB_FRAMES,
  });
  k.loadSprite("sea-snail", SEA_SNAIL_ATLAS, {
    sliceX: SEA_SNAIL_FRAMES,
  });
  k.loadSprite("luminous-kelp", LUMINOUS_KELP_ATLAS, {
    sliceX: LUMINOUS_KELP_COLS,
    sliceY: LUMINOUS_KELP_ROWS,
  });
  k.loadSprite("luminous-kelp-bushy", LUMINOUS_KELP_BUSHY_ATLAS, {
    sliceX: LUMINOUS_KELP_COLS,
    sliceY: LUMINOUS_KELP_ROWS,
  });
  k.loadSprite("plant-atlas-v2", PLANT_ATLAS, {
    sliceX: PLANT_ATLAS_COLS,
    sliceY: PLANT_ATLAS_ROWS,
  });
  k.loadSprite("sci-fi-props", SCI_FI_PROPS_ATLAS, {
    sliceX: SCI_FI_PROPS_ATLAS_COLS,
    sliceY: SCI_FI_PROPS_ATLAS_ROWS,
  });
  k.loadSprite("eldritch-props", ELDRITCH_PROPS_ATLAS, {
    sliceX: ELDRITCH_PROPS_ATLAS_COLS,
    sliceY: ELDRITCH_PROPS_ATLAS_ROWS,
  });
  k.loadSprite("star-wars-props", STAR_WARS_PROPS_ATLAS, {
    sliceX: STAR_WARS_PROPS_ATLAS_COLS,
    sliceY: STAR_WARS_PROPS_ATLAS_ROWS,
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
    // Start the pair far apart so both are immediately readable before their
    // independent routes eventually carry them around the full substrate.
    spawnHermitCrab(k, k.width() * 0.24);
    spawnHermitCrab(k, k.width() * 0.76);
    spawnSeaSnail(k);
    // Three ages of the same modular species. Their separately randomised
    // current phases keep the grove from swaying as one repeated sprite.
    spawnLuminousKelp(k, k.width() * 0.58, 0.72);
    spawnLuminousKelp(k, k.width() * 0.72, 1.28);
    spawnLuminousKelp(k, k.width() * 0.88, 0.96);
  });
})();

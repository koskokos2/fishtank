import kaplay from "kaplay";
import { makeFishSheet, FISH_SPECIES } from "./pixels";
import { makeBackdrop } from "./backdrop";
import { spawnFish } from "./fish";
import {
  makeOctopus,
  makeNautilusSprite,
  spawnCephalopod,
  setupCephalopodArms,
} from "./cephalopod";
import { NAUTILUS_FRAMES } from "./nautilusAtlas";
import { setupTank } from "./tank";

const FISH_COUNT = 20;
const BACKDROP_SEED = 1;

// Fixed virtual resolution: the whole scene renders into a 640x360 buffer that
// is scaled up to the window. This gives the fish and the procedurally-drawn
// background a single, consistent pixel grid — every sprite texel and every
// scene primitive is one buffer pixel. The canvas is left at 640x360 here and
// integer-scaled by fitInteger() below.
const VW = 640;
const VH = 360;

const k = kaplay({
  width: VW,
  height: VH,
  crisp: true,
  background: [6, 24, 43],
});

// Pixel-perfect display: scale the buffer by the largest whole number that fits
// the window, centered, letterboxing any remainder. Fractional scaling maps a
// source pixel to 2- or 3-wide screen pixels unevenly, which crawls when sprites
// move; an integer factor keeps every pixel identical. On 16:9 displays the
// factor lands exactly (1080p = 3x, 1440p = 4x, 4K = 6x), so there are no bars.
const canvas = document.querySelector("canvas")!;
function fitInteger() {
  const scale = Math.max(
    1,
    Math.floor(Math.min(window.innerWidth / VW, window.innerHeight / VH)),
  );
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
fitInteger();
window.addEventListener("resize", fitInteger);

const fishSpecies = Array.from({ length: FISH_COUNT }, () =>
  k.choose(FISH_SPECIES),
);

// The nautilus atlas is smooth-downscaled on a canvas (async image decode), so
// resolve it first, then register every sprite together — that way they're all
// in the load queue before onLoad fires (no load-order race).
(async () => {
  const nautilusSheet = await makeNautilusSprite();

  k.loadSprite("backdrop", makeBackdrop(BACKDROP_SEED));
  fishSpecies.forEach((species, i) => {
    k.loadSprite(`fish-${i}`, makeFishSheet(species), {
      sliceX: 2,
      anims: { swim: { from: 0, to: 1, loop: true, speed: 1 } },
    });
  });
  k.loadSprite("octopus", makeOctopus());
  k.loadSprite("nautilus", nautilusSheet, {
    sliceX: NAUTILUS_FRAMES,
    anims: { idle: { from: 0, to: NAUTILUS_FRAMES - 1, loop: true, speed: 10 } },
  });

  setupTank(k);
  setupCephalopodArms(k);

  k.onLoad(() => {
    fishSpecies.forEach((species, i) =>
      spawnFish(k, `fish-${i}`, species.level),
    );
    // A few cephalopods drift among the fish as larger accent creatures.
    spawnCephalopod(k, "nautilus");
    spawnCephalopod(k, "octopus");
    spawnCephalopod(k, "octopus");
  });
})();

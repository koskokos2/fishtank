import type { KAPLAYCtx } from "kaplay";
import { CITY_LANDMARK_IMAGES } from "./cityRelicImage";
import { RES } from "./res";
import { groundZ, sandTopAt } from "./backdrop";

const padding = 2 * RES;
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const image = CITY_LANDMARK_IMAGES[0];
const width = image.designWidth * RES;
const height = Math.round(width * image.height / image.width);
const originalBase = sandTopAt((-38 + image.designWidth * .67) * RES) + 14 * RES;
const spriteName = "city-guardian";

// Chosen placement: horizontal -3, vertical +50 design pixels.
const x = -3 * RES;
const baseY = originalBase + 50 * RES;
const layout = { x, y: Math.round(baseY - height), z: groundZ(baseY) };
function burialY(worldX: number) {
  const u = Math.max(0, Math.min(1, (worldX - x) / width));
  const drift = (Math.sin(u * Math.PI * 3 + .6) * 3 - (1 - u) * 7) * RES;
  return sandTopAt(worldX) + 35 * RES + drift;
}
// Approximate the buried edge with short strips instead of carrying the same
// depth down the whole dune. Near the chin the sprite ends above the burial
// line: extending the exclusion below that point would seal off clear sand.
const clearance = Math.max(22 * RES, 64); // native crawler body above its feet
const footprints: { x0: number; x1: number; baseY: number; maxDepth: number }[] = [];
for (let left = Math.max(0, x); left < x + width; left += 8 * RES) {
  const right = Math.min(left + 8 * RES, x + width);
  let maxDepth = 0;
  for (let column = left; column <= right; column++) {
    const bottom = Math.min(burialY(column), baseY);
    maxDepth = Math.max(maxDepth, bottom - sandTopAt(column) + clearance);
  }
  footprints.push({ x0: left, x1: right, baseY, maxDepth });
}
export function cityRelicFootprints() { return footprints; }

export async function makeCityRelicSprites() {
  return Promise.all(CITY_LANDMARK_IMAGES.map(async art => {
    const source = new Image();
    source.src = art.image;
    await source.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width + padding * 2;
    canvas.height = height + padding * 2;
    const context = canvas.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    // Both skins share the chosen contact line and canvas bounds. Fit the new
    // sculpture without stretching its face; align its bottom before burial.
    const scale = Math.min(width / art.width, height / art.height);
    const drawnWidth = Math.round(art.width * scale), drawnHeight = Math.round(art.height * scale);
    context.drawImage(source, padding + Math.round((width - drawnWidth) / 2),
      padding + height - drawnHeight, drawnWidth, drawnHeight);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const burialBand = 6 * RES;
    for (let x = 0; x < canvas.width; x++) {
      const bottom = burialY(layout.x + x - padding) - layout.y + padding;
      for (let y = Math.max(0, Math.floor(bottom - burialBand)); y < canvas.height; y++) {
        const coverage = Math.max(0, Math.min(1, (bottom - y) / burialBand));
        if (coverage <= (BAYER[y & 3][x & 3] + .5) / 16) pixels.data[(y * canvas.width + x) * 4 + 3] = 0;
      }
    }
    context.putImageData(pixels, 0, 0);
    return { name: art.name === "halloween" ? "city-guardian-halloween" : spriteName, image: canvas.toDataURL() };
  }));
}

export function spawnCityDuneRelic(k: KAPLAYCtx) {
  k.add([
    k.sprite(spriteName), k.pos(layout.x - padding, layout.y - padding), k.z(layout.z), "city-dune-relic",
  ]);
}

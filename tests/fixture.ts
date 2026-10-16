// Test-only entry. Production index.html never imports this or exposes a global.
import { aquarium as k } from "../src/main";
import { installBirthdayFish } from "../src/birthdayFish";
import { BIRTHDAY_LAYOUT, BIRTHDAY_FRAME_WIDTH, BIRTHDAY_FRAME_HEIGHT } from "../src/birthdayFishAtlas";
import { groundZ } from "../src/backdrop";
import type { FishActor } from "../src/fish";

k.randSeed(24);
// Kaplay returns depth-sorted objects; assertions must follow identity, not z.
const actors = () => BIRTHDAY_LAYOUT.flatMap(entry => k.get(entry.name) as FishActor[]);

const state = () => ({
  loaded: Boolean(k.getSprite("birthday-atlas")?.data),
  width: k.width(), height: k.height(),
  sparkles: k.get("birthday-sparkles").map(trail => ({
    count: trail.sparkleCount as number,
    z: trail.z as number,
    ownerZ: actors().find(fish => fish.id === trail.ownerId)?.z,
  })),
  ordinaryFish: k.get("fish").filter(fish => !fish.is("birthday-fish")).map(fish => ({
    collisionSensor: fish.has("area"), chaseTarget: fish.is("collidable-fish"),
  })),
  fish: actors().map((object) => {
    const fish = object as FishActor;
    const entry = BIRTHDAY_LAYOUT.find((entry) => fish.is(entry.name))!;
    return { name: entry.name, x: fish.pos.x, y: fish.pos.y,
      width: fish.width * fish.scale.x, height: fish.height * fish.scale.y,
      frame: fish.frame, angle: fish.angle, flip: fish.flipX,
      z: fish.z, expectedZ: groundZ(fish.pos.y), ordinaryFishTag: fish.is("fish"),
      collisionSensor: fish.has("area"), chaseTarget: fish.is("collidable-fish"),
      scale: fish.scale.x, left: entry.left, right: entry.right, qr: entry.qr,
    };
  }),
});
const skinNames = ["plant-atlas-v2", "plant-atlas-v2-goth", "luminous-kelp", "luminous-kelp-goth", "hermit-crab", "crawling-hand"];
const skinAssetIds = new Map<object, number>();
let drawProbe: ((options: Parameters<typeof k.drawUVQuad>[0]) => void) | undefined;
const drawUVQuad = k.drawUVQuad;
k.drawUVQuad = options => { drawProbe?.(options); return drawUVQuad(options); };
const api = {
  halloweenSparks: () => k.get("halloween-sparks").map(object => ({
    id: object.id, ...object.sparkStats(),
  })),
  fishAngles: () => k.get("fish").filter(f => !f.is("birthday-fish")).map(f => ({ id: f.id, angle: f.angle as number })),
  fishFiltering: async () => {
    const draws: { width: number; height: number; leftPadding: number; topPadding: number; rightPadding: number; bottomPadding: number }[] = [];
    drawProbe = options => {
      if (options.shader !== "fish-cubic-c1") return;
      const u = options.uniform as unknown as { textureSize: { x: number; y: number }; frameMin: { x: number; y: number }; frameMax: { x: number; y: number } };
      const q = options.quad!;
      draws.push({ width: options.width!, height: options.height!,
        leftPadding: u.frameMin.x - q.x * u.textureSize.x,
        topPadding: u.frameMin.y - q.y * u.textureSize.y,
        rightPadding: (q.x + q.w) * u.textureSize.x - u.frameMax.x,
        bottomPadding: (q.y + q.h) * u.textureSize.y - u.frameMax.y });
    };
    await new Promise(resolve => setTimeout(resolve, 120));
    drawProbe = undefined;
    return { draws, fish: k.get("fish").filter(f => !f.is("birthday-fish")).map(f => ({
      id: f.id, x: f.pos.x, y: f.pos.y, frame: f.frame,
      width: f.width, height: f.height, scale: f.scale.x,
    })).sort((a, b) => (a.id ?? 0) - (b.id ?? 0)) };
  },
  skinAssets: () => Object.fromEntries(skinNames.map(name => {
    const data = k.getSprite(name)?.data;
    if (data && !skinAssetIds.has(data)) skinAssetIds.set(data, skinAssetIds.size + 1);
    return [name, data ? skinAssetIds.get(data) : null];
  })),
  // Inspect real custom-draw UVs, rather than only asserting that assets loaded.
  plantDrawing: async () => {
    let kelpMinY = Infinity, kelpMaxY = -Infinity;
    const seen = new Set<string>();
    const poses = new Set<string>();
    const filtered = new Set<string>();
    const uniforms = new Map<string, Set<unknown>>();
    let validBounds = true;
    const assets = skinNames.slice(0, 4).map(name => ({ name, data: k.getSprite(name)?.data }));
    drawProbe = options => {
      for (const { name, data } of assets) {
        if (data && data.tex === options.tex && data.frames.includes(options.quad!)) {
          seen.add(name);
          poses.add(JSON.stringify([name, data.frames.indexOf(options.quad!), options.pos,
            options.scale, options.angle, options.width, options.height, options.anchor]));
          if (options.shader === "grid-cubic-c1") {
            filtered.add(name);
            if (!uniforms.has(name)) uniforms.set(name, new Set());
            uniforms.get(name)!.add(options.uniform);
            const u = options.uniform as unknown as { textureSize: {x: number; y: number}; atlasOrigin: {x: number; y: number}; cellSize: {x: number; y: number} };
            const q = options.quad!;
            for (const axis of ["x", "y"] as const) {
              const edge = q[axis] * u.textureSize[axis];
              const centre = edge + u.cellSize[axis] * 0.5;
              const derived = u.atlasOrigin[axis] + Math.floor((centre - u.atlasOrigin[axis]) / u.cellSize[axis]) * u.cellSize[axis];
              validBounds &&= Math.abs(derived - edge) < 0.001;
            }
          }
          if (name.startsWith("luminous-kelp")) {
            const y = (options.pos as { y: number }).y;
            kelpMinY = Math.min(kelpMinY, y);
            kelpMaxY = Math.max(kelpMaxY, y);
          }
        }
      }
    };
    await new Promise(resolve => setTimeout(resolve, 100));
    drawProbe = undefined;
    return { skins: [...seen].sort(), kelpHeight: (kelpMaxY - kelpMinY) / k.height(),
      poses: [...poses].sort(), filtered: [...filtered].sort(), validBounds,
      uniformCounts: [...uniforms.values()].map(values => values.size) };
  },
  settingsLayer: (name: string) => k.get(`settings-${name}`).map(object => ({
    id: object.id, hidden: object.hidden, sprite: object.sprite as string | undefined,
  })),
  paused: () => k.debug.paused,
  state,
  reinstall: () => installBirthdayFish(k),
  pause: () => { k.debug.paused = true; },
  resume: () => { k.debug.paused = false; },
  // Stable open-water placement for scan verification. Updates are paused, but
  // the real scene renderer, sprite atlas, UVs and depth sorting still run.
  // These scan-only positions avoid the kelp in the right-hand territory;
  // the movement test separately checks the actual swimming territories.
  pose: (direction: number, frame = 0) => {
    k.debug.paused = true;
    actors().forEach((fish, index) => {
      const actor = fish as FishActor;
      actor.pos = k.vec2(k.width() * (0.2 + index * 0.23), k.height() * (index === 1 ? 0.4 : 0.32));
      actor.z = groundZ(actor.pos.y);
      const trail = k.get("birthday-sparkles").find(trail => trail.ownerId === actor.id);
      if (trail) trail.z = actor.z - 0.01;
      actor.stop();
      actor.frame = index * 8 + direction * 4 + frame;
    });
  },
  occluder: () => {
    const fish = actors()[0];
    return k.add([k.rect(BIRTHDAY_FRAME_WIDTH, BIRTHDAY_FRAME_HEIGHT), k.pos(fish.pos),
      k.anchor("center"), k.color(25, 110, 60), k.z(fish.z + 1), "test-occluder"]);
  },
  removeOne: () => k.get("birthday-fish")[0]?.destroy(),
};
declare global { interface Window { birthdayTest: typeof api } }
window.birthdayTest = api;

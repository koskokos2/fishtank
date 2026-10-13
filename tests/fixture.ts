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
const api = {
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

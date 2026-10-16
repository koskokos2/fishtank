import type { Color, KAPLAYCtx, Vec2 } from "kaplay";
import type { FishActor } from "./fish";
import { off, profile, withDrawProfile } from "./profiling";
import { RES } from "./res";

const PALETTES: [number, number, number][][] = [
  [[255, 216, 108], [255, 242, 187], [255, 170, 66]],
  [[255, 164, 218], [244, 220, 255], [194, 156, 255]],
  [[110, 246, 222], [217, 255, 234], [165, 178, 255]],
];

type Sparkle = {
  pos: Vec2; vx: number; vy: number; age: number; life: number;
  size: number; phase: number; color: Color;
};

// Like sandPuff, draw plain particle structs in one object, not one game object
// per grain. Each resident has a bounded trail which dies with its owner.
export function attachBirthdaySparkles(k: KAPLAYCtx, fish: FishActor, palette: number) {
  if (off("puffs")) return;
  const colors = PALETTES[palette].map(([r, g, b]) => k.rgb(r, g, b));
  const core = k.rgb(255, 250, 221);
  const grains: Sparkle[] = [];
  let previousX = fish.pos.x, previousY = fish.pos.y;
  let budget = 0;

  const trail = k.add([
    k.pos(0, 0),
    k.z(fish.z - 0.01),
    "birthday-sparkles",
    {
      ownerId: fish.id,
      get sparkleCount() { return grains.length; },
      update() {
        profile("puffs", () => {
          const dt = Math.min(k.dt(), 1 / 30);
          if (dt <= 0) return;
          const vx = (fish.pos.x - previousX) / dt;
          const vy = (fish.pos.y - previousY) / dt;
          previousX = fish.pos.x; previousY = fish.pos.y;
          for (let i = grains.length - 1; i >= 0; i--) {
            const grain = grains[i];
            grain.age += dt;
            if (grain.age >= grain.life) {
              grains[i] = grains[grains.length - 1];
              grains.pop();
              continue;
            }
            grain.vx *= Math.exp(-1.4 * dt);
            grain.vy -= 2 * RES * dt;
            grain.pos.x += grain.vx * dt;
            grain.pos.y += grain.vy * dt;
          }
          // A few twinkles while hovering, a fuller wake while swimming.
          const speed = Math.hypot(vx, vy) / RES;
          budget = Math.min(4, budget + dt * (9 + Math.min(36, speed * 1.5)));
          while (budget >= 1 && grains.length < 112) {
            budget--;
            const angle = k.rand(0, Math.PI * 2);
            const radius = k.rand(0.82, 1.06);
            grains.push({
              pos: k.vec2(
                fish.pos.x + Math.cos(angle) * fish.width * fish.scale.x * 0.48 * radius,
                fish.pos.y + Math.sin(angle) * fish.height * fish.scale.y * 0.43 * radius,
              ),
              vx: k.rand(-5, 5) * RES - Math.max(-30 * RES, Math.min(30 * RES, vx)) * 0.12,
              vy: -k.rand(3, 9) * RES,
              age: 0, life: k.rand(1.6, 2.6),
              size: k.chance(0.3) ? 2 * RES : RES,
              phase: k.rand(0, Math.PI * 2), color: k.choose(colors),
            });
          }
        });
      },
      draw() {
        withDrawProfile("puffs", () => {
          for (const grain of grains) {
            const fade = Math.sin(Math.PI * grain.age / grain.life);
            const twinkle = 0.55 + 0.45 * Math.sin(grain.age * 11 + grain.phase) ** 2;
            const opacity = fade * twinkle;
            const x = Math.round(grain.pos.x), y = Math.round(grain.pos.y);
            const size = grain.size;
            // Crisp little crosses and a bright centre, using sand's pixel
            // rectangles rather than blur, textures or screen-space overlays.
            k.drawRect({ pos: k.vec2(x - size, y), width: size * 3, height: size,
              color: grain.color, opacity: opacity * 0.7 });
            k.drawRect({ pos: k.vec2(x, y - size), width: size, height: size * 3,
              color: grain.color, opacity: opacity * 0.7 });
            k.drawRect({ pos: k.vec2(x, y), width: size, height: size,
              color: core, opacity });
          }
        });
      },
    },
  ]);
  // The trail's lower z can make its update run before the fish's movement.
  // Follow the owner's update instead, after spawnFish has set this frame's z.
  const ownerUpdated = fish.onUpdate(() => { trail.z = fish.z - 0.01; });
  const ownerDestroyed = fish.onDestroy(() => trail.destroy());
  trail.onDestroy(() => { ownerUpdated.cancel(); ownerDestroyed.cancel(); });
}

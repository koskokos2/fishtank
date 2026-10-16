import type { KAPLAYCtx, Vec2 } from "kaplay";
import { RES } from "./res";
import { groundZ } from "./backdrop";
import { off, profile, withDrawProfile } from "./profiling";

const S = RES;
const DENSITY = 0.49;
const MAX_LIGHTS = Math.round(64 * DENSITY);
const MAX_EMBERS = 192;
type Particle = {
  pos: Vec2; active: boolean; vx: number; vy: number; age: number; life: number;
  phase: number; tint: number; nextBurst: number; flare: number; emit: number;
};

// One controller and fixed pools: sparkler showers never add scene objects,
// textures or timers, even when many rising lights flare at the same time.
export function createHalloweenSparks(k: KAPLAYCtx) {
  const makePool = (count: number): Particle[] => Array.from({ length: count }, () => ({
    pos: k.vec2(0, 0), active: false, vx: 0, vy: 0, age: 0, life: 0,
    phase: 0, tint: 0, nextBurst: 0, flare: 0, emit: 0,
  }));
  const lights = makePool(MAX_LIGHTS);
  const embers = makePool(MAX_EMBERS);
  const colours = [k.rgb(204, 132, 255), k.rgb(255, 157, 55), k.rgb(151, 255, 127)];
  const core = k.rgb(255, 244, 198);
  const drawPos = k.vec2(0, 0);
  let spawnIn = 0.6;
  let bursts = 0;
  let active = false;
  // Match actual ray visibility, including manual backdrop/caustics toggles.
  const night = () => off("backdrop") || off("caustics") || off("water-light");
  const emit = (x: number, y: number) => {
    if (!night()) return;
    // Thin every source equally, including the initial field and fish gulps.
    if (!k.chance(DENSITY)) return;
    const p = lights.find(p => !p.active);
    if (!p) return;
    p.active = true;
    p.pos.x = x; p.pos.y = y;
    p.vx = k.rand(-1.5, 1.5) * S;
    p.vy = -k.rand(9, 17) * S;
    p.age = 0; p.life = 45;
    p.phase = k.rand(0, Math.PI * 2);
    p.tint = k.randi(0, colours.length);
    p.nextBurst = k.rand(1.5, 7);
    p.flare = 0; p.emit = 0;
  };
  const syncNight = () => {
    const next = night();
    if (next === active) return active;
    active = next;
    if (active) {
      spawnIn = 0.6;
      // Start a fresh field at dusk; never resume a frozen daytime shower.
      for (let i = 0; i < 22; i++) emit(k.rand(0.04, 0.96) * k.width(), k.rand(0.12, 0.86) * k.height());
    } else {
      for (const p of lights) p.active = false;
      for (const p of embers) p.active = false;
    }
    return active;
  };
  const shower = (light: Particle) => {
    const p = embers.find(p => !p.active);
    if (!p) return;
    const angle = k.rand(0, Math.PI * 2);
    const speed = k.rand(18, 48) * S;
    p.active = true;
    p.pos.x = light.pos.x; p.pos.y = light.pos.y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - 7 * S;
    p.age = 0; p.life = k.rand(0.28, 0.75);
    p.tint = light.tint;
  };
  const square = (p: Particle, dx: number, dy: number, width: number, height: number,
    colour: typeof core, opacity: number) => {
    drawPos.x = Math.round(p.pos.x + dx * S);
    drawPos.y = Math.round(p.pos.y + dy * S);
    k.drawRect({ pos: drawPos, width: width * S, height: height * S, color: colour, opacity });
  };
  const controller = k.add([
    // Keep both rising glows and their sparkler fragments behind swimmers.
    "halloween-sparks", k.z(groundZ(0) - 4),
    {
      sparkStats: () => ({ active, lights: lights.filter(p => p.active).length,
        embers: embers.filter(p => p.active).length, bursts, maxLights: MAX_LIGHTS, maxEmbers: MAX_EMBERS }),
      update() {
        if (!syncNight()) return;
        profile("bubbles", () => {
          // Clamp catch-up after a sleeping/background tab: no burst backlog.
          const dt = Math.min(k.dt(), 0.05);
          spawnIn -= dt;
          if (spawnIn <= 0) {
            spawnIn = k.rand(0.45, 0.95);
            emit(k.rand(0.05, 0.95) * k.width(), k.rand(0.65, 0.9) * k.height());
          }
          for (const p of lights) {
            if (!p.active) continue;
            p.age += dt;
            p.pos.x += (p.vx + Math.sin(p.age * 2 + p.phase) * 3 * S) * dt;
            p.pos.y += p.vy * dt;
            if (p.pos.y < -8 * S || p.age > p.life) { p.active = false; continue; }
            p.nextBurst -= dt;
            if (p.nextBurst <= 0) {
              p.flare = k.rand(0.25, 0.55);
              p.nextBurst = k.rand(4, 10);
              p.emit = 0;
              bursts++;
            }
            if (p.flare > 0) {
              p.flare -= dt;
              p.emit -= dt;
              if (p.emit <= 0) { p.emit += 0.045; shower(p); }
            }
          }
          for (const p of embers) {
            if (!p.active) continue;
            p.age += dt;
            if (p.age >= p.life) { p.active = false; continue; }
            p.vx *= Math.exp(-2 * dt);
            p.vy += 28 * S * dt;
            p.pos.x += p.vx * dt; p.pos.y += p.vy * dt;
          }
        });
      },
      draw() {
        // Also react while paused: settings and the wall clock remain live.
        if (!syncNight()) return;
        withDrawProfile("bubbles", () => {
          for (const p of lights) {
            if (!p.active) continue;
            const fade = Math.min(1, p.age * 3, Math.max(0, p.pos.y / (16 * S)));
            const pulse = (0.7 + 0.3 * Math.sin(p.age * 3.5 + p.phase)) * fade;
            square(p, -1, -1, 3, 3, colours[p.tint], pulse * 0.13);
            square(p, 0, 0, 1, 1, core, pulse);
            if (p.flare > 0) {
              square(p, -2, 0, 5, 1, colours[p.tint], fade * 0.65);
              square(p, 0, -2, 1, 5, core, fade * 0.8);
            }
          }
          for (const p of embers) {
            if (!p.active) continue;
            const fade = 1 - p.age / p.life;
            const horizontal = Math.abs(p.vx) > Math.abs(p.vy);
            square(p, 0, 0, horizontal ? 2 : 1, horizontal ? 1 : 2,
              p.age < 0.1 ? core : colours[p.tint], fade * 0.85);
          }
        });
      },
    },
  ]);
  syncNight();
  return { emit, controller };
}

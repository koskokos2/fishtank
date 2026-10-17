import { expect, test } from "bun:test";
import type { KAPLAYCtx } from "kaplay";
import { spawnRotatingProps, resetPropObstacles, getPropObstacles, PROP_SLOTS } from "../src/propPlacement";
import { liveGroup } from "../src/liveGroup";
import { VW } from "../src/res";

test("city excludes the two guardian-side slots from spawning and repeated rotations", () => {
  type Actor = Record<string, any>;
  const actors: Actor[] = [];
  const timers: { active: boolean; callback: () => void }[] = [];
  const spawnedSlots: number[] = [];
  let seed = 24;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const shell = {
    width: () => VW, dt: () => 1,
    rand: (min: number, max: number) => min + random() * (max - min),
    randi: (min: number, max: number) => Math.floor(min + random() * (max - min)),
    choose: <T>(items: T[]) => items[Math.floor(random() * items.length)],
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    vec2: (x: number, y: number) => ({ x, y }),
    pos: (x: number, y: number) => ({ pos: { x, y } }),
    z: (z: number) => ({ z }), anchor: () => ({}), rotate: (angle: number) => ({ angle }),
    sprite: (sprite: string, options: object) => ({ sprite, ...options }),
    add(components: any[]) {
      const callbacks = new Set<() => void>(), destroyed = new Set<() => void>();
      const actor: Actor = Object.assign({}, ...components.filter(c => typeof c === "object"));
      actor.alive = true;
      actor.tag = () => {};
      actor.onUpdate = (callback: () => void) => { callbacks.add(callback); return { cancel: () => callbacks.delete(callback) }; };
      actor.onDestroy = (callback: () => void) => { destroyed.add(callback); };
      actor.destroy = () => { if (!actor.alive) return; actor.alive = false; callbacks.clear(); for (const fn of destroyed) fn(); };
      actor.tick = () => { actor.update?.(); for (const fn of [...callbacks]) if (actor.alive) fn(); };
      actors.push(actor);
      if (actor.propSlotIndex !== undefined) {
        spawnedSlots.push(actor.propSlotIndex);
        expect(actor.pos.x).toBe(PROP_SLOTS[actor.propSlotIndex].fx * VW);
      }
      return actor;
    },
    loop(_seconds: number, callback: () => void) {
      const timer = { active: true, callback };
      timers.push(timer);
      return { cancel: () => { timer.active = false; } };
    },
  } as unknown as KAPLAYCtx;
  const tick = () => { for (const actor of [...actors]) if (actor.alive) actor.tick(); };
  resetPropObstacles();
  const city = liveGroup(shell, "props");
  spawnRotatingProps(city.context, true);
  expect(spawnedSlots).toEqual([0, 3, 4, 5]);
  expect(getPropObstacles()).toHaveLength(4);
  for (let cycle = 0; cycle < 24; cycle++) {
    const before = spawnedSlots.length;
    for (const timer of timers) if (timer.active) timer.callback();
    for (let second = 0; second < 90; second++) tick();
    expect(spawnedSlots.length).toBe(before + 1);
    expect(spawnedSlots.every(slot => slot !== 1 && slot !== 2)).toBe(true);
    expect(getPropObstacles()).toHaveLength(4);
  }
  // Dispose during a handoff: neither its timer nor a delayed drop may survive.
  for (const timer of timers) if (timer.active) timer.callback();
  city.dispose();
  const afterDispose = spawnedSlots.length;
  for (let second = 0; second < 90; second++) tick();
  expect(spawnedSlots.length).toBe(afterDispose);
  expect(timers.every(timer => !timer.active)).toBe(true);
  resetPropObstacles();
  const ordinary = liveGroup(shell, "props");
  spawnRotatingProps(ordinary.context, false);
  expect(spawnedSlots.slice(-6)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(getPropObstacles()).toHaveLength(6);
  ordinary.dispose();
  resetPropObstacles();
});

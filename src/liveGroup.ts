import type { GameObj, KAPLAYCtx } from "kaplay";

// Own a layer's objects and timers without adding a parent that would change
// global z-ordering. Late spawns (fish replacements, bubbles, prop drops) stay
// in the same group and are cleaned up when its settings change.
export function liveGroup(engine: KAPLAYCtx, name: string) {
  const objects = new Set<GameObj>();
  const timers = new Set<ReturnType<KAPLAYCtx["loop"]>>();
  const context: KAPLAYCtx = Object.assign(Object.create(engine), {
    add(components: Parameters<KAPLAYCtx["add"]>[0]) {
      const object = engine.add(components);
      object.tag(`settings-${name}`);
      objects.add(object);
      object.onDestroy(() => objects.delete(object));
      return object;
    },
    loop(...args: Parameters<KAPLAYCtx["loop"]>) {
      const timer = engine.loop(...args);
      timers.add(timer);
      return timer;
    },
  });
  return {
    context,
    dispose() {
      for (const timer of timers) timer.cancel();
      timers.clear();
      for (const object of [...objects]) object.destroy();
      objects.clear();
    },
  };
}

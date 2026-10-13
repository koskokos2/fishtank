import type { KAPLAYCtx } from "kaplay";
import { shouldShowBirthdayFish, birthdayCheckDelay } from "./birthdayDate";
import { BIRTHDAY_QR } from "./birthdayQr";
import { BIRTHDAY_ATLAS, BIRTHDAY_ATLAS_COLS, BIRTHDAY_ATLAS_ROWS, BIRTHDAY_LAYOUT } from "./birthdayFishAtlas";
import { spawnFish, type FishActor } from "./fish";
import { birthdayFishEnabled } from "./profiling";
import { RES } from "./res";
import { attachBirthdaySparkles } from "./birthdaySparkles";

export function loadBirthdayFish(k: KAPLAYCtx) {
  const anims: Record<string, { from: number; to: number; loop: boolean; speed: number }> = {};
  for (const entry of BIRTHDAY_LAYOUT) {
    anims[`${entry.name}-left`] = { from: entry.left, to: entry.left + 3, loop: true, speed: 1 };
    anims[`${entry.name}-right`] = { from: entry.right, to: entry.right + 3, loop: true, speed: 1 };
  }
  k.loadSprite("birthday-atlas", BIRTHDAY_ATLAS, {
    sliceX: BIRTHDAY_ATLAS_COLS, sliceY: BIRTHDAY_ATLAS_ROWS, anims,
  });
}

const disposers = new WeakMap<KAPLAYCtx, () => void>();

/** The calendar owns these three identities; ordinary population controls don't. */
export function installBirthdayFish(k: KAPLAYCtx): () => void {
  disposers.get(k)?.();
  const residents = new Map<string, FishActor>();
  let timer: ReturnType<typeof setTimeout>;
  let disposed = false;

  function reconcile() {
    if (disposed) return;
    clearTimeout(timer);
    const now = new Date();
    if (shouldShowBirthdayFish(birthdayFishEnabled, now)) {
      BIRTHDAY_LAYOUT.forEach((entry, index) => {
        if (residents.get(entry.name)?.exists()) return;
        const level = [
          { min: 0.18, max: 0.38 },
          { min: 0.45, max: 0.65 },
          { min: 0.25, max: 0.48 },
        ][index];
        const fish = spawnFish(k, "birthday-atlas", {
          level, speed: 0.32 + index * 0.04,
          length: 35, motion: "flowing",
        }, {
          resident: true, ignoreCollisions: true, calm: true, levelBody: true,
          swimZone: { min: index / 3, max: (index + 1) / 3 },
          // Two-pixel QR modules must occupy whole world pixels even at low
          // render density. Round up to half-scale steps to preserve the code.
          scale: Math.ceil(RES * 2 / 3) / 2,
          position: { x: k.width() * (index + 0.5) / 3, y: k.height() * [0.28, 0.46, 0.32][index] },
          swimAnimations: { left: `${entry.name}-left`, right: `${entry.name}-right` },
        });
        fish.tag("birthday-fish");
        fish.tag(entry.name);
        attachBirthdaySparkles(k, fish, index);
        residents.set(entry.name, fish);
      });
    } else {
      for (const fish of residents.values()) fish.destroy();
      residents.clear();
    }
    timer = setTimeout(reconcile, birthdayCheckDelay(now));
  }

  // main.ts fits the canvas with CSS, outside Kaplay's viewport scaler. Map
  // client coordinates explicitly; its normal area.onClick otherwise uses
  // unscaled offsets and can activate the wrong fish on a smaller window.
  const openFish = (event: MouseEvent) => {
    const bounds = k.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * k.width() / bounds.width;
    const y = (event.clientY - bounds.top) * k.height() / bounds.height;
    const hit = [...residents.entries()]
      .filter(([, fish]) => fish.exists()
        && Math.abs(x - fish.pos.x) <= fish.width * fish.scale.x / 2
        && Math.abs(y - fish.pos.y) <= fish.height * fish.scale.y / 2)
      .sort((a, b) => b[1].z - a[1].z)[0];
    if (!hit) return;
    const index = BIRTHDAY_LAYOUT.findIndex(entry => entry.name === hit[0]);
    window.open(BIRTHDAY_QR[index].url, "_blank", "noopener,noreferrer");
  };

  k.canvas.addEventListener("click", openFish);
  window.addEventListener("focus", reconcile);
  window.addEventListener("pageshow", reconcile);
  document.addEventListener("visibilitychange", reconcile);
  reconcile();
  const dispose = () => {
    disposed = true;
    clearTimeout(timer);
    for (const fish of residents.values()) fish.destroy();
    residents.clear();
    k.canvas.removeEventListener("click", openFish);
    window.removeEventListener("focus", reconcile);
    window.removeEventListener("pageshow", reconcile);
    document.removeEventListener("visibilitychange", reconcile);
    if (disposers.get(k) === dispose) disposers.delete(k);
  };
  disposers.set(k, dispose);
  return dispose;
}

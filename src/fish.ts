import type { KAPLAYCtx } from "kaplay";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Motion model grounded in fish-swimming kinematics:
//  - Burst-and-coast gait: fish thrust in bursts, then glide with a still body
//    while drag bleeds off speed. They never hold a constant cruise.
//  - Tail-beat frequency tracks speed (amplitude is ~constant), so the fin
//    animation speeds up under thrust and nearly stops while coasting.
//  - The rigid body pitches toward its travel direction — nose up rising, down
//    diving — and turns emerge from decelerating and reversing, never snapping.
const ACCEL = 66; // forward thrust during a burst (px/s^2)
const DRAG = 1.1; // horizontal water resistance (per second)
const VDRAG = 1.4; // vertical water resistance
const VMAX = 26; // cap on vertical speed (keeps pitch gentle)
const MAX_TILT = (22 * Math.PI) / 180;
// Pitch snaps to multiples of this (degrees) so a tilted sprite holds a fixed
// rotation between steps instead of resampling — and rotating pixels — every frame.
const TILT_STEP = 7;
const AVOID = 520; // separation acceleration; grows as fish get closer
const AVOID_MAX = 150; // cap so a deep overlap can't fling a fish across the tank
const BODY_OFF = 8; // head/tail separation points sit this far from the center
const PAIR_DIST = 12; // min spacing kept between any two body points
const SEPARATION = 0.25; // share of the overlap each fish resolves per frame

export function spawnFish(
  k: KAPLAYCtx,
  spriteName: string,
  level: { min: number; max: number } = { min: 0.1, max: 0.9 },
) {
  const minY = 16;
  const maxY = () => k.height() * 0.8;
  // Map the species' preferred band (fractions of the swimmable height) to pixel
  // Y bounds, so spawning and the swim target favor that level. A little inset
  // keeps fish off the exact band edges.
  const bandTop = () => minY + (maxY() - minY) * level.min;
  const bandBot = () => minY + (maxY() - minY) * level.max;

  // No per-fish scaling: at the fixed virtual resolution (see main.ts) a sprite
  // scaled up would have chunkier texels than the rest of the scene. Every fish
  // draws 1:1 so the whole tank shares one pixel grid.
  const fish = k.add([
    k.sprite(spriteName),
    k.pos(k.rand(40, k.width() - 40), k.rand(bandTop(), bandBot())),
    k.anchor("center"),
    k.rotate(0),
    k.z(20),
    // Enlarged collider acts as a proximity sensor for separation, not a hard
    // hitbox — fish steer away before they actually touch.
    k.area({ scale: 1.5 }),
    // Head/tail world points, published each frame for capsule-style separation.
    { headX: 0, headY: 0, tailX: 0, tailY: 0 },
    "fish",
  ]);
  fish.play("swim", { loop: true });

  let vx = k.choose([-1, 1]) * 24;
  let vy = 0;
  let heading = Math.sign(vx); // intended horizontal travel direction
  let facingRight = vx > 0;
  // True sub-pixel position kept in floats; fish.pos is snapped to whole pixels
  // for rendering so the sprite doesn't crawl/shimmer as it drifts slowly.
  let px = fish.pos.x;
  let py = fish.pos.y;
  let depth = py;
  let ang = 0;
  let phase: "burst" | "coast" = "burst";
  let timer = k.rand(0.3, 0.8);
  let beat = 3;

  fish.flipX = facingRight;

  // Separation: while another fish is within sensor range, accelerate away from
  // it, harder the closer it is. They veer around each other rather than overlap;
  // the existing drag settles the push. onCollideUpdate fires per overlapping
  // neighbor each frame, and this closure shares vx/vy with the motion loop.
  fish.onCollideUpdate("fish", (other) => {
    const dt = k.dt();
    const dir = facingRight ? 1 : -1;
    const mine: [number, number][] = [
      [px + dir * BODY_OFF, py], // head
      [px - dir * BODY_OFF, py], // tail
    ];
    const o = other as unknown as Record<string, number>;
    const theirs: [number, number][] = [
      [o.headX, o.headY],
      [o.tailX, o.tailY],
    ];
    // Separate the nearest head/tail point-pairs so the whole length of each
    // body is respected, not just its center. Force-based steering veers them
    // apart; the positional nudge resolves real overlaps even in a crowd.
    for (const [mx, my] of mine) {
      for (const [ox, oy] of theirs) {
        const dx = mx - ox;
        const dy = my - oy;
        const d = Math.hypot(dx, dy) || 1;
        if (d >= PAIR_DIST) continue;
        const nx = dx / d;
        const ny = dy / d;
        vx += nx * Math.min(AVOID_MAX, AVOID / d) * dt;
        vy += ny * Math.min(AVOID_MAX, AVOID / d) * dt;
        const push = (PAIR_DIST - d) * SEPARATION;
        px += nx * push;
        py += ny * push;
      }
    }
  });

  fish.onUpdate(() => {
    const dt = k.dt();
    const w = k.width();

    timer -= dt;
    if (timer <= 0) {
      if (phase === "burst") {
        phase = "coast";
        timer = k.rand(0.6, 1.7);
      } else {
        phase = "burst";
        timer = k.rand(0.4, 0.9);
        if (k.rand() < 0.12) heading *= -1; // occasional wander turn
        if (k.rand() < 0.5) depth = k.rand(bandTop(), bandBot());
      }
    }

    // Steer away from the walls; the burst then carries the turn through.
    const margin = 50;
    if (px < margin) heading = 1;
    else if (px > w - margin) heading = -1;

    // Burst applies thrust; coast applies none. Drag acts in both phases, so a
    // coast is a decelerating glide.
    const ax = phase === "burst" ? heading * ACCEL : 0;
    const ay = phase === "burst" ? clamp((depth - py) * 0.9, -34, 34) : 0;
    vx += ax * dt;
    vy += ay * dt;
    vx -= vx * DRAG * dt;
    vy -= vy * VDRAG * dt;
    vy = clamp(vy, -VMAX, VMAX);

    px += vx * dt;
    py += vy * dt;

    if (py < minY) {
      py = minY;
      vy = Math.abs(vy) * 0.3;
    } else if (py > maxY()) {
      py = maxY();
      vy = -Math.abs(vy) * 0.3;
    }

    // Facing flips only once travel is clearly horizontal, so a turn reads as a
    // slow reversal rather than a snap.
    if (vx > 6) facingRight = true;
    else if (vx < -6) facingRight = false;
    fish.flipX = facingRight;

    // Pitch toward the travel direction, clamped so the fish never goes vertical.
    const slope = clamp(Math.atan2(vy, Math.abs(vx) + 8), -MAX_TILT, MAX_TILT);
    const targetAngle = ((facingRight ? slope : -slope) * 180) / Math.PI;
    ang = lerpTo(ang, targetAngle, 8, dt);

    // Snap the rendered transform: position to the pixel grid, pitch to fixed
    // tilt steps (the float state above stays smooth). A shallow slope snaps to
    // 0°, keeping slow horizontal swimmers perfectly crisp.
    fish.pos.x = Math.round(px);
    fish.pos.y = Math.round(py);
    fish.angle = Math.round(ang / TILT_STEP) * TILT_STEP;

    // Publish body points for neighbours' separation checks.
    const dir = facingRight ? 1 : -1;
    fish.headX = px + dir * BODY_OFF;
    fish.headY = py;
    fish.tailX = px - dir * BODY_OFF;
    fish.tailY = py;

    // Tail beats faster under thrust, nearly stops while gliding.
    const speed = Math.hypot(vx, vy);
    const targetBeat = phase === "burst" ? Math.min(13, 4 + speed * 0.18) : 1.2;
    beat = lerpTo(beat, targetBeat, 6, dt);
    fish.animSpeed = beat;
  });

  return fish;
}

// Frame-rate-independent exponential approach toward a target.
function lerpTo(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

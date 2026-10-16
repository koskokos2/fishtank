/**
 * Render-free soak test of the production crawler and rotating-prop controllers.
 * bun tools/crab-soak.ts --days=21 --fps=30 --seed=24
 * Add --creature=snail or --creature=hand to exercise the other crawlers.
 * --assert-moving exits nonzero on stuck creatures or unreachable retargets.
 * Only the KAPLAY scene/timer/sprite shell is replaced; movement, terrain,
 * placement, obstacle changes and prop sink/drop animations run unmodified.
 * A load-time getter exposes closure state for diagnostics, without changing it.
 */
import { plugin } from "bun";
import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import type { KAPLAYCtx } from "kaplay";
import { defaultSettings, encodeSettings, SETTING_GATES } from "../src/settingsCodec";

const { values } = parseArgs({ options: {
  days: { type: "string", default: "21" }, fps: { type: "string", default: "30" },
  seed: { type: "string", default: "24" }, group: { type: "string", default: "small" },
  creature: { type: "string", default: "crab" },
  "assert-moving": { type: "boolean", default: false },
  output: { type: "string", default: "test-results/crab-soak.json" },
} });
const days = Number(values.days), fps = Number(values.fps), seed = Number(values.seed);
if (!(days > 0 && fps > 0 && Number.isInteger(fps) && Number.isFinite(days) && Number.isFinite(seed)))
  throw new Error("Expected positive --days, integer --fps and finite --seed");
const group = `obj-${values.group}`;
const creature = values.creature!;
if (!["crab", "hand", "snail"].includes(creature)) throw new Error(`Unknown creature: ${creature}`);
if (!SETTING_GATES.includes(group as typeof SETTING_GATES[number])) throw new Error(`Unknown group: ${group}`);
// All optional layers off; only substrate, props and 20 crawlers remain.
const settings = defaultSettings();
settings.disabled = SETTING_GATES.filter(gate => !["sand", "props", "crabs", group].includes(gate));
settings.counts = { fish: 0, jelly: 0, octo: 0, naut: 0,
  crabs: creature === "snail" ? 0 : 20, snail: creature === "snail" ? 20 : 0, plants: 0 };
settings.crawlingHands = creature === "hand";
settings.realTimeSun = false;
settings.smoothTextures = false;
const search = `?settings=${encodeSettings(settings)}`;
Object.defineProperty(globalThis, "location", { value: { search }, configurable: true });

await plugin({ name: "crab-soak-readonly-state", setup(build) {
  build.onLoad({ filter: /[/\\](hermitCrab|seaSnail)\.ts$/ }, async ({ path }) => {
    const source = await Bun.file(path).text();
    const name = path.endsWith("seaSnail.ts") ? "snail" : "crab";
    const marker = `  ${name}.onUpdate(() =>`;
    if (source.split(marker).length !== 2) throw new Error(`Update soak instrumentation for ${path}`);
    return { loader: "ts", contents: source.replace(marker, `
  Object.defineProperty(${name}, "soakState", { get: () => ({
    x, substrateDepth, targetX, targetDepth, rest, speed, facing,
    maxDepthHere: maxSubstrateDepthAt(x), maxDepthAtTarget: maxSubstrateDepthAt(targetX),
  }) });
${marker}`) };
  });
} });
const { spawnHermitCrab } = await import("../src/hermitCrab");
const { spawnSeaSnail } = await import("../src/seaSnail");
const { spawnRotatingProps, getPropObstacles, PROP_WHITELIST } = await import("../src/propPlacement");
const { VW, VH } = await import("../src/res");

// Seeded PRNG; the sequence is reproducible within this harness, not identical
// to a browser session (other disabled systems don't consume random numbers).
let randomState = seed >>> 0;
const random = () => {
  randomState = (randomState + 0x6d2b79f5) | 0;
  let v = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
  v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
  return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
};
type Callback = { active: boolean; fn: () => void };
type Actor = Record<string, any> & { alive: boolean; callbacks: Callback[] };
const objects: Actor[] = [];
const timers: { every: number; next: number; fn: () => void; active: boolean }[] = [];
let time = 0, nextId = 0;
const fakeSprite = { tex: { width: 768, height: 128 }, frames: Array.from({length: 6}, (_, i) => ({x: i / 6, y: 0, w: 1 / 6, h: 1})) };
const shell = {
  width: () => VW, height: () => VH, dt: () => 1 / fps, time: () => time,
  rand: (min = 0, max = 1) => min + random() * (max - min),
  randi: (min: number, max: number) => Math.floor(min + random() * (max - min)),
  chance: (p: number) => random() < p,
  choose: <T>(items: T[]) => items[Math.floor(random() * items.length)],
  sprite: (name: string, options: object = {}) => ({sprite: name, width: 128, height: 128, frame: 0, draw() {}, ...options}),
  getSprite: () => ({data: fakeSprite}),
  quad: (x: number, y: number, w: number, h: number) => ({x, y, w, h}),
  vec2: (x: number, y: number) => ({x, y}),
  pos: (x: number, y: number) => ({pos: {x, y}}),
  anchor: (anchor: string) => ({anchor}),
  rotate: (angle: number) => ({angle}),
  scale: (n: number) => ({scale: {x: n, y: n}}),
  z: (z: number) => ({z}),
  add(components: object[]) {
    const actor: Actor = {alive: true, callbacks: [], id: nextId++};
    for (const component of components) Object.assign(actor, component);
    actor.onUpdate = (fn: () => void) => {
      const callback = {active: true, fn};
      actor.callbacks.push(callback);
      return {cancel: () => { callback.active = false; }};
    };
    actor.destroy = () => { actor.alive = false; };
    objects.push(actor);
    return actor;
  },
  loop(every: number, fn: () => void, _count?: number, waitFirst?: boolean) {
    const timer = {every, next: time + (waitFirst ? every : 0), fn, active: true};
    timers.push(timer);
    return {cancel: () => {timer.active = false;}};
  },
};
const k = shell as unknown as KAPLAYCtx;
spawnRotatingProps(k);
const crabs = Array.from({length: 20}, (_, i) => creature === "snail"
  ? spawnSeaSnail(k) : spawnHermitCrab(k, VW * ((i + 0.5) / 20))) as unknown as Actor[];
const tracking = crabs.map(crab => ({
  anchorX: crab.pos.x, anchorY: crab.pos.y, lastMoved: 0, maxStillSeconds: 0,
  distance: 0, lastX: crab.pos.x, lastY: crab.pos.y, episode: null as null | StuckEpisode,
}));
type StuckEpisode = { crab: number; startSeconds: number; detectedSeconds: number;
  recoveredSeconds: number | null; state: object; obstacles: object };
const episodes: StuckEpisode[] = [];
const daily: object[] = [];
const invalidRetargets: object[] = [];
let retargetVersion = getPropObstacles();
let obstacleChanges = 0, seenObstacles = getPropObstacles();
const started = performance.now();
const totalFrames = Math.round(days * 86400 * fps);
const snapshot = (index: number) => ({crab: index + 1, ...crabs[index].soakState,
  x: crabs[index].pos.x, y: crabs[index].pos.y,
  stationarySeconds: time - tracking[index].lastMoved,
  maxStationarySeconds: tracking[index].maxStillSeconds,
  sampledDistance: tracking[index].distance,
});
console.log(JSON.stringify({event: "start", days, fps, seed, creature, count: 20, group,
  rotatingProps: getPropObstacles().length,
  pool: PROP_WHITELIST.filter(p => p.id.startsWith(`${values.group}:`)).length,
  url: `http://127.0.0.1:3000/${search}`, graphics: false}));
for (let frame = 1; frame <= totalFrames; frame++) {
  time = frame / fps;
  // Compare the controller's response to a new obstacle layout, without
  // mutating destinations or adding recovery behavior to the real controller.
  const beforeRetarget = retargetVersion !== getPropObstacles()
    ? crabs.map(crab => crab.soakState) : null;
  retargetVersion = getPropObstacles();
  for (const timer of timers) if (timer.active && time >= timer.next) {
    timer.next += timer.every;
    timer.fn();
  }
  const limit = objects.length;
  for (let i = 0; i < limit; i++) {
    const object = objects[i];
    if (!object.alive) continue;
    if (object.update) object.update();
    for (const callback of object.callbacks) if (callback.active) callback.fn();
  }
  // Only transient prop controllers disappear; compact without a per-tick copy.
  for (let i = objects.length - 1; i >= 0; i--) if (!objects[i].alive) objects.splice(i, 1);
  if (beforeRetarget && invalidRetargets.length < 20) {
    for (let i = 0; i < crabs.length; i++) {
      const before = beforeRetarget[i], after = crabs[i].soakState;
      if (before.targetDepth <= before.maxDepthAtTarget && after.targetDepth > after.maxDepthAtTarget) {
        invalidRetargets.push({seconds: time, crab: i + 1, before, after});
      }
    }
  }
  if (seenObstacles !== getPropObstacles()) { seenObstacles = getPropObstacles(); obstacleChanges++; }
  if (frame % fps !== 0) continue;
  for (let i = 0; i < crabs.length; i++) {
    const crab = crabs[i], track = tracking[i];
    if (!Number.isFinite(crab.pos.x + crab.pos.y)) throw new Error(`Nonfinite crab ${i + 1} at ${time}`);
    track.distance += Math.hypot(crab.pos.x - track.lastX, crab.pos.y - track.lastY);
    track.lastX = crab.pos.x; track.lastY = crab.pos.y;
    if (Math.hypot(crab.pos.x - track.anchorX, crab.pos.y - track.anchorY) > 3) {
      track.lastMoved = time; track.anchorX = crab.pos.x; track.anchorY = crab.pos.y;
      if (track.episode) { track.episode.recoveredSeconds = time; track.episode = null; }
    }
    const still = time - track.lastMoved;
    track.maxStillSeconds = Math.max(track.maxStillSeconds, still);
    if (still >= 300 && !track.episode) {
      const episode: StuckEpisode = {crab: i + 1, startSeconds: track.lastMoved,
        detectedSeconds: time, recoveredSeconds: null, state: snapshot(i),
        obstacles: getPropObstacles().map(o => ({...o}))};
      episodes.push(episode); track.episode = episode;
      if (episodes.length <= 20) console.log(JSON.stringify({event: "stuck", ...episode}));
    }
  }
  if (frame % (86400 * fps) === 0 || frame === totalFrames) {
    const row = {day: time / 86400, wallSeconds: (performance.now() - started) / 1000,
      obstacleChanges, currentStuck: tracking.filter(t => t.episode).length,
      totalEpisodes: episodes.length, crabs: crabs.map((_, i) => snapshot(i))};
    daily.push(row);
    console.log(JSON.stringify({event: "progress", ...row, crabs: undefined}));
  }
}
const report = {days: time / 86400, fps, seed, group, creature, graphics: false, count: 20,
  settingsURL: `http://127.0.0.1:3000/${search}`, wallSeconds: (performance.now() - started) / 1000,
  obstacleChanges, stuckDefinition: "less than 3 pixels of net movement for 300 seconds; normal rests are at most 20 seconds",
  invalidRetargets, episodes, daily, final: crabs.map((_, i) => snapshot(i))};
await mkdir(new URL("../test-results/", import.meta.url), {recursive: true});
await Bun.write(values.output!, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({event: "complete", output: values.output, wallSeconds: report.wallSeconds,
  totalEpisodes: episodes.length, currentlyStuck: tracking.filter(t => t.episode).length}));
if (values["assert-moving"] && (episodes.length || invalidRetargets.length)) process.exitCode = 1;

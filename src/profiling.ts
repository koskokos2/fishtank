import type { KAPLAYCtx } from "kaplay";
import { BIRTHDAY_START_LABEL } from "./birthdayDate";
import { currentSun, realTimeSun, setRealTimeSun, setSunTimeOverride, sunTimeOverride } from "./sunClock";

import { settings, copySettings, saveSettings } from "./settings";
import { showSettingsHint } from "./settingsHint";
import { applyTheme, selectedTheme } from "./themePresets";
import { COUNT_LIMITS, COUNT_KEYS, SETTING_GATES, type CountKey, type TankSettings } from "./settingsCodec";

const OFF = new Set<string>(settings.disabled);
export const off = (name: string) =>
  name === "backdrop" && realTimeSun ? !currentSun().daylight : OFF.has(name);
export const uncapped = settings.frameCap === 0;
export let birthdayFishEnabled = settings.birthday;
export let gothPlantsEnabled = settings.gothPlants;
export let gothKelpEnabled = settings.gothKelp;
export let crawlingHandsEnabled = settings.crawlingHands;
export let halloweenBubblesEnabled = settings.halloweenBubbles;
// The saved choice stays enabled during the day; only its effective skin changes.
export const halloweenBubblesActive = () => halloweenBubblesEnabled
  && (off("backdrop") || off("caustics") || off("water-light"));
export let smoothTextures = settings.smoothTextures;
export const capFPS = settings.frameCap || 62;
const settingsListeners = new Set<() => void>();
export const onSettingsChange = (listener: () => void) => { settingsListeners.add(listener); };
function updateSettings(next: TankSettings, reload = false) {
  next.realTimeSun = realTimeSun;
  next.sunTime = realTimeSun ? sunTimeOverride : null;
  saveSettings(next, reload);
  if (reload) return;
  OFF.clear();
  for (const name of next.disabled) OFF.add(name);
  birthdayFishEnabled = next.birthday;
  gothPlantsEnabled = next.gothPlants;
  gothKelpEnabled = next.gothKelp;
  crawlingHandsEnabled = next.crawlingHands;
  halloweenBubblesEnabled = next.halloweenBubbles;
  smoothTextures = next.smoothTextures;
  if (kaplayDebug) kaplayDebug.paused = next.paused;
  for (const listener of settingsListeners) listener();
}
export const num = (name: string, fallback: number) =>
  COUNT_KEYS.includes(name as CountKey) ? settings.counts[name as CountKey] : fallback;
let entityCountDefaults: readonly (readonly [string, number])[] = [];
export const configureEntityCountDefaults = (
  counts: Readonly<Record<string, number>>,
) => {
  entityCountDefaults = Object.entries(counts);
};

// Info-icon previews for the fish/object set toggles: each set's owning module
// (fish.ts, propPlacement.ts) registers its members' atlas crop coordinates so
// the settings panel can render name + thumbnail without profiling.ts knowing
// about fish or props itself.
export type SetPreviewItem = {
  name: string;
  src: string; // atlas data URL
  cell: number; // native px per atlas cell (square)
  row: number;
  col: number;
};
const setPreviews = new Map<string, readonly SetPreviewItem[]>();
// Additive: a gate's members can be registered from more than one call site
// (e.g. propPlacement.ts's rotating whitelist and its fixed display props both
// contribute to the same "star-wars"/"sci-fi" families), so a later call must
// extend the list rather than replace it.
export const registerSetPreview = (
  gate: string,
  items: readonly SetPreviewItem[],
) => {
  const existing = setPreviews.get(gate);
  setPreviews.set(gate, existing ? [...existing, ...items] : items);
};

type HeapMemory = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};
type UserAgentMemory = {
  bytes: number;
  breakdown?: readonly {
    bytes: number;
    types?: readonly string[];
  }[];
};
type MemoryPerformance = Performance & {
  memory?: HeapMemory;
  measureUserAgentSpecificMemory?: () => Promise<UserAgentMemory>;
};
type GcPerformanceEntry = PerformanceEntry & {
  kind?: number;
  flags?: number;
  detail?: {
    kind?: number;
    flags?: number;
  };
};
type LongAnimationFrameScript = {
  duration: number;
};
type LongAnimationFrameEntry = PerformanceEntry & {
  blockingDuration?: number;
  renderStart?: number;
  styleAndLayoutStart?: number;
  scripts?: readonly LongAnimationFrameScript[];
};
type LongFrameBreakdown = {
  total: number;
  script: number;
  otherWork: number;
  renderOther: number;
  styleLayout: number;
  blocking: number;
};
type FrameProbeSample = {
  ts: number;
  beforeProbeMs: number;
  glSubmitMs: number;
};
type FrameProbe = {
  consume(ts: number): FrameProbeSample | undefined;
};
type ProfileComponent = {
  draw?: () => void;
};
type DrawProfileFrame = {
  name: string;
  start: number;
};
type ProfileAverages = Map<string, number>;
type ProfileRoot = {
  fixedUpdate: () => void;
  update: () => void;
  draw: () => void;
};
type DebugStatReader = () => string;

const MB = 1024 * 1024;
const formatBytes = (bytes: number) => {
  const mib = bytes / MB;
  return mib >= 1024
    ? `${(mib / 1024).toFixed(1)}GB`
    : `${mib.toFixed(mib < 10 ? 1 : 0)}MB`;
};
const formatAge = (ms: number) =>
  ms < 1000 ? "now" : `${Math.round(ms / 1000)}s ago`;
const formatMs = (ms: number) => `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
const pushRolling = (samples: number[], value: number, max = 240) => {
  samples.push(value);
  if (samples.length > max) samples.shift();
};
const avgOf = (samples: readonly number[]) =>
  samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
const addProfileTime = (
  totals: Map<string, number>,
  name: string,
  ms: number,
) => {
  totals.set(name, (totals.get(name) ?? 0) + ms);
};
const PROFILE_SMOOTHING = 0.45;
const consumeProfileAverages = (
  totals: Map<string, number>,
  frames: number,
  knownNames: readonly string[],
  seenNames: Set<string>,
  smoothed: ProfileAverages,
) => {
  for (const name of totals.keys()) seenNames.add(name);
  const raw = new Map<string, number>();
  for (const name of knownNames) raw.set(name, 0);
  for (const name of seenNames) raw.set(name, 0);
  for (const [name, ms] of totals) raw.set(name, ms / Math.max(1, frames));
  for (const [name, ms] of raw) {
    const prev = smoothed.get(name);
    smoothed.set(
      name,
      prev === undefined ? ms : prev + (ms - prev) * PROFILE_SMOOTHING,
    );
  }
  totals.clear();
  return new Map(smoothed);
};
const sumProfile = (entries: ProfileAverages) =>
  [...entries.values()].reduce((sum, ms) => sum + ms, 0);
const PROFILE_COLUMNS = 3;
const profileGrid = (
  label: string,
  entries: readonly (readonly [string, number])[],
) => {
  const labelWidth = 10;
  const nameWidth = 12;
  const valueWidth = 7;
  const rows: string[] = [];
  for (let i = 0; i < entries.length; i += PROFILE_COLUMNS) {
    const cells = entries.slice(i, i + PROFILE_COLUMNS).map(([name, ms]) => {
      const clipped = name.length > nameWidth ? name.slice(0, nameWidth) : name;
      return `${clipped.padEnd(nameWidth)} ${formatMs(ms).padStart(valueWidth)}`;
    });
    rows.push(
      `${(i === 0 ? label : "").padEnd(labelWidth)}${cells.join("  ")}`,
    );
  }
  return rows.join("\n");
};
const profileEntries = (
  entries: ProfileAverages,
  order: readonly string[],
  extra?: readonly (readonly [string, number])[],
) => {
  const result: [string, number][] = [];
  const used = new Set<string>();
  for (const entry of extra ?? []) {
    result.push([entry[0], entry[1]]);
    used.add(entry[0]);
  }
  for (const name of order) {
    result.push([name, entries.get(name) ?? 0]);
    used.add(name);
  }
  for (const [name, ms] of [...entries.entries()].sort((a, b) => b[1] - a[1])) {
    if (!used.has(name)) result.push([name, ms]);
  }
  return result;
};
const summarizeMemoryBreakdown = (sample: UserAgentMemory) => {
  const byType = new Map<string, number>();
  for (const part of sample.breakdown ?? []) {
    const type = part.types?.length
      ? [...part.types].sort().join("+")
      : "other";
    byType.set(type, (byType.get(type) ?? 0) + part.bytes);
  }
  return [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type, bytes]) => `${type.toLowerCase()} ${formatBytes(bytes)}`)
    .join(", ");
};
const GC_KIND_NAMES: Record<number, string> = {
  1: "minor",
  2: "major",
  4: "incremental",
  8: "weak",
};
const gcKindName = (kind?: number) =>
  kind === undefined ? "gc" : (GC_KIND_NAMES[kind] ?? `kind ${kind}`);
const makeLongFrameBreakdown = (
  entry: LongAnimationFrameEntry,
): LongFrameBreakdown => {
  const end = entry.startTime + entry.duration;
  const renderStart = entry.renderStart ?? end;
  const styleStart = entry.styleAndLayoutStart ?? end;
  const work = Math.max(0, renderStart - entry.startTime);
  const render = Math.max(0, end - renderStart);
  const styleLayout = Math.max(0, end - styleStart);
  const script = (entry.scripts ?? []).reduce((sum, s) => sum + s.duration, 0);
  return {
    total: entry.duration,
    script,
    otherWork: Math.max(0, work - script),
    renderOther: Math.max(0, render - styleLayout),
    styleLayout,
    blocking: entry.blockingDuration ?? 0,
  };
};

let debugProfiling = settings.debug;
const jsProfileTotals = new Map<string, number>();
const drawProfileTotals = new Map<string, number>();
const glProfileTotals = new Map<string, number>();
const engineProfileTotals = new Map<string, number>();
const JS_PROFILE_ORDER = [
  "fish",
  "fish collide",
  "cephs",
  "crabs",
  "snails",
  "kelp",
  "plants",
  "bubbles",
  "motes",
  "puffs",
  "props",
] as const;
const DRAW_PROFILE_ORDER = [
  "backdrop",
  "sand",
  "props",
  "plants",
  "kelp",
  "motes",
  "bubbles",
  "fish",
  "cephs",
  "crabs",
  "snails",
  "puffs",
] as const;
const ENGINE_PROFILE_ORDER = [
  "root update",
  "root fixed",
  "root draw",
] as const;
const seenJsProfileNames = new Set<string>();
const seenDrawProfileNames = new Set<string>();
const seenGlProfileNames = new Set<string>();
const seenEngineProfileNames = new Set<string>();
const smoothedJsProfileAverages: ProfileAverages = new Map();
const smoothedDrawProfileAverages: ProfileAverages = new Map();
const smoothedGlProfileAverages: ProfileAverages = new Map();
const smoothedEngineProfileAverages: ProfileAverages = new Map();
const drawProfileStack: DrawProfileFrame[] = [];
const debugStatReaders = new Map<string, DebugStatReader>();
let frameProbe: FrameProbe | null = null;
const profiledRoots = new WeakSet<ProfileRoot>();
let rafProfileInstalled = false;
let rafCallbackTotalMs = 0;

export const registerDebugStat = (name: string, read: DebugStatReader) => {
  debugStatReaders.set(name, read);
};

export const profile = <T>(name: string, fn: () => T): T => {
  if (!debugProfiling) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    addProfileTime(jsProfileTotals, name, performance.now() - start);
  }
};

export const withDrawProfile = <T>(name: string, fn: () => T): T => {
  if (!debugProfiling) return fn();
  drawProfileStack.push({ name, start: performance.now() });
  try {
    return fn();
  } finally {
    const frame = drawProfileStack.pop();
    if (frame)
      addProfileTime(
        drawProfileTotals,
        frame.name,
        performance.now() - frame.start,
      );
  }
};

// The game runs kaplay with global: false, so the debug object is only
// reachable through the context; installEngineProfiler stashes it here for the
// overlay readers (which live in load listeners outside any k scope).
let kaplayDebug: KAPLAYCtx["debug"] | null = null;

export const installEngineProfiler = (
  k: Pick<KAPLAYCtx, "getTreeRoot" | "debug">,
) => {
  kaplayDebug = k.debug;
  kaplayDebug.paused = settings.paused;
  const root = k.getTreeRoot() as ProfileRoot;
  if (profiledRoots.has(root)) return;
  profiledRoots.add(root);

  const wrap = <K extends keyof ProfileRoot>(key: K, name: string) => {
    const original = root[key];
    root[key] = function (this: ProfileRoot) {
      if (!debugProfiling) return original.call(this);
      const start = performance.now();
      try {
        return original.call(this);
      } finally {
        addProfileTime(engineProfileTotals, name, performance.now() - start);
      }
    } as ProfileRoot[K];
  };

  wrap("update", "root update");
  wrap("fixedUpdate", "root fixed");
  wrap("draw", "root draw");
};

export const profileDraw = (name: string): ProfileComponent => ({
  draw() {
    if (debugProfiling)
      drawProfileStack.push({ name, start: performance.now() });
  },
});

export const profileDrawEnd = (): ProfileComponent => ({
  draw() {
    if (!debugProfiling) return;
    const frame = drawProfileStack.pop();
    if (frame)
      addProfileTime(
        drawProfileTotals,
        frame.name,
        performance.now() - frame.start,
      );
  },
});

const installFrameProbe = () => {
  const samples: FrameProbeSample[] = [];
  let current: FrameProbeSample | null = null;
  const tick = (ts: number) => {
    current = { ts, beforeProbeMs: performance.now() - ts, glSubmitMs: 0 };
    samples.push(current);
    if (samples.length > 360) samples.shift();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const addGlSubmitTime = (ms: number) => {
    if (!debugProfiling) return;
    if (current) current.glSubmitMs += ms;
    addProfileTime(
      glProfileTotals,
      drawProfileStack[drawProfileStack.length - 1]?.name ?? "unscoped",
      ms,
    );
  };
  const patchGlDrawPrototype = (
    proto: Pick<WebGLRenderingContext, "drawArrays" | "drawElements">,
  ) => {
    const drawArrays = proto.drawArrays;
    proto.drawArrays = function (mode, first, count) {
      const start = performance.now();
      try {
        return drawArrays.call(this, mode, first, count);
      } finally {
        addGlSubmitTime(performance.now() - start);
      }
    };
    const drawElements = proto.drawElements;
    proto.drawElements = function (mode, count, type, offset) {
      const start = performance.now();
      try {
        return drawElements.call(this, mode, count, type, offset);
      } finally {
        addGlSubmitTime(performance.now() - start);
      }
    };
  };
  if (typeof WebGLRenderingContext !== "undefined")
    patchGlDrawPrototype(WebGLRenderingContext.prototype);
  if (
    typeof WebGL2RenderingContext !== "undefined" &&
    (typeof WebGLRenderingContext === "undefined" ||
      WebGL2RenderingContext.prototype.drawArrays !==
        WebGLRenderingContext.prototype.drawArrays)
  )
    patchGlDrawPrototype(WebGL2RenderingContext.prototype);

  return {
    consume(ts: number) {
      const i = samples.findIndex((s) => s.ts === ts);
      if (i < 0) return undefined;
      const sample = samples[i];
      samples.splice(0, i + 1);
      return sample;
    },
  };
};

const installRafProfiler = () => {
  if (rafProfileInstalled || typeof requestAnimationFrame === "undefined")
    return;
  rafProfileInstalled = true;
  const originalRequestAnimationFrame = requestAnimationFrame.bind(globalThis);
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    originalRequestAnimationFrame((time) => {
      if (!debugProfiling) return callback(time);
      const start = performance.now();
      try {
        return callback(time);
      } finally {
        rafCallbackTotalMs += performance.now() - start;
      }
    })) as typeof requestAnimationFrame;
};

const setDebugProfiling = (enabled: boolean) => {
  debugProfiling = enabled;
  if (enabled && typeof requestAnimationFrame !== "undefined") {
    installRafProfiler();
    if (!frameProbe) frameProbe = installFrameProbe();
  }
  if (!enabled) {
    jsProfileTotals.clear();
    drawProfileTotals.clear();
    glProfileTotals.clear();
    engineProfileTotals.clear();
    seenJsProfileNames.clear();
    seenDrawProfileNames.clear();
    seenGlProfileNames.clear();
    seenEngineProfileNames.clear();
    smoothedJsProfileAverages.clear();
    smoothedDrawProfileAverages.clear();
    smoothedGlProfileAverages.clear();
    smoothedEngineProfileAverages.clear();
    drawProfileStack.length = 0;
    rafCallbackTotalMs = 0;
  }
};

// ?fps overlays a live frame-rate readout — easier to read than the in-scene
// console prop, and available even with ?off=props. Superseded by ?debug's
// panel, which occupies the same corner.
if (settings.fps && !settings.debug)
  addEventListener("load", () => {
    const label = document.createElement("div");
    label.style.cssText =
      "position:fixed;right:8px;top:8px;z-index:9;background:#000c;color:#7f7;" +
      "font:16px/1.4 monospace;padding:4px 8px;border-radius:4px";
    document.body.append(label);
    setInterval(() => {
      const d = kaplayDebug;
      label.textContent = d ? String(Math.round(d.fps())) : "…";
    }, 250);
  });

// ?debug overlays a live performance panel: rendered fps vs rAF tick rate
// (a gap means the frame cap is skipping ticks, and the tick rate is the
// display's real refresh), main-thread frame cost with p95 over a rolling
// window, late-rAF probe timing, named update/draw breakdowns, Kaplay root
// overhead, approximate untracked time before the panel probe, GL submit-call
// timing, object count, JS heap, buffer size, and the renderer string.
if (typeof addEventListener !== "undefined" && typeof document !== "undefined")
  addEventListener("load", () => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;right:8px;top:8px;z-index:9;background:#000c;color:#7f7;" +
      "font:13px/1.5 monospace;padding:6px 18px 6px 10px;border-radius:4px";
    document.body.append(box);

    // Outside ?debug, start collapsed so normal runs only show the settings gear.
    // If localStorage has a saved state, restore it.
    const savedSettingsPanelOpen = localStorage.getItem(
      "debugSettingsPanelOpen",
    );
    const initialSettingsPanelOpen = debugProfiling
      ? true
      : savedSettingsPanelOpen === "true";
    box.style.display = initialSettingsPanelOpen ? "" : "none";

    const gear = document.createElement("button");
    gear.textContent = "⚙";
    gear.setAttribute("aria-label", "settings");
    gear.title = "settings";
    gear.style.cssText =
      "position:fixed;right:8px;top:8px;z-index:9;background:none;border:none;" +
      "color:#fff;font:15px monospace;cursor:pointer;padding:2px 6px;" +
      `border-radius:4px;display:${initialSettingsPanelOpen ? "none" : "block"}`;
    document.body.append(gear);
    const dismissSettingsHint = showSettingsHint(gear, initialSettingsPanelOpen);
    const close = document.createElement("button");
    close.textContent = "×";
    close.style.cssText =
      "position:absolute;top:0;right:2px;background:none;border:none;" +
      "color:#7f7a;font:15px monospace;cursor:pointer;padding:2px 4px";
    box.append(close);

    const themeLabel = document.createElement("label");
    themeLabel.style.cssText = "display:flex;align-items:center;gap:6px;padding-right:12px";
    const themeSelect = document.createElement("select");
    themeSelect.style.cssText = "background:#000;color:#7f7;border:1px solid #7f74;border-radius:3px;font:inherit;padding:1px 2px";
    for (const [value, text] of [["none", "no theme"], ["halloween", "halloween"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      themeSelect.append(option);
    }
    themeSelect.value = selectedTheme(settings);
    themeLabel.append("theme", themeSelect);
    themeLabel.title = "choose a preset, then customize individual settings below";
    box.append(themeLabel);

    const detailBox = document.createElement("div");
    detailBox.style.cssText =
      "position:fixed;left:8px;top:8px;z-index:9;background:#000c;color:#7f7;" +
      "font:13px/1.5 monospace;padding:6px 18px 6px 10px;border-radius:4px;" +
      "max-width:min(720px,calc(100vw - 16px));max-height:calc(100vh - 16px);" +
      "overflow:auto;display:none";
    document.body.append(detailBox);
    const detailClose = document.createElement("button");
    detailClose.textContent = "×";
    detailClose.style.cssText =
      "position:absolute;top:0;right:2px;background:none;border:none;" +
      "color:#7f7a;font:15px monospace;cursor:pointer;padding:2px 4px";
    detailBox.append(detailClose);
    const detailPanel = document.createElement("div");
    detailPanel.style.cssText = "white-space:pre";
    detailBox.append(detailPanel);

    const fpsRow = document.createElement("div");
    fpsRow.style.cssText =
      "display:flex;gap:6px;align-items:center;white-space:pre";
    const fpsPanel = document.createElement("span");
    fpsPanel.textContent = "fps: …";
    const detailToggle = document.createElement("button");
    detailToggle.title = "show performance details";
    detailToggle.setAttribute("aria-label", "show performance details");
    detailToggle.style.cssText =
      "display:grid;grid-template-columns:repeat(3,3px);align-items:end;gap:2px;" +
      "height:15px;background:#0008;border:1px solid #7f74;color:#7f7;" +
      "cursor:pointer;padding:2px 3px;border-radius:3px";
    for (const h of [5, 9, 7]) {
      const bar = document.createElement("span");
      bar.style.cssText = `display:block;width:3px;height:${h}px;background:#7f7`;
      detailToggle.append(bar);
    }
    const setDetailsVisible = (visible: boolean) => {
      detailBox.style.display = visible ? "" : "none";
      setDebugProfiling(visible);
      if (visible && !detailPanel.textContent)
        detailPanel.textContent = "warming performance details...";
      detailToggle.title = visible
        ? "hide performance details"
        : "show performance details";
      detailToggle.setAttribute(
        "aria-label",
        visible ? "hide performance details" : "show performance details",
      );
      localStorage.setItem("debugDetailsPanelOpen", String(visible));
    };
    detailToggle.addEventListener("click", () => {
      setDetailsVisible(detailBox.style.display === "none");
    });
    detailClose.addEventListener("click", () => {
      setDetailsVisible(false);
    });

    const setBoxVisible = (visible: boolean) => {
      if (visible) dismissSettingsHint();
      box.style.display = visible ? "" : "none";
      gear.style.display = visible ? "none" : "block";
      localStorage.setItem("debugSettingsPanelOpen", String(visible));
    };
    close.addEventListener("click", () => {
      setBoxVisible(false);
    });
    gear.addEventListener("click", () => {
      setBoxVisible(true);
    });
    fpsRow.append(fpsPanel, detailToggle);
    setInterval(() => {
      const d = kaplayDebug;
      fpsPanel.textContent = `fps: ${d ? Math.round(d.fps()) : "?"}`;
    }, 250);

    // Auto-open the detail panel (performance breakdown) if debug param is set
    if (settings.debug) {
      setDetailsVisible(true);
    } else {
      // Otherwise, restore from localStorage
      const savedDetailsPanelOpen = localStorage.getItem(
        "debugDetailsPanelOpen",
      );
      if (savedDetailsPanelOpen === "true") {
        setDetailsVisible(true);
      }
    }

    // Set-preview panel: a tiny ⓘ next to a fish/object set row pins this open
    // on the left with that set's members' names + atlas-cropped thumbnails,
    // so a set can be identified before deciding to disable it. Sits
    // bottom-left so it never collides with the top-left detail panel.
    const PREVIEW_THUMB_SIZE = 64;
    const previewBox = document.createElement("div");
    previewBox.style.cssText =
      "position:fixed;left:8px;bottom:8px;z-index:9;background:#000c;color:#7f7;" +
      "font:13px/1.5 monospace;padding:6px 18px 6px 10px;border-radius:4px;" +
      "width:480px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);" +
      "overflow:auto;display:none";
    document.body.append(previewBox);
    const previewClose = document.createElement("button");
    previewClose.textContent = "×";
    previewClose.style.cssText =
      "position:absolute;top:0;right:2px;background:none;border:none;" +
      "color:#7f7a;font:15px monospace;cursor:pointer;padding:2px 4px";
    previewBox.append(previewClose);
    const previewTitle = document.createElement("div");
    previewTitle.style.cssText = "font-weight:bold;margin-bottom:4px";
    previewBox.append(previewTitle);
    const previewGrid = document.createElement("div");
    previewGrid.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));" +
      "gap:8px 12px";
    previewBox.append(previewGrid);

    const atlasImages = new Map<string, Promise<HTMLImageElement>>();
    const loadAtlasImage = (src: string) => {
      let p = atlasImages.get(src);
      if (!p) {
        p = new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("atlas thumb load failed"));
          img.src = src;
        });
        atlasImages.set(src, p);
      }
      return p;
    };
    let activePreviewGate: string | null = null;
    const closePreview = () => {
      previewBox.style.display = "none";
      activePreviewGate = null;
    };
    const openPreview = (gate: string, label: string) => {
      if (activePreviewGate === gate) {
        closePreview();
        return;
      }
      activePreviewGate = gate;
      previewBox.style.display = "";
      previewTitle.textContent = label;
      previewGrid.replaceChildren();
      for (const item of setPreviews.get(gate) ?? []) {
        const cell = document.createElement("div");
        cell.style.cssText = "display:flex;align-items:center;gap:6px";
        const canvas = document.createElement("canvas");
        canvas.width = PREVIEW_THUMB_SIZE;
        canvas.height = PREVIEW_THUMB_SIZE;
        canvas.style.cssText = "flex:none;image-rendering:pixelated";
        const nameEl = document.createElement("span");
        nameEl.textContent = item.name;
        cell.append(canvas, nameEl);
        previewGrid.append(cell);
        loadAtlasImage(item.src).then((img) => {
          const cx = canvas.getContext("2d")!;
          cx.imageSmoothingEnabled = false;
          cx.drawImage(
            img,
            item.col * item.cell,
            item.row * item.cell,
            item.cell,
            item.cell,
            0,
            0,
            PREVIEW_THUMB_SIZE,
            PREVIEW_THUMB_SIZE,
          );
        });
      }
    };
    previewClose.addEventListener("click", closePreview);

    const birthdayLabel = document.createElement("label");
    birthdayLabel.style.cssText =
      "display:flex;gap:6px;align-items:center;cursor:pointer;" +
      "margin-top:6px;border-top:1px solid #7f74;padding-top:6px";
    birthdayLabel.title =
      `show from ${BIRTHDAY_START_LABEL} onward. Unchecked: never show birthday fish.`;
    const birthdayCb = document.createElement("input");
    birthdayCb.type = "checkbox";
    birthdayCb.checked = birthdayFishEnabled;
    birthdayCb.style.accentColor = "#7f7";
    birthdayCb.addEventListener("change", () => {
      const p = copySettings();
      p.birthday = birthdayCb.checked;
      updateSettings(p);
    });
    birthdayLabel.append(birthdayCb, "birthday fish (scheduled)");

    // Scene-element checkboxes: each maps to a live disabled-layer flag. Every
    // checkbox across every grid below shares one `boxes` map and `apply`, so
    // toggling one section's gates never clobbers another's.
    const TOGGLES = ["backdrop", "plants", "bubbles", "kelp"];
    // Fish-atlas and prop-family themes: same flag mechanism as TOGGLES,
    // gate names prefixed so they can't collide with each other or TOGGLES
    // (both have a "pop-culture" entry). Kept in sync by hand with fishKindSet's
    // FISH_SET_ATLASES (fish.ts) and the families built into PROP_WHITELIST
    // (propPlacement.ts) — profiling.ts stays a leaf module with no game imports.
    const FISH_SET_TOGGLES: (readonly [string, string])[] = [
      ["fish-main", "freshwater 1"],
      ["fish-extra", "freshwater 2"],
      ["fish-bonus", "freshwater 3"],
      ["fish-alien", "alien"],
      ["fish-pop-culture", "pop culture"],
      ["fish-odyssey", "the odyssey"],
      ["fish-giger", "giger"],
      ["fish-halloween", "halloween"],
      ["fish-witches", "witches"],
    ];
    const OBJECT_SET_TOGGLES: (readonly [string, string])[] = [
      ["obj-sci-fi", "sci-fi"],
      ["obj-eldritch", "eldritch"],
      ["obj-star-wars", "star wars"],
      ["obj-pop-culture", "pop culture"],
      ["obj-odyssey", "the odyssey"],
      ["obj-giger", "giger"],
      ["obj-halloween", "halloween"],
      ["obj-grindelwald", "alpine"],
      ["obj-small", "seabed finds"],
    ];
    const boxes = new Map<string, HTMLInputElement>();
    const apply = () => {
      const offNow = [...boxes.entries()]
        // A scheduled night must not become a permanent manual backdrop choice.
        .filter(([name, cb]) => name === "backdrop" && realTimeSun ? OFF.has(name) : !cb.checked)
        .map(([name]) => name);
      const p = copySettings();
      // Gates without sidebar controls retain their shared-URL values.
      p.disabled = SETTING_GATES.filter(gate => boxes.has(gate) ? offNow.includes(gate) : OFF.has(gate));
      updateSettings(p);
    };
    const addToggleGrid = (
      title: string,
      entries: readonly (readonly [string, string])[],
    ) => {
      const grid = document.createElement("div");
      grid.style.cssText =
        "display:grid;grid-template-columns:1fr 1fr;gap:1px 12px;" +
        "margin-top:6px;border-top:1px solid #7f74;padding-top:6px";
      box.append(grid);
      if (title) {
        const heading = document.createElement("div");
        heading.style.cssText =
          "grid-column:1/-1;opacity:.7;margin-bottom:2px;" +
          "display:flex;align-items:center;gap:6px";
        const label = document.createElement("span");
        label.textContent = title;
        heading.append(label);
        const allBtn = document.createElement("button");
        const syncAllButton = () => {
          allBtn.textContent = entries.every(([name]) => off(name)) ? "+" : "×";
        };
        syncAllButton();
        onSettingsChange(syncAllButton);
        allBtn.title = `toggle all ${title}`;
        allBtn.style.cssText =
          "background:none;border:none;color:#7f7;cursor:pointer;" +
          "font:11px monospace;padding:0;line-height:1";
        allBtn.addEventListener("click", () => {
          const cbs = entries.map(([name]) => boxes.get(name)!);
          const turnOn = cbs.some((cb) => !cb.checked);
          for (const cb of cbs) cb.checked = turnOn;
          apply();
        });
        heading.append(allBtn);
        grid.append(heading);
      }
      for (const [name, display] of entries) {
        const label = document.createElement("label");
        label.style.cssText =
          "display:flex;gap:6px;align-items:center;cursor:pointer";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !off(name);
        cb.style.accentColor = "#7f7";
        if (name === "backdrop") cb.title = "toggle daytime lighting and take manual control of the sun.";
        if (name === "bubbles") cb.title = "show bubbles and drifting motes, or magical sparks during Halloween nights";
        cb.addEventListener("change", () => {
          if (name !== "backdrop") { apply(); return; }
          // Manual backdrop changes are live too, and leave automatic mode.
          setRealTimeSun(false);
          apply();
          syncSunControls();
        });
        boxes.set(name, cb);
        label.append(cb, display);
        if (setPreviews.has(name)) {
          const info = document.createElement("button");
          info.textContent = "ⓘ";
          info.title = `preview ${display}`;
          info.style.cssText =
            "background:none;border:none;color:#7f7a;cursor:pointer;" +
            "font:11px monospace;padding:0;line-height:1";
          // A click inside a <label> also toggles its checkbox unless the
          // default is prevented before the event finishes bubbling.
          info.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPreview(name, display);
          });
          label.append(info);
        }
        grid.append(label);
      }
      return grid;
    };
    const menu = addToggleGrid(
      "",
      TOGGLES.map((n) => [n, n === "backdrop" ? "sun" : n] as const),
    );
    menu.style.borderTop = "none";
    const skinBoxes = new Map<"gothPlants" | "gothKelp" | "crawlingHands" | "halloweenBubbles", HTMLInputElement>();
    const addSkinToggle = (
      layer: "plants" | "kelp" | "crabs" | "bubbles",
      enabled: boolean,
      field: "gothPlants" | "gothKelp" | "crawlingHands" | "halloweenBubbles" = layer === "plants" ? "gothPlants" : "gothKelp",
      display = `goth ${layer}`,
    ) => {
      const label = document.createElement("label");
      label.style.cssText =
        "display:flex;gap:6px;align-items:center;cursor:pointer";
      label.title =
        field === "halloweenBubbles"
          ? "magical sparks at night; regular bubbles and motes during the day. The bubbles checkbox controls visibility."
          : `replace the ${layer} with ${display}.` + (boxes.has(layer) ? ` The ${layer} checkbox controls visibility.` : "");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = enabled;
      skinBoxes.set(field, cb);
      cb.style.accentColor = "#7f7";
      cb.addEventListener("change", () => {
        const p = copySettings();
        p[field] = cb.checked;
        updateSettings(p);
      });
      label.append(cb, display);
      const layerLabel = boxes.get(layer)?.closest("label");
      if (layerLabel) layerLabel.after(label);
      else menu.append(label);
    };
    addSkinToggle("bubbles", halloweenBubblesEnabled, "halloweenBubbles", "night sparkles");
    const sunControls = document.createElement("div");
    sunControls.style.cssText = "margin-top:6px;border-top:1px solid #7f74;padding-top:6px";
    const sunLabel = document.createElement("label");
    sunLabel.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer";
    const sunToggle = document.createElement("input");
    sunToggle.type = "checkbox";
    sunToggle.style.accentColor = "#7f7";
    sunLabel.append(sunToggle, "real-time sun");
    sunLabel.title = "local time: sunrise at 04:00, night at 18:00. Updates without reloading.";
    const timeRow = document.createElement("label");
    timeRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:5px";
    const timeSlider = document.createElement("input");
    timeSlider.type = "range";
    timeSlider.min = "0";
    timeSlider.max = "1439";
    timeSlider.step = "1";
    timeSlider.setAttribute("aria-label", "temporary sun time");
    timeSlider.style.cssText = "flex:0.5;min-width:60px;margin:0;accent-color:#7f7";
    timeRow.append("preview time", timeSlider);
    const timeStatus = document.createElement("output");
    const resetTime = document.createElement("button");
    resetTime.textContent = "use real time";
    resetTime.style.cssText = "background:none;color:#7f7;border:1px solid #7f74;font:inherit;cursor:pointer";
    const timeFooter = document.createElement("div");
    timeFooter.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px";
    timeFooter.append(resetTime, timeStatus);
    sunControls.append(sunLabel, timeRow, timeFooter);
    function syncSunControls() {
      const sun = currentSun();
      sunToggle.checked = realTimeSun;
      timeSlider.disabled = !realTimeSun;
      timeSlider.value = String(Math.floor(sun.minutes));
      resetTime.disabled = !realTimeSun || sunTimeOverride === null;
      resetTime.style.opacity = resetTime.disabled ? ".4" : "1";
      const hours = String(Math.floor(sun.minutes / 60)).padStart(2, "0");
      const minutes = String(Math.floor(sun.minutes % 60)).padStart(2, "0");
      timeStatus.textContent = realTimeSun
        ? `${hours}:${minutes} · ${sunTimeOverride === null ? "live" : "preview"} · ${sun.daylight ? "day" : "night"}`
        : off("backdrop") ? "manual night" : "fixed daytime rays";
      boxes.get("backdrop")!.checked = !off("backdrop");
    }
    sunToggle.addEventListener("change", () => {
      setRealTimeSun(sunToggle.checked);
      updateSettings(copySettings());
      syncSunControls();
    });
    timeSlider.addEventListener("input", () => {
      setSunTimeOverride(Number(timeSlider.value));
      updateSettings(copySettings());
      syncSunControls();
    });
    resetTime.addEventListener("click", () => {
      setSunTimeOverride(null);
      updateSettings(copySettings());
      syncSunControls();
    });
    syncSunControls();
    window.setInterval(syncSunControls, 1000);

    addToggleGrid("fish sets", FISH_SET_TOGGLES);
    addToggleGrid("object sets", OBJECT_SET_TOGGLES);

    // Buffer resolution and frame cap need a reload (both are fixed at init);
    // pause is live and splits update cost from draw cost — if fps rises while
    // paused, the update side was the load; if not, it's the draw side.
    // Explicit rows keep intrinsic panel width based on the wider row, rather
    // than the combined width of controls that merely wrap onto a second line.
    const graphicsSection = document.createElement("div");
    graphicsSection.style.cssText =
      "display:grid;gap:12px;margin-top:6px;border-top:1px solid #7f74;padding-top:6px";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:12px;align-items:center;flex-wrap:wrap";
    const makeSelect = (
      title: string,
      options: [string, string][],
      current: string,
      onPick: (v: string, p: TankSettings) => void,
      reload = true,
    ) => {
      const label = document.createElement("label");
      label.style.cssText =
        "display:flex;gap:5px;align-items:center;cursor:pointer";
      const sel = document.createElement("select");
      sel.style.cssText =
        "background:#000;color:#7f7;border:1px solid #7f74;border-radius:3px;" +
        "font:inherit;padding:1px 2px";
      for (const [value, text] of options) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = text;
        o.selected = value === current;
        sel.append(o);
      }
      sel.addEventListener("change", () => {
        const p = copySettings();
        onPick(sel.value, p);
        updateSettings(p, reload);
      });
      label.append(title, sel);
      row.append(label);
      return label;
    };
    const textureLabel = document.createElement("label");
    textureLabel.style.cssText = "display:flex;gap:5px;align-items:center;cursor:pointer";
    const textureToggle = document.createElement("input");
    textureToggle.type = "checkbox";
    textureToggle.checked = smoothTextures;
    textureToggle.style.accentColor = "#7f7";
    textureToggle.addEventListener("change", () => {
      const query = copySettings();
      query.smoothTextures = textureToggle.checked;
      updateSettings(query, false);
    });
    textureLabel.append(textureToggle, "texture filtering");
    textureLabel.title = "smooths fish, octopuses, jellyfish, nautiluses, snails, crabs, hands, plants and kelp while preserving detail. Changes instantly.";
    // Keep the live checkboxes together on their own line.
    const graphicsToggles = document.createElement("div");
    graphicsToggles.style.cssText = "display:flex;gap:12px;align-items:center";
    const resNow = String(settings.resolution);
    makeSelect(
      "resolution",
      [
        ["1", "360p"],
        ["2", "720p"],
        ["3", "1080p"],
        ["6", "4K"],
      ],
      resNow,
      (v, p) => {
        p.resolution = Number(v) as TankSettings["resolution"];
      },
    );
    const capNow = settings.frameCap === 0 ? "off" : settings.frameCap === 32 ? "30" : "60";
    makeSelect(
      "fps cap",
      [
        ["30", "30"],
        ["60", "60"],
        ["off", "off"],
      ],
      capNow,
      (v, p) => {
        p.frameCap = v === "off" ? 0 : v === "30" ? 32 : 62;
      },
    );
    const pauseLabel = document.createElement("label");
    pauseLabel.style.cssText =
      "display:flex;gap:6px;align-items:center;cursor:pointer";
    const pauseCb = document.createElement("input");
    pauseCb.type = "checkbox";
    pauseCb.style.accentColor = "#7f7";
    pauseCb.checked = settings.paused;
    pauseCb.addEventListener("change", () => {
      const p = copySettings();
      p.paused = pauseCb.checked;
      updateSettings(p);
    });
    pauseLabel.append(pauseCb, "pause");
    row.prepend(fpsRow);
    graphicsToggles.append(textureLabel, pauseLabel);
    graphicsSection.append(row, graphicsToggles);

    // Spawn-count inputs rebuild only the affected population and update the URL.
    const countStyle = document.createElement("style");
    countStyle.textContent = `
      .tank-count-input { appearance: textfield; }
      .tank-count-input::-webkit-inner-spin-button,
      .tank-count-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    `;
    document.head.append(countStyle);
    const countRow = document.createElement("div");
    countRow.style.cssText =
      "display:grid;grid-template-columns:repeat(2,max-content);gap:4px 16px;margin-top:6px;" +
      "border-top:1px solid #7f74;padding-top:6px";
    box.append(countRow);
    const countLabels: Record<CountKey, string> = {
      fish: "fish", jelly: "jellyfish", octo: "octopuses", naut: "nautiluses",
      crabs: "crabs", snail: "sea snails", plants: "plants",
    };
    for (const [name, fallback] of entityCountDefaults) {
      const displayName = countLabels[name as CountKey];
      const maxCount = COUNT_LIMITS[name as CountKey];
      const countControl = document.createElement("div");
      countControl.style.cssText =
        "display:grid;grid-template-columns:7em max-content 1.8em 1.8em;gap:6px;align-items:center";
      const label = document.createElement("label");
      label.textContent = displayName;
      label.htmlFor = `count-${name}`;
      label.style.cursor = "pointer";
      const input = document.createElement("input");
      input.id = label.htmlFor;
      input.type = "number";
      input.min = "0";
      input.max = String(maxCount);
      input.className = "tank-count-input";
      input.step = "1";
      input.value = String(num(name, fallback));
      input.style.cssText =
        "width:calc(3ch + 8px);box-sizing:border-box;background:#000;color:#7f7;border:1px solid #7f74;" +
        "border-radius:3px;font:inherit;padding:1px 3px";
      const value = () => {
        const v = Math.min(maxCount, Math.max(0, Math.floor(Number(input.value))));
        return Number.isFinite(v) ? v : fallback;
      };
      const minus = document.createElement("button");
      const plus = document.createElement("button");
      const syncButtons = () => {
        minus.disabled = value() <= 0;
        plus.disabled = value() >= maxCount;
        minus.style.opacity = minus.disabled ? ".4" : "1";
        plus.style.opacity = plus.disabled ? ".4" : "1";
      };
      const applyCount = (next: number) => {
        const p = copySettings();
        p.counts[name as CountKey] = next;
        input.value = String(next);
        syncButtons();
        updateSettings(p);
      };
      input.addEventListener("change", () => applyCount(value()));
      input.addEventListener("input", syncButtons);
      for (const [button, delta, symbol, action] of [
        [minus, -1, "−", "decrease"], [plus, 1, "+", "increase"],
      ] as const) {
        button.type = "button";
        button.textContent = symbol;
        button.setAttribute("aria-label", `${action} ${displayName} count`);
        button.title = `${action} ${displayName} count`;
        button.style.cssText =
          "background:#000;color:#7f7;border:1px solid #7f74;border-radius:3px;" +
          "font:inherit;padding:1px 0;cursor:pointer;line-height:1.2";
        button.addEventListener("click", () => applyCount(Math.min(maxCount, Math.max(0, value() + delta))));
      }
      syncButtons();
      countControl.append(label, input, minus, plus);
      countRow.append(countControl);
    }

    box.append(sunControls, graphicsSection, birthdayLabel);

    const githubLink = document.createElement("a");
    githubLink.href = "https://github.com/koskokos2/fishtank";
    githubLink.target = "_blank";
    githubLink.rel = "noreferrer";
    githubLink.textContent = "github: koskokos2/fishtank";
    githubLink.style.cssText =
      "display:block;margin-top:6px;border-top:1px solid #7f74;padding-top:6px;" +
      "color:#7f7;text-decoration:none";
    box.append(githubLink);

    themeSelect.addEventListener("change", () => {
      updateSettings(applyTheme(copySettings(), themeSelect.value === "halloween" ? "halloween" : "none"));
    });
    onSettingsChange(() => {
      themeSelect.value = selectedTheme(settings);
      for (const [gate, checkbox] of boxes) checkbox.checked = !off(gate);
      for (const [field, checkbox] of skinBoxes) checkbox.checked = settings[field];
    });

    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl") ?? null;
    const dbgExt = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl
      ? String(
          gl.getParameter(
            dbgExt ? dbgExt.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
          ),
        )
      : "no WebGL";
    const perf = performance as MemoryPerformance;
    const supportedEntryTypes =
      typeof PerformanceObserver === "undefined"
        ? []
        : (PerformanceObserver.supportedEntryTypes ?? []);

    let pageMemory: UserAgentMemory | null = null;
    let pageMemoryStatus = perf.measureUserAgentSpecificMemory
      ? "pending"
      : "n/a";
    let pageMemoryNextAt = performance.now() + 1000;
    let pageMemoryBusy = false;
    const samplePageMemory = (now: number) => {
      if (
        !perf.measureUserAgentSpecificMemory ||
        pageMemoryBusy ||
        now < pageMemoryNextAt
      )
        return;
      if (typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
        pageMemoryStatus = "needs COI";
        pageMemoryNextAt = Number.POSITIVE_INFINITY;
        return;
      }
      pageMemoryBusy = true;
      perf
        .measureUserAgentSpecificMemory()
        .then((sample) => {
          pageMemory = sample;
          pageMemoryStatus = "ok";
          pageMemoryNextAt = performance.now() + 10000;
        })
        .catch((error: unknown) => {
          pageMemoryStatus =
            error instanceof Error ? error.name || "failed" : "failed";
          pageMemoryNextAt = performance.now() + 30000;
        })
        .finally(() => {
          pageMemoryBusy = false;
        });
    };

    const nativeGc = {
      count: 0,
      totalMs: 0,
      lastAt: 0,
      lastDuration: 0,
      lastKind: undefined as number | undefined,
    };
    let gcIntervalMs = 0;
    let gcStatus = "not exposed";
    if (
      typeof PerformanceObserver !== "undefined" &&
      supportedEntryTypes.includes("gc")
    ) {
      try {
        new PerformanceObserver((list) => {
          if (!debugProfiling) return;
          for (const entry of list.getEntries() as GcPerformanceEntry[]) {
            const kind = entry.detail?.kind ?? entry.kind;
            nativeGc.count++;
            nativeGc.totalMs += entry.duration;
            nativeGc.lastAt = performance.now();
            nativeGc.lastDuration = entry.duration;
            nativeGc.lastKind = kind;
            gcIntervalMs += entry.duration;
          }
        }).observe({ type: "gc", buffered: true });
        gcStatus = "native";
      } catch (error) {
        gcStatus = error instanceof Error ? error.name || "failed" : "failed";
      }
    }

    let lastHeapUsed: number | undefined;
    let heapPeak = 0;
    let heapDropCount = 0;
    let lastHeapDropAt = 0;
    let lastHeapDropBytes = 0;
    const trackHeapDrop = (heap: HeapMemory | undefined, now: number) => {
      if (!heap) return;
      const used = heap.usedJSHeapSize;
      const threshold = Math.max(MB, heapPeak * 0.02);
      if (lastHeapUsed !== undefined && used + threshold < lastHeapUsed) {
        heapDropCount++;
        lastHeapDropAt = now;
        lastHeapDropBytes = lastHeapUsed - used;
      }
      heapPeak = Math.max(heapPeak, used);
      lastHeapUsed = used;
    };
    const pageMemoryText = () => {
      if (!perf.measureUserAgentSpecificMemory) return "";
      if (!pageMemory)
        return `page   ${pageMemoryBusy ? "sampling" : pageMemoryStatus}`;
      const summary = summarizeMemoryBreakdown(pageMemory);
      return `page   ${formatBytes(pageMemory.bytes)}${
        summary ? ` (${summary})` : ""
      }`;
    };
    const gcText = (now: number, heap: HeapMemory | undefined) => {
      if (gcStatus === "native") {
        const avg = nativeGc.count ? nativeGc.totalMs / nativeGc.count : 0;
        const last = nativeGc.lastAt
          ? ` last ${gcKindName(nativeGc.lastKind)} ${nativeGc.lastDuration.toFixed(
              1,
            )}ms ${formatAge(now - nativeGc.lastAt)}`
          : " waiting";
        return `gc     native ${nativeGc.count} avg ${avg.toFixed(1)}ms${last}`;
      }
      if (heap) {
        const last = lastHeapDropAt
          ? `last -${formatBytes(lastHeapDropBytes)} ${formatAge(
              now - lastHeapDropAt,
            )}`
          : "none yet";
        return `gc     ${heapDropCount} heap drops, ${last}`;
      }
      return `gc     ${gcStatus}`;
    };
    const debugStatsText = () => {
      if (!debugStatReaders.size) return "";
      return `stats  ${[...debugStatReaders.entries()]
        .map(([name, read]) => `${name} ${read()}`)
        .join("  ")}`;
    };

    const longFrames: LongFrameBreakdown[] = [];
    let browserRenderIntervalMs = 0;
    let longFrameStatus = supportedEntryTypes.includes("long-animation-frame")
      ? "waiting"
      : "not exposed";
    if (
      typeof PerformanceObserver !== "undefined" &&
      supportedEntryTypes.includes("long-animation-frame")
    ) {
      try {
        new PerformanceObserver((list) => {
          if (!debugProfiling) return;
          for (const entry of list.getEntries() as LongAnimationFrameEntry[]) {
            const frame = makeLongFrameBreakdown(entry);
            longFrames.push(frame);
            if (longFrames.length > 40) longFrames.shift();
            browserRenderIntervalMs += frame.renderOther + frame.styleLayout;
          }
        }).observe({ type: "long-animation-frame", buffered: true });
      } catch (error) {
        longFrameStatus =
          error instanceof Error ? error.name || "failed" : "failed";
      }
    }
    const longFrameText = () => {
      if (longFrameStatus === "not exposed") return "";
      if (!longFrames.length) return `long   ${longFrameStatus}`;
      const avg = (pick: (f: LongFrameBreakdown) => number) =>
        avgOf(longFrames.map(pick));
      return [
        `long   avg ${formatMs(avg((f) => f.total))} block ${formatMs(
          avg((f) => f.blocking),
        )}`,
        `       js ${formatMs(avg((f) => f.script))}+${formatMs(
          avg((f) => f.otherWork),
        )} render ${formatMs(avg((f) => f.renderOther))} layout ${formatMs(
          avg((f) => f.styleLayout),
        )}`,
      ].join("\n");
    };

    const costs: number[] = [];
    const beforeProbeCosts: number[] = [];
    const afterProbeCosts: number[] = [];
    const glSubmitCosts: number[] = [];
    const meterCosts: number[] = [];
    let ticks = 0;
    const tick = (ts: number) => {
      const now = performance.now();
      const elapsed = now - ts;
      const frameStart = frameProbe?.consume(ts);
      const beforeProbe = frameStart?.beforeProbeMs ?? 0;
      const glSubmit = frameStart?.glSubmitMs ?? 0;
      if (debugProfiling) {
        pushRolling(costs, elapsed);
        pushRolling(beforeProbeCosts, beforeProbe);
        pushRolling(glSubmitCosts, glSubmit);
        pushRolling(
          afterProbeCosts,
          Math.max(0, elapsed - beforeProbe - glSubmit),
        );
        ticks++;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    let lastT = performance.now();
    setInterval(() => {
      const meterStart = performance.now();
      if (!debugProfiling) {
        ticks = 0;
        lastT = performance.now();
        gcIntervalMs = 0;
        browserRenderIntervalMs = 0;
        rafCallbackTotalMs = 0;
        return;
      }
      const now = performance.now();
      const hz = Math.round((ticks * 1000) / (now - lastT));
      const frameCount = Math.max(1, ticks);
      ticks = 0;
      lastT = now;
      const sorted = [...costs].sort((a, b) => a - b);
      const avg =
        sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      const d = kaplayDebug;
      const heap = perf.memory;
      trackHeapDrop(heap, now);
      samplePageMemory(now);
      const jsByApp = consumeProfileAverages(
        jsProfileTotals,
        frameCount,
        JS_PROFILE_ORDER,
        seenJsProfileNames,
        smoothedJsProfileAverages,
      );
      const drawByApp = consumeProfileAverages(
        drawProfileTotals,
        frameCount,
        DRAW_PROFILE_ORDER,
        seenDrawProfileNames,
        smoothedDrawProfileAverages,
      );
      const glByApp = consumeProfileAverages(
        glProfileTotals,
        frameCount,
        DRAW_PROFILE_ORDER,
        seenGlProfileNames,
        smoothedGlProfileAverages,
      );
      const engineByApp = consumeProfileAverages(
        engineProfileTotals,
        frameCount,
        ENGINE_PROFILE_ORDER,
        seenEngineProfileNames,
        smoothedEngineProfileAverages,
      );
      const beforeProbeAvg = avgOf(beforeProbeCosts);
      const afterProbeAvg = avgOf(afterProbeCosts);
      const glSubmitAvg = avgOf(glSubmitCosts);
      const gcPauseAvg = gcStatus === "native" ? gcIntervalMs / frameCount : 0;
      const browserRenderAvg = browserRenderIntervalMs / frameCount;
      const meterAvg = avgOf(meterCosts);
      const rafCallbacksAvg = rafCallbackTotalMs / frameCount;
      gcIntervalMs = 0;
      browserRenderIntervalMs = 0;
      rafCallbackTotalMs = 0;
      const appUpdateAvg = sumProfile(jsByApp);
      const appDrawAvg = sumProfile(drawByApp);
      const rootUpdateAvg = engineByApp.get("root update") ?? 0;
      const rootFixedAvg = engineByApp.get("root fixed") ?? 0;
      const rootDrawAvg = engineByApp.get("root draw") ?? 0;
      const engineUpdateWalkAvg = Math.max(0, rootUpdateAvg - appUpdateAvg);
      const engineDrawWalkAvg = Math.max(0, rootDrawAvg - appDrawAvg);
      const engineWalkAvg =
        engineUpdateWalkAvg + rootFixedAvg + engineDrawWalkAvg;
      const rootMeasuredAvg = rootUpdateAvg + rootFixedAvg + rootDrawAvg;
      const accountGapAvg = beforeProbeAvg - rootMeasuredAvg;
      const rafOtherAvg = Math.max(0, rafCallbacksAvg - rootMeasuredAvg);
      const unknownGapAvg = Math.max(
        0,
        accountGapAvg - rafOtherAvg - gcPauseAvg - meterAvg,
      );
      const accountGapEntry: readonly [string, number] =
        accountGapAvg >= 0
          ? ["browser/other", accountGapAvg]
          : ["timing overlap", -accountGapAvg];
      const fps = d ? Math.round(d.fps()) : "?";
      const fpsText = `fps    ${fps} (raf ${hz}Hz)`;
      fpsPanel.textContent = `fps: ${fps}`;
      detailPanel.textContent = [
        fpsText,
        `frame  ${formatMs(avg)} p95 ${formatMs(p95)}`,
        profileGrid("timing", [
          ["before meter", beforeProbeAvg],
          ["after meter", afterProbeAvg],
          ["gpu calls", glSubmitAvg],
        ]),
        profileGrid("where", [
          ["app updates", appUpdateAvg],
          ["app drawing", appDrawAvg],
          ["scene overhead", engineWalkAvg],
          ["game total", rootMeasuredAvg],
          accountGapEntry,
        ]),
        profileGrid("browser", [
          ["other JS", rafOtherAvg],
          ["gc pauses", gcPauseAvg],
          ["meter cost", meterAvg],
          ["unknown gap", unknownGapAvg],
          ["render/layout", browserRenderAvg],
        ]),
        profileGrid("updates", profileEntries(jsByApp, JS_PROFILE_ORDER)),
        profileGrid("overhead", [
          ["call updates", engineUpdateWalkAvg],
          ["timer phase", rootFixedAvg],
          ["call draws", engineDrawWalkAvg],
        ]),
        profileGrid("drawing", profileEntries(drawByApp, DRAW_PROFILE_ORDER)),
        profileGrid("gpu calls", profileEntries(glByApp, DRAW_PROFILE_ORDER)),
        longFrameText(),
        `draws  ${d ? d.drawCalls() : "?"}  objs ${d ? d.numObjects() : "?"}`,
        debugStatsText(),
        heap
          ? `heap   ${formatBytes(heap.usedJSHeapSize)}/${formatBytes(
              heap.totalJSHeapSize,
            )} lim ${formatBytes(heap.jsHeapSizeLimit)}`
          : "heap   n/a",
        pageMemoryText(),
        gcText(now, heap),
        "note   overhead = framework time to call object updates/draws",
        "       timer phase = engine timer/interval-style work due this frame",
        "       browser/other = before meter minus game total; render/layout is extra",
        "       game total = updates + drawing + overhead; gpu calls are CPU-side",
        `${canvas?.width ?? "?"}x${canvas?.height ?? "?"} ${renderer}`,
      ]
        .filter(Boolean)
        .join("\n");
      pushRolling(meterCosts, (performance.now() - meterStart) / frameCount);
    }, 500);
  });

// ?gpu overlays the WebGL renderer string — the ground truth for whether a
// browser or webview is on the real GPU (V3D/VideoCore/Apple/ANGLE-Metal) or a
// software rasterizer (llvmpipe/softpipe/SwiftShader). Useful where internal
// pages like webkit://gpu or chrome://gpu aren't reachable.
if (settings.gpu)
  addEventListener("load", () => {
    const gl = document.querySelector("canvas")?.getContext("webgl");
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    const label = document.createElement("div");
    label.textContent = gl
      ? String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
      : "no WebGL context";
    label.style.cssText =
      "position:fixed;left:8px;top:8px;z-index:9;background:#000c;color:#7df;" +
      "font:12px/1.4 monospace;padding:4px 8px;border-radius:4px";
    document.body.append(label);
  });

import type { KAPLAYCtx } from "kaplay";

// Scene-ablation toggles for performance profiling. Normal operation is
// unaffected (empty query = everything on). Open the page with e.g.
// ?off=caustics,kelp to skip spawning those layers, ?off=all for the empty
// tank floor, and ?uncap to lift the maxFPS cap — then read the FPS console.
// Headless tools import scene modules that import this one — no location there.
const params =
  typeof location === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(location.search);
const OFF = new Set((params.get("off") ?? "").split(",").filter(Boolean));
export const off = (name: string) => OFF.has(name) || OFF.has("all");
export const uncapped = params.has("uncap");
// ?cap=32 overrides the default frame cap — launchers pass a lower cap on weak
// devices (halves sustained load and heat) without needing a separate build.
export const capFPS = Number(params.get("cap")) || 62;
// ?fish=4 style spawn-count overrides; anything unparseable keeps the default.
export const num = (name: string, fallback: number) => {
  if (!params.has(name)) return fallback;
  const v = Number(params.get(name));
  return Number.isFinite(v) && v >= 0 ? Math.min(999, Math.floor(v)) : fallback;
};
let entityCountDefaults: readonly (readonly [string, number])[] = [];
export const configureEntityCountDefaults = (
  counts: Readonly<Record<string, number>>,
) => {
  entityCountDefaults = Object.entries(counts);
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
  startDelay: number;
  glDrawMs: number;
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
  const labelWidth = 8;
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

let debugProfiling = false;
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
  "caustics",
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
let frameProbe: FrameProbe | null = null;
const profiledRoots = new WeakSet<ProfileRoot>();

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

export const installEngineProfiler = (k: Pick<KAPLAYCtx, "getTreeRoot">) => {
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
    current = { ts, startDelay: performance.now() - ts, glDrawMs: 0 };
    samples.push(current);
    if (samples.length > 360) samples.shift();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const addGlDrawTime = (ms: number) => {
    if (!debugProfiling) return;
    if (current) current.glDrawMs += ms;
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
        addGlDrawTime(performance.now() - start);
      }
    };
    const drawElements = proto.drawElements;
    proto.drawElements = function (mode, count, type, offset) {
      const start = performance.now();
      try {
        return drawElements.call(this, mode, count, type, offset);
      } finally {
        addGlDrawTime(performance.now() - start);
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

const setDebugProfiling = (enabled: boolean) => {
  debugProfiling = enabled;
  if (enabled && !frameProbe && typeof requestAnimationFrame !== "undefined")
    frameProbe = installFrameProbe();
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
  }
};

// ?fps overlays a live frame-rate readout — easier to read than the in-scene
// console prop, and available even with ?off=props. Superseded by ?debug's
// panel, which occupies the same corner.
if (params.has("fps") && !params.has("debug"))
  addEventListener("load", () => {
    const label = document.createElement("div");
    label.style.cssText =
      "position:fixed;right:8px;top:8px;z-index:9;background:#000c;color:#7f7;" +
      "font:16px/1.4 monospace;padding:4px 8px;border-radius:4px";
    document.body.append(label);
    setInterval(() => {
      const d = (globalThis as { debug?: { fps(): number } }).debug;
      label.textContent = d ? String(Math.round(d.fps())) : "…";
    }, 250);
  });

// ?debug overlays a live performance panel: rendered fps vs rAF tick rate
// (a gap means the frame cap is skipping ticks, and the tick rate is the
// display's real refresh), main-thread frame cost with p95 over a rolling
// window (measured as the delay between the vsync timestamp and this late-
// registered rAF callback — kaplay's callback runs first in the tick), GL
// draw calls, named update/draw/GL breakdowns, Kaplay root overhead, object
// count, JS heap, buffer size, and the renderer string.
if (typeof addEventListener !== "undefined" && typeof document !== "undefined")
  addEventListener("load", () => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;right:8px;top:8px;z-index:9;background:#000c;color:#7f7;" +
      "font:13px/1.5 monospace;padding:6px 18px 6px 10px;border-radius:4px";
    if (!debugProfiling) box.style.display = "none";
    document.body.append(box);

    // Outside ?debug, start collapsed so normal runs only show the settings gear.
    const gear = document.createElement("button");
    gear.textContent = "⚙";
    gear.style.cssText =
      "position:fixed;right:8px;top:8px;z-index:9;background:none;border:none;" +
      "color:#000a;font:15px monospace;cursor:pointer;padding:2px 6px;" +
      `border-radius:4px;display:${debugProfiling ? "none" : "block"}`;
    document.body.append(gear);
    const close = document.createElement("button");
    close.textContent = "×";
    close.style.cssText =
      "position:absolute;top:0;right:2px;background:none;border:none;" +
      "color:#7f7a;font:15px monospace;cursor:pointer;padding:2px 4px";
    close.addEventListener("click", () => {
      box.style.display = "none";
      gear.style.display = "block";
    });
    gear.addEventListener("click", () => {
      gear.style.display = "none";
      box.style.display = "";
    });
    box.append(close);

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
    detailToggle.title = "Show performance details";
    detailToggle.setAttribute("aria-label", "Show performance details");
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
        ? "Hide performance details"
        : "Show performance details";
      detailToggle.setAttribute(
        "aria-label",
        visible ? "Hide performance details" : "Show performance details",
      );
    };
    detailToggle.addEventListener("click", () => {
      setDetailsVisible(detailBox.style.display === "none");
    });
    detailClose.addEventListener("click", () => {
      setDetailsVisible(false);
    });
    fpsRow.append(fpsPanel, detailToggle);
    box.append(fpsRow);
    setInterval(() => {
      const d = (globalThis as { debug?: { fps(): number } }).debug;
      fpsPanel.textContent = `fps: ${d ? Math.round(d.fps()) : "?"}`;
    }, 250);

    // Scene-element checkboxes: each maps to an ?off= gate, which only runs at
    // spawn time — applying a change rewrites the query and reloads.
    const TOGGLES = [
      "backdrop",
      "sand",
      "props",
      "plants",
      "caustics",
      "motes",
      "bubbles",
      "puffs",
      "fish",
      "cephs",
      "crabs",
      "kelp",
    ];
    const menu = document.createElement("div");
    menu.style.cssText =
      "display:grid;grid-template-columns:1fr 1fr;gap:1px 12px;" +
      "margin-top:6px;border-top:1px solid #7f74;padding-top:6px";
    box.append(menu);
    const boxes = new Map<string, HTMLInputElement>();
    const apply = () => {
      const offNow = TOGGLES.filter((n) => !boxes.get(n)!.checked);
      const p = new URLSearchParams(location.search);
      if (offNow.length) p.set("off", offNow.join(","));
      else p.delete("off");
      location.search = p.toString();
    };
    for (const name of TOGGLES) {
      const label = document.createElement("label");
      label.style.cssText =
        "display:flex;gap:6px;align-items:center;cursor:pointer";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !off(name);
      cb.style.accentColor = "#7f7";
      cb.addEventListener("change", apply);
      boxes.set(name, cb);
      label.append(cb, name);
      menu.append(label);
    }
    const allBtn = document.createElement("label");
    allBtn.style.cssText =
      "display:flex;gap:6px;align-items:center;cursor:pointer";
    const allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.checked = TOGGLES.every((n) => !off(n));
    allCb.style.accentColor = "#7f7";
    allCb.addEventListener("change", () => {
      for (const cb of boxes.values()) cb.checked = allCb.checked;
      apply();
    });
    allBtn.append(allCb, "(all)");
    menu.append(allBtn);

    // Buffer resolution and frame cap need a reload (both are fixed at init);
    // pause is live and splits update cost from draw cost — if fps rises while
    // paused, the update side was the load; if not, it's the draw side.
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;gap:12px;align-items:center;margin-top:6px;" +
      "border-top:1px solid #7f74;padding-top:6px";
    box.append(row);
    const makeSelect = (
      title: string,
      options: [string, string][],
      current: string,
      onPick: (v: string, p: URLSearchParams) => void,
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
        const p = new URLSearchParams(location.search);
        onPick(sel.value, p);
        location.search = p.toString();
      });
      label.append(title, sel);
      row.append(label);
    };
    const resNow = ["1", "2"].includes(params.get("res") ?? "")
      ? params.get("res")!
      : "3";
    makeSelect(
      "res",
      [
        ["1", "640"],
        ["2", "1280"],
        ["3", "1920"],
      ],
      resNow,
      (v, p) => {
        if (v === "3") p.delete("res");
        else p.set("res", v);
      },
    );
    const capNow = params.has("uncap")
      ? "off"
      : params.get("cap") === "32"
        ? "30"
        : "60";
    makeSelect(
      "cap",
      [
        ["30", "30"],
        ["60", "60"],
        ["off", "off"],
      ],
      capNow,
      (v, p) => {
        p.delete("cap");
        p.delete("uncap");
        if (v === "30") p.set("cap", "32");
        if (v === "off") p.set("uncap", "");
      },
    );
    const pauseLabel = document.createElement("label");
    pauseLabel.style.cssText =
      "display:flex;gap:6px;align-items:center;cursor:pointer";
    const pauseCb = document.createElement("input");
    pauseCb.type = "checkbox";
    pauseCb.style.accentColor = "#7f7";
    pauseCb.addEventListener("change", () => {
      const d = (globalThis as { debug?: { paused: boolean } }).debug;
      if (d) d.paused = pauseCb.checked;
    });
    pauseLabel.append(pauseCb, "pause");
    row.append(pauseLabel);

    // Spawn-count inputs (?fish= etc.); like the toggles, counts are fixed at
    // spawn time, so a change rewrites the query and reloads.
    const countRow = document.createElement("div");
    countRow.style.cssText =
      "display:flex;flex-direction:column;gap:2px;margin-top:6px;" +
      "border-top:1px solid #7f74;padding-top:6px";
    box.append(countRow);
    for (const [name, fallback] of entityCountDefaults) {
      const label = document.createElement("label");
      label.style.cssText =
        "display:grid;grid-template-columns:4.5em 4.5em;gap:6px;" +
        "align-items:center;cursor:pointer";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "999";
      input.value = String(num(name, fallback));
      input.style.cssText =
        "width:4em;background:#000;color:#7f7;border:1px solid #7f74;" +
        "border-radius:3px;font:inherit;padding:1px 3px";
      input.addEventListener("change", () => {
        const p = new URLSearchParams(location.search);
        const v = Math.min(999, Math.max(0, Math.floor(Number(input.value))));
        if (!Number.isFinite(v) || v === fallback) p.delete(name);
        else p.set(name, String(v));
        location.search = p.toString();
      });
      label.append(name, input);
      countRow.append(label);
    }

    const githubLink = document.createElement("a");
    githubLink.href = "https://github.com/koskokos2/fishtank";
    githubLink.target = "_blank";
    githubLink.rel = "noreferrer";
    githubLink.textContent = "GitHub: koskokos2/fishtank";
    githubLink.style.cssText =
      "display:block;margin-top:6px;border-top:1px solid #7f74;padding-top:6px;" +
      "color:#7f7;text-decoration:none";
    box.append(githubLink);

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

    const longFrames: LongFrameBreakdown[] = [];
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
            longFrames.push(makeLongFrameBreakdown(entry));
            if (longFrames.length > 40) longFrames.shift();
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
    const preCosts: number[] = [];
    const jsCosts: number[] = [];
    const glDrawCosts: number[] = [];
    let ticks = 0;
    const tick = (ts: number) => {
      const now = performance.now();
      const elapsed = now - ts;
      const frameStart = frameProbe?.consume(ts);
      const pre = frameStart?.startDelay ?? 0;
      const glDraw = frameStart?.glDrawMs ?? 0;
      if (debugProfiling) {
        pushRolling(costs, elapsed);
        pushRolling(preCosts, pre);
        pushRolling(glDrawCosts, glDraw);
        pushRolling(jsCosts, Math.max(0, elapsed - pre - glDraw));
        ticks++;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    let lastT = performance.now();
    setInterval(() => {
      if (!debugProfiling) {
        ticks = 0;
        lastT = performance.now();
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
      const d = (
        globalThis as {
          debug?: { fps(): number; drawCalls(): number; numObjects(): number };
        }
      ).debug;
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
      const preAvg = avgOf(preCosts);
      const jsAvg = avgOf(jsCosts);
      const glAvg = avgOf(glDrawCosts);
      const appUpdateAvg = sumProfile(jsByApp);
      const appDrawAvg = sumProfile(drawByApp);
      const appGlAvg = sumProfile(glByApp);
      const appDrawNoGlAvg = Math.max(0, appDrawAvg - appGlAvg);
      const engineOtherAvg = Math.max(
        0,
        jsAvg - appUpdateAvg - appDrawNoGlAvg,
      );
      const rootUpdateAvg = engineByApp.get("root update") ?? 0;
      const rootFixedAvg = engineByApp.get("root fixed") ?? 0;
      const rootDrawAvg = engineByApp.get("root draw") ?? 0;
      const engineUpdateWalkAvg = Math.max(0, rootUpdateAvg - appUpdateAvg);
      const engineDrawWalkAvg = Math.max(0, rootDrawAvg - appDrawAvg);
      const engineFrameMiscAvg = Math.max(
        0,
        engineOtherAvg -
          engineUpdateWalkAvg -
          rootFixedAvg -
          engineDrawWalkAvg,
      );
      const fps = d ? Math.round(d.fps()) : "?";
      const fpsText = `fps    ${fps} (raf ${hz}Hz)`;
      fpsPanel.textContent = `fps: ${fps}`;
      detailPanel.textContent = [
        fpsText,
        `frame  ${formatMs(avg)} p95 ${formatMs(p95)}`,
        `parts  pre ${formatMs(preAvg)} js ${formatMs(
          jsAvg,
        )} draw-cpu ${formatMs(appDrawAvg)} gl ${formatMs(glAvg)}`,
        profileGrid(
          "js by",
          profileEntries(jsByApp, JS_PROFILE_ORDER, [
            ["engine/other", engineOtherAvg],
          ]),
        ),
        profileGrid("engine", [
          ["update walk", engineUpdateWalkAvg],
          ["fixed walk", rootFixedAvg],
          ["draw walk", engineDrawWalkAvg],
          ["frame/misc", engineFrameMiscAvg],
        ]),
        profileGrid("draw by", profileEntries(drawByApp, DRAW_PROFILE_ORDER)),
        profileGrid("gl by", profileEntries(glByApp, DRAW_PROFILE_ORDER)),
        longFrameText(),
        `draws  ${d ? d.drawCalls() : "?"}  objs ${d ? d.numObjects() : "?"}`,
        heap
          ? `heap   ${formatBytes(heap.usedJSHeapSize)}/${formatBytes(
              heap.totalJSHeapSize,
            )} lim ${formatBytes(heap.jsHeapSizeLimit)}`
          : "heap   n/a",
        pageMemoryText(),
        gcText(now, heap),
        `${canvas?.width ?? "?"}x${canvas?.height ?? "?"} ${renderer}`,
      ]
        .filter(Boolean)
        .join("\n");
    }, 500);
  });

// ?gpu overlays the WebGL renderer string — the ground truth for whether a
// browser or webview is on the real GPU (V3D/VideoCore/Apple/ANGLE-Metal) or a
// software rasterizer (llvmpipe/softpipe/SwiftShader). Useful where internal
// pages like webkit://gpu or chrome://gpu aren't reachable.
if (params.has("gpu"))
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

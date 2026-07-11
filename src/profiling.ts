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
// draw calls, object count, JS heap, buffer size, and the renderer string.
if (params.has("debug"))
  addEventListener("load", () => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;right:8px;top:8px;z-index:9;background:#000c;color:#7f7;" +
      "font:13px/1.5 monospace;padding:6px 18px 6px 10px;border-radius:4px";
    document.body.append(box);

    // The × collapses the panel to a tiny gear in the same corner; the gear
    // brings it back. Sampling keeps running so reopening shows a warm window.
    const gear = document.createElement("button");
    gear.textContent = "⚙";
    gear.style.cssText =
      "position:fixed;right:8px;top:8px;z-index:9;background:#000c;border:none;" +
      "color:#7f7a;font:15px monospace;cursor:pointer;padding:2px 6px;" +
      "border-radius:4px;display:none";
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

    const panel = document.createElement("div");
    panel.style.whiteSpace = "pre";
    box.append(panel);

    // Scene-element checkboxes: each maps to an ?off= gate, which only runs at
    // spawn time — applying a change rewrites the query and reloads.
    const TOGGLES = [
      "backdrop", "sand", "props", "plants", "caustics", "motes",
      "bubbles", "fish", "cephs", "crabs", "kelp",
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
      label.style.cssText = "display:flex;gap:6px;align-items:center;cursor:pointer";
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
    allBtn.style.cssText = "display:flex;gap:6px;align-items:center;cursor:pointer";
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
      label.style.cssText = "display:flex;gap:5px;align-items:center;cursor:pointer";
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
    const resNow = ["1", "2"].includes(params.get("res") ?? "") ? params.get("res")! : "3";
    makeSelect("res", [["1", "640"], ["2", "1280"], ["3", "1920"]], resNow, (v, p) => {
      if (v === "3") p.delete("res");
      else p.set("res", v);
    });
    const capNow = params.has("uncap") ? "off" : params.get("cap") === "32" ? "30" : "60";
    makeSelect("cap", [["30", "30"], ["60", "60"], ["off", "off"]], capNow, (v, p) => {
      p.delete("cap");
      p.delete("uncap");
      if (v === "30") p.set("cap", "32");
      if (v === "off") p.set("uncap", "");
    });
    const pauseLabel = document.createElement("label");
    pauseLabel.style.cssText = "display:flex;gap:6px;align-items:center;cursor:pointer";
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
    const COUNTS: [string, number][] = [
      ["fish", 10],
      ["jelly", 3],
      ["octo", 1],
      ["naut", 1],
      ["crabs", 2],
      ["snail", 1],
      ["plants", 26],
    ];
    for (const [name, fallback] of COUNTS) {
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

    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl") ?? null;
    const dbgExt = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl
      ? String(gl.getParameter(dbgExt ? dbgExt.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
      : "no WebGL";

    const costs: number[] = [];
    let ticks = 0;
    const tick = (ts: number) => {
      costs.push(performance.now() - ts);
      if (costs.length > 240) costs.shift();
      ticks++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    let lastT = performance.now();
    setInterval(() => {
      const now = performance.now();
      const hz = Math.round((ticks * 1000) / (now - lastT));
      ticks = 0;
      lastT = now;
      const sorted = [...costs].sort((a, b) => a - b);
      const avg = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      const d = (globalThis as {
        debug?: { fps(): number; drawCalls(): number; numObjects(): number };
      }).debug;
      const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      panel.textContent = [
        `fps    ${d ? Math.round(d.fps()) : "?"} (raf ${hz}Hz)`,
        `frame  ${avg.toFixed(1)}ms p95 ${p95.toFixed(1)}`,
        `draws  ${d ? d.drawCalls() : "?"}  objs ${d ? d.numObjects() : "?"}`,
        heap ? `heap   ${(heap.usedJSHeapSize / 1048576).toFixed(0)}MB` : "",
        `${canvas?.width ?? "?"}x${canvas?.height ?? "?"} ${renderer.slice(0, 42)}`,
      ].filter(Boolean).join("\n");
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

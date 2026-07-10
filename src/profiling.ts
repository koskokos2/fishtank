// Scene-ablation toggles for performance profiling. Normal operation is
// unaffected (empty query = everything on). Open the page with e.g.
// ?off=caustics,kelp to skip spawning those layers, ?off=all for the empty
// tank floor, and ?uncap to lift the maxFPS cap — then read the FPS console.
const params = new URLSearchParams(location.search);
const OFF = new Set((params.get("off") ?? "").split(",").filter(Boolean));
export const off = (name: string) => OFF.has(name) || OFF.has("all");
export const uncapped = params.has("uncap");

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

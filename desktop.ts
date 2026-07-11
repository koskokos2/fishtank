// Desktop launcher for the Linux binary. The webview's native run loop blocks
// this thread, so the embedded HTTP server runs in a worker.
import { Webview } from "webview-bun";

const PORT = 8421;

// The Linux target embeds WebKitGTK. Two defaults matter on weak/embedded GPUs
// (the Raspberry Pi above all); both are opt-out via FISHTANK_NO_GPU_TWEAKS=1
// and inert on macOS/WKWebView:
//
//   GDK_BACKEND=x11 — under a Wayland session (Pi OS's labwc/wayfire), WebKitGTK's
//   GTK Wayland frame clock throttles requestAnimationFrame to a single-digit rate
//   (~7 Hz measured on a Pi 5), capping the scene regardless of how little work it
//   does. Routing through XWayland syncs rAF to the real display refresh (~7→25 fps
//   measured for an empty tank). Harmless on native-X11 sessions. Only skip this on
//   a pure-Wayland system with no XWayland, where x11 can't start — use
//   GDK_BACKEND=wayland (or FISHTANK_NO_GPU_TWEAKS=1) there.
//
//   WEBKIT_FORCE_COMPOSITING_MODE=1 — force accelerated compositing onto the GPU.
//
// Do NOT set WEBKIT_DISABLE_DMABUF_RENDERER=1: that forces a full-surface software
// copy every frame (the slow path), so it can only hurt here.
if (process.platform === "linux" && !process.env.FISHTANK_NO_GPU_TWEAKS) {
  process.env.GDK_BACKEND ??= "x11";
  process.env.WEBKIT_FORCE_COMPOSITING_MODE ??= "1";
}

// Thread the scene's runtime tuning knobs (res.ts's ?res=1|2, plus ?plants=,
// ?fish=, ?prof, ?gpu, …) through to the bundled build without a rebuild, so a
// weak device can drop the buffer density and entity counts:
//   FISHTANK_QUERY="res=2&plants=40" ./fishtank
//   FISHTANK_RES=2 ./fishtank
const query = new URLSearchParams(process.env.FISHTANK_QUERY ?? "");
if (process.env.FISHTANK_RES) query.set("res", process.env.FISHTANK_RES);
const QUERY_STRING = query.toString();

type ServerMessage =
  | { type: "ready"; port: number }
  | { type: "error"; message: string };

// Bun's --compile bundler fails to resolve workers referenced via
// `new URL("./worker.ts", import.meta.url)` (ModuleNotFound at runtime in the
// $bunfs virtual filesystem, Bun 1.3.9). A plain relative specifier is embedded
// and resolved correctly in both the compiled binary and `bun run`.
const worker = new Worker("./desktopServer.ts");
const port = await new Promise<number>((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Timed out waiting for desktop server")),
    5000,
  );

  worker.addEventListener("message", (event: MessageEvent<ServerMessage>) => {
    const message = event.data;
    if (message.type === "ready") {
      clearTimeout(timeout);
      resolve(message.port);
    } else if (message.type === "error") {
      clearTimeout(timeout);
      reject(new Error(message.message));
    }
  });

  worker.addEventListener("error", (event) => {
    clearTimeout(timeout);
    reject(event.error ?? new Error(event.message));
  });

  worker.postMessage({ type: "start", port: PORT });
});

const webview = new Webview();
webview.title = "Fishtank";
webview.navigate(`http://127.0.0.1:${port}/${QUERY_STRING ? `?${QUERY_STRING}` : ""}`);
webview.run();

worker.terminate();

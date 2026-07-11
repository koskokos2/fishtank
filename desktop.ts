// Desktop launcher for the Linux binary. The webview's native run loop blocks
// this thread, so the embedded HTTP server runs in a worker.
import { Webview } from "webview-bun";

const PORT = 8421;

// The Linux target embeds WebKitGTK, which — unlike the Chromium the web build
// usually runs in — leans on the CPU for compositing unless accelerated
// compositing is forced on. Nudge WebKit toward the GPU before the web process
// spawns. This var is WebKitGTK-only; it's inert on macOS/WKWebView. Set
// FISHTANK_NO_GPU_TWEAKS=1 to skip it. If the Pi's V3D + DMABUF path misbehaves,
// try WEBKIT_DISABLE_DMABUF_RENDERER=1 ./fishtank (it passes straight through).
if (process.platform === "linux" && !process.env.FISHTANK_NO_GPU_TWEAKS) {
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

// Desktop launcher for the Linux binary. The webview's native run loop blocks
// this thread, so the embedded HTTP server runs in a worker.
import { Webview } from "webview-bun";

const PORT = 8421;

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
webview.navigate(`http://127.0.0.1:${port}/`);
webview.run();

worker.terminate();

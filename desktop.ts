// Desktop launcher for the Linux binary. Serves the production build from ./dist
// over localhost and opens it in a native webview (WebKitGTK on Linux).
//
// Run `bun run build` first so ./dist exists, then `bun run compile` to produce
// the standalone `fishtank` executable. The compiled binary expects ./dist to
// sit next to it. webview-bun loads libwebview via bun:ffi; if --compile cannot
// embed that native lib, ship libwebview.so alongside the executable.
import { Webview } from "webview-bun";

const PORT = 8421;
const dist = `${import.meta.dir}/dist`;

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const { pathname } = new URL(req.url);
    const path = pathname === "/" ? "/index.html" : pathname;
    return new Response(Bun.file(dist + path));
  },
});

const webview = new Webview();
webview.title = "Fishtank";
webview.navigate(`http://localhost:${PORT}/`);
webview.run();

server.stop();

// Desktop launcher for the Linux binary. Bun's HTML import bundles and embeds
// the web app into the executable, then serves it to the native webview.
import { Webview } from "webview-bun";
import index from "./index.html";

const PORT = 8421;

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": index,
  },
});

const webview = new Webview();
webview.title = "Fishtank";
webview.navigate(`http://localhost:${server.port}/`);
webview.run();

server.stop();

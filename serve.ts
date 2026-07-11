import { DEFAULT_PORT, readPort, serveDist } from "./src/serveDist";

const port = readPort(Bun.argv[2] ?? Bun.env.PORT);
const server = serveDist(`${import.meta.dir}/dist`, port);

console.log(`Fishtank serving at http://localhost:${server.port}/`);
console.log(`Open it in a browser, or run: chromium-browser --kiosk http://localhost:${server.port}/`);

process.on("SIGINT", () => {
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
